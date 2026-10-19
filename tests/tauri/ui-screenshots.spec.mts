import {
  applyTheme,
  captureCommonScreens,
  seedScreenshotThreads,
  Shooter,
  UI_THEMES,
} from "../screenshots/ui-scenario.mjs";
import { expect, type TauriApp, test } from "./fixtures.mjs";

/** Tauri版だけにあるコメントOverlayの操作窓と、流れている状態のOverlay窓を撮影する。 */
async function captureCommentOverlay(
  tauri: TauriApp,
  shooter: Shooter,
  appendPost: () => void,
): Promise<void> {
  const page = tauri.page;
  const overlayControl = page
    .locator(".status-bar")
    .getByRole("button", { name: /コメントOverlay制御/u });
  await overlayControl.click();
  const overlayPanel = page.locator(".mini-window");
  await expect(overlayPanel).toBeVisible();
  await shooter.capture(page, "tauri-comment-overlay-controls");
  const flowSwitch = overlayPanel
    .locator(".mini-window__toggle-row")
    .filter({ hasText: "コメントを画面に流す" })
    .locator(".mini-window__switch");
  await flowSwitch.click();
  await expect(flowSwitch).toHaveAttribute("aria-pressed", "true");
  const overlay = await tauri.window("overlay");
  await shooter.capture(overlay, "tauri-comment-overlay-empty");
  await overlayPanel.locator(".mini-window__close").click();

  appendPost();
  await page.getByRole("button", { name: "更新", exact: true }).click();
  await expect(overlay.locator(".comment-overlay-stage__comment").first()).toBeVisible({
    timeout: 15_000,
  });
  // コメントは右端から入ってくるため、表示された直後ではほぼ画面外に写る。
  // 画面の中ほどまで流れるのを待ち、この1枚だけアニメーションを止めずに撮る。
  await overlay.waitForTimeout(2_000);
  await shooter.capture(overlay, "tauri-comment-overlay-flowing", "allow");

  await overlayControl.click();
  await flowSwitch.click();
  await expect(flowSwitch).toHaveAttribute("aria-pressed", "false");
  await page.locator(".mini-window__close").click();
}

async function captureArchiveReplay(tauri: TauriApp, shooter: Shooter): Promise<void> {
  const page = tauri.page;
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByRole("button", { name: "コマンドパレット", exact: true }).click();
  // 入力欄は先頭の ">" でコマンド検索になるため、fillで置き換えるときも残す。
  await page.getByPlaceholder("コマンドを検索...").fill(">過去実況");
  await page.getByRole("option", { name: /過去実況再生を開く/u }).click();
  const replay = await tauri.window("replay");
  await expect(replay.getByRole("heading", { name: "過去実況再生", exact: true })).toBeVisible();
  await shooter.capture(replay, "tauri-archive-replay");
  await replay.getByRole("button", { name: "過去実況再生を閉じる", exact: true }).click();
}

for (const theme of UI_THEMES) {
  test(`Tauri版のUI画面と別窓を${theme}テーマで撮影する`, async ({ tauri, localBoard }) => {
    // 多数の設定セクションを個別に保存する撮影シナリオのため、通常の短いE2E上限を延長する。
    test.setTimeout(300_000);
    const shooter = await Shooter.create("tauri", theme);
    seedScreenshotThreads(localBoard);
    await applyTheme(tauri.page, theme);
    await captureCommonScreens(tauri.page, shooter, localBoard, {
      afterThread: async () => {
        await captureCommentOverlay(tauri, shooter, () => localBoard.appendPost());
        await captureArchiveReplay(tauri, shooter);
      },
    });
  });
}
