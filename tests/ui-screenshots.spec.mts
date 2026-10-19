import { expect, test } from "./fixtures.mjs";
import {
  applyTheme,
  captureCommonScreens,
  seedScreenshotThreads,
  Shooter,
  UI_THEMES,
} from "./screenshots/ui-scenario.mjs";

for (const theme of UI_THEMES) {
  test(`Chrome版のUI画面とミニウィンドウを${theme}テーマで撮影する`, async ({
    page,
    extensionId,
    localBoard,
  }) => {
    // 多数の設定セクションを個別に保存する撮影シナリオのため、通常の短いE2E上限を延長する。
    test.setTimeout(300_000);
    const shooter = await Shooter.create("chrome", theme);
    seedScreenshotThreads(localBoard);
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(`chrome-extension://${extensionId}/view/index.html`);
    await expect(page.locator(".browser-shell")).toBeVisible();
    await applyTheme(page, theme);
    await captureCommonScreens(page, shooter, localBoard);
  });
}
