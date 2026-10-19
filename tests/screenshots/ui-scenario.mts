/**
 * Chrome版とTauri版で共通のUIスクリーンショット撮影手順。
 *
 * 変更理由: 以前はChrome版のspecとTauri版のスクリプトが同じ手順を別々に持ち、片方だけ画面が
 * 増えたり撮影名がずれたりしていた。手順をここへ集め、各版のspecは起動方法と固有の画面だけを持つ。
 * 出力先は `scripts/ui-screenshots.mjs` が決め、`<出力先>/<chrome|tauri>/<light|dark>/` に保存する。
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, type Page } from "@playwright/test";

import type { startLocalBoard } from "../localboard.mjs";

type LocalBoard = Awaited<ReturnType<typeof startLocalBoard>>;

/**
 * 撮影するテーマ。`config_theme_id` の値で、保存先のフォルダー名にも使う。
 * 既定の "system" はOSの配色で結果が変わるため、明示した2つを撮る。
 */
export const UI_THEMES = ["light", "dark"] as const;
export type UiTheme = (typeof UI_THEMES)[number];

export const SCREENSHOT_THREAD_TITLE = "架空番組実況スレッド ★1";
const SCREENSHOT_RESPONSE_COUNT = 24;

const SETTINGS = [
  ["一般", "settings-general"],
  ["表示", "settings-display"],
  ["ドメイン共通と各板", "settings-site-board"],
  ["更新関連", "settings-reload"],
  ["コメントOverlay", "settings-comment-overlay"],
  ["NG", "settings-ng"],
  ["その他", "settings-other"],
  ["デバッグ", "settings-debug"],
  ["データ", "settings-data"],
] as const;

/**
 * 1920px幅のディスプレイで、ウィンドウを左右半分に並べたときの表示領域。
 * 設定画面のサイドバーがこの幅でも窮屈にならないかを確かめるため、各カテゴリを撮る。
 */
const HALF_DISPLAY_VIEWPORT = { width: 960, height: 1040 };

function defaultRoot(): string {
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  return path.join("screenshots", "ui", stamp);
}

/** 版とテーマごとの保存先へ、名前を付けて撮影する。 */
export class Shooter {
  private constructor(readonly dir: string) {}

  static async create(platform: "chrome" | "tauri", theme: UiTheme): Promise<Shooter> {
    const root = path.resolve(process.env.UI_SHOT_DIR ?? defaultRoot());
    const dir = path.join(root, platform, theme);
    await mkdir(dir, { recursive: true });
    return new Shooter(dir);
  }

  async capture(page: Page, name: string, animations: "disabled" | "allow" = "disabled") {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(this.dir, `${name}.png`), animations });
  }
}

function fileName(label: string): string {
  return label
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}-]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .toLowerCase();
}

