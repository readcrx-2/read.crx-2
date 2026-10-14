import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";
import { chromium, type Browser, type Page } from "playwright";

import { startLocalBoard } from "../tests/localboard.mts";

const cdpUrl = process.env.CHLENS_CDP_URL ?? "http://127.0.0.1:9222";
const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const outputDir = path.resolve(
  process.env.UI_SHOT_DIR ?? path.join("screenshots", "ui", "tauri", stamp),
);
const SETTINGS = [
  ["一般", "settings-general"],
  ["表示", "settings-display"],
  ["ドメイン共通と各板", "settings-site-board"],
  ["更新関連", "settings-reload"],
  ["コメントOverlay", "settings-comment-overlay"],
  ["NG", "settings-ng"],
  ["その他", "settings-other"],
  ["データ", "settings-data"],
] as const;

function fileName(label: string): string {
  return label
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}-]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .toLowerCase();
}

async function capture(
  page: Page,
  name: string,
  animations: "disabled" | "allow" = "disabled",
): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), animations });
}

async function captureMiniWindows(page: Page): Promise<void> {
  const buttons = page.locator(".status-bar button");
  // 小窓を開く操作でボタンDOMが更新されるため、各回のlocatorを名前から取り直す。
  const labels = await buttons.evaluateAll((items) =>
    items
      .map((button) =>
        button.getAttribute("aria-label") ??
        button.getAttribute("title") ??
        button.textContent?.trim() ??
        "",
      )
      .filter((label) => label.length > 0),
  );
  let index = 1;
  for (const label of labels) {
    if (await page.locator(".mini-window").count()) {
      await page.locator(".mini-window__close").click();
    }
    const button = page.locator(".status-bar").getByRole("button", { name: label, exact: true }).first();
    if ((await button.count()) === 0) continue;
    await button.click();
    const miniWindow = page.locator(".mini-window");
    if (!(await miniWindow.count())) continue;
    await miniWindow.waitFor({ state: "visible" });
    const title = (await miniWindow.locator(".mini-window__title").innerText()).trim();
    await capture(page, `tauri-thread-mini-${String(index).padStart(2, "0")}-${fileName(title || label)}`);
    index += 1;
  }
  if (await page.locator(".mini-window").count()) await page.locator(".mini-window__close").click();
}

async function captureQuickAccessPage(page: Page, label: string, name: string): Promise<void> {
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByText(label, { exact: true }).click();
  await page.locator(".thread-list-page, .page-status").waitFor({ state: "visible" });
  await page.waitForTimeout(300);
  await page.locator('.page-status [aria-label$="読み込み中"]').waitFor({ state: "hidden" });
  await capture(page, `tauri-${name}`);
}

async function captureSettings(page: Page): Promise<void> {
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByTitle("設定を開く", { exact: true }).click();
  await page.locator(".settings-page__shell").waitFor({ state: "visible" });

  const captureScrolledSections = async (name: string) => {
    const main = page.locator(".settings-page__main");
    await main.evaluate((element) => { element.scrollTop = 0; });
    const { height, maxScroll } = await main.evaluate((element) => ({
      height: Math.max(element.clientHeight, 1),
      maxScroll: Math.max(0, element.scrollHeight - element.clientHeight),
    }));
    let index = 1;
    for (let top = 0; top <= maxScroll; top += Math.max(1, Math.floor(height * 0.8))) {
      await main.evaluate((element, scrollTop) => { element.scrollTop = scrollTop; }, top);
      await capture(page, `tauri-${name}-section-${String(index).padStart(2, "0")}`);
      index += 1;
    }
  };

  for (const [label, file] of SETTINGS) {
    const section = page.locator(".settings-page__section-btn").filter({ hasText: label }).first();
    if (!(await section.count())) continue;
    await section.click();
    await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
    await page.locator('[aria-label$="読み込み中"]').waitFor({ state: "hidden" });
    await page.locator(".settings-page__site-board-loading").waitFor({ state: "hidden" });
    await page.waitForTimeout(200);

    if (label === "NG") {
      for (const name of ["NG記法例", "高度なNG設定"]) {
        const toggle = page.getByRole("button", { name, exact: true });
        if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
      }
      await captureScrolledSections(`${file}-rules`);
      await page.getByRole("tab", { name: "文字列置換", exact: true }).click();
      const replacement = page.getByRole("button", { name: "置換記法例", exact: true });
      if ((await replacement.getAttribute("aria-expanded")) === "false") await replacement.click();
      await captureScrolledSections(`${file}-replacement`);
    } else {
      await page.locator(".settings-page__main details:not([open]) summary").evaluateAll((summaries) => {
        for (const summary of summaries) (summary as HTMLElement).click();
      });
      await captureScrolledSections(file);
      if (label === "データ") {
        await page.getByRole("button", { name: "zipをエクスポート", exact: true }).click();
        await page.getByRole("dialog", { name: "バックアップ内容を選択" }).waitFor({ state: "visible" });
        await capture(page, `tauri-${file}-export-dialog`);
        await page.getByRole("button", { name: "キャンセル", exact: true }).click();
      }
    }
  }
}

