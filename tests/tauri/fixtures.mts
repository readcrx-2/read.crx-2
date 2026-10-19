import { type ChildProcess, execFile, execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { type Browser, chromium, type Page, test as base } from "@playwright/test";

import { startLocalBoard } from "../localboard.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const CDP_TIMEOUT_MS = 30_000;
const EXIT_TIMEOUT_MS = 10_000;
const MAX_CONSOLE_LENGTH = 300;

/** Tauri版の窓。CDPのページURLで見分ける。 */
const WINDOW_PATHS = {
  main: "/view/index.html",
  overlay: "/view/comment-overlay.html",
  replay: "/view/archive-replay.html",
} as const;
export type TauriWindow = keyof typeof WINDOW_PATHS;

const execFileAsync = promisify(execFile);

/**
 * `pnpm run build:tauri:e2e` で作られる実行ファイルを返す。
 *
 * cargoの出力先は `CARGO_TARGET_DIR` だけでなく `.cargo/config.toml` の `build.target-dir` でも
 * 変わるため、推測せず `cargo metadata` に問い合わせる。
 */
function resolveExecutable(): string {
  if (process.env.CHLENS_E2E_TAURI_EXE) return process.env.CHLENS_E2E_TAURI_EXE;
  const metadata = execFileSync(
    "cargo",
    ["metadata", "--format-version", "1", "--no-deps", "--manifest-path", "src-tauri/Cargo.toml"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const { target_directory: targetDir } = JSON.parse(metadata) as { target_directory: string };
  return path.join(targetDir, "debug/chlens.exe");
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("空きポートを取得できませんでした"));
      });
    });
  });
}

/** WebView2のリモートデバッグが応答するまで待つ。途中でアプリが終了したら失敗にする。 */
async function waitForCdp(endpoint: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + CDP_TIMEOUT_MS;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Tauri版がCDPの準備前に終了しました（終了コード ${child.exitCode}）`);
    }
    try {
      const response = await fetch(`${endpoint}/json/version`);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Tauri版のCDPが${CDP_TIMEOUT_MS}ms以内に応答しませんでした: ${endpoint}`, {
    cause: lastError,
  });
}

/**
 * E2E用のTauri版を1つ起動し、保存先を保ったまま再起動もできるようにした操作窓口。
 *
 * 保存先は `CHLENS_DATA_DIR` でテストごとの一時ディレクトリへ差し替え、普段使いのデータに触れない
 * （src-tauri/src/data_dir.rs）。窓はoffstage-windowsの非表示デスクトップに出る。
 */
export class TauriApp {
  private child: ChildProcess | null = null;
  private browser: Browser | null = null;
  private mainPage: Page | null = null;

  private constructor(
    readonly dataDir: string,
    private readonly executable: string,
    private readonly bbsmenuUrl: string,
  ) {}

  static async launch(bbsmenuUrl: string): Promise<TauriApp> {
    const executable = resolveExecutable();
    if (!existsSync(executable)) {
      throw new Error(
        `Tauri版の実行ファイルがありません: ${executable}\npnpm run build:tauri:e2e でビルドしてください`,
      );
    }
    const dataDir = await mkdtemp(path.join(tmpdir(), "chlens-e2e-"));
    const app = new TauriApp(dataDir, executable, bbsmenuUrl);
    await app.start();
    return app;
  }

  /** メイン窓のページ。起動のたびに作り直されるため、再起動後は取り直す。 */
  get page(): Page {
    if (!this.mainPage) throw new Error("Tauri版が起動していません");
    return this.mainPage;
  }

