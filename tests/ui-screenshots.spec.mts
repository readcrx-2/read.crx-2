import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.mjs";

const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const outputDir = path.resolve(
  process.env.UI_SHOT_DIR ?? path.join("screenshots", "ui", stamp),
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

async function capture(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), animations: "disabled" });
}

async function captureMiniWindows(page: Page, prefix: string): Promise<void> {
  const statusButtons = page.locator(".status-bar button");
  // 小窓を開くとステータスバー配下のDOMが更新されるため、nth()を使い回さず
  // 最初に撮影対象の名前を控えて、各回でボタンを取り直す。
  const labels = await statusButtons.evaluateAll((buttons) =>
    buttons
      .map((button) =>
        button.getAttribute("aria-label") ??
        button.getAttribute("title") ??
        button.textContent?.trim() ??
        "",
      )
      .filter((label) => label.length > 0),
  );
  let miniWindowIndex = 1;
  for (const label of labels) {
    if (await page.locator(".mini-window").count()) {
      await page.locator(".mini-window__close").click();
    }
    const button = page.locator(".status-bar").getByRole("button", { name: label, exact: true }).first();
    // ページ遷移などで対象が消えた場合は、存在しないnth()を待たず次へ進む。
    if ((await button.count()) === 0) continue;
    await button.click();
    const miniWindow = page.locator(".mini-window");
    if (await miniWindow.count()) {
      await expect(miniWindow).toBeVisible();
      const title = (await miniWindow.locator(".mini-window__title").innerText()).trim();
      await capture(page, `${prefix}-mini-${String(miniWindowIndex).padStart(2, "0")}-${fileName(title || label)}`);
      miniWindowIndex += 1;
    }
  }
  if (await page.locator(".mini-window").count()) await page.locator(".mini-window__close").click();
}

async function captureQuickAccessPage(page: Page, label: string, name: string): Promise<void> {
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByText(label, { exact: true }).click();
  await page.locator(".thread-list-page, .page-status").waitFor({ state: "visible" });
  await page.waitForTimeout(300);
  await page.locator('.page-status [aria-label$="読み込み中"]').waitFor({ state: "hidden" });
  await capture(page, name);
}

async function captureSettings(page: Page, prefix = ""): Promise<void> {
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByTitle("設定を開く", { exact: true }).click();
  await expect(page.locator(".settings-page__shell")).toBeVisible();

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
      await capture(page, `${prefix}${name}-section-${String(index).padStart(2, "0")}`);
      index += 1;
    }
  };

  for (const [label, file] of SETTINGS) {
    const section = page.locator(".settings-page__section-btn").filter({ hasText: label }).first();
    if (!(await section.count())) continue;
    await section.click();
    await expect(page.locator(".settings-page__title")).toHaveText(label);
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
      // 設定ページ内の折りたたみ項目も開き、隠れたセクションを撮影対象へ含める。
      await page.locator(".settings-page__main details:not([open]) summary").evaluateAll((summaries) => {
        for (const summary of summaries) (summary as HTMLElement).click();
      });
      await captureScrolledSections(file);
      if (label === "データ") {
        await page.getByRole("button", { name: "zipをエクスポート", exact: true }).click();
        await page.getByRole("dialog", { name: "バックアップ内容を選択" }).waitFor({ state: "visible" });
        await capture(page, `${prefix}${file}-export-dialog`);
        await page.getByRole("button", { name: "キャンセル", exact: true }).click();
      }
    }
  }
}

