import { BrowserHttpClient } from "src/app/platform/browser/HttpClient";
import { BrowserStorageManager } from "src/app/platform/browser/StorageManager";
import { BrowserWindowManager } from "src/app/platform/browser/WindowManager";
import { platformCookieManager } from "src/app/platform/CookieManager";
import { platformDownloadManager } from "src/app/platform/DownloadManager";
import { MAX_CONCURRENT_HTTP_REQUESTS, QueuedHttpClient } from "src/app/platform/QueuedHttpClient";
import { inheritTauriInternalsFromTopWindow, isTauriRuntime } from "src/app/platform/runtime";
import { TauriHttpClient } from "src/app/platform/tauri/HttpClient";
import { TauriStorageManager } from "src/app/platform/tauri/StorageManager";
import { TauriWindowManager } from "src/app/platform/tauri/WindowManager";
import { Platform } from "src/app/platform/types";

// Tauri v2は常に__TAURI_INTERNALSをメインウィンドウに注入する。
// iframeには注入されないため、同一オリジンのトップウィンドウから引き継ぐ。
inheritTauriInternalsFromTopWindow();

const isTauri = isTauriRuntime();
const httpClient = new QueuedHttpClient(
  isTauri ? TauriHttpClient : BrowserHttpClient,
  MAX_CONCURRENT_HTTP_REQUESTS,
);

export const platform: Platform = isTauri
  ? {
      window: TauriWindowManager,
      http: httpClient,
      download: platformDownloadManager,
      cookies: platformCookieManager,
      storage: TauriStorageManager,
    }
  : {
      window: BrowserWindowManager,
      http: httpClient,
      download: platformDownloadManager,
      cookies: platformCookieManager,
      storage: BrowserStorageManager,
    };
