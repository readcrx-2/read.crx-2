import { type BrowserContext, chromium, test as base } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { startLocalBoard } from "./localboard.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    const pathToExtension = path.join(__dirname, "../debug/chrome");
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      // 既存のChromiumを使う環境でも、ブラウザの追加ダウンロードなしで検証できるようにする。
      executablePath: process.env.CHLENS_E2E_CHROMIUM_PATH,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    try {
      await use(context);
    } finally {
      await context.close();
    }
  },
  extensionId: async ({ context }, use) => {
    // Manifest V3用:
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) serviceWorker = await context.waitForEvent("serviceworker");
    const extensionId = serviceWorker.url().split("/")[2];
    await use(extensionId);
  },
  page: async ({ context, extensionId, localBoard }, use, testInfo) => {
    // 初回画面が設定を読む前に保存し、外部bbsmenuへの通信と初期設定ダイアログを避ける。
    const worker = context.serviceWorkers().find((item) => item.url().includes(extensionId));
    if (!worker) throw new Error("拡張機能のサービスワーカーが見つかりません");
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
      const coverage = await page.evaluate(() =>
        (globalThis as typeof globalThis & { __coverage__?: unknown }).__coverage__ ?? null,
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
