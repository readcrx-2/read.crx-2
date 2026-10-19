import { readdir } from "node:fs/promises";

import { expect, test } from "./fixtures.mjs";

test("Tauri版を起動するとホームと新しいタブの操作が表示される", async ({ page }) => {
  await expect(page.locator(".browser-shell")).toBeVisible();
  await expect(page.getByRole("button", { name: "板一覧を開く", exact: true })).toBeVisible();
  await page.getByTitle("新しいタブ", { exact: true }).click();
  await page.getByTestId("title-bar-title").click();
  await expect(page.getByPlaceholder("URLを入力")).toBeVisible();
});

test("Tauri版はSQLiteとWebView2のデータをE2E用の保存先に作る", async ({ tauri }) => {
  // 差し替えが効かないと普段使いの %APPDATA%\com.chlens.app を読み書きしてしまう（data_dir.rs）。
  await expect
    .poll(async () => readdir(tauri.dataDir), { timeout: 10_000 })
    .toEqual(expect.arrayContaining(["chlens.db", "webview2"]));
});
