import "webextension-polyfill";

import { configInstance } from "src/service-container/config-instance";
import { setupContainer } from "src/service-container/setup";

export const manifest = (async () => {
  // ブラウザ拡張の環境では拡張マニフェストを取得するが、
  // Tauriやローカル実行など拡張APIが無い環境では失敗させず
  // フォールバックでHTML側のバージョン情報を返す。
  if (!/^(?:chrome|moz)-extension:$/.test(location.protocol)) {
    try {
      const response = await fetch("/manifest.json");
      return await response.json();
    } catch {
      return { version: document.documentElement.dataset.appVersion || "" };
    }
  }

  try {
    const response = await fetch("/manifest.json");
    return await response.json();
  } catch (e) {
    console.error("manifest.json fetch failed:", e);
    return { version: document.documentElement.dataset.appVersion || "" };
  }
})();

/**
 * 画面の入口から、設定の読み込みとサービスコンテナの準備が済んでから描画を始める。
 *
 * 変更理由: 以前は `import "src/app"` で旧互換の `window.app` と旧APIの再エクスポートを
 * まとめて読み込み、その `app.boot` を経由していた。過去実況窓のように旧APIを使わない
 * 画面でも同じ一式を抱えていたため、起動に必要な処理だけをES moduleとして切り出した。
 */
export async function bootView(path: string, onReady: () => void): Promise<void> {
  // Chromeがiframeのsrcと無関係な内容を読み込むバグへの対応
  if (frameElement && (<HTMLIFrameElement>frameElement).src !== location.href) {
    location.href = (<HTMLIFrameElement>frameElement).src;
    return;
  }

  if (location.pathname !== path) {
    return;
  }

  const htmlVersion = document.documentElement.dataset.appVersion!;
  if ((await manifest).version !== htmlVersion) {
    location.reload();
    return;
  }

  const onload = () => {
    configInstance.ready(() => {
      setupContainer();
      onReady();
    });
  };

  // async関数のためDOMContentLoadedに間に合わないことがある
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onload);
  } else {
    onload();
  }
}
