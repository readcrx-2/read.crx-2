import { expect, test } from "./fixtures.mjs";

// React版の入口から検証し、旧HTMLの要素に依存させない。
test("起動時にホームと新しいタブの操作が表示される", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await expect(page.locator(".browser-shell")).toBeVisible();
  await expect(page.getByRole("button", { name: "板一覧を開く", exact: true })).toBeVisible();
  await page.getByTitle("新しいタブ", { exact: true }).click();
  await page.getByTestId("title-bar-title").click();
  await expect(page.getByPlaceholder("URLを入力")).toBeVisible();
});

test("ナビゲーションから設定画面を開ける", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByTitle("設定を開く", { exact: true }).click();
  await expect(page.locator(".settings-page__shell")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "設定カテゴリ" })).toBeVisible();
});

// Radix の非制御Tooltipは、開いた通知を自分で受けて表示直後に閉じていた。
// 単体テストのDOMでは effect の順序が再現しにくいため、実ブラウザでホバーし続けて確かめる。
test("ボタンのツールチップがホバー中は表示され続ける", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByTitle("設定を開く", { exact: true }).click();
  await page.getByRole("button", { name: "板", exact: true }).click();
  await page.getByRole("button", { name: "板一覧を再取得" }).hover();
  const tooltip = page.locator(".browser-tooltip").filter({ hasText: "強制取得" });
  await expect(tooltip).toBeVisible();
  await page.waitForTimeout(500);
  await expect(tooltip).toBeVisible();
});

// 旧 example.spec.mts から移した。起動確認は上のテストと重なるため、
// 画面からは見えないバックグラウンドの起動だけをここで確認する。
test("バックグラウンドのサービスワーカーが動作していること", async ({ context, extensionId }) => {
  const serviceWorkers = context.serviceWorkers();
  expect(serviceWorkers.length).toBeGreaterThan(0);
  expect(serviceWorkers[0].url()).toContain(extensionId);
});
