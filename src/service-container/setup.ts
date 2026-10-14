import { LogLevels } from "consola";
import { defer } from "src/app/Defer";
import { setConsolaLevel } from "src/app/logger";
import message from "src/app/Message";
import Notification from "src/app/Notification";
import { escapeHtml, safeHref } from "src/app/Util";
import { BBSMenuModel } from "src/core/board/BBSMenuModel";
import { createBoardService } from "src/core/board/BoardService";
import Bookmark from "src/core/bookmark/Bookmark";
import type { ComparableReadState } from "src/core/bookmark/read-state-compare";
import { isNewerReadState } from "src/core/bookmark/read-state-compare";
import * as ReadState from "src/core/bookmark/ReadState";
import * as NG from "src/core/ng/NG";
import { installCorePorts } from "src/core/ports/registry";
import Cache from "src/core/storage/Cache";
import ThreadService from "src/core/thread/ThreadService";
import { configInstance } from "src/service-container/config-instance";
import { container } from "src/service-container/Container";
import {
  IBBSMenuService,
  IBoardResult,
  IBoardService,
  IBookmark,
  IBookmarkItem,
  ICacheItem,
  ICacheService,
  IConfig,
  IMessage,
  INGService,
  INotificationService,
  IReadState,
  IReadStateService,
  IThreadService,
  IToastService,
  IUtil,
} from "src/service-container/interfaces";
import { toastStore } from "src/service-container/toast-store";

let bookmarkRuntime: Bookmark | undefined;

export function getBookmarkRuntime(): Bookmark | undefined {
  return bookmarkRuntime;
}

function initializeBookmarkRuntime(): void {
  if (bookmarkRuntime) return;

  const configuredBookmarkId = configInstance.get("bookmark_id");
  const rootNodeId =
    typeof configuredBookmarkId === "string" && configuredBookmarkId.length > 0
      ? configuredBookmarkId
      : "dummy";
  bookmarkRuntime = new Bookmark(rootNodeId);
  const entryList = bookmarkRuntime.bel as Bookmark["bel"] & {
    needReconfigureRootNodeId?: {
      add: (callback: () => void) => void;
      wasCalled: boolean;
    };
    setRootNodeId?: (rootNodeId: string) => Promise<boolean>;
  };
  const notifyRootSelectionRequired = () => {
    message.send("bookmark_root_reconfigure_required");
  };

  entryList.needReconfigureRootNodeId?.add(notifyRootSelectionRequired);
  // persistent callback は過去の通知を再生しないため、起動前に判明した不正rootもUIへ伝える。
  if (entryList.needReconfigureRootNodeId?.wasCalled) {
    notifyRootSelectionRequired();
  }

  message.on("config_updated", ({ key, val }: { key?: string; val?: unknown }) => {
    if (key !== "bookmark_id") return;
    const nextRootNodeId = typeof val === "string" && val.length > 0 ? val : "dummy";
    void entryList.setRootNodeId?.(nextRootNodeId);
  });
}

// 変更理由: 旧実装と同じく、設定の読み込み完了時点で初回scanを開始し、
// DOMの準備を待っている間にブックマーク初期表示が遅れないようにする。
configInstance.ready(initializeBookmarkRuntime);

