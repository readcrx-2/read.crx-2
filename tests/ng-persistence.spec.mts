import { expect, test } from "./fixtures.mjs";

test("IDをNG指定したレスは更新と再読み込み後も非表示のまま", async ({
  page,
  extensionId,
  localBoard,
}) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  const input = page.getByPlaceholder("URLを入力");
  await input.fill(localBoard.threadUrl);
  await input.press("Enter");
  const first = page.locator('.thread-page__responses [data-res-num="1"]');
  const second = page.locator('.thread-page__responses [data-res-num="2"]');
  await expect(first).toContainText("最初の日本語レス");
  await expect(second).toContainText("二番目の日本語レス");
  // 画面上のNG操作と永続化をまとめて検証する。
  await first.click({ button: "right" });
  await page.getByRole("button", { name: "ID/IPをNG指定", exact: true }).click();
  await expect(first).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("config_ngwords")))
    .toBe('hide:\n  when id contains "local001"');
  await page.getByRole("button", { name: "更新", exact: true }).click();
  await expect(second).toBeVisible();
  await expect(first).toBeHidden();
  await page.reload();
  await expect(second).toBeVisible();
  await expect(first).toBeHidden();
});
