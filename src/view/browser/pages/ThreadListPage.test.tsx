import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { createOpenedBoards } from "src/core/board/OpenedBoards";
import {
  type DisplayThread,
  THREAD_LIST_COLUMNS,
} from "src/features/thread-list/ui/thread-list-shared";
import { container as serviceContainer } from "src/service-container/index";
import type {
  IBoardService,
  IBoardTitleService,
  IBookmark,
  IThread,
} from "src/service-container/interfaces";
import { stubService } from "src/service-container/test-stubs";
import { ThreadListPage } from "src/view/browser/pages/ThreadListPage";
import { getAutoRefreshThreadPageKey } from "src/view/browser/state/tabs/auto-refresh-pages";
import { QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE } from "src/view/browser/utils/filter-toolbar-events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const THREAD_LIST_SORT_STORAGE_KEY = "chlens_browser_thread_list_sort_by_site";
const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("src/app/logger", () => ({ createLogger: () => loggerMock }));

const { dispatchMock, selectedTabIdRef, viewStateRef, updateViewStateMock } = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  selectedTabIdRef: { current: "tab-1" },
  viewStateRef: {
    current: {} as {
      searchQuery?: string;
      sortColumn?: string | null;
      sortDirection?: "asc" | "desc";
    },
  },
  updateViewStateMock: vi.fn(),
}));
const { focusedPaneIdRef, panesRef } = vi.hoisted(() => ({
  focusedPaneIdRef: { current: "pane-1" },
  panesRef: { current: [] as unknown[] },
}));
const { cacheGetMock, cachePutMock } = vi.hoisted(() => ({
  cacheGetMock: vi.fn(),
  cachePutMock: vi.fn(),
}));
const { bookmarkGetMock } = vi.hoisted(() => ({
  bookmarkGetMock: vi.fn(),
}));

vi.mock("src/features/thread-list/ui/thread-list-shared", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("src/features/thread-list/ui/thread-list-shared")>();
  return {
    ...actual,
    // UIキャッシュの検証をページ表示の責務へ限定し、拡張機能APIを読み込まずに試す。
    getThreadListCache: cacheGetMock,
    setThreadListCache: cachePutMock,
  };
});

// 板名の解決はサービスコンテナの boardTitle から使うため、テスト用の関数を用意して登録する。
const { askBoardTitle } = vi.hoisted(() => ({
  askBoardTitle: vi.fn(async (_url: unknown): Promise<string | null> => null),
}));
vi.mock("src/core/board/BoardUrlNormalizer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("src/core/board/BoardUrlNormalizer")>();
  // 実在の板へ依存せず、予約済みドメインで板を開いた記録を検証する。
  return {
    ...actual,
    normalizeBoardUrl: (url: string, options?: Parameters<typeof actual.normalizeBoardUrl>[1]) =>
      actual.normalizeBoardUrl(url, url.includes("example.com") ? {} : options),
    getBoardUrlKey: (url: string, options?: Parameters<typeof actual.getBoardUrlKey>[1]) =>
      actual.getBoardUrlKey(url, url.includes("example.com") ? {} : options),
  };
});

vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabStore: () => ({
    dispatch: dispatchMock,
    state: { selectedTabId: selectedTabIdRef.current },
    stateRef: {
      get current() {
        return {
          panes: [
            {
              id: "pane-1",
              tabs: [
                {
                  id: selectedTabIdRef.current,
                  history: [
                    { type: "boardList", title: "ホーム" },
                    {
                      type: "threadList",
                      title: "Software",
                      boardUrl: "https://egg.5ch.net/software/",
                      boardTitle: "Software",
                    },
                    { type: "settings", title: "設定" },
                  ],
                  currentIndex: 1,
                  pinned: false,
                  reloadKey: 0,
                  autoRefreshEnabled: false,
                  autoRefreshPageKey: null,
                },
              ],
              activeTabId: selectedTabIdRef.current,
            },
          ],
          activePaneId: "pane-1",
          closedTabs: [],
        };
      },
    },
    viewTab: {
      id: selectedTabIdRef.current,
      history: [
        { type: "boardList", title: "ホーム" },
        {
          type: "threadList",
          title: "Software",
          boardUrl: "https://egg.5ch.net/software/",
          boardTitle: "Software",
        },
        { type: "settings", title: "設定" },
      ],
      currentIndex: 1,
      pinned: false,
      reloadKey: 0,
      autoRefreshEnabled: false,
      autoRefreshPageKey: null,
    },
  }),
  useTabDispatch: () => dispatchMock,
  useTabDispatchForTab: () => dispatchMock,
  useTabViewState: () => ({ state: viewStateRef.current, update: updateViewStateMock }),
  usePaneId: () => "pane-1",
  useActivePaneId: () => focusedPaneIdRef.current,
  useTabPanes: () => ({ panes: panesRef.current }),
}));

const THREADS: IThread[] = [
  {
    url: "https://egg.5ch.net/test/read.cgi/software/1/",
    title: "B Thread",
    resCount: 20,
    createdAt: 1,
    readState: {
      url: "https://egg.5ch.net/test/read.cgi/software/1/",
      read: 14,
      received: 20,
      last: 14,
    },
  },
  {
    url: "https://egg.5ch.net/test/read.cgi/software/2/",
    title: "A Thread",
    resCount: 5,
    createdAt: 2,
    readState: {
      url: "https://egg.5ch.net/test/read.cgi/software/2/",
      read: 5,
      received: 5,
      last: 5,
    },
  },
  {
    url: "https://egg.5ch.net/test/read.cgi/software/3/",
    title: "C Thread",
    resCount: 12,
    createdAt: 3,
    readState: {
      url: "https://egg.5ch.net/test/read.cgi/software/3/",
      read: 3,
      received: 12,
      last: 3,
    },
  },
];

