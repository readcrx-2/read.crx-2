import { fileURLToPath } from "node:url";

import { defineConfig } from "vite-plus";

export default defineConfig({
  resolve: {
    alias: {
      // アプリ本体と同じ src/* エイリアスで解決しないと、UIコンポーネントの実装をそのままテストできない。
      src: fileURLToPath(new URL("./src", import.meta.url)),
      packages: fileURLToPath(new URL("./packages", import.meta.url)),
      "@chlen/chlib": fileURLToPath(new URL("./packages/chlib/src/index.ts", import.meta.url)),
    },
  },
  test: {
    // 既定は jsdom のまま。ただしCIの実行時間の約7割がjsdom環境の準備に使われていたため、
    // DOMを使わない純粋なロジックのテストはファイル先頭の `// @vitest-environment node` で node 環境に切り替える。
    // 新しいテストは迷ったら jsdom のままでよく、DOMに触れないと分かっているものだけ node にする。
    environment: "jsdom",
    // 変更理由: forksプールでは、ファイルごとにjsdomの読み込みと環境構築をやり直していた。
    // 実行時間の半分以上がこの準備に使われていたため、ワーカーを使い回しつつファイルごとに
    // VMコンテキストを分ける vmForks にした。vi.mock などのファイル単位の分離は保たれる。
    // isolate: false はモジュールのキャッシュを共有してしまい、実行順によって vi.mock が
    // 効かないファイルが出たため採用していない。
    pool: "vmForks",
    // 変更理由: chlibのテストがincludeに入っておらず、CIで一度も実行されていなかった。
    // bbsmenuの解析テストをchlibへ移したため、共有パッケージのテストも同じ実行に含める。
    include: [
      "src/**/*.{test,spec}.{ts,tsx,js,jsx}",
      "packages/*/src/**/*.{test,spec}.{ts,tsx,js,jsx}",
    ],
    exclude: ["node_modules/**", "e2e/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.{test,spec}.{ts,tsx,js,jsx}",
        "**/__mocks__/**",
        "**/*.d.ts",
        "**/*.stories.{ts,tsx,js,jsx}",
      ],
      reportsDirectory: "coverage/unit",
      reporter: ["text", "html", "lcov", "json"],
    },
  },
});