  /** 指定した窓のページを、CDPに現れるまで待って返す。 */
  async window(kind: TauriWindow): Promise<Page> {
    const context = this.browser?.contexts()[0];
    if (!context) throw new Error("TauriのCDPにブラウザーコンテキストがありません");
    const deadline = Date.now() + CDP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const page = context.pages().find((item) => item.url().includes(WINDOW_PATHS[kind]));
      if (page) return page;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Tauri版の${kind}窓がCDPに現れませんでした`);
  }

  /** 同じ保存先のまま終了して起動し直す。保存処理を通すため、終了は窓を閉じる操作で行う。 */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async close(): Promise<void> {
    await this.stop();
    // WebView2の子プロセスが終了直後までファイルを掴むことがあるため、少し待って再試行する。
    await rm(this.dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }

  private async start(): Promise<void> {
    const port = await findFreePort();
    const endpoint = `http://127.0.0.1:${port}`;
    const child = spawn(this.executable, [], {
      env: {
        ...process.env,
        CHLENS_DATA_DIR: this.dataDir,
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;
    // Rust側のログ（stdout）とパニック（stderr）を失敗の調査に使えるよう、テストの出力へ流す。
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => process.stdout.write(`[tauri] ${chunk}`));
    child.stderr?.on("data", (chunk: string) => process.stderr.write(`[tauri] ${chunk}`));
    child.once("error", (error) => console.error("[E2E] Tauri版を起動できませんでした", error));

    await waitForCdp(endpoint, child);
    this.browser = await chromium.connectOverCDP(endpoint);
    const page = await this.window("main");
    page.on("pageerror", (error) => console.error("[E2E] ページエラー", error));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      // CSPエラーには埋め込みフォントのdata URIが丸ごと入り、1件で数万文字になるため切り詰める。
      const text = message.text();
      const shown =
        text.length > MAX_CONSOLE_LENGTH ? `${text.slice(0, MAX_CONSOLE_LENGTH)}…` : text;
      console.error("[E2E] コンソールエラー", shown);
    });
    await this.initializeSettings(page);
    this.mainPage = page;
  }

  /**
   * 初回起動だけ、外部bbsmenuへの通信と初期設定ダイアログを避ける設定を保存して読み込み直す。
   *
   * CDPで接続した時点で画面はもう読み込まれているため、Chrome版のfixtureのように
   * 読み込み前のスクリプトでは差し込めない。再起動後は保存済みの設定をそのまま使う。
   */
  private async initializeSettings(page: Page): Promise<void> {
    await page.waitForLoadState("domcontentloaded");
    const initialized = await page.evaluate((bbsmenuUrl) => {
      if (localStorage.getItem("e2e_initialized")) return false;
      const settings = {
        config_format_2chnet: "dat",
        config_bbsmenu: bbsmenuUrl,
        config_ngwords: "",
      };
      for (const [key, value] of Object.entries(settings)) localStorage.setItem(key, value);
      localStorage.setItem("e2e_initialized", "true");
      return true;
    }, this.bbsmenuUrl);
    if (initialized) await page.reload();
    await page.locator(".browser-shell").waitFor({ state: "visible" });
  }

  private async stop(): Promise<void> {
    const child = this.child;
    this.mainPage = null;
    await this.browser?.close().catch((error: unknown) => {
      console.warn("[E2E] TauriのCDP接続を閉じられませんでした", error);
    });
    this.browser = null;
    this.child = null;
    if (!child || child.exitCode !== null || child.pid === undefined) return;

    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    // /F なしのtaskkillは窓へWM_CLOSEを送る。メイン窓を閉じるとアプリ全体が終了する（lib.rs）ため、
    // 強制終了と違いWebView2のlocalStorageやSQLiteを書き終えてから終わる。
    await execFileAsync("taskkill", ["/PID", String(child.pid)]).catch((error: unknown) => {
      console.warn("[E2E] Tauri版へ終了要求を送れませんでした", error);
    });
    const graceful = await Promise.race([
      exited.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), EXIT_TIMEOUT_MS)),
    ]);
    if (graceful) return;

    console.warn(`[E2E] Tauri版が${EXIT_TIMEOUT_MS}ms以内に終了しないため強制終了します`);
    await execFileAsync("taskkill", ["/PID", String(child.pid), "/T", "/F"]).catch(
      (error: unknown) => console.error("[E2E] Tauri版を強制終了できませんでした", error),
    );
    await exited;
  }
}

export const test = base.extend<{
  localBoard: Awaited<ReturnType<typeof startLocalBoard>>;
  tauri: TauriApp;
}>({
  // eslint-disable-next-line no-empty-pattern -- Playwrightの依存解析に必要な分割代入。
  localBoard: async ({}, use) => {
    const board = await startLocalBoard();
    try {
      await use(board);
    } finally {
      await board.close();
    }
  },
  tauri: async ({ localBoard }, use, testInfo) => {
    // WebView2の実行ファイルとリモートデバッグはWindowsだけで使える。
    testInfo.skip(process.platform !== "win32", "Tauri版のE2EはWindowsだけで実行する");
    const app = await TauriApp.launch(`${localBoard.origin}/bbsmenu.html`);
    try {
      await use(app);
    } finally {
      await app.close();
    }
  },
  page: async ({ tauri }, use) => {
    await use(tauri.page);
  },
});

export const expect = test.expect;