export function setupContainer(): void {
  const config = configInstance;
  const runtimeMessage = message;
  // app.boot は config.ready の完了後に呼ぶため、ここでは読込済み設定からrootを決める。
  const syncConsolaLevel = () => {
    setConsolaLevel(config.get("debug_log") === "on" ? LogLevels.debug : LogLevels.info);
  };

  syncConsolaLevel();

  // Config Adapter
  const configAdapter: IConfig = {
    get: (key: string) => config.get(key),
    set: async (key: string, val: unknown) => {
      // 変更理由: 設定保存は非同期ストレージへ書き込むため、ここで Promise を落とすと
      // 「見た目は更新されたのにリロード直後に戻る」競合を呼び込みやすい。
      if (key === "ngwords") {
        // 構文エラーの入力を先に保存すると、修正途中のDSLが永続化されて
        // 次回起動でも警告が残るため、検証成功後にだけストレージを書き換える。
        NG.validate(typeof val === "string" ? val : "");
      }
      // 変更理由: Config実装はstring/numberを受理するため、型宣言のstringへ変換せず値を渡す。
      await config.set(key, val as string);
      // NGワード設定が更新されたら、NGサービス側の内部状態とキャッシュも同期する。
      // これにより、設定画面での保存が即座にNG判定ロジックへ反映されるようになる。
      if (key === "ngwords") {
        NG.apply(typeof val === "string" ? val : "");
      }
      if (key === "debug_log") {
        syncConsolaLevel();
      }
    },
    ready: (cb: () => void) => config.ready(cb),
    getAll: () => config.getAll(),
    del: (key: string) => config.del(key),
  };

  runtimeMessage.on("config_updated", ({ key }: { key?: string }) => {
    if (key === "debug_log") {
      syncConsolaLevel();
    }
  });

  // Message Adapter
  // on/off はジェネリックメソッドのため、アロー関数プロパティではなく
  // メソッド構文で実装して bivariance を効かせる。
  const messageAdapter: IMessage = {
    send: (type: string, data?: unknown) => runtimeMessage.send(type, data),
    on(type, cb) {
      runtimeMessage.on(type, cb);
    },
    off(type, cb) {
      runtimeMessage.off(type, cb);
    },
  };

  // Bookmark Adapter
  // app.bootはConfig.ready後に呼ばれるため、ここではscan済みの共有実体を登録する。
  const activeBookmark = bookmarkRuntime;
  if (!activeBookmark) {
    throw new Error("Bookmark runtime is not initialized before Config.ready");
  }
  const bookmarkAdapter: IBookmark = {
    promiseFirstScan: activeBookmark.promiseFirstScan,
    get: (url: string) => activeBookmark.get(url),
    // nullはBookmark.addの数値チェックで未指定と同じ扱いなのでundefinedへ揃える。
    add: (item: IBookmarkItem) =>
      activeBookmark.add(item.url, item.title, item.resCount ?? undefined),
    remove: (url: string) => activeBookmark.remove(url),
    updateResCount: (url: string, count: number) => activeBookmark.updateResCount(url, count),
    updateExpired: (url: string, expired: boolean) => activeBookmark.updateExpired(url, expired),
    getByBoard: (url: string) => activeBookmark.getByBoard(url),
    getAllBoards: () => activeBookmark.getAllBoards(),
  };

  // Cache Adapter
  const cacheServiceAdapter: ICacheService = {
    getCache: (path: string): ICacheItem => {
      return new Cache(path) as ICacheItem;
    },
  };

  // ReadState Adapter
  const readStateAdapter: IReadStateService = {
    get: async (url: string) => (await ReadState.get(url)) ?? undefined,
    getByBoard: (boardUrl: string) => ReadState.getByBoard(boardUrl),
    set: async (readState: IReadState) => {
      await ReadState.set(readState);
    },
  };

  // Board Service Adapter
  // 依存は登録済みの container から渡す。
  const boardService = createBoardService(container);
  const boardServiceAdapter: IBoardService = {
    getThreads: (url: string): Promise<IBoardResult> => boardService.getThreads(url),
    getCachedResCount: (url: string, options?: { forceUpdate?: boolean }) =>
      boardService.getCachedResCount(url, options),
  };

  // BBSMenu Service Adapter
  // 変更理由: 以前は src/core/board/BBSMenu.js のシングルトンを各所が直接 import しており、
  // container.bbsMenu と入口が分かれていた。板一覧の状態はここで作る1つのモデルだけが持つ。
  const bbsMenuModel = new BBSMenuModel();
  const bbsMenuServiceAdapter: IBBSMenuService = {
    get: (forceReload?: boolean) => bbsMenuModel.get(forceReload),
    getCached: () => bbsMenuModel.getCached(),
    onChange: bbsMenuModel.onChange,
  };

  // Thread Service Adapter
  const threadServiceAdapter: IThreadService = {
    getThread: (url, options) => ThreadService.getThread(url, options),
  };

  // Toast Service Adapter
  const toastServiceAdapter: IToastService = {
    notify: (message, options) => {
      toastStore.notify(message, options);
    },
    success: (message, options) => {
      toastStore.success(message, options);
    },
    error: (message, options) => {
      toastStore.error(message, options);
    },
    info: (message, options) => {
      toastStore.info(message, options);
    },
  };

  // Notification Service Adapter
  const notificationServiceAdapter: INotificationService = {
    notify: async (title, options) => {
      // container.notification は OS 通知専用に分離し、
      // UI向けメッセージは container.toast 側で扱う。
      const instance = new Notification(
        title,
        options?.message ?? "",
        options?.url ?? "",
        options?.tag,
        options?.targetWindow,
      );
      return instance.ready;
    },
    isSupported: (targetWindow) => Notification.isSupported(targetWindow),
  };

  // NG Service Adapter
  const ngServiceAdapter: INGService = {
    isNGBoard: (title, url, resCount) => NG.isNGBoard(title, url, resCount),
    isNGThread: (res, title, url) => NG.isNGThread(res, title, url),
    add: (ruleDsl) => NG.add(ruleDsl),
    invalidateCache: () => NG.invalidateCache(),
    execExpire: () => NG.execExpire(),
  };

  // Util Adapter
  const utilAdapter: IUtil = {
    escapeHtml,
    safeHref,
    // 変更理由: 待機結果の値は利用せず、IUtilでは完了だけを表すPromise<void>に揃える。
    defer: async () => {
      await defer();
    },
    isNewerReadState: (
      a: ComparableReadState | null | undefined,
      b: ComparableReadState | null | undefined,
    ) => isNewerReadState(a, b),
    // 変更理由: 旧アダプターの既定値を保ち、URL分類の仕様変更をこの移行へ混ぜない。
    guessType: (_url: string) => ({ bbsType: "2ch", protocol: "https:" }),
  };

  container.config = configAdapter;
  container.message = messageAdapter;
  container.bookmark = bookmarkAdapter;
  container.cache = cacheServiceAdapter;
  container.util = utilAdapter;
  container.readState = readStateAdapter;
  container.board = boardServiceAdapter;
  container.bbsMenu = bbsMenuServiceAdapter;
  container.thread = threadServiceAdapter;
  container.toast = toastServiceAdapter;
  container.notification = notificationServiceAdapter;
  container.ng = ngServiceAdapter;

  // core は container を import せず、ここで登録されたサービスだけを使う（Phase C-1）。
  installCorePorts(container);
}
