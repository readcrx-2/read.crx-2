import { readFileSync } from "node:fs";

import iconv from "iconv-lite";

import { expect, test } from "./fixtures.mjs";

test("NG内の置換タブから先頭のBEアイコンを削除し、本文とサムネイルへ反映する", async ({
  page,
  context,
  extensionId,
  localBoard,
}, testInfo) => {
  // 任意の添付DATでも同じテストを実行できる。実在するスレッドのURLや本文を固定fixtureへ保存しない。
  const source = process.env.CHLENS_E2E_DAT_PATH
    ? iconv.decode(readFileSync(process.env.CHLENS_E2E_DAT_PATH), "Shift_JIS")
    : "名無し<>sage<>2026/10/02(金) 12:00:00 ID:local001<> sssp://example.com/ico/001.gif <br> 残す本文 <br> https://example.com/keep.png <>置換E2E\n";
  const rows = source.trimEnd().split(/\r?\n/u);
  const first = rows[0].split("<>");
  first[4] = "置換E2E";
  rows[0] = first.join("<>");
  localBoard.setDat(rows.join("\n"));
  const iconPostIndex = rows.findIndex((row) =>
    /sssp:\/\/[^\s<>]+\/ico\/001\.gif/u.test(row.split("<>")[3] ?? ""),
  );
  expect(iconPostIndex).toBeGreaterThanOrEqual(0);
  const message = rows[iconPostIndex].split("<>")[3];
  const iconUrl = message
    .match(/sssp:\/\/[^\s<>]+\/ico\/001\.gif/u)![0]
    .replace(/^sssp:/u, "https:");
  const remainingText = message.split(/<br\s*\/?\s*>/iu)[1].trim();
  await context.route(/https?:\/\//u, async (route) => {
    const requestUrl = new URL(route.request().url());
    const boardUrl = new URL(localBoard.origin);
    if (requestUrl.origin === boardUrl.origin) return route.continue();
    // アプリが先に試すHTTPSは、HTTP専用ローカル板への再試行を妨げないよう失敗させる。
    if (requestUrl.hostname === boardUrl.hostname && requestUrl.port === boardUrl.port)
      return route.abort("connectionfailed");
    // テストでは画像の内容に依存せず、サムネイル要素とURLを検証する。
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  });
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  const urlInput = page.getByPlaceholder("URLを入力");
  await urlInput.fill(localBoard.threadUrl);
  await urlInput.press("Enter");
  const panel = page.locator('.content-area__tab-panel[data-active="true"]');
  const iconPost = panel.locator(`[data-res-num="${iconPostIndex + 1}"]`);
  await expect(iconPost).toContainText(remainingText);
  await expect(
    iconPost.locator(".res__thumb--image").filter({ has: page.locator(`img[src="${iconUrl}"]`) }),
  ).toHaveCount(1);

  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByTitle("設定を開く", { exact: true }).click();
  await panel.getByRole("button", { name: /^NG/ }).click();
  await panel.getByRole("tab", { name: "文字列置換", exact: true }).click();
  const editor = panel.getByRole("textbox", { name: "置換ルール", exact: true });
  // MonacoのNative EditContextは空の入力要素が0サイズになるため、実際の編集面をクリックする。
  const editingSurface = panel.locator(".monaco-editor .view-lines");
  await expect(editingSurface).toBeVisible();
  await editingSurface.click({ position: { x: 10, y: 10 } });
  await expect(editor).toBeFocused();
  await page.keyboard.insertText("remove body line first:\n  equals bare");
  await expect(panel.getByText("置換ルールを保存できません", { exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("config_replace_str_txt")))
    .toBeNull();
  const rule = `remove body line first:\n  equals "${iconUrl}"`;
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(rule);
  await expect
    // Monacoの改行コードはOS・モデルによってCRLFになるため、DSLの内容を揃えて比較する。
    .poll(() =>
      page.evaluate(() => localStorage.getItem("config_replace_str_txt")?.replace(/\r\n/gu, "\n")),
    )
    .toBe(rule);
  await expect(panel.getByText("置換ルールを保存できません", { exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "置換記法例", exact: true }).click();
  await expect(panel.locator(".dsl-editor__snippet")).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath("replacement-settings.png"), fullPage: true });
  await panel.getByRole("tab", { name: "NGルール", exact: true }).click();
  await expect(editingSurface).toBeVisible();
  await editingSurface.click({ position: { x: 10, y: 10 } });
  await expect(panel.getByRole("textbox", { name: "NGルール", exact: true })).toBeFocused();
  await panel.getByRole("tab", { name: "文字列置換", exact: true }).click();
  await expect(panel.locator(".view-lines")).toContainText("remove body line first:");
  await page.reload();
  await expect(panel.getByRole("tab", { name: "文字列置換", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(panel.locator(".dsl-editor__snippet")).toHaveCount(2);

  await page.getByRole("tab", { name: /置換E2E/u }).click();
  await page.getByRole("button", { name: "更新", exact: true }).click();
  await expect(iconPost).toContainText(remainingText);
  await expect(iconPost.locator(".res__body")).not.toContainText("001.gif");
  await expect(panel.locator(`.res__thumb img[src="${iconUrl}"]`)).toHaveCount(0);
  if (!process.env.CHLENS_E2E_DAT_PATH)
    await expect(iconPost.locator('img[src="https://example.com/keep.png"]')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("replacement-thread.png"), fullPage: true });
});
