import { expect, test } from "./fixtures.mjs";

test("ホームの板一覧からローカル板を選び、ホームへ戻れる", async ({
  page,
  extensionId,
  localBoard,
}) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByRole("button", { name: "板一覧を開く", exact: true }).click();
  // 保存済み開閉状態に依存せず、必要な階層だけを開いて通常の板選択を通す。
  const menu = page.getByRole("button", { name: "テスト板メニュー", exact: true });
  await expect(menu).toBeVisible();
  if ((await menu.getAttribute("aria-expanded")) === "false") await menu.click();
  const category = page.getByRole("button", { name: "テストカテゴリ", exact: true });
  await expect(category).toBeVisible();
  if ((await category.getAttribute("aria-expanded")) === "false") await category.click();
  await page.getByText("ローカルテスト板", { exact: true }).click();
  const panel = page.locator('.content-area__tab-panel[data-active="true"]');
  await expect(panel.getByText("ローカルテストスレッド", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "戻る", exact: true }).click();
  await expect(page.getByRole("button", { name: "板一覧を開く", exact: true })).toBeVisible();
  expect(localBoard.requests).toContain("/bbsmenu.html");
  expect(localBoard.requests).toContain("/local/subject.txt");
});

test("ローカル板からスレッドを開き、更新と再起動後もレスを重複させず表示する", async ({
  page,
  extensionId,
  localBoard,
}) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  const urlInput = page.getByPlaceholder("URLを入力");
  await urlInput.fill(localBoard.boardUrl);
  await urlInput.press("Enter");

  const panel = page.locator('.content-area__tab-panel[data-active="true"]');
  await expect(panel.getByText("ローカルテストスレッド", { exact: true })).toBeVisible();
  await panel.getByText("ローカルテストスレッド", { exact: true }).click();
  const responses = page.locator(
    '.content-area__tab-panel[data-active="true"] .thread-page__responses',
  );
  await expect(responses.locator('[data-res-num="1"]')).toContainText("最初の日本語レス");
  await expect(responses.locator('[data-res-num="2"]')).toContainText("二番目の日本語レス");

  localBoard.appendPost();
  await page.getByRole("button", { name: "更新", exact: true }).click();
  await expect(responses.locator('[data-res-num="3"]')).toContainText("更新で追加された日本語レス");
  await expect(responses.locator("[data-res-num]")).toHaveCount(3);

  // UI操作で保存されたセッションを復元させ、直接ストアを書き換えるテストでは見えない退行を検出する。
  await page.reload();
  await expect(responses.locator('[data-res-num="3"]')).toContainText("更新で追加された日本語レス");
  await expect(responses.locator("[data-res-num]")).toHaveCount(3);
  expect(localBoard.requests).toContain("/local/subject.txt");
  expect(
    localBoard.requests.filter((url) => url === "/local/dat/1000000001.dat").length,
  ).toBeGreaterThanOrEqual(2);
});
