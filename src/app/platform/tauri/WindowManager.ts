import { getCurrentWindow, Window as TauriWindow } from "@tauri-apps/api/window";
import { WindowManager, WindowOptions } from "src/app/platform/types";

// Tauri環境ではbrowser.tabs/windowsが使えないため、
// window.openを使ってシステムブラウザまたは新しいwebviewウィンドウを開く
export const TauriWindowManager: WindowManager = {
  getAssetUrl(path: string): string {
    return new URL(path, window.location.href).toString();
  },

  async openUrlInTab(url: string, _active = true): Promise<void> {
    window.open(url, "_blank");
  },

  async openWindow(options: WindowOptions): Promise<void> {
    const features = [
      options.width ? `width=${options.width}` : "",
      options.height ? `height=${options.height}` : "",
    ]
      .filter(Boolean)
      .join(",");
    window.open(options.url, "_blank", features);
  },

  openPopup(name: string, features: string, sourceWindow = window): Window | null {
    // 表示元のWindowを受け取り、ブラウザ版と同じく別窓からの操作を起点にできるようにする。
    return sourceWindow.open("", name, features);
  },

  async focusPopup(popup: Window): Promise<void> {
    // WebView2のDOM focusでは最小化したOS窓が復元されないため、生成時に付けたラベルで操作する。
    const label = (popup as Window & { __chlensPopupLabel?: string }).__chlensPopupLabel;
    if (!label) throw new Error("別窓のTauriラベルを取得できませんでした");
    const nativeWindow = new TauriWindow(label);
    await nativeWindow.unminimize();
    await nativeWindow.show();
    await nativeWindow.setFocus();
  },

  async closeCurrent(): Promise<void> {
    window.close();
  },

  async setTitle(title: string): Promise<void> {
    await getCurrentWindow().setTitle(title);
  },
};
