import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => {
  const onMessage: Array<(data: { key?: string; val?: unknown }) => void> = [];
  const bookmarkEntryList = {
    needReconfigureRootNodeId: { add: vi.fn(), wasCalled: true },
    setRootNodeId: vi.fn(async () => true),
  };
  return {
    onMessage,
    configReadyCallbacks: [] as Array<() => void>,
    bookmarkEntryList,
    bookmarkRoots: [] as string[],
    promiseFirstScan: Promise.resolve(true) as Promise<boolean>,
    bookmarkGet: vi.fn(() => null),
    bookmarkGetAll: vi.fn(() => []),
    bookmarkImport: vi.fn(async () => true),
    bookmarkGetByBoard: vi.fn(() => []),
    bookmarkGetAllBoards: vi.fn(() => []),
    messageSend: vi.fn(),
    configValues: { bookmark_id: "root-1", debug_log: "off" } as Record<string, string>,
    readStateGet: vi.fn(async () => ({
      url: "https://example.com/thread/",
      last: 1,
      read: 1,
      received: 1,
    })),
    readStateGetByBoard: vi.fn(async () => []),
    readStateGetAll: vi.fn(async () => []),
    readStateSet: vi.fn(async () => undefined),
    isNewerReadState: vi.fn(() => true),
    configSet: vi.fn(async () => undefined),
    // view・features がサービスコンテナ経由で使う core の実装（Phase E）。
    history: {
      add: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
      get: vi.fn(async () => []),
      getByUrl: vi.fn(async () => []),
      getAll: vi.fn(async () => []),
      clear: vi.fn(async () => undefined),
    },
    askBoardTitleByUrl: vi.fn(async () => "板名"),
    replaceStrSet: vi.fn(async () => ({ ok: true })),
    listLogs: vi.fn(async () => []),
    deleteLogs: vi.fn(async () => undefined),
    writeHistory: {
      add: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
      get: vi.fn(async () => []),
      getByUrl: vi.fn(async () => []),
      getAll: vi.fn(async () => []),
      clear: vi.fn(async () => undefined),
    },
  };
});

vi.mock("src/core/history/History", () => mocks.history);
vi.mock("src/core/thread/ReplaceStrTxt", () => ({ set: mocks.replaceStrSet }));
vi.mock("src/core/board/BoardTitleSolver", () => ({
  ask: vi.fn(),
  askByUrl: mocks.askBoardTitleByUrl,
  getCachedTitles: vi.fn(),
}));
vi.mock("src/core/history/WriteHistory", () => mocks.writeHistory);

vi.mock("src/service-container/config-instance", () => ({
  configInstance: {
    get: (key: string) => mocks.configValues[key] ?? null,
    set: mocks.configSet,
    ready: (callback: () => void) => mocks.configReadyCallbacks.push(callback),
    getAll: () => mocks.configValues,
    del: vi.fn(async () => undefined),
  },
}));

vi.mock("src/app/Message", () => ({
  default: {
    send: mocks.messageSend,
    on: (_type: string, callback: (data: { key?: string; val?: unknown }) => void) => {
      mocks.onMessage.push(callback);
    },
    off: vi.fn(),
  },
}));

vi.mock("src/app/Defer", () => ({ defer: vi.fn(async () => undefined) }));
vi.mock("src/app/Util", () => ({
  escapeHtml: (value: string) => value,
  safeHref: (value: string) => value,
}));
vi.mock("src/core/bookmark/Bookmark", () => ({
  default: class {
    readonly bel = mocks.bookmarkEntryList;
    readonly promiseFirstScan = mocks.promiseFirstScan;
    constructor(rootId: string) {
      mocks.bookmarkRoots.push(rootId);
    }
    get = mocks.bookmarkGet;
    getByBoard = mocks.bookmarkGetByBoard;
    getAllBoards = mocks.bookmarkGetAllBoards;
    getAll = mocks.bookmarkGetAll;
    import = mocks.bookmarkImport;
    add = vi.fn(async () => true);
    remove = vi.fn(async () => true);
    updateResCount = vi.fn(async () => true);
    updateExpired = vi.fn(async () => true);
  },
}));
vi.mock("src/core/bookmark/ReadState", () => ({
  get: mocks.readStateGet,
  getByBoard: mocks.readStateGetByBoard,
  getAll: mocks.readStateGetAll,
  set: mocks.readStateSet,
}));
vi.mock("src/core/bookmark/read-state-compare", () => ({
  isNewerReadState: mocks.isNewerReadState,
}));
vi.mock("src/core/board/BBSMenuModel", () => ({
  BBSMenuModel: class {
    get = vi.fn(async () => ({ status: "success" as const }));
    getCached = vi.fn(async () => ({ status: "success" as const }));
    onChange = { add: vi.fn(), remove: vi.fn() };
  },
}));
vi.mock("src/core/board/BoardService", () => ({
  createBoardService: () => ({ getThreads: vi.fn(), getCachedResCount: vi.fn() }),
}));
vi.mock("src/core/storage/Cache", () => ({
  default: class {
    static listLogs = mocks.listLogs;
    static deleteLogs = mocks.deleteLogs;
  },
}));
vi.mock("src/core/ng/NG", () => ({
  validate: vi.fn(),
  apply: vi.fn(),
  isNGBoard: vi.fn(),
  isNGThread: vi.fn(),
  add: vi.fn(),
  invalidateCache: vi.fn(),
  execExpire: vi.fn(),
}));
vi.mock("src/app/Notification", () => ({
  default: class {
    ready = Promise.resolve(true);
    static isSupported = vi.fn(() => true);
  },
}));
vi.mock("src/core/thread/ThreadService", () => ({
  createThreadService: () => ({ getThread: vi.fn() }),
}));
const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("src/app/logger", () => ({ setConsolaLevel: vi.fn(), createLogger: () => loggerMock }));
vi.mock("src/service-container/Container", () => ({ container: {} }));
vi.mock("src/service-container/toast-store", () => ({ toastStore: {} }));

