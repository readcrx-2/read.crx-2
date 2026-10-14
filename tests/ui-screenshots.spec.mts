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
  const statusButtonCount = await statusButtons.count();
  let miniWindowIndex = 1;
  for (let index = 0; index < statusButtonCount; index += 1) {
    const button = statusButtons.nth(index);
    const label =
      (await button.getAttribute("aria-label")) ??
      (await button.getAttribute("title")) ??
      (await button.innerText()).trim();
    if (await page.locator(".mini-window").count()) {
      await page.locator(".mini-window__close").click();
    }
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

test("UI画面とステータスバーのミニウィンドウを撮影する", async ({ page, extensionId, localBoard }) => {
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

  // 人気フィルタは有効時だけステータスバー項目が現れるため、先に表示状態へ切り替える。
  const popularFilter = page.locator(".thread-page__filter-btn").filter({ hasText: "多レス" });
  if (await popularFilter.isVisible()) {
    await popularFilter.click();
    await expect(page.locator(".status-bar").getByRole("button", { name: /人気レス/u })).toBeVisible();
  }

  await captureMiniWindows(page, "thread");

  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByTitle("設定を開く", { exact: true }).click();
  await expect(page.locator(".settings-page__shell")).toBeVisible();
  for (const [label, file] of SETTINGS) {
    const section = page.locator(".settings-page__section-btn").filter({ hasText: label }).first();
    if (!(await section.count())) continue;
    await section.click();
    await expect(page.locator(".settings-page__title")).toHaveText(label);
    await capture(page, file);
  }

  // 各カテゴリの補助設定はページ下部にあるため、個別にスクロールして撮影する。
  for (const [label, file] of [
    ["表示", "settings-display-details"],
    ["ドメイン共通と各板", "settings-site-board-details"],
    ["その他", "settings-other-details"],
    ["データ", "settings-data-details"],
  ] as const) {
    const section = page.locator(".settings-page__section-btn").filter({ hasText: label }).first();
    if (!(await section.count())) continue;
    await section.click();
    const main = page.locator(".settings-page__main");
    await main.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await capture(page, file);
    await main.evaluate((element) => {
      element.scrollTop = 0;
    });
  }
});