async function getTauriPages(page: Page): Promise<Page[]> {
  return page.context().pages();
}

async function run(): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const localBoard = await startLocalBoard();
  localBoard.setThreads([
    {
      id: "1000000001",
      title: "架空番組実況スレッド ★1",
      posts: Array.from({ length: 24 }, (_, index) => {
        const number = String(index + 1).padStart(3, "0");
        const messages = ["番組始まった！", "この演出いいね", "次の展開が気になる", "実況テスト用のレスです"];
        return `視聴者${number}<>sage<>2026/10/02(金) 12:${String(index).padStart(2, "0")}:00 ID:sample${String(index % 7).padStart(3, "0")}<>${messages[index % messages.length]}<>架空番組実況スレッド ★1`;
      }),
    },
  ]);
  let browser: Browser | undefined;
  let main: Page | undefined;
  let temporaryTabId: string | null = null;
  let savedConfig: Array<[string, string | null]> | undefined;
  let overlayStarted = false;
  const configKeys = ["config_theme_id", "config_thread_display_mode", "config_bbsmenu"];

  try {
    browser = await chromium.connectOverCDP(cdpUrl);
    const context = browser.contexts()[0];
    if (!context) throw new Error("TauriのCDPにブラウザーコンテキストがありません");
    let pages = await context.pages();
    main = pages.find((page) => page.url().includes("/view/index.html"));
    if (!main) {
      throw new Error("Main画面が見つかりません。pnpm dev:tauri:debug で起動してください");
    }

    savedConfig = await main.evaluate(
      (keys) => keys.map((key) => [key, localStorage.getItem(key)] as [string, string | null]),
      configKeys,
    );
    await main.getByTitle("新しいタブ", { exact: true }).click();
    temporaryTabId = await main.locator(".tab--active").getAttribute("data-tab-id");
    if (!temporaryTabId) throw new Error("撮影用タブを特定できませんでした");
    await main.locator(".browser-shell").waitFor({ state: "visible" });
    await main.evaluate((menuUrl) => {
      localStorage.setItem("config_theme_id", "dark");
      localStorage.setItem("config_thread_display_mode", "live-chat");
      localStorage.setItem("config_bbsmenu", menuUrl);
    }, `${localBoard.origin}/bbsmenu.html`);
    await main.reload();
    await main.locator(".browser-shell[data-theme='dark']").waitFor({ state: "visible" });

    await main.getByRole("button", { name: "板一覧を開く", exact: true }).click();
    const menu = main.getByRole("button", { name: "テスト板メニュー", exact: true });
    if ((await menu.getAttribute("aria-expanded")) === "false") await menu.click();
    const category = main.getByRole("button", { name: "テストカテゴリ", exact: true });
    if ((await category.getAttribute("aria-expanded")) === "false") await category.click();
    await main.getByText("ローカルテスト板", { exact: true }).click();
    const panel = main.locator('.content-area__tab-panel[data-active="true"]');
    await panel.getByText("架空番組実況スレッド ★1", { exact: true }).waitFor({ state: "visible" });
    await capture(main, "tauri-thread-list");
    await captureMiniWindows(main);
    await panel.getByText("架空番組実況スレッド ★1", { exact: true }).click();
    const responses = main.locator(".thread-page__responses");
    await responses.locator('[data-res-num="24"]').waitFor({ state: "visible", timeout: 30_000 });

    // 撮影用スレッドをお気に入りに登録し、履歴・過去ログの一覧にも架空データを表示する。
    await main.getByTitle("メニュー", { exact: true }).click();
    const addBookmark = main.getByRole("button", { name: "お気に入りに追加", exact: true });
    if (await addBookmark.count()) await addBookmark.click();

    // コメントを流す再現には自動更新が必要なので、スレッドのミニウィンドウからONにする。
    await main.locator(".status-bar").getByRole("button", { name: /スレッド自動更新/u }).click();
    const refreshPanel = main.locator(".mini-window");
    await refreshPanel.locator(".mini-window__toggle-row").filter({ hasText: "自動更新" }).locator(".mini-window__switch").click();
    await refreshPanel.locator(".mini-window__close").click();
    await capture(main, "tauri-thread-live-chat");
    await captureMiniWindows(main);

    await main.getByTitle("メニュー", { exact: true }).click();
    await main.getByText("フィルター", { exact: true }).click();
    await main.getByRole("button", { name: "多レス", exact: true }).click();
    await captureMiniWindows(main);

    const overlayControl = main
      .locator(".status-bar")
      .getByRole("button", { name: /コメントOverlay制御/u });
    await overlayControl.click();
    const overlayPanel = main.locator(".mini-window");
    await overlayPanel.waitFor({ state: "visible" });
    await capture(main, "tauri-comment-overlay-controls");
    await overlayPanel.locator(".mini-window__toggle-row")
      .filter({ hasText: "コメントを画面に流す" })
      .locator(".mini-window__switch")
      .click();
    overlayStarted = true;

    pages = await getTauriPages(main);
    let overlay = pages.find((page) => page.url().includes("/view/comment-overlay.html"));
    if (!overlay) {
      await main.context().waitForEvent("page", { timeout: 15_000 }).catch(() => undefined);
      pages = await getTauriPages(main);
      overlay = pages.find((page) => page.url().includes("/view/comment-overlay.html"));
    }
    if (!overlay) throw new Error("コメントOverlay画面が起動しませんでした");
    await overlay.locator("body").waitFor({ state: "visible" });
    await capture(overlay, "tauri-comment-overlay-empty");

    await overlayPanel.locator(".mini-window__close").click();
    localBoard.appendPost();
    await main.getByRole("button", { name: "更新", exact: true }).click();
    await responses.locator('[data-res-num="25"]').waitFor({ state: "visible", timeout: 15_000 });
    await main.waitForTimeout(1_000);
    await overlay.locator(".comment-overlay-stage__comment").waitFor({ state: "visible", timeout: 15_000 });
    await capture(overlay, "tauri-comment-overlay-flowing", "allow");

    await overlayControl.click();
    const stopSwitch = main
      .locator(".mini-window__toggle-row")
      .filter({ hasText: "コメントを画面に流す" })
      .locator(".mini-window__switch");
    await stopSwitch.click();
    await expect(stopSwitch).toHaveAttribute("aria-pressed", "false");
    overlayStarted = false;
    if (await main.locator(".mini-window").count()) await main.locator(".mini-window__close").click();

    await captureQuickAccessPage(main, "ブックマークリスト", "bookmarks");
    await captureQuickAccessPage(main, "閲覧履歴", "history");
    await captureQuickAccessPage(main, "ログ検索", "logs");
    await captureQuickAccessPage(main, "書き込み履歴", "write-history");

    await captureSettings(main);
    console.info(`[ui:shots:tauri] 保存先: ${outputDir}`);
  } finally {
    try {
      if (main && overlayStarted && !main.isClosed()) {
        const overlayTrigger = main
          .locator(".status-bar")
          .getByRole("button", { name: /コメントOverlay制御/u });
        if (await overlayTrigger.count()) {
          await overlayTrigger.click().catch(() => undefined);
          const stopSwitch = main
            .locator(".mini-window__toggle-row")
            .filter({ hasText: "コメントを画面に流す" })
            .locator(".mini-window__switch");
          if ((await stopSwitch.getAttribute("aria-pressed").catch(() => null)) === "true") {
            await stopSwitch.click().catch(() => undefined);
          }
        }
      }
      if (main && savedConfig && !main.isClosed()) {
        await main.evaluate((entries) => {
          for (const [key, value] of entries) {
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
          }
        }, savedConfig);
        if (temporaryTabId) {
          const closeTemporaryTab = main.locator(`.tab[data-tab-id="${temporaryTabId}"] .tab__close`);
          if (await closeTemporaryTab.count()) await closeTemporaryTab.click();
        }
        // 変更したテーマ・設定を、元のタブにも即時反映して利用者の状態へ戻す。
        await main.reload().catch(() => undefined);
      }
    } finally {
      try {
        await browser?.close();
      } finally {
        await localBoard.close();
      }
    }
  }
}

run().catch((error: unknown) => {
  console.error("[ui:shots:tauri] 撮影に失敗しました:", error);
  process.exitCode = 1;
});