describe("サービスコンテナの初期化", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.onMessage.length = 0;
    mocks.configReadyCallbacks.length = 0;
    mocks.bookmarkRoots.length = 0;
    mocks.bookmarkEntryList.needReconfigureRootNodeId.wasCalled = true;
    mocks.bookmarkEntryList.setRootNodeId.mockClear();
    mocks.messageSend.mockClear();
    mocks.configValues.bookmark_id = "root-1";
    mocks.configValues.debug_log = "off";
    mocks.promiseFirstScan = Promise.resolve(true);
    mocks.readStateGet.mockClear();
    mocks.isNewerReadState.mockClear();
  });

  it("window.appなしでBookmarkとReadStateを設定済みConfigから初期化する", async () => {
    const { setupContainer } = await import("src/service-container/setup");
    const { container } = await import("src/service-container/Container");

    expect(mocks.bookmarkRoots).toEqual([]);
    for (const callback of mocks.configReadyCallbacks) callback();
    for (const callback of mocks.configReadyCallbacks) callback();
    setupContainer();

    expect("app" in globalThis).toBe(false);
    expect(mocks.bookmarkRoots).toEqual(["root-1"]);
    expect(container.bookmark.promiseFirstScan).toBe(mocks.promiseFirstScan);
    expect(mocks.messageSend).toHaveBeenCalledWith("bookmark_root_reconfigure_required");
    await expect(container.readState.get("https://example.com/thread/")).resolves.toMatchObject({
      read: 1,
    });
    expect(container.util.isNewerReadState(null, null)).toBe(true);
  });

  it("メインの画面が使う core の実装をサービスコンテナへつなぐ", async () => {
    const { setupContainer } = await import("src/service-container/setup");
    const { setupBrowserViewServices } = await import("src/service-container/setup-browser-view");
    const { container } = await import("src/service-container/Container");
    for (const callback of mocks.configReadyCallbacks) callback();
    setupContainer();
    setupBrowserViewServices();

    // 呼び出しを core の実装へそのまま渡していることを、サービスごとに確かめる。
    await container.history.add("https://example.com/test/read.cgi/a/1/", "スレ", 1, "板");
    expect(mocks.history.add).toHaveBeenCalledWith(
      "https://example.com/test/read.cgi/a/1/",
      "スレ",
      1,
      "板",
    );
    await container.history.getAll();
    expect(mocks.history.getAll).toHaveBeenCalled();
    // 履歴の一覧は window.app ではなくここから読む（legacy-window-app-plan の Phase 1）。
    await container.history.get(0, 500);
    expect(mocks.history.get).toHaveBeenCalledWith(0, 500);
    await container.writeHistory.get(undefined, 5000);
    expect(mocks.writeHistory.get).toHaveBeenCalledWith(undefined, 5000);
    await container.writeHistory.remove("https://example.com/test/read.cgi/a/1/", 3);
    expect(mocks.writeHistory.remove).toHaveBeenCalledWith(
      "https://example.com/test/read.cgi/a/1/",
      3,
    );
    await container.readState.getAll();
    expect(mocks.readStateGetAll).toHaveBeenCalled();
    await container.writeHistory.getByUrl("https://example.com/test/read.cgi/a/1/");
    expect(mocks.writeHistory.getByUrl).toHaveBeenCalledWith(
      "https://example.com/test/read.cgi/a/1/",
    );
    await container.threadLog.listLogs(0, 10);
    expect(mocks.listLogs).toHaveBeenCalledWith(0, 10);
    await container.threadLog.deleteLogs();
    expect(mocks.deleteLogs).toHaveBeenCalled();
    await expect(container.boardTitle.askByUrl("https://example.com/board/")).resolves.toBe("板名");
    await container.replaceStr.set("rule");
    expect(mocks.replaceStrSet).toHaveBeenCalledWith("rule");
    // 開いた板の記録は、登録した config へ書き込む（取得確認済みの独自ホストとして保存させる）。
    container.openedBoards.upsertOpenedBoardEntry("https://example.com/board/", "板", 1, true);
    await vi.waitFor(() =>
      expect(mocks.configSet).toHaveBeenCalledWith("opened_board_entries", expect.any(String)),
    );
  });

  it("bookmark_id更新をEntryListへ渡す", async () => {
    const { setupContainer } = await import("src/service-container/setup");
    for (const callback of mocks.configReadyCallbacks) callback();
    setupContainer();

    for (const listener of mocks.onMessage) {
      listener({ key: "bookmark_id", val: "root-2" });
    }

    expect(mocks.bookmarkEntryList.setRootNodeId).toHaveBeenCalledWith("root-2");
  });

  describe("ブックマークの起動の順番（legacy-window-app-plan の Phase 2）", () => {
    // 起動の順番: 設定の読み込み（Config.ready）→ ブックマークの初期化（走査の開始）→ setupContainer → 描画。
    // 画面は描画のあと container.bookmark.ready() で最初の走査の完了を待ってから読む。
    it("設定の読み込みより前にはブックマークを作らず、setupContainer も始められない", async () => {
      const { setupContainer } = await import("src/service-container/setup");

      expect(mocks.bookmarkRoots).toEqual([]);
      expect(() => setupContainer()).toThrow(
        "Bookmark runtime is not initialized before Config.ready",
      );
    });

    it("ready は最初の走査が終わるまで解決しない", async () => {
      let finishScan: ((value: boolean) => void) | undefined;
      mocks.promiseFirstScan = new Promise<boolean>((resolve) => {
        finishScan = resolve;
      });
      const { setupContainer } = await import("src/service-container/setup");
      const { container } = await import("src/service-container/Container");
      for (const callback of mocks.configReadyCallbacks) callback();
      setupContainer();

      let isReady = false;
      const ready = container.bookmark.ready().then(() => {
        isReady = true;
      });
      await Promise.resolve();
      expect(isReady).toBe(false);

      finishScan?.(true);
      await ready;
      expect(isReady).toBe(true);
    });

    it("最初の走査が失敗しても ready は reject せず、原因をログに残す", async () => {
      const scanError = new Error("走査の失敗");
      mocks.promiseFirstScan = Promise.reject(scanError);
      // 未処理の reject として扱われないよう、テスト側でも受けておく。
      mocks.promiseFirstScan.catch(() => undefined);
      loggerMock.error.mockClear();
      const { setupContainer } = await import("src/service-container/setup");
      const { container } = await import("src/service-container/Container");
      for (const callback of mocks.configReadyCallbacks) callback();
      setupContainer();

      await expect(container.bookmark.ready()).resolves.toBeUndefined();
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.stringContaining("初回の走査"),
        scanError,
      );
    });

    it("画面が使う一覧・読み込み・保存先の操作を Bookmark へつなぐ", async () => {
      const { setupContainer } = await import("src/service-container/setup");
      const { container } = await import("src/service-container/Container");
      for (const callback of mocks.configReadyCallbacks) callback();
      setupContainer();

      container.bookmark.getAll();
      expect(mocks.bookmarkGetAll).toHaveBeenCalled();
      const entry = {
        url: "https://example.com/test/read.cgi/a/1/",
        title: "スレ",
        type: "thread",
        bbsType: "2ch",
        resCount: null,
        readState: null,
        expired: false,
      };
      await expect(container.bookmark.import(entry)).resolves.toBe(true);
      expect(mocks.bookmarkImport).toHaveBeenCalledWith(entry);

      // 起動前に保存先が見つからなかったことは、画面から選び直しの要否として読める。
      expect(container.bookmarkRoot.isReconfigureRequired()).toBe(true);
      mocks.bookmarkEntryList.needReconfigureRootNodeId.wasCalled = false;
      expect(container.bookmarkRoot.isReconfigureRequired()).toBe(false);
      await expect(container.bookmarkRoot.setRootNodeId("root-3")).resolves.toBe(true);
      expect(mocks.bookmarkEntryList.setRootNodeId).toHaveBeenCalledWith("root-3");
    });
  });
});
