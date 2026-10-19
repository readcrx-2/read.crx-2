import { expect, test } from "./fixtures.mjs";

// Tauri版の取得はWebViewのfetchではなくRustのHTTP（http_transport.rs）を通るため、
// Chrome版のE2Eでは検証できないShift_JISの変換と差分更新をここで確かめる。
test("Tauri版で板一覧からスレッドを開き、更新でレスを重複させず追加する", async ({
  page,
  localBoard,
}) => {
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
  await panel.getByText("ローカルテストスレッド", { exact: true }).click();
  const responses = panel.locator(".thread-page__responses");
  await expect(responses.locator('[data-res-num="1"]')).toContainText("最初の日本語レス");
  await expect(responses.locator('[data-res-num="2"]')).toContainText("二番目の日本語レス");

  localBoard.appendPost();
  await page.getByRole("button", { name: "更新", exact: true }).click();
  await expect(responses.locator('[data-res-num="3"]')).toContainText("更新で追加された日本語レス");
  await expect(responses.locator("[data-res-num]")).toHaveCount(3);

  expect(localBoard.requests).toContain("/bbsmenu.html");
  expect(localBoard.requests).toContain("/local/subject.txt");
  expect(
    localBoard.requests.filter((url) => url === "/local/dat/1000000001.dat").length,
  ).toBeGreaterThanOrEqual(2);
});
