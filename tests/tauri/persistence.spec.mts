import { expect, test } from "./fixtures.mjs";

// Chrome版の再読み込みと違い、アプリを終了して起動し直す。閲覧履歴とレスのキャッシュはSQLite、
// タブのセッションはWebView2のlocalStorageに残るため、両方が同じ保存先へ書けていることを確かめる。
test("Tauri版を再起動しても閲覧中のスレッドと閲覧履歴が残る", async ({ tauri, localBoard }) => {
  const page = tauri.page;
  await page.getByTestId("title-bar-title").click();
  const urlInput = page.getByPlaceholder("URLを入力");
  await urlInput.fill(localBoard.threadUrl);
  await urlInput.press("Enter");
  const panel = page.locator('.content-area__tab-panel[data-active="true"]');
  const responses = panel.locator(".thread-page__responses");
  await expect(responses.locator('[data-res-num="2"]')).toContainText("二番目の日本語レス");

  localBoard.appendPost();
  await page.getByRole("button", { name: "更新", exact: true }).click();
  await expect(responses.locator('[data-res-num="3"]')).toContainText("更新で追加された日本語レス");

  await tauri.restart();
  const restarted = tauri.page;
  const restoredPanel = restarted.locator('.content-area__tab-panel[data-active="true"]');
  const restoredResponses = restoredPanel.locator(".thread-page__responses");
  await expect(restoredResponses.locator('[data-res-num="3"]')).toContainText(
    "更新で追加された日本語レス",
  );
  await expect(restoredResponses.locator("[data-res-num]")).toHaveCount(3);

  await restarted.getByTitle("メニュー", { exact: true }).click();
  await restarted.getByRole("button", { name: "閲覧履歴", exact: true }).click();
  await expect(
    restoredPanel
      .locator(".simple-data-table__title")
      .filter({ hasText: "ローカルテストスレッド" }),
  ).toBeVisible();
});
