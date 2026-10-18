import { LogLevels } from "consola";
import { defer } from "src/app/Defer";
import { setConsolaLevel } from "src/app/logger";
import { createLogger } from "src/app/logger";
import message from "src/app/Message";
import Notification from "src/app/Notification";
import { isTauriRuntime } from "src/app/platform/runtime";
import { escapeHtml, safeHref } from "src/app/Util";
import { BBSMenuModel } from "src/core/board/BBSMenuModel";
import { createBoardService } from "src/core/board/BoardService";
import Bookmark from "src/core/bookmark/Bookmark";
import type { ComparableReadState } from "src/core/bookmark/read-state-compare";
import { isNewerReadState } from "src/core/bookmark/read-state-compare";
import * as ReadState from "src/core/bookmark/ReadState";
import { createNG } from "src/core/ng/NG";
import Cache from "src/core/storage/Cache";
import { createReplaceStrTxt } from "src/core/thread/ReplaceStrTxt";
import { createThreadService } from "src/core/thread/ThreadService";
import { configInstance } from "src/service-container/config-instance";
import { container } from "src/service-container/Container";
import {
  IBBSMenuService,
  IBoardResult,
  IBoardService,
  IBookmark,
  IBookmarkItem,
  IBookmarkRootService,
  ICacheItem,
  ICacheService,
  IConfig,
  ICoreNoticeService,
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

const logger = createLogger("service-container");

type BookmarkEntryListRuntime = Bookmark["bel"] & {
  needReconfigureRootNodeId?: {
    add: (callback: () => void) => void;
    wasCalled: boolean;
  };
  setRootNodeId?: (rootNodeId: string) => Promise<boolean>;
};

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
  const entryList = bookmarkRuntime.bel as BookmarkEntryListRuntime;
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
    const debugEnabled = config.get("debug_log") === "on";
    // 変更理由: 通常は warn/error のみ出し、デバッグログ設定を有効にしたときだけ debug も出す。
    setConsolaLevel(debugEnabled ? LogLevels.debug : LogLevels.warn);
    if (isTauriRuntime()) {
      // Rust側（tauri_plugin_log）も同じ設定に追従させる。
      void import("@tauri-apps/api/core")
        .then(({ invoke }) => invoke("set_log_debug", { enabled: debugEnabled }))
        .catch((error: unknown) => {
          logger.error("Rust側のログレベル切り替えに失敗しました", error);
        });
    }
  };

  syncConsolaLevel();

  // NG と置換設定の状態は、ここで作る1つずつのインスタンスだけが持つ。
  // 依存は呼ばれた時点で container から読むため、登録前に作っても未登録の例外は出ない。
  const ng = createNG(container);
  const replaceStrTxt = createReplaceStrTxt(container);

  // Config Adapter
  const configAdapter: IConfig = {
    get: (key: string) => config.get(key),
    set: async (key: string, val: unknown) => {
      // 変更理由: 設定保存は非同期ストレージへ書き込むため、ここで Promise を落とすと
      // 「見た目は更新されたのにリロード直後に戻る」競合を呼び込みやすい。
      if (key === "ngwords") {
        // 構文エラーの入力を先に保存すると、修正途中のDSLが永続化されて
        // 次回起動でも警告が残るため、検証成功後にだけストレージを書き換える。
        ng.validate(typeof val === "string" ? val : "");
      }
      // 変更理由: Config実装はstring/numberを受理するため、型宣言のstringへ変換せず値を渡す。
      await config.set(key, val as string);
      // NGワード設定が更新されたら、NGサービス側の内部状態とキャッシュも同期する。
      // これにより、設定画面での保存が即座にNG判定ロジックへ反映されるようになる。
      if (key === "ngwords") {
        ng.apply(typeof val === "string" ? val : "");
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
    ready: async () => {
      try {
        // 変更理由: BrowserBookmarkEntryList は初回の走査が終わる前だと空の一覧を返しうるため、
        // 画面は読む前にここで待つ。以前は view の legacy-app.ts が window.app から同じ Promise を待っていた
        // （legacy-window-app-plan の Phase 2）。
        await activeBookmark.promiseFirstScan;
      } catch (error) {
        // 初回の走査に失敗しても、画面は読めるデータで表示を続ける。握りつぶさずに原因を残す。
        logger.error("初回の走査の完了待ちに失敗しました:", error);
      }
    },
    getAll: () => activeBookmark.getAll(),
    import: (entry) => activeBookmark.import(entry),
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

  // BookmarkRoot Adapter
  // 画面は保存先の切り替えと選び直しの要否をここから使う。保存先の実装（ブラウザのブックマーク・IndexedDB）は Bookmark が選ぶ。
  const activeEntryList = activeBookmark.bel as BookmarkEntryListRuntime;
  const bookmarkRootAdapter: IBookmarkRootService = {
    isReconfigureRequired: () => activeEntryList.needReconfigureRootNodeId?.wasCalled === true,
    // IndexedDB（Tauri）の保存先には切り替えがないため、何もせず成功として扱う（以前の画面の挙動と同じ）。
    setRootNodeId: async (rootNodeId) =>
      (await activeEntryList.setRootNodeId?.(rootNodeId)) ?? true,
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
    getAll: () => ReadState.getAll(),
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
  const bbsMenuModel = new BBSMenuModel(container);
  const bbsMenuServiceAdapter: IBBSMenuService = {
    get: (forceReload?: boolean) => bbsMenuModel.get(forceReload),
    getCached: () => bbsMenuModel.getCached(),
    onChange: bbsMenuModel.onChange,
  };

  // Thread Service Adapter
  // 依存は登録済みの container から渡す。
  const threadService = createThreadService(container);
  const threadServiceAdapter: IThreadService = {
    getThread: (url, options) => threadService.getThread(url, options),
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

  // core から届く出来事を、これまでと同じ文言のトーストで知らせる。
  const coreNoticeAdapter: ICoreNoticeService = {
    ngRuleRegexInvalid: (source) => {
      toastStore.notify(
        `NG機能の正規表現(${source})を読み込むのに失敗しました\nこの条件は無効化されます`,
        { backgroundColor: "red" },
      );
    },
    bbsMenuFetchFailed: (url) => {
      // HTML として表示するため、設定に書かれた URL も文字として埋め込む。
      const escapedUrl = escapeHtml(url);
      toastStore.notify(
        `板一覧の取得に失敗しました。(<a href="${escapedUrl}" target="_blank">${escapedUrl}</a>)`,
        { html: true, backgroundColor: "red" },
      );
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
    isNGBoard: (title, url, resCount) => ng.isNGBoard(title, url, resCount),
    isNGThread: (res, title, url) => ng.isNGThread(res, title, url),
    add: (ruleDsl) => ng.add(ruleDsl),
    invalidateCache: () => ng.invalidateCache(),
    execExpire: () => ng.execExpire(),
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
  container.bookmarkRoot = bookmarkRootAdapter;
  container.cache = cacheServiceAdapter;
  container.util = utilAdapter;
  container.readState = readStateAdapter;
  container.board = boardServiceAdapter;
  container.bbsMenu = bbsMenuServiceAdapter;
  container.thread = threadServiceAdapter;
  container.toast = toastServiceAdapter;
  container.notification = notificationServiceAdapter;
  container.ng = ngServiceAdapter;
  container.notice = coreNoticeAdapter;
  container.replaceStr = { set: replaceStrTxt.set, replace: replaceStrTxt.replace };
}