/** 一覧やレス表示が埋まるよう、架空の板・スレ・レスを配信する。 */
export function seedScreenshotThreads(localBoard: LocalBoard): void {
  localBoard.setThreads([
    {
      id: "1000000001",
      title: SCREENSHOT_THREAD_TITLE,
      posts: Array.from({ length: SCREENSHOT_RESPONSE_COUNT }, (_, index) => {
        const number = String(index + 1).padStart(3, "0");
        const messages = [
          "番組始まった！",
          "この場面の演出いいね",
          "次の展開が気になる",
          "※画像は example.com のダミーです",
          "実況テスト用のレスです",
          "ここ好き",
        ];
        return `視聴者${number}<>sage<>2026/10/02(金) 12:${String(index).padStart(2, "0")}:00 ID:sample${String(index % 7).padStart(3, "0")}<>${messages[index % messages.length]}<>${SCREENSHOT_THREAD_TITLE}`;
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
}

/** テーマと実況向けの表示形式を保存し、読み込み直して反映を待つ。 */
export async function applyTheme(page: Page, theme: UiTheme): Promise<void> {
  await page.evaluate((themeId) => {
    localStorage.setItem("config_theme_id", themeId);
    localStorage.setItem("config_thread_display_mode", "live-chat");
  }, theme);
  await page.reload();
  await expect(page.locator(".browser-shell")).toHaveAttribute("data-theme", theme);
}

async function captureMiniWindows(page: Page, shooter: Shooter, prefix: string): Promise<void> {
  const statusButtons = page.locator(".status-bar button");
  // 小窓を開くとステータスバー配下のDOMが更新されるため、nth()を使い回さず
  // 最初に撮影対象の名前を控えて、各回でボタンを取り直す。
  const labels = await statusButtons.evaluateAll((buttons) =>
    buttons
      .map(
        (button) =>
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
    const button = page
      .locator(".status-bar")
      .getByRole("button", { name: label, exact: true })
      .first();
    // ページ遷移などで対象が消えた場合は、存在しないnth()を待たず次へ進む。
    if ((await button.count()) === 0) continue;
    await button.click();
    const miniWindow = page.locator(".mini-window");
    if (await miniWindow.count()) {
      await expect(miniWindow).toBeVisible();
      const title = (await miniWindow.locator(".mini-window__title").innerText()).trim();
      await shooter.capture(
        page,
        `${prefix}-mini-${String(miniWindowIndex).padStart(2, "0")}-${fileName(title || label)}`,
      );
      miniWindowIndex += 1;
    }
  }
  if (await page.locator(".mini-window").count()) await page.locator(".mini-window__close").click();
}

async function captureQuickAccessPage(
  page: Page,
  shooter: Shooter,
  label: string,
  name: string,
): Promise<void> {
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByText(label, { exact: true }).click();
  await page.locator(".thread-list-page, .page-status").waitFor({ state: "visible" });
  await page.waitForTimeout(300);
  await page.locator('.page-status [aria-label$="読み込み中"]').waitFor({ state: "hidden" });
  await shooter.capture(page, name);
}

async function captureSettings(page: Page, shooter: Shooter): Promise<void> {
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByTitle("設定を開く", { exact: true }).click();
  await expect(page.locator(".settings-page__shell")).toBeVisible();

  const captureScrolledSections = async (name: string) => {
    const main = page.locator(".settings-page__main");
    await main.evaluate((element) => {
      element.scrollTop = 0;
    });
    const { height, maxScroll } = await main.evaluate((element) => ({
      height: Math.max(element.clientHeight, 1),
      maxScroll: Math.max(0, element.scrollHeight - element.clientHeight),
    }));
    let index = 1;
    for (let top = 0; top <= maxScroll; top += Math.max(1, Math.floor(height * 0.8))) {
      await main.evaluate((element, scrollTop) => {
        element.scrollTop = scrollTop;
      }, top);
      await shooter.capture(page, `${name}-section-${String(index).padStart(2, "0")}`);
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
      await page
        .locator(".settings-page__main details:not([open]) summary")
        .evaluateAll((summaries) => {
          for (const summary of summaries) (summary as HTMLElement).click();
        });
      await captureScrolledSections(file);
      if (label === "データ") {
        await page.getByRole("button", { name: "zipをエクスポート", exact: true }).click();
        await page
          .getByRole("dialog", { name: "バックアップ内容を選択" })
          .waitFor({ state: "visible" });
        await shooter.capture(page, `${file}-export-dialog`);
        await page.getByRole("button", { name: "キャンセル", exact: true }).click();
      }
    }
  }
}

/**
 * 表示領域をディスプレイの半分の幅へ変え、設定の各カテゴリの先頭を撮る。
 * 表示領域を元に戻さないため、撮影の最後に呼ぶ。
 */
async function captureSettingsAtHalfDisplay(page: Page, shooter: Shooter): Promise<void> {
  await page.setViewportSize(HALF_DISPLAY_VIEWPORT);
  const main = page.locator(".settings-page__main");
  for (const [label, file] of SETTINGS) {
    const section = page.locator(".settings-page__section-btn").filter({ hasText: label }).first();
    if (!(await section.count())) continue;
    await section.click();
    await expect(page.locator(".settings-page__title")).toHaveText(label);
    await page.locator('[aria-label$="読み込み中"]').waitFor({ state: "hidden" });
    await page.locator(".settings-page__site-board-loading").waitFor({ state: "hidden" });
    await main.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.waitForTimeout(200);
    await shooter.capture(page, `${file}-half-display`);
  }
}

export interface ScenarioOptions {
  /** スレッドを開いて新着を受け取った後に、版に固有の画面を撮影する。 */
  afterThread?: () => Promise<void>;
}

/**
 * ホームから設定までの共通画面を撮影する。
 *
 * 事前に `seedScreenshotThreads` で架空データを配信し、`applyTheme` でテーマを反映しておく。
 */
export async function captureCommonScreens(
  page: Page,
  shooter: Shooter,
  localBoard: LocalBoard,
  options: ScenarioOptions = {},
): Promise<void> {
  await shooter.capture(page, "01-home");

  await page.getByRole("button", { name: "板一覧を開く", exact: true }).click();
  const menu = page.getByRole("button", { name: "テスト板メニュー", exact: true });
  if ((await menu.getAttribute("aria-expanded")) === "false") await menu.click();
  const category = page.getByRole("button", { name: "テストカテゴリ", exact: true });
  if ((await category.getAttribute("aria-expanded")) === "false") await category.click();
  await expect(page.getByText("ローカルテスト板", { exact: true })).toBeVisible();
  await shooter.capture(page, "02-board-list");

  await page.getByText("ローカルテスト板", { exact: true }).click();
  const panel = page.locator('.content-area__tab-panel[data-active="true"]');
  await expect(panel.getByText(SCREENSHOT_THREAD_TITLE, { exact: true })).toBeVisible();
  await shooter.capture(page, "03-thread-list");
  await captureMiniWindows(page, shooter, "thread-list");

  await panel.getByText(SCREENSHOT_THREAD_TITLE, { exact: true }).click();
  const responses = panel.locator(".thread-page__responses");
  await expect(responses.locator(`[data-res-num="${SCREENSHOT_RESPONSE_COUNT}"]`)).toBeVisible({
    timeout: 30_000,
  });

  // 架空スレをブックマークし、履歴・ログと合わせて一覧画面に表示する。
  await page.getByTitle("メニュー", { exact: true }).click();
  const addBookmark = page.getByRole("button", { name: "お気に入りに追加", exact: true });
  if (await addBookmark.count()) await addBookmark.click();

  // コメント流し表示は自動更新中に届いた新着だけを順次出すため、先に有効化する。
  await page
    .locator(".status-bar")
    .getByRole("button", { name: /スレッド自動更新/u })
    .click();
  const autoRefreshPanel = page.locator(".mini-window");
  await expect(autoRefreshPanel).toBeVisible();
  const autoRefreshSwitch = autoRefreshPanel
    .locator(".mini-window__toggle-row")
    .filter({ hasText: "自動更新" })
    .locator(".mini-window__switch");
  await autoRefreshSwitch.click();
  await expect(autoRefreshSwitch).toHaveAttribute("aria-pressed", "true");
  await autoRefreshPanel.locator(".mini-window__close").click();
  await shooter.capture(page, "04-thread-live-chat");

  localBoard.appendPost();
  await page.getByRole("button", { name: "更新", exact: true }).click();
  await expect(
    responses.locator(`[data-res-num="${SCREENSHOT_RESPONSE_COUNT + 1}"]`),
  ).toContainText("更新で追加された日本語レス");
  await shooter.capture(page, "05-thread-new-comments");

  // 人気フィルタの小窓は多レス表示中だけ現れるため、メニューから状態を切り替える。
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByText("フィルター", { exact: true }).click();
  await page.getByRole("button", { name: "多レス", exact: true }).click();
  await expect(
    page.locator(".status-bar").getByRole("button", { name: /人気レス/u }),
  ).toBeVisible();
  await captureMiniWindows(page, shooter, "thread");

  await options.afterThread?.();

  await captureQuickAccessPage(page, shooter, "ブックマークリスト", "06-bookmarks");
  await captureQuickAccessPage(page, shooter, "閲覧履歴", "07-history");
  await captureQuickAccessPage(page, shooter, "ログ検索", "08-logs");
  await captureQuickAccessPage(page, shooter, "書き込み履歴", "09-write-history");

  await captureSettings(page, shooter);
  await captureSettingsAtHalfDisplay(page, shooter);
}
