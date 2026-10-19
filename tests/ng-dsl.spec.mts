import { expect, test } from "./fixtures.mjs";

test("NGエディタの新構文でOR・AND・除外・適用先を保存し、スレ一覧とレスへ反映する", async ({
  page,
  extensionId,
  localBoard,
}, testInfo) => {
  localBoard.setDat(
    [
      "名無し<>sage<>2026/10/02(金) 12:00:00 ID:local001<>対象の本文<>ローカルテストスレッド",
      "名無し<>sage<>2026/10/02(金) 12:01:00 ID:local002<>対象の本文<>",
      "名無し<>sage<>2026/10/02(金) 12:02:00 ID:local003<>通常の本文<>",
    ].join("\n"),
  );
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  const urlInput = page.getByPlaceholder("URLを入力");
  await urlInput.fill(localBoard.threadUrl);
  await urlInput.press("Enter");
  const panel = page.locator('.content-area__tab-panel[data-active="true"]');
  const first = panel.locator('[data-res-num="1"]');
  const second = panel.locator('[data-res-num="2"]');
  const third = panel.locator('[data-res-num="3"]');
  await expect(first).toContainText("対象の本文");
  await expect(second).toContainText("対象の本文");
  await expect(third).toContainText("通常の本文");

  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByTitle("設定を開く", { exact: true }).click();
  await panel.getByRole("button", { name: /^NG/ }).click();
  const editingSurface = panel.locator(".monaco-editor .view-lines");
  await expect(editingSurface).toBeVisible();
  // 空のNative EditContextは0サイズなので、ユーザーと同じ編集面から入力する。
  await editingSurface.click({ position: { x: 10, y: 10 } });
  await page.keyboard.insertText("hide:\n  when body contains bare");
  await expect(panel.getByText("NGルールを保存できません", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("config_ngwords"))).toBe("");
  const sites = new URL(localBoard.origin).hostname;
  const rule = `highlight:
  color blue
  label "注目"
  sites "${sites}"
  when title contains:
    "ローカル"
    "別のタイトル"
  when res-count >= 3
  unless title contains "除外"

hide:
  sites "${sites}"
  when body contains:
    "対象"
    "宣伝"
  unless id contains "local001"`;
  // insertTextは「入力」として自動インデントされるため、複数行のルールは貼り付けで検証する。
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate((text) => navigator.clipboard.writeText(text), rule);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("config_ngwords")?.replace(/\r\n/gu, "\n")),
    )
    .toBe(rule);
  await expect(panel.getByText("NGルールを保存できません", { exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "NG記法例", exact: true }).click();
  await expect(panel.locator(".dsl-editor__snippet")).toHaveCount(7);
  await expect(
    panel.getByRole("heading", { name: "複数のIDをまとめて指定する", exact: true }),
  ).toBeVisible();
  await expect(panel.getByRole("heading", { name: "unlessだけで書く", exact: true })).toBeVisible();
  await panel.getByRole("tab", { name: "文字列置換", exact: true }).click();
  await panel.getByRole("tab", { name: "NGルール", exact: true }).click();
  await expect(editingSurface).toContainText("unless id contains");
  await page.reload();
  await expect(panel.getByRole("tab", { name: "NGルール", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(editingSurface).toContainText("unless id contains");
  await page.screenshot({ path: testInfo.outputPath("ng-dsl-settings.png"), fullPage: true });

  await page.getByRole("tab", { name: "ローカルテストスレッド", exact: true }).click();
  await page.getByRole("button", { name: "更新", exact: true }).click();
  await expect(first).toBeVisible();
  await expect(second).toBeHidden();
  await expect(third).toBeVisible();
  await page.reload();
  await expect(first).toBeVisible();
  await expect(second).toBeHidden();
  await expect(third).toBeVisible();

  // 同じルール群をスレ一覧で評価し、titleとレス数のANDで色・ラベルを付ける。
  // URL入力はフォーカスが外れるとタイトルのピルへ戻るため、移動前に開き直す。
  await page.getByTestId("title-bar-title").click();
  await urlInput.fill(localBoard.boardUrl);
  await urlInput.press("Enter");
  await expect(panel.getByText("ローカルテストスレッド", { exact: true })).toBeVisible();
  await expect(panel.getByText("注目（1）", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ng-dsl-thread-list.png"), fullPage: true });
});

test("NG・置換エディタはEnterで現在の深さだけを維持し、段の変更をTabで行える", async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByTitle("設定を開く", { exact: true }).click();
  const panel = page.locator('.content-area__tab-panel[data-active="true"]');
  await panel.getByRole("button", { name: /^NG/ }).click();
  const editingSurface = panel.locator(".monaco-editor .view-lines");
  await editingSurface.click({ position: { x: 10, y: 10 } });
  await page.keyboard.insertText("hide:");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.insertText("when body contains:");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.insertText('"入力テスト"');
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("config_ngwords")?.replace(/\r\n/gu, "\n")),
    )
    .toBe('hide:\n  when body contains:\n    "入力テスト"');

  await panel.getByRole("tab", { name: "文字列置換", exact: true }).click();
  await editingSurface.click({ position: { x: 10, y: 10 } });
  await page.keyboard.insertText("replace body:");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.insertText('from "前"');
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText('to "後"');
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("config_replace_str_txt")?.replace(/\r\n/gu, "\n")),
    )
    .toBe('replace body:\n  from "前"\n  to "後"');
});

test("collapseでスレ一覧とレスを折りたたみ、unless単体の複数IDで例外を残す", async ({
  page,
  extensionId,
  localBoard,
}) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  const input = page.getByPlaceholder("URLを入力");
  await input.fill(localBoard.boardUrl);
  await input.press("Enter");
  const panel = page.locator('.content-area__tab-panel[data-active="true"]');
  await expect(panel.getByText("ローカルテストスレッド", { exact: true })).toBeVisible();
  await page.getByTitle("メニュー", { exact: true }).click();
  await page.getByTitle("設定を開く", { exact: true }).click();
  await panel.getByRole("button", { name: /^NG/ }).click();
  const rule = `collapse:
  when title contains "ローカル"

collapse:
  unless id contains:
    "local001"
    "local003"`;
  await panel.locator(".monaco-editor .view-lines").click({ position: { x: 10, y: 10 } });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate((text) => navigator.clipboard.writeText(text), rule);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("config_ngwords")?.replace(/\r\n/gu, "\n")),
    )
    .toBe(rule);
  await page.getByRole("tab", { name: "ローカルテスト板", exact: true }).click();
  const group = panel.getByRole("button", { name: /折りたたんだスレ（1）/ });
  await expect(group).toBeVisible();
  await expect(panel.getByText("ローカルテストスレッド", { exact: true })).toBeHidden();
  await group.click();
  await expect(panel.getByText("ローカルテストスレッド", { exact: true })).toBeVisible();
  // URL入力はフォーカスが外れるとタイトルのピルへ戻るため、スレを開く前に開き直す。
  await page.getByTestId("title-bar-title").click();
  await input.fill(localBoard.threadUrl);
  await input.press("Enter");
  await expect(panel.locator('[data-res-num="1"]')).toContainText("最初の日本語レス");
  await expect(panel.getByText("二番目の日本語レス", { exact: true })).toBeHidden();
  await panel.getByRole("button", { name: "レス2の内容を表示", exact: true }).click();
  await expect(panel.locator('[data-res-num="2"]')).toContainText("二番目の日本語レス");
});
