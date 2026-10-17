import "src/view/browser/styles/index.css";

import { createRoot } from "react-dom/client";
import { boot } from "src/app";
import { installDebugApi } from "src/app/debug/debug-api";
import { installConsoleCapture } from "src/app/debug/debug-log";
import { installLogPersistence } from "src/app/debug/log-persistence";
import { setupBrowserViewServices } from "src/service-container/setup-browser-view";
import { BrowserApp } from "src/view/browser/App";

// 起動処理のエラーも外部CLIから読めるよう、boot より前に記録を始める。
installConsoleCapture();
// 記録を再起動後も読めるよう、IndexedDB へ保存し始める。
installLogPersistence();
installDebugApi();

// 設定の読み込みとサービスコンテナの準備を待ってから描画する。
// 変更理由: 以前はグローバルの app.boot（window.app）を呼んでいた。view・features から window.app を
// 参照しないよう lint で塞いだため（legacy-window-app-plan の Phase 3）、同じ関数を import して使う。
void boot("/view/index.html", () => {
  // メインの画面だけが使うサービスは、setupContainer（boot の中）の後、描画より前に登録する。
  setupBrowserViewServices();
  const container = document.getElementById("root");
  if (!container) return;
  createRoot(container).render(<BrowserApp />);
});
