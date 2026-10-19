import { expect, test } from "./fixtures.mjs";

test("非表示の閲覧履歴タブへ戻ると最新の履歴が表示され、再読み込み後も残る", async ({
  page,
  extensionId,
  localBoard,
}) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByRole("button", { name: "閲覧履歴", exact: true }).click();
  const panel = page.locator('.content-area__tab-panel[data-active="true"]');
  await expect(panel.locator(".history-list-page__table")).toBeVisible();
  await page.getByTitle("新しいタブ", { exact: true }).click();
  await page.getByTestId("title-bar-title").click();
  const input = page.getByPlaceholder("URLを入力");
  await input.fill(localBoard.threadUrl);
  await input.press("Enter");
  await expect(panel.locator('[data-res-num="1"]')).toContainText("最初の日本語レス");
  // 非表示タブの再表示で読み直し、メモリ上だけの履歴では通さない。
  await page.getByRole("tab", { name: "閲覧履歴" }).click();
  await expect(
    panel.locator(".simple-data-table__title").filter({ hasText: "ローカルテストスレッド" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    panel.locator(".simple-data-table__title").filter({ hasText: "ローカルテストスレッド" }),
  ).toBeVisible();
});
