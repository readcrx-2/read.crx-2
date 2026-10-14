import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // 拡張機能はテストごとにブラウザを起動するため、同時起動数を抑える。
  // 変更理由: 2並列で落ちていた原因（fixtureのサービスワーカー待ちと自動更新テストの設定キー）を
  // 直したため、CIでも2並列にする。GitHubのubuntu-latestは4 vCPUなので、ブラウザ2つなら競合しにくい。
  workers: 2,
  reporter: "html",
  use: {
    // リトライしないローカル実行でも失敗した操作を追跡できるようにする。
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
