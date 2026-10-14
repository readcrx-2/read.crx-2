import "src/app";
import "src/view/browser/styles/index.css";

import { createRoot } from "react-dom/client";
import { installDebugApi } from "src/app/debug/debug-api";
import { installConsoleCapture } from "src/app/debug/debug-log";
import { setupBrowserViewServices } from "src/service-container/setup-browser-view";
import { BrowserApp } from "src/view/browser/App";

// 起動処理のエラーも外部CLIから読めるよう、boot より前に記録を始める。
installConsoleCapture();
installDebugApi();

// app.boot() 経由で初期化し、core モジュールの準備完了を待つ
declare const app: {
  boot: (path: string, fn: () => void) => void;
};

app.boot("/view/index.html", () => {
  // メインの画面だけが使うサービスは、setupContainer（boot の中）の後、描画より前に登録する。
  setupBrowserViewServices();
  const container = document.getElementById("root");
  if (!container) return;
  createRoot(container).render(<BrowserApp />);
});
