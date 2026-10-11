import "webextension-polyfill";

import { bootView } from "src/app/boot";
///<reference path="global.d" />
import * as platformInternal from "src/app/platform";
import { config, configInstance as _config } from "src/service-container/config-instance";
import { getBookmarkRuntime } from "src/service-container/setup";

export * from "./app/BrowserDetect";
export { default as Callbacks } from "./app/Callbacks";
export * from "./app/Defer";
export * from "./app/ImageExt";
export { default as LocalStorage } from "./app/LocalStorage";
export * from "./app/Log";
export { default as message } from "./app/Message";
export * from "./app/Util";

import CallbacksClass from "src/app/Callbacks";
import { defer } from "src/app/Defer";
import LocalStorageClass from "src/app/LocalStorage";
import { assertArg, criticalError, log } from "src/app/Log";
import messageInstance from "src/app/Message";
import { deepCopy, escapeHtml, replaceAll, safeHref } from "src/app/Util";

type LegacyAppObject = {
  log: typeof log;
  criticalError: typeof criticalError;
  assertArg: typeof assertArg;
  defer: typeof defer;
  deepCopy: typeof deepCopy;
  replaceAll: typeof replaceAll;
  escapeHtml: typeof escapeHtml;
  safeHref: typeof safeHref;
  message: typeof messageInstance;
  Callbacks: typeof CallbacksClass;
  LocalStorage: typeof LocalStorageClass;
  [key: string]: unknown;
};

// Create global app object early to satisfy legacy code
const appObj: LegacyAppObject = {
  log,
  criticalError,
  assertArg,
  defer,
  deepCopy,
  replaceAll,
  escapeHtml,
  safeHref,
  message: messageInstance,
  Callbacks: CallbacksClass,
  LocalStorage: LocalStorageClass,
};
(window as unknown as { app: LegacyAppObject }).app = appObj;

// runtime.ts 側で必要な内部値は吸収済みなので、new-ui は常にローカル platform を使う。
export const platform = new Proxy({} as typeof platformInternal.platform, {
  get(_target, prop) {
    const actualPlatform = platformInternal.platform;
    if (!actualPlatform) {
      console.error("platform is not initialized");
      return undefined;
    }
    return actualPlatform[prop as keyof typeof platformInternal.platform];
  },
});

// 親ウィンドウからアクセスできる互換APIとして内部configも公開する。
export { _config, config };

appObj.platform = platform;
appObj.config = config;
appObj._config = _config;

// Core modules - previously in app_core.js
import { Point, QDollarRecognizer } from "src/app/$Q";
import Notification from "src/app/Notification";
import * as BBSMenu from "src/core/board/BBSMenu";
import Board from "src/core/board/Board";
import BoardService from "src/core/board/BoardService";
import * as BoardTitleSolver from "src/core/board/BoardTitleSolver";
import Bookmark from "src/core/bookmark/Bookmark";
import * as BookmarkEntryList from "src/core/bookmark/BookmarkEntryList";
import BrowserBookmarkEntryList from "src/core/bookmark/BrowserBookmarkEntryList";
import IDBBookmarkEntryList from "src/core/bookmark/IDBBookmarkEntryList";
import * as ReadState from "src/core/bookmark/ReadState";
import * as History from "src/core/history/History";
import * as WriteHistory from "src/core/history/WriteHistory";
import * as HTTP from "src/core/network/HTTP";
import * as URL from "src/core/network/URL";
import * as NG from "src/core/ng/NG";
import Cache from "src/core/storage/Cache";
import * as ImageReplaceDat from "src/core/thread/ImageReplaceDat";
import * as ReplaceStrTxt from "src/core/thread/ReplaceStrTxt";
import SikiGuard from "src/core/thread/SikiGuard";
import Thread from "src/core/thread/Thread";
import ThreadSearch from "src/core/thread/ThreadSearch";
import ThreadService from "src/core/thread/ThreadService";
import * as util from "src/core/util/jsutil";
import * as Util from "src/core/util/Util";

// window.app には実際に参照される旧互換APIだけを残す。
Object.assign(appObj, {
  History,
  ReadState,
  WriteHistory,
});

appObj.boot = boot; // Will be defined later

export {
  BBSMenu,
  Board,
  BoardService,
  BoardTitleSolver,
  Bookmark,
  BookmarkEntryList,
  BrowserBookmarkEntryList,
  Cache,
  History,
  HTTP,
  IDBBookmarkEntryList,
  ImageReplaceDat,
  NG,
  Notification,
  Point,
  QDollarRecognizer,
  ReadState,
  ReplaceStrTxt,
  SikiGuard,
  Thread,
  ThreadSearch,
  ThreadService,
  URL,
  Util,
  util,
  WriteHistory,
};

// 起動処理は過去実況窓とも共有するため、旧互換のwindow.appから切り離したbootViewへまとめた。
export { manifest } from "src/app/boot";

type BootCallback = (...modules: unknown[]) => void;
type BootRequirements = BootCallback | string[] | null;

export async function boot(
  path: string,
  requirements: BootRequirements,
  fn?: BootCallback,
): Promise<void> {
  let callback = fn;
  const moduleNames = Array.isArray(requirements) ? requirements : null;
  if (callback == null && typeof requirements === "function") {
    callback = requirements;
  }
  const bootCallback = callback;
  if (bootCallback == null) {
    return;
  }

  await bootView(path, () => {
    const localApp = (window as unknown as { app: LegacyAppObject }).app;
    const bookmarkRuntime = getBookmarkRuntime();
    if (bookmarkRuntime) {
      // ブックマーク移行中の旧画面とroot設定UIが参照する互換APIを維持する。
      localApp.bookmark = bookmarkRuntime;
      localApp.bookmarkEntryList = bookmarkRuntime.bel;
    }

    if (moduleNames == null) {
      bootCallback();
      return;
    }

    const modules: unknown[] = [];
    const modulesByName = localApp as unknown as Record<string, unknown>;
    for (const module of moduleNames) {
      modules.push(modulesByName[module]);
    }
    bootCallback(...modules);
  });
}
