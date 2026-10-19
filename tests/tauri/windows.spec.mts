import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.mjs";

type TauriInternals = {
  invoke: (command: string, args: Record<string, unknown>) => Promise<unknown>;
};

/**
 * Tauriの窓が表示されているかをネイティブの窓に問い合わせる。
 *
 * 非表示の窓もCDPにはページとして残り、WebView2の `document.visibilityState` も
 * 窓を隠しても "visible" のままなので、画面側の状態からは見分けられない。
 */
async function isWindowVisible(page: Page, label: string): Promise<boolean> {
  return page.evaluate(
    async (windowLabel) =>
      (
        window as typeof window & { __TAURI_INTERNALS__: TauriInternals }
      ).__TAURI_INTERNALS__.invoke("plugin:window|is_visible", { label: windowLabel }),
    label,
  ) as Promise<boolean>;
}

test("コマンドパレットから過去実況再生の窓を開き、閉じると非表示に戻る", async ({ tauri }) => {
  const page = tauri.page;
  const replay = await tauri.window("replay");
  await expect.poll(() => isWindowVisible(page, "archive-replay")).toBe(false);

  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByRole("button", { name: "コマンドパレット", exact: true }).click();
  // 入力欄は先頭の ">" でコマンド検索になるため、fillで置き換えるときも残す。
  await page.getByPlaceholder("コマンドを検索...").fill(">過去実況");
  await page.getByRole("option", { name: /過去実況再生を開く/u }).click();

  await expect.poll(() => isWindowVisible(page, "archive-replay")).toBe(true);
  await expect(replay.getByRole("heading", { name: "過去実況再生", exact: true })).toBeVisible();

  // OSの閉じる操作と同じく、破棄せず非表示にして次回も同じ窓を使う（archive-replay-window.ts）。
  await replay.getByRole("button", { name: "過去実況再生を閉じる", exact: true }).click();
  await expect.poll(() => isWindowVisible(page, "archive-replay")).toBe(false);
});

test("コメントOverlayを流し始めると、更新で届いたレスが別窓に流れる", async ({
  tauri,
  localBoard,
}) => {
  const page = tauri.page;
  await page.getByTestId("title-bar-title").click();
  const urlInput = page.getByPlaceholder("URLを入力");
  await urlInput.fill(localBoard.threadUrl);
  await urlInput.press("Enter");
  const responses = page.locator(
    '.content-area__tab-panel[data-active="true"] .thread-page__responses',
  );
  await expect(responses.locator('[data-res-num="2"]')).toContainText("二番目の日本語レス");

  const overlayControl = page
    .locator(".status-bar")
    .getByRole("button", { name: /コメントOverlay制御/u });
  await overlayControl.click();
  const flowSwitch = page
    .locator(".mini-window__toggle-row")
    .filter({ hasText: "コメントを画面に流す" })
    .locator(".mini-window__switch");
  await flowSwitch.click();
  await expect(flowSwitch).toHaveAttribute("aria-pressed", "true");
  const overlay = await tauri.window("overlay");
  await expect.poll(() => isWindowVisible(page, "comment-overlay")).toBe(true);
  await page.locator(".mini-window__close").click();

  localBoard.appendPost();
  await page.getByRole("button", { name: "更新", exact: true }).click();
  await expect(responses.locator('[data-res-num="3"]')).toContainText("更新で追加された日本語レス");
  await expect(
    overlay
      .locator(".comment-overlay-stage__comment")
      .filter({ hasText: "更新で追加された日本語レス" }),
  ).toBeVisible({ timeout: 15_000 });

  await overlayControl.click();
  await flowSwitch.click();
  await expect(flowSwitch).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => isWindowVisible(page, "comment-overlay")).toBe(false);
});
