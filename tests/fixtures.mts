import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

import { type BrowserContext, chromium, test as base, type Worker } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

import { startLocalBoard } from "./localboard.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTENSION_PATH = path.join(__dirname, "../debug/chrome");
const SERVICE_WORKER_TIMEOUT_MS = 10_000;
const LAUNCH_ATTEMPTS = 3;

/**
 * 拡張機能を読み込んだChromiumを起動し、サービスワーカーが見えるまで待つ。
 *
 * 変更理由: 並列実行で負荷が高いと、起動したChromiumのサービスワーカーを
 * Playwrightが一度も捕捉できず、"serviceworker" イベントを待ったままテストの
 * 30秒を使い切ることがあった。同じブラウザで待ち続けても回復しないため、
 * 短めに見切って起動し直す。
 */
async function launchExtensionContext(): Promise<BrowserContext> {
  for (let attempt = 1; ; attempt++) {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      // 既存のChromiumを使う環境でも、ブラウザの追加ダウンロードなしで検証できるようにする。
      executablePath: process.env.CHLENS_E2E_CHROMIUM_PATH,
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    });
    if (await findExtensionWorker(context)) return context;
    await context.close();
    if (attempt >= LAUNCH_ATTEMPTS) {
      throw new Error(
        `拡張機能のサービスワーカーを${LAUNCH_ATTEMPTS}回の起動で検出できませんでした（各${SERVICE_WORKER_TIMEOUT_MS}ms待機）`,
      );
    }
    console.warn(
      `[E2E] サービスワーカーを検出できないためChromiumを起動し直します（${attempt}回目）`,
    );
  }
}

/** Manifest V3の拡張機能のサービスワーカーを返す。時間内に現れなければ null。 */
async function findExtensionWorker(context: BrowserContext): Promise<Worker | null> {
  const [existing] = context.serviceWorkers();
  if (existing) return existing;
  return context
    .waitForEvent("serviceworker", { timeout: SERVICE_WORKER_TIMEOUT_MS })
    .catch((error: unknown) => {
      console.warn("[E2E] サービスワーカーの待機がタイムアウトしました", error);
      return null;
    });
}

/**
 * サービスワーカーで chrome.bookmarks が使えるようになるまで待つ。
 *
 * 変更理由: Playwrightはサービスワーカーを起動直後に捕捉するため、評価が早すぎると
 * chrome.bookmarks が未定義だったり、setTimeout すら定義前のグローバルで実行されたりして、
 * 並列実行時に任意のテストが落ちていた。ワーカー内で待つとその待機自体が失敗するため、
 * Node側から評価を繰り返して確かめる。
 */
async function waitForBookmarksApi(worker: Worker): Promise<void> {
  const deadline = Date.now() + SERVICE_WORKER_TIMEOUT_MS;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const ready = await worker.evaluate(
        () =>
          typeof (
            globalThis as typeof globalThis & { chrome?: { bookmarks?: { create?: unknown } } }
          ).chrome?.bookmarks?.create === "function",
      );
      if (ready) return;
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `拡張機能のbookmarks APIが${SERVICE_WORKER_TIMEOUT_MS}ms以内に使えるようになりませんでした`,
    { cause: lastError },
  );
}

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  localBoard: Awaited<ReturnType<typeof startLocalBoard>>;
}>({
  // Playwrightは引数の分割代入から依存fixtureを解析するため、依存なしでもこの形が必要。
  // eslint-disable-next-line no-empty-pattern
  localBoard: async ({}, use) => {
    const board = await startLocalBoard();
    try {
      await use(board);
    } finally {
      await board.close();
    }
  },
  // eslint-disable-next-line no-empty-pattern -- Playwrightの依存解析に必要な分割代入。
  context: async ({}, use) => {
    const context = await launchExtensionContext();
    try {
      await use(context);
    } finally {
      await context.close();
    }
  },
  extensionId: async ({ context }, use) => {
    const serviceWorker = await findExtensionWorker(context);
    if (!serviceWorker) throw new Error("拡張機能のサービスワーカーが見つかりません");
    const extensionId = serviceWorker.url().split("/")[2];
    await use(extensionId);
  },
  page: async ({ context, extensionId, localBoard }, use, testInfo) => {
    // 初回画面が設定を読む前に保存し、外部bbsmenuへの通信と初期設定ダイアログを避ける。
    const worker = context.serviceWorkers().find((item) => item.url().includes(extensionId));
    if (!worker) throw new Error("拡張機能のサービスワーカーが見つかりません");
    await waitForBookmarksApi(worker);
    const folderId = await worker.evaluate(async () => {
      const api = (
        globalThis as typeof globalThis & {
          chrome: {
            bookmarks: { create: (details: { title: string }) => Promise<{ id: string }> };
          };
        }
      ).chrome;
      // ChromeのルートIDはバージョンで変わるため、実在する専用フォルダーを使う。
      const folder = await api.bookmarks.create({ title: "E2Eテスト" });
      return folder.id;
    });
    await context.addInitScript(
      ({ folderId, origin, extensionId }) => {
        // 現在の設定保存先はlocalStorage。再読み込みではNGやセッションを上書きしない。
        if (location.host !== extensionId || localStorage.getItem("e2e_initialized")) return;
        const settings = {
          config_bookmark_id: folderId,
          config_format_2chnet: "dat",
          config_bbsmenu: `${origin}/bbsmenu.html`,
          config_ngwords: "",
        };
        for (const [key, value] of Object.entries(settings)) localStorage.setItem(key, value);
        localStorage.setItem("e2e_initialized", "true");
      },
      { folderId, origin: localBoard.origin, extensionId },
    );
    const page = await context.newPage();
    page.on("pageerror", (error) => console.error("[E2E] ページエラー", error));
    page.on("console", (message) => {
      if (message.type() === "error") console.error("[E2E] コンソールエラー", message.text());
    });
    await use(page);
    if (process.env.E2E_COVERAGE === "true" && !page.isClosed()) {
      const coverage = await page.evaluate(
        () => (globalThis as typeof globalThis & { __coverage__?: unknown }).__coverage__ ?? null,
      );
      if (coverage) {
        const outputDir = path.resolve(__dirname, "../coverage/e2e/raw");
        await mkdir(outputDir, { recursive: true });
        const filename = `${testInfo.workerIndex}-${randomUUID()}.json`;
        await writeFile(path.join(outputDir, filename), JSON.stringify(coverage));
      }
    }
    await page.close();
  },
});

export const expect = test.expect;
