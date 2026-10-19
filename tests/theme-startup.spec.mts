import { readFile } from "node:fs/promises";

import { expect, type Page, test } from "@playwright/test";

// 拡張APIや掲示板への接続を使わず、生成HTMLの初期描画だけを実ブラウザで検証する。
async function inspectBeforeStyles(
  page: Page,
  savedTheme: string | null,
  systemTheme: "light" | "dark",
  pauseThemeInit: boolean,
  inspect: () => Promise<void>,
): Promise<void> {
  const pendingAssets = Promise.withResolvers<void>();
  await page.emulateMedia({ colorScheme: systemTheme });
  await page.addInitScript((theme) => {
    if (theme !== null) localStorage.setItem("config_theme_id", theme);
  }, savedTheme);
  await page.route("http://example.com/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/browser.js") {
      await route.fulfill({ contentType: "text/javascript", body: "" });
      return;
    }
    if (pathname === "/browser.css" || (pauseThemeInit && pathname === "/theme-init.js")) {
      await pendingAssets.promise;
    }
    const file = new URL(`../debug/chrome${pathname}`, import.meta.url);
    await route.fulfill({
      contentType: pathname.endsWith(".js")
        ? "text/javascript"
        : pathname.endsWith(".css")
          ? "text/css"
          : "text/html",
      body: await readFile(file),
    });
  });

  try {
    await page.goto("http://example.com/view/index.html", { waitUntil: "commit" });
    await expect(page.locator('script[src="../theme-init.js"]')).toBeAttached();
    if (!pauseThemeInit) {
      await expect(page.locator("html")).toHaveAttribute("data-theme", /^(light|dark)$/);
    }
    await inspect();
  } finally {
    pendingAssets.resolve();
    await page.waitForLoadState("load");
  }
}

async function hasDarkCanvas(page: Page): Promise<boolean> {
  // Canvasはブラウザが実際に選んだページ背景色。属性の設定だけでは白画面を検出できない。
  const color = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "Canvas";
    document.documentElement.append(probe);
    const canvasColor = getComputedStyle(probe).color;
    probe.remove();
    return canvasColor;
  });
  const channels = (color.match(/\d+/g) ?? []).slice(0, 3);
  expect(channels).toHaveLength(3);
  return channels.every((channel) => Number(channel) < 128);
}

test("テーマスクリプトの読み込み前からOSのダーク配色で背景を描画する", async ({ page }) => {
  await inspectBeforeStyles(page, null, "dark", true, async () => {
    expect(await hasDarkCanvas(page)).toBe(true);
  });
});

for (const scenario of [
  {
    name: "OSがライトでも保存済みダーク設定を優先する",
    saved: "dark",
    system: "light",
    dark: true,
  },
  {
    name: "OSがダークでも保存済みライト設定を優先する",
    saved: "light",
    system: "dark",
    dark: false,
  },
  {
    name: "OSがダークでもライトの旧IDの保存値をライトとして扱う",
    saved: "default",
    system: "dark",
    dark: false,
  },
  {
    name: "未知の保存値ならOSのダーク設定に従う",
    saved: "unknown-theme",
    system: "dark",
    dark: true,
  },
  { name: "未設定ならOSのダーク設定に従う", saved: null, system: "dark", dark: true },
] as const) {
  test(`CSSの読み込み前に${scenario.name}`, async ({ page }) => {
    await inspectBeforeStyles(page, scenario.saved, scenario.system, false, async () => {
      expect(await hasDarkCanvas(page)).toBe(scenario.dark);
    });
  });
}