function createMemoryStorage(): Storage {
  const items = new Map<string, string>();

  return {
    get length() {
      return items.size;
    },
    clear() {
      items.clear();
    },
    getItem(key: string) {
      return items.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(items.keys())[index] ?? null;
    },
    removeItem(key: string) {
      items.delete(key);
    },
    setItem(key: string, value: string) {
      items.set(key, value);
    },
  };
}

function getRenderedThreadTitles(): string[] {
  return Array.from(document.querySelectorAll(".thread-list__title")).map(
    (node) => node.textContent?.trim() ?? "",
  );
}

async function flushAsyncRender(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("ThreadListPage", () => {
  let getThreadsMock: ReturnType<typeof vi.fn>;
  const configUpdatedListeners = new Set<(payload: { key?: string }) => void>();
  const messageListeners = new Map<string, Set<(payload: never) => void>>();

  beforeEach(() => {
    cacheGetMock.mockReset();
    cacheGetMock.mockResolvedValue(undefined);
    cachePutMock.mockReset();
    vi.useFakeTimers();
    dispatchMock.mockReset();
    viewStateRef.current = {};
    updateViewStateMock.mockReset();
    const askBoardTitleMock = vi.mocked(askBoardTitle);
    askBoardTitleMock.mockReset();
    askBoardTitleMock.mockResolvedValue(null);
    selectedTabIdRef.current = "tab-1";
    focusedPaneIdRef.current = "pane-1";
    panesRef.current = [];
    const localStorageMock = createMemoryStorage();
    vi.stubGlobal("localStorage", localStorageMock);
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageMock,
    });
    window.localStorage.removeItem(THREAD_LIST_SORT_STORAGE_KEY);
    getThreadsMock = vi.fn(async () => ({
      threads: THREADS,
      message: null,
    }));
    serviceContainer.board = {
      getThreads: getThreadsMock,
      getCachedResCount: vi.fn(),
    } as unknown as IBoardService;
    bookmarkGetMock.mockReset();
    bookmarkGetMock.mockReturnValue(undefined);
    serviceContainer.bookmark = {
      // 初回の走査の完了はサービスコンテナで待つ（legacy-window-app-plan の Phase 2）。
      ready: vi.fn(async () => undefined),
      get: bookmarkGetMock,
      add: vi.fn(),
      remove: vi.fn(),
      updateResCount: vi.fn(),
      updateExpired: vi.fn(),
      getByBoard: vi.fn(() => []),
    } as unknown as IBookmark;
    serviceContainer.util = {
      isNewerReadState: (a: unknown, b: unknown) =>
        (b as { received?: number }).received !== (a as { received?: number }).received,
    } as unknown as typeof serviceContainer.util;
    serviceContainer.config = {
      get: vi.fn((key: string) => (key === "auto_load_second_board" ? "10000" : "0")),
      set: vi.fn(),
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    // ジェネリックな実サービスに対し、このテストで扱うconfig更新イベントだけに限定する。
    serviceContainer.boardTitle = stubService<IBoardTitleService>("boardTitle", {
      ask: askBoardTitle,
    });
    // 開いた板の保存は、テストごとに差し替える config をそのまま読む本物の実装で確かめる。
    serviceContainer.openedBoards = createOpenedBoards(serviceContainer);
    serviceContainer.message = {
      send: vi.fn(),
      on: vi.fn((type: string, handler: (payload: { key?: string }) => void) => {
        if (type === "config_updated") {
          configUpdatedListeners.add(handler);
        }
        if (!messageListeners.has(type)) {
          messageListeners.set(type, new Set());
        }
        messageListeners.get(type)?.add(handler as (payload: never) => void);
      }),
      off: vi.fn((type: string, handler: (payload: { key?: string }) => void) => {
        if (type === "config_updated") {
          configUpdatedListeners.delete(handler);
        }
        messageListeners.get(type)?.delete(handler as (payload: never) => void);
      }),
    } as unknown as typeof serviceContainer.message;
  });

  afterEach(() => {
    cleanup();
    window.localStorage.removeItem(THREAD_LIST_SORT_STORAGE_KEY);
    vi.unstubAllGlobals();
    configUpdatedListeners.clear();
    messageListeners.clear();
    vi.useRealTimers();
  });

  it("板だけを開いた日時を保存し、板名更新では日時を維持し、再選択で更新する", async () => {
    vi.useRealTimers();
    let saved = "[]";
    serviceContainer.config.get = vi.fn((key: string) =>
      key === "opened_board_entries" ? saved : "0",
    );
    serviceContainer.config.set = vi.fn((key: string, value: unknown) => {
      if (key === "opened_board_entries") saved = String(value);
    });
    let now = 100;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const page = {
      type: "threadList" as const,
      title: "sample",
      boardUrl: "https://example.com/sample/",
      boardTitle: "sample",
    };
    const { rerender } = render(
      <ThreadListPage tabId="tab-1" page={page} refreshKey={0} isActive />,
    );
    await waitFor(() =>
      expect(JSON.parse(saved)).toEqual([{ url: page.boardUrl, title: "", lastVisited: 100 }]),
    );
    expect(askBoardTitle).toHaveBeenCalled();
    now = 200;
    const resolvedPage = { ...page, title: "サンプル板", boardTitle: "サンプル板" };
    rerender(<ThreadListPage tabId="tab-1" page={resolvedPage} refreshKey={0} isActive />);
    await waitFor(() =>
      expect(JSON.parse(saved)[0]).toEqual({
        url: page.boardUrl,
        title: "サンプル板",
        lastVisited: 100,
      }),
    );
    rerender(<ThreadListPage tabId="tab-1" page={resolvedPage} refreshKey={0} isActive={false} />);
    rerender(<ThreadListPage tabId="tab-1" page={resolvedPage} refreshKey={0} isActive />);
    await waitFor(() => expect(JSON.parse(saved)[0].lastVisited).toBe(200));
    vi.restoreAllMocks();
  });

  it("未保存の板名は取得結果から直接保存し、タブの描画更新を待たず閲覧日時を保つ", async () => {
    vi.useRealTimers();
    let saved = JSON.stringify([{ url: "https://example.com/sample/", title: "", lastVisited: 1 }]);
    serviceContainer.config.get = vi.fn((key: string) =>
      key === "opened_board_entries" ? saved : "0",
    );
    serviceContainer.config.set = vi.fn((key: string, value: unknown) => {
      if (key === "opened_board_entries") saved = String(value);
    });
    const pending = Promise.withResolvers<string>();
    vi.mocked(askBoardTitle).mockReturnValueOnce(pending.promise);
    const page = {
      type: "threadList" as const,
      title: "sample",
      boardUrl: "https://example.com/sample/",
      boardTitle: "sample",
    };
    render(<ThreadListPage tabId="tab-1" page={page} refreshKey={0} isActive />);
    await waitFor(() => expect(JSON.parse(saved)[0].lastVisited).toBeGreaterThan(1));
    const visitedAt = JSON.parse(saved)[0].lastVisited;
    await act(async () => pending.resolve("取得した板名"));
    await waitFor(() =>
      expect(JSON.parse(saved)[0]).toEqual({
        url: page.boardUrl,
        title: "取得した板名",
        lastVisited: visitedAt,
      }),
    );
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "取得した板名", boardUrl: page.boardUrl }),
    );
  });

  it("板を切り替えた後に届いた名前も元の板へ保存し、表示中の板を上書きしない", async () => {
    vi.useRealTimers();
    let saved = "[]";
    serviceContainer.config.get = vi.fn((key: string) =>
      key === "opened_board_entries" ? saved : "0",
    );
    serviceContainer.config.set = vi.fn((key: string, value: unknown) => {
      if (key === "opened_board_entries") saved = String(value);
    });
    const pending = Promise.withResolvers<string>();
    vi.mocked(askBoardTitle).mockReturnValueOnce(pending.promise);
    const first = {
      type: "threadList" as const,
      title: "sample",
      boardUrl: "https://example.com/sample/",
      boardTitle: "sample",
    };
    const second = {
      type: "threadList" as const,
      title: "別の板",
      boardUrl: "https://example.com/another/",
      boardTitle: "別の板",
    };
    const { rerender } = render(
      <ThreadListPage tabId="tab-1" page={first} refreshKey={0} isActive />,
    );
    await waitFor(() => expect(JSON.parse(saved)).toHaveLength(1));
    const visitedAt = JSON.parse(saved)[0].lastVisited;
    rerender(<ThreadListPage tabId="tab-1" page={second} refreshKey={0} isActive />);
    await waitFor(() => expect(JSON.parse(saved)).toHaveLength(2));
    await act(async () => pending.resolve("最初の板名"));
    await waitFor(() =>
      expect(
        JSON.parse(saved).find((entry: { url: string }) => entry.url === first.boardUrl),
      ).toEqual({ url: first.boardUrl, title: "最初の板名", lastVisited: visitedAt }),
    );
    expect(
      JSON.parse(saved).find((entry: { url: string }) => entry.url === second.boardUrl).title,
    ).toBe("別の板");
    expect(dispatchMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: "最初の板名" }));
  });

  it.each([true, false])(
    "独自ホストの板はスレ一覧の取得確認を保存し、名前の到着順に依存しない（名前が先=%s）",
    async (nameFirst) => {
      vi.useRealTimers();
      let saved = "[]";
      serviceContainer.config.get = vi.fn((key: string) =>
        key === "opened_board_entries" ? saved : "0",
      );
      serviceContainer.config.set = vi.fn((key: string, value: unknown) => {
        if (key === "opened_board_entries") saved = String(value);
      });
      const title = Promise.withResolvers<string>();
      const subject = Promise.withResolvers<{ threads: IThread[]; message: null }>();
      vi.mocked(askBoardTitle).mockReturnValueOnce(title.promise);
      getThreadsMock.mockReturnValueOnce(subject.promise);
      const page = {
        type: "threadList" as const,
        title: "sample",
        boardUrl: "https://example.org/sample/",
        boardTitle: "sample",
      };
      const { unmount } = render(
        <ThreadListPage tabId="tab-1" page={page} refreshKey={0} isActive />,
      );
      await act(flushAsyncRender);
      expect(JSON.parse(saved)).toEqual([]);
      const todayStart = new Date().setHours(0, 0, 0, 0);
      if (nameFirst) await act(async () => title.resolve("独自の板名"));
      await act(async () => subject.resolve({ threads: THREADS, message: null }));
      if (!nameFirst) await act(async () => title.resolve("独自の板名"));
      await waitFor(() =>
        expect(JSON.parse(saved)[0]).toMatchObject({
          url: page.boardUrl,
          title: "独自の板名",
          subjectVerified: true,
        }),
      );
      expect(JSON.parse(saved)[0].lastVisited).toBeGreaterThanOrEqual(todayStart);
      unmount();
      render(
        <ThreadListPage
          tabId="tab-1"
          page={{ ...page, title: "独自の板名", boardTitle: "独自の板名" }}
          refreshKey={0}
          isActive
        />,
      );
      await waitFor(() => expect(JSON.parse(saved)).toHaveLength(1));
      expect(JSON.parse(saved)[0]).toMatchObject({ title: "独自の板名", subjectVerified: true });
      expect(askBoardTitle).toHaveBeenCalledTimes(1);
    },
  );

  it("独自ホストは名前だけ判明しても、スレ一覧の取得に失敗したら保存対象を広げない", async () => {
    vi.useRealTimers();
    loggerMock.error.mockClear();
    let saved = "[]";
    serviceContainer.config.get = vi.fn((key: string) =>
      key === "opened_board_entries" ? saved : "0",
    );
    serviceContainer.config.set = vi.fn((key: string, value: unknown) => {
      if (key === "opened_board_entries") saved = String(value);
    });
    getThreadsMock.mockRejectedValueOnce(new Error("スレ一覧なし"));
    vi.mocked(askBoardTitle).mockResolvedValueOnce("名前だけの結果");
    render(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "sample",
          boardUrl: "https://example.org/sample/",
          boardTitle: "sample",
        }}
        refreshKey={0}
        isActive
      />,
    );
    await waitFor(() => expect(loggerMock.error).toHaveBeenCalled());
    await act(flushAsyncRender);
    expect(JSON.parse(saved)).toEqual([]);
  });

  it("板の保存に失敗した場合は詳細をログへ出し、次の保存を続ける", async () => {
    vi.useRealTimers();
    loggerMock.error.mockClear();
    const error = new Error("保存失敗");
    let saved = "[]";
    serviceContainer.config.get = vi.fn((key: string) =>
      key === "opened_board_entries" ? saved : "0",
    );
    const saveConfig = vi
      .fn((key: string, value: unknown) => {
        if (key === "opened_board_entries") saved = String(value);
      })
      .mockRejectedValueOnce(error);
    serviceContainer.config.set = saveConfig;
    const page = {
      type: "threadList" as const,
      title: "サンプル板",
      boardUrl: "https://example.com/sample/",
      boardTitle: "サンプル板",
    };
    render(<ThreadListPage tabId="tab-1" page={page} refreshKey={0} isActive />);
    await waitFor(() =>
      expect(loggerMock.error).toHaveBeenCalledWith("開いた板の保存に失敗しました", {
        boardUrl: page.boardUrl,
        error,
      }),
    );
    await waitFor(() =>
      expect(JSON.parse(saved)[0]).toMatchObject({
        url: page.boardUrl,
        title: page.title,
        lastVisited: expect.any(Number),
      }),
    );
  });

  it("一覧上端の上ホイールはフィルタを開くだけで、一覧の更新はしない", async () => {
    // 変更理由: 一覧上端のホイール操作は更新からフィルタ開閉へ戻したため、
    // 実際の一覧とスクロール要素を組み合わせて、更新が走らず開閉だけが行われることを確かめる。
    vi.useRealTimers();
    const scrollContainerRef = createRef<HTMLDivElement>();
    render(
      <div ref={scrollContainerRef} className="content-area__tab-panel" data-tab-panel-id="tab-1">
        <ThreadListPage
          tabId="tab-1"
          page={{
            type: "threadList",
            title: "テスト板",
            boardUrl: "https://example.com/wheel-refresh/",
            boardTitle: "テスト板",
          }}
          refreshKey={0}
          isActive
          scrollContainerRef={scrollContainerRef}
        />
      </div>,
    );
    const panel = scrollContainerRef.current!;
    await waitFor(() => expect(getRenderedThreadTitles()).toHaveLength(3));
    dispatchMock.mockClear();

    fireEvent.wheel(panel, { deltaY: -48 });
    expect(screen.getByRole("textbox")).toBeVisible();
    // ホイールで開いた直後の下ホイールは、フィルタを閉じる操作として扱う。
    fireEvent.wheel(panel, { deltaY: 48 });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(dispatchMock).not.toHaveBeenCalledWith({ type: "RELOAD", tabId: "tab-1" });

    const toggleFilter = () =>
      fireEvent(
        window,
        new CustomEvent(QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE.threadList, {
          detail: { tabId: "tab-1" },
        }),
      );
    // ボタンで開いたフィルタは、下ホイールでは閉じない。
    toggleFilter();
    expect(screen.getByRole("textbox")).toBeVisible();
    fireEvent.wheel(panel, { deltaY: 48 });
    expect(screen.getByRole("textbox")).toBeVisible();
    toggleFilter();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it.each([false, true])(
    "一覧の中央スピナーは更新の完了と同時に消える（取得失敗: %s）",
    async (fails) => {
      // 変更理由: タイマーを進めずに表示終了を確認し、完了後にフェード用の
      // スピナーが残る挙動が成功・失敗の両方で再発しないようにする。
      vi.useRealTimers();
      const page = {
        type: "threadList" as const,
        title: "テスト板",
        boardUrl: "https://example.com/spinner-duration/",
        boardTitle: "テスト板",
      };
      const { rerender } = render(
        <ThreadListPage tabId="tab-1" page={page} refreshKey={0} isActive />,
      );
      await waitFor(() => expect(getRenderedThreadTitles()).toHaveLength(3));
      vi.useFakeTimers();

      const refreshError = new Error("テスト用の取得失敗");
      let finishRefresh = () => {};
      getThreadsMock.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            finishRefresh = () =>
              fails ? reject(refreshError) : resolve({ threads: THREADS, message: null });
          }),
      );
      loggerMock.error.mockClear();
      rerender(<ThreadListPage tabId="tab-1" page={page} refreshKey={1} isActive />);
      expect(screen.getByLabelText("スレ一覧を読み込み中")).toBeVisible();

      await act(async () => {
        finishRefresh();
        await flushAsyncRender();
      });

      expect(screen.queryByLabelText("スレ一覧を読み込み中")).toBeNull();
      expect(document.querySelector(".thread-list-page__loading-overlay")).toBeNull();
      if (fails) {
        expect(loggerMock.error).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ error: refreshError }),
        );
      }
    },
  );

  it("一覧の自動更新は表示中タブでのみ発火する", async () => {
    const props = {
      tabId: "tab-1",
      page: {
        type: "threadList" as const,
        title: "Software",
        boardUrl: "https://egg.5ch.net/software/",
        boardTitle: "Software",
      },
      refreshKey: 0,
      isActive: true,
      isAutoRefreshEnabled: true,
    };

    const { rerender } = render(
      <ThreadListPage
        tabId={props.tabId}
        page={props.page}
        refreshKey={props.refreshKey}
        isActive={props.isActive}
        isAutoRefreshEnabled={props.isAutoRefreshEnabled}
      />,
    );

    await flushAsyncRender();
    expect(getThreadsMock).toHaveBeenCalledTimes(1);

    dispatchMock.mockClear();

    selectedTabIdRef.current = "tab-2";
    rerender(
      <ThreadListPage
        tabId={props.tabId}
        page={props.page}
        refreshKey={props.refreshKey}
        isActive={false}
        isAutoRefreshEnabled={props.isAutoRefreshEnabled}
      />,
    );
    await vi.advanceTimersByTimeAsync(10000);
    expect(dispatchMock).not.toHaveBeenCalledWith({ type: "RELOAD" });

    selectedTabIdRef.current = "tab-1";
    rerender(
      <ThreadListPage
        tabId={props.tabId}
        page={props.page}
        refreshKey={props.refreshKey}
        isActive={true}
        isAutoRefreshEnabled={props.isAutoRefreshEnabled}
      />,
    );
    await vi.advanceTimersByTimeAsync(10000);
    expect(dispatchMock).toHaveBeenCalledWith({ type: "RELOAD", tabId: "tab-1" });
  });

  it("非表示中の既読更新は保留し、表示復帰時に再取得なしで反映する", async () => {
    vi.useRealTimers();
    const page = {
      type: "threadList" as const,
      title: "Software",
      boardUrl: "https://egg.5ch.net/software/",
      boardTitle: "Software",
    };
    const { rerender } = render(
      <ThreadListPage tabId="tab-1" page={page} refreshKey={0} isActive={false} />,
    );

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toContain("B Thread");
    });
    const emit = (payload: unknown) => {
      for (const handler of messageListeners.get("read_state_updated") ?? []) {
        handler(payload as never);
      }
    };
    // 変更理由: 2ペイン時、スレ側の自動更新で既読位置が進むたび裏側の一覧まで
    // 書き換わっていた。非表示の間は適用せず、復帰時にまとめて反映する。
    emit({
      board_url: "https://egg.5ch.net/software/",
      read_state: {
        url: "https://egg.5ch.net/test/read.cgi/software/1/",
        read: 14,
        received: 25,
        last: 14,
      },
    });
    await flushAsyncRender();
    // 未読列は 20-14=6 のまま変わらない。
    expect(document.body.textContent).not.toContain("11");

    rerender(<ThreadListPage tabId="tab-1" page={page} refreshKey={0} isActive={true} />);
    await waitFor(() => {
      // 未読列が 25-14=11 に更新される。再取得は走らない。
      expect(document.body.textContent).toContain("11");
    });
    expect(getThreadsMock).toHaveBeenCalledTimes(1);
  });

  it("エッヂのhttp板URLで届いた既読通知を一覧の色と未読数へ反映する", async () => {
    vi.useRealTimers();
    const threadUrl = "http://bbs.eddibb.cc/test/read.cgi/example/1/";
    getThreadsMock.mockResolvedValueOnce({
      threads: [
        { ...THREADS[0], url: threadUrl, title: "テストスレ", resCount: 4, readState: undefined },
      ],
      message: null,
    });

    render(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "テスト板",
          boardUrl: "https://bbs.eddibb.cc/example/",
          boardTitle: "テスト板",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toContain("テストスレ");
    });
    const row = document.querySelector(".simple-data-table__row");
    expect(row).not.toHaveClass("thread-list__row--visited");

    for (const handler of messageListeners.get("read_state_updated") ?? []) {
      handler({
        board_url: "http://bbs.eddibb.cc/example/",
        read_state: { url: threadUrl, last: 2, read: 2, received: 4 },
      } as never);
    }

    await waitFor(() => {
      const updatedRow = document.querySelector(".simple-data-table__row");
      expect(updatedRow).toHaveClass("thread-list__row--visited");
      expect(updatedRow?.querySelector(".thread-list__unread-badge")).toHaveTextContent("2");
    });
  });

  it("自ペインの表タブでもフォーカス外なら既読更新を保留する", async () => {
    vi.useRealTimers();
    focusedPaneIdRef.current = "pane-2";
    const page = {
      type: "threadList" as const,
      title: "Software",
      boardUrl: "https://egg.5ch.net/software/",
      boardTitle: "Software",
    };
    const { rerender } = render(
      <ThreadListPage tabId="tab-1" page={page} refreshKey={0} isActive={true} />,
    );

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toContain("B Thread");
    });
    // 変更理由: 2ペインでスレ側を見ている間、裏ペインの一覧がスレの自動更新に
    // 連動して書き換わらないこと。フォーカスを戻すとまとめて反映される。
    for (const handler of messageListeners.get("read_state_updated") ?? []) {
      handler({
        board_url: "https://egg.5ch.net/software/",
        read_state: {
          url: "https://egg.5ch.net/test/read.cgi/software/1/",
          read: 14,
          received: 25,
          last: 14,
        },
      } as never);
    }
    await waitFor(() => {
      expect(getThreadsMock).toHaveBeenCalledTimes(1);
    });
    expect(document.body.textContent).not.toContain("11");

    focusedPaneIdRef.current = "pane-1";
    // フォーカス変化はストア経由のため再描画で取り込む。
    rerender(<ThreadListPage tabId="tab-1" page={page} refreshKey={0} isActive={true} />);
    await waitFor(() => {
      expect(document.body.textContent).toContain("11");
    });
    expect(getThreadsMock).toHaveBeenCalledTimes(1);
  });

  it("別ペインのスレ自動更新による既読更新を一覧へ即時反映しない", async () => {
    vi.useRealTimers();
    focusedPaneIdRef.current = "pane-1";
    const threadUrl = THREADS[0].url;
    const boardUrl = new URL(threadUrl).origin + "/software/";
    panesRef.current = [
      {
        id: "pane-1",
        activeTabId: "list-tab",
        tabs: [
          {
            id: "list-tab",
            history: [
              {
                type: "threadList",
                title: "Software",
                boardUrl,
                boardTitle: "Software",
              },
            ],
            currentIndex: 0,
            pinned: false,
            reloadKey: 0,
            autoRefreshEnabled: false,
            autoRefreshPageKey: null,
          },
        ],
      },
      {
        id: "pane-2",
        activeTabId: "thread-tab",
        tabs: [
          {
            id: "thread-tab",
            history: [
              {
                type: "thread",
                title: "スレッド",
                threadUrl,
              },
            ],
            currentIndex: 0,
            pinned: false,
            reloadKey: 0,
            autoRefreshEnabled: true,
            // 変更理由: キーはURL正規化（旧ホスト→現行ホスト）を通して生成されるため、
            // 文字列を直接組み立てず本番と同じヘルパーで作る。
            autoRefreshPageKey: getAutoRefreshThreadPageKey(threadUrl),
          },
        ],
      },
    ];
    const page = {
      type: "threadList" as const,
      title: "Software",
      boardUrl,
      boardTitle: "Software",
    };
    const { rerender } = render(
      <ThreadListPage tabId="tab-1" page={page} refreshKey={0} isActive={true} />,
    );

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toContain("B Thread");
    });
    for (const handler of messageListeners.get("read_state_updated") ?? []) {
      handler({
        board_url: boardUrl,
        read_state: {
          url: threadUrl,
          read: 14,
          received: 25,
          last: 14,
        },
      } as never);
    }

    await flushAsyncRender();
    expect(document.body.textContent).not.toContain("11");

    // スレ側の次回更新で一覧コンポーネントが再描画されても、
    // 自動更新中の通知は引き続き保留する。
    panesRef.current = [...panesRef.current];
    rerender(<ThreadListPage tabId="tab-1" page={page} refreshKey={0} isActive={true} />);
    await flushAsyncRender();
    expect(document.body.textContent).not.toContain("11");

    panesRef.current = [
      {
        id: "pane-1",
        activeTabId: "list-tab",
        tabs: [
          {
            id: "list-tab",
            history: [page],
            currentIndex: 0,
            pinned: false,
            reloadKey: 0,
            autoRefreshEnabled: false,
            autoRefreshPageKey: null,
          },
        ],
      },
    ];
    // スレの自動更新が終わると、保留していた既読状態だけを一覧へ反映する。
    rerender(<ThreadListPage tabId="tab-1" page={page} refreshKey={0} isActive={true} />);
    await waitFor(() => {
      expect(document.body.textContent).toContain("11");
    });
    expect(getThreadsMock).toHaveBeenCalledTimes(1);
  });

  it("スレ一覧のフィルタを板ごとに復元し、保存更新で入力中の値を巻き戻さない", async () => {
    vi.useRealTimers();
    viewStateRef.current = { searchQuery: "A Thread" };

    const softwarePage = {
      type: "threadList" as const,
      title: "Software",
      boardUrl: "https://egg.5ch.net/software/",
      boardTitle: "Software",
    };
    const { rerender } = render(
      <ThreadListPage tabId="tab-1" page={softwarePage} refreshKey={0} isActive={true} />,
    );

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("A Thread");
    });

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "B Thread" } });
    expect(updateViewStateMock).toHaveBeenCalledWith(
      expect.objectContaining({ searchQuery: "B Thread" }),
    );

    // タブストアの再描画が入力イベントより先に届いても、同じ板の入力値は維持する。
    viewStateRef.current = { searchQuery: "" };
    rerender(<ThreadListPage tabId="tab-1" page={softwarePage} refreshKey={0} isActive={true} />);
    expect(screen.getByRole("textbox")).toHaveValue("B Thread");

    // 板を切り替えたときだけ、切り替え先の板に保存された値を復元する。
    viewStateRef.current = { searchQuery: "C Thread" };
    rerender(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "News",
          boardUrl: "https://egg.5ch.net/news/",
          boardTitle: "News",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("C Thread");
    });
  });

  it("同じsiteでは保存したソート順を復元し、別siteには持ち込まない", async () => {
    vi.useRealTimers();

    const { rerender } = render(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "Software",
          boardUrl: "https://egg.5ch.net/software/",
          boardTitle: "Software",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toEqual(["B Thread", "A Thread", "C Thread"]);
    });

    fireEvent.click(screen.getByRole("columnheader", { name: /レス/ }));

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toEqual(["A Thread", "C Thread", "B Thread"]);
    });

    rerender(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "VIP",
          boardUrl: "https://itest.5ch.net/news4vip/",
          boardTitle: "VIP",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(getThreadsMock).toHaveBeenCalledTimes(2);
      expect(getRenderedThreadTitles()).toEqual(["A Thread", "C Thread", "B Thread"]);
    });

    rerender(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "Open2ch",
          boardUrl: "https://hayabusa.open2ch.net/livejupiter/",
          boardTitle: "Open2ch",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(getThreadsMock).toHaveBeenCalledTimes(3);
      expect(getRenderedThreadTitles()).toEqual(["B Thread", "A Thread", "C Thread"]);
    });
  });

  it("一覧データがある場合はresult.messageをエラー表示しない", async () => {
    vi.useRealTimers();

    getThreadsMock.mockResolvedValueOnce({
      threads: THREADS,
      message: "板の読み込みに失敗しました",
    });

    render(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "Software",
          boardUrl: "https://egg.5ch.net/software/",
          boardTitle: "Software",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toEqual(["B Thread", "A Thread", "C Thread"]);
    });

    expect(screen.queryByText("板の読み込みに失敗しました")).toBeNull();
  });

  it("取得結果が空でもキャッシュを復元できれば警告を表示しない", async () => {
    vi.useRealTimers();
    cacheGetMock.mockResolvedValue(THREADS);
    getThreadsMock.mockResolvedValueOnce({
      threads: [],
      message: "板の読み込みに失敗しました",
    });

    render(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "Software",
          boardUrl: "https://example.com/software/",
          boardTitle: "Software",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toEqual(["B Thread", "A Thread", "C Thread"]);
    });
    expect(screen.queryByText("板の読み込みに失敗しました")).toBeNull();
  });

  it("未読数列を表示して未読数でソートできる", async () => {
    vi.useRealTimers();

    render(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "Software",
          boardUrl: "https://egg.5ch.net/software/",
          boardTitle: "Software",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: /未読/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("columnheader", { name: /未読/ }));

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toEqual(["A Thread", "B Thread", "C Thread"]);
    });

    fireEvent.click(screen.getByRole("columnheader", { name: /未読/ }));

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toEqual(["C Thread", "B Thread", "A Thread"]);
    });
  });

  it("未読数は閲覧済みスレだけに青いバッジで表示する", async () => {
    vi.useRealTimers();
    getThreadsMock.mockResolvedValueOnce({
      threads: [THREADS[0], { ...THREADS[1], readState: undefined }],
      message: null,
    });

    render(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "Software",
          boardUrl: "https://egg.5ch.net/software/",
          boardTitle: "Software",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toEqual(["B Thread", "A Thread"]);
    });

    const badges = document.querySelectorAll(".thread-list__unread-badge");
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent("6");
    expect(badges[0]).toHaveClass("thread-list__unread-badge");

    const unseenRow = Array.from(document.querySelectorAll(".simple-data-table__row")).find((row) =>
      row.textContent?.includes("A Thread"),
    );
    expect(unseenRow?.querySelector(".thread-list__unread-badge")).toBeNull();
  });

  it("一度開いたスレの一覧文字色を控えめにする", async () => {
    vi.useRealTimers();
    getThreadsMock.mockResolvedValueOnce({
      threads: [THREADS[0], { ...THREADS[1], readState: undefined }],
      message: null,
    });

    render(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "Software",
          boardUrl: "https://egg.5ch.net/software/",
          boardTitle: "Software",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toEqual(["B Thread", "A Thread"]);
    });

    const findRowByTitle = (title: string) =>
      Array.from(document.querySelectorAll(".simple-data-table__row")).find((row) =>
        row.textContent?.includes(title),
      );

    expect(findRowByTitle("B Thread")).toHaveClass("thread-list__row--visited");
    expect(findRowByTitle("A Thread")).not.toHaveClass("thread-list__row--visited");
  });

  it("ハイライトスレのタイトル横にバッヂを表示しない", () => {
    const titleColumn = THREAD_LIST_COLUMNS.find((column) => column.key === "title");
    if (!titleColumn) throw new Error("タイトル列が見つかりません");

    const highlightedThread: DisplayThread = {
      thread: {
        ...THREADS[0],
        highlight: {
          type: "HighlightTitle",
          action: "highlight",
          params: { label: "注目", bgColor: "yellow" },
        },
      },
      originalIndex: 0,
      unreadCount: 3,
      heat: 1,
      isBookmarked: false,
    };

    render(<>{titleColumn.cell(highlightedThread)}</>);

    expect(screen.queryByText("注目")).toBeNull();
    expect(document.querySelector(".thread-list__label")).toBeNull();
  });

  it("ブックマーク済みスレに星を表示し、右クリック項目にアイコンを付ける", async () => {
    vi.useRealTimers();
    bookmarkGetMock.mockImplementation((url: string) =>
      url === THREADS[0].url ? { url, title: THREADS[0].title, type: "thread" } : undefined,
    );

    render(
      <ThreadListPage
        tabId="tab-1"
        tab={{
          id: "tab-1",
          history: [
            {
              type: "threadList",
              title: "Software",
              boardUrl: "https://egg.5ch.net/software/",
              boardTitle: "Software",
            },
          ],
          currentIndex: 0,
          pinned: false,
          reloadKey: 0,
          autoRefreshEnabled: false,
          autoRefreshPageKey: null,
        }}
        page={{
          type: "threadList",
          title: "Software",
          boardUrl: "https://egg.5ch.net/software/",
          boardTitle: "Software",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(document.querySelectorAll(".thread-list__bookmark-star")).toHaveLength(1);
    });

    bookmarkGetMock.mockReturnValue(undefined);
    for (const handler of messageListeners.get("bookmark_updated") ?? []) {
      handler({} as never);
    }
    await waitFor(() => {
      expect(document.querySelectorAll(".thread-list__bookmark-star")).toHaveLength(0);
    });

    const firstRow = document.querySelector(".simple-data-table__row");
    expect(firstRow).not.toBeNull();
    fireEvent.contextMenu(firstRow as HTMLElement, { clientX: 20, clientY: 20 });

    await waitFor(() => {
      const menu = document.querySelector(".context-menu");
      expect(menu).not.toBeNull();
      // このタブは履歴先頭のため、戻る先が存在しない。
      expect(menu?.querySelector('[aria-label="戻る"]')).toBeDisabled();
      expect(menu?.querySelector('[aria-label="進む"]')).not.toBeNull();
      expect(menu?.querySelector('[aria-label="更新"]')).not.toBeNull();
      expect(menu?.querySelector(".context-menu__header-actions")).not.toBeNull();
      // NG・ブックマーク・タイトル・URL・タイトルとURLの5項目を共通定義から表示する。
      expect(menu?.querySelectorAll(".context-menu__item .context-menu__icon")).toHaveLength(5);
    });
  });

  it("板URLが変わったらタイトル解決を再実行する", async () => {
    vi.useRealTimers();

    const askBoardTitleMock = vi.mocked(askBoardTitle);
    askBoardTitleMock.mockResolvedValueOnce("Software");
    askBoardTitleMock.mockResolvedValueOnce("News");

    const { rerender } = render(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "https://egg.5ch.net/software/",
          boardUrl: "https://egg.5ch.net/software/",
          boardTitle: "https://egg.5ch.net/software/",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith({
        type: "UPDATE_TITLE_FOR_TAB",
        tabId: "tab-1",
        title: "Software",
        boardUrl: "https://egg.5ch.net/software/",
      });
    });

    rerender(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "https://egg.5ch.net/news/",
          boardUrl: "https://egg.5ch.net/news/",
          boardTitle: "https://egg.5ch.net/news/",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith({
        type: "UPDATE_TITLE_FOR_TAB",
        tabId: "tab-1",
        title: "News",
        boardUrl: "https://egg.5ch.net/news/",
      });
    });

    expect(askBoardTitleMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      boardUrl: "http://bbs.eddibb.cc/liveedge/",
      placeholderTitle: "bbs.eddibb.cc/liveedge",
      resolvedTitle: "エッヂ",
    },
    {
      boardUrl: "https://tulip-garden.net/garden/",
      placeholderTitle: "tulip-garden.net/garden",
      resolvedTitle: "チューリップ庭園",
    },
  ])(
    "URL由来の仮タイトルでは板名再解決をスキップしない: $boardUrl",
    async ({ boardUrl, placeholderTitle, resolvedTitle }) => {
      vi.useRealTimers();

      const askBoardTitleMock = vi.mocked(askBoardTitle);
      askBoardTitleMock.mockResolvedValueOnce(resolvedTitle);

      render(
        <ThreadListPage
          tabId="tab-1"
          page={{
            type: "threadList",
            title: boardUrl,
            boardUrl,
            boardTitle: placeholderTitle,
          }}
          refreshKey={0}
          isActive={true}
        />,
      );

      await waitFor(() => {
        expect(dispatchMock).toHaveBeenCalledWith({
          type: "UPDATE_TITLE_FOR_TAB",
          tabId: "tab-1",
          title: resolvedTitle,
          boardUrl,
        });
      });

      expect(askBoardTitleMock).toHaveBeenCalledTimes(1);
    },
  );

  it("既に解決済みの title があるときは URL由来 boardTitle で上書きしない", async () => {
    vi.useRealTimers();

    const askBoardTitleMock = vi.mocked(askBoardTitle);

    render(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "チューリップ庭園",
          boardUrl: "https://tulip-garden.net/garden/",
          boardTitle: "tulip-garden.net/garden",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      // oxlint-disable-next-line unbound-method
      expect(serviceContainer.board.getThreads).toHaveBeenCalled();
    });

    expect(askBoardTitleMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalledWith({
      type: "UPDATE_TITLE_FOR_TAB",
      tabId: "tab-1",
      title: "tulip-garden.net/garden",
    });
  });
});
