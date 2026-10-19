import { DEFAULT_HTTPS_MODE, type HttpsMode } from "packages/chlib/src/fetcher/https-first";

let currentHttpsMode: HttpsMode = DEFAULT_HTTPS_MODE;

/**
 * 設定画面で選んだHTTPSへの切り替え方針を、このウィンドウの通信要求へ添えるために保持する。
 *
 * 変更理由: 実際の通信は拡張機能のバックグラウンドやTauriのRust側で行われ、そこからは設定を
 * 読めない。設定を読めるウィンドウ側で方針を持ち、要求ごとに渡して切り替える。
 */
export function setHttpsMode(mode: HttpsMode): void {
  currentHttpsMode = mode;
}

export function getHttpsMode(): HttpsMode {
  return currentHttpsMode;
}
