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
      name: "chrome",
      use: { ...devices["Desktop Chrome"] },
      // UIスクリーンショットは画面の検証ではなく撮影用で、1件で通常のE2E全体の約4割の時間を使う。
      // そのため通常の実行からは外し、pnpm run ui:shots（CHLENS_UI_SHOTS=true）のときだけ実行する。
      testIgnore: [
        "tauri/**",
        ...(process.env.CHLENS_UI_SHOTS === "true" ? [] : ["**/ui-screenshots.spec.mts"]),
      ],
    },
    {
      name: "tauri",
      testDir: "./tests/tauri",
      // offstage-windowsは1回の実行につき非表示デスクトップを1つだけ使い、全窓がそこへ出る。
      // Tauri版はメイン・Overlay・過去実況の窓を持つため、複数起動するとフォーカスを奪い合う。
      workers: 1,
      // exeの起動とWebView2の初期化に時間がかかるため、既定の30秒では足りないことがある。
      timeout: 60_000,
    },
  ],
});