test("UI画面とステータスバーのミニウィンドウを撮影する", async ({ page, extensionId, localBoard }) => {
  // 多数の設定セクションを個別に保存する撮影シナリオのため、通常の短いE2E上限を延長する。
  test.setTimeout(300_000);
  await mkdir(outputDir, { recursive: true });
  localBoard.setThreads([
    {
      id: "1000000001",
      title: "架空番組実況スレッド ★1",
      posts: Array.from({ length: 24 }, (_, index) => {
        const number = String(index + 1).padStart(3, "0");
        const messages = [
          "番組始まった！",
          "この場面の演出いいね",
          "次の展開が気になる",
          "※画像は example.com のダミーです",
          "実況テスト用のレスです",
          "ここ好き",
        ];
        return `視聴者${number}<>sage<>2026/10/02(金) 12:${String(index).padStart(2, "0")}:00 ID:sample${String(index % 7).padStart(3, "0")}<>${messages[index % messages.length]}<>架空番組実況スレッド ★1`;
      }),
    },
    {
      id: "1000000002",
      title: "秋アニメの感想を語るスレ",
      posts: ["名無しさん<>sage<>2026/10/02(金) 11:00:00 ID:sample100<>今期のおすすめを教えて<>"],
    },
    {
      id: "1000000003",
      title: "週末の予定を書いていくスレ",
      posts: ["名無しさん<>sage<>2026/10/02(金) 10:00:00 ID:sample101<>散歩に行く予定<>"],
    },
  ]);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await expect(page.locator(".browser-shell")).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem("config_theme_id", "dark");
    localStorage.setItem("config_thread_display_mode", "live-chat");
  });
  await page.reload();
  await expect(page.locator(".browser-shell")).toHaveAttribute("data-theme", "dark");
  await capture(page, "01-home");

  await page.getByRole("button", { name: "板一覧を開く", exact: true }).click();
  const menu = page.getByRole("button", { name: "テスト板メニュー", exact: true });
  if ((await menu.getAttribute("aria-expanded")) === "false") await menu.click();
  const category = page.getByRole("button", { name: "テストカテゴリ", exact: true });
  if ((await category.getAttribute("aria-expanded")) === "false") await category.click();
  await expect(page.getByText("ローカルテスト板", { exact: true })).toBeVisible();
  await capture(page, "02-board-list");

  await page.getByText("ローカルテスト板", { exact: true }).click();
  const panel = page.locator('.content-area__tab-panel[data-active="true"]');
  await expect(panel.getByText("架空番組実況スレッド ★1", { exact: true })).toBeVisible();
  await capture(page, "03-thread-list");
  await captureMiniWindows(page, "thread-list");

  await panel.getByText("架空番組実況スレッド ★1", { exact: true }).click();
  const responses = page.locator(".thread-page__responses");
  await expect(responses.locator('[data-res-num="24"]')).toBeVisible();

  // 架空スレをブックマークし、履歴・ログと合わせて一覧画面に表示する。
  await page.getByTitle("メニュー", { exact: true }).click();
  const addBookmark = page.getByRole("button", { name: "お気に入りに追加", exact: true });
  if (await addBookmark.count()) await addBookmark.click();

  // コメント流し表示は自動更新中に届いた新着だけを順次出すため、先に有効化する。
  await page.locator(".status-bar").getByRole("button", { name: /スレッド自動更新/u }).click();
  const autoRefreshPanel = page.locator(".mini-window");
  await expect(autoRefreshPanel).toBeVisible();
  await autoRefreshPanel.locator(".mini-window__toggle-row").filter({ hasText: "自動更新" }).locator(".mini-window__switch").click();
  await expect(
    autoRefreshPanel.locator(".mini-window__toggle-row").filter({ hasText: "自動更新" }).locator(".mini-window__switch"),
  ).toHaveAttribute("aria-pressed", "true");
  await autoRefreshPanel.locator(".mini-window__close").click();
  await capture(page, "04-thread-live-chat");

  localBoard.appendPost();
  await page.getByRole("button", { name: "更新", exact: true }).click();
  await expect(responses.locator('[data-res-num="25"]')).toContainText("更新で追加された日本語レス");
  await capture(page, "05-thread-new-comments");

  // 人気フィルタの小窓は多レス表示中だけ現れるため、メニューから状態を切り替える。
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByText("フィルター", { exact: true }).click();
  await page.getByRole("button", { name: "多レス", exact: true }).click();
  await expect(page.locator(".status-bar").getByRole("button", { name: /人気レス/u })).toBeVisible();

  await captureMiniWindows(page, "thread");

  await captureQuickAccessPage(page, "ブックマークリスト", "06-bookmarks");
  await captureQuickAccessPage(page, "閲覧履歴", "07-history");
  await captureQuickAccessPage(page, "ログ検索", "08-logs");
  await captureQuickAccessPage(page, "書き込み履歴", "09-write-history");

  await captureSettings(page);
});
