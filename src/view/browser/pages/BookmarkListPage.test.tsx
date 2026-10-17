import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { container } from "src/service-container";
import type { IBookmarkEntry } from "src/service-container/interfaces";
import { BookmarkListPage } from "src/view/browser/pages/BookmarkListPage";
import { QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE } from "src/view/browser/utils/filter-toolbar-events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mockUseTabStore = vi.fn();
const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("src/app/logger", () => ({ createLogger: () => loggerMock }));

const { dispatchMock, removeBookmarkMock, copyTextMock, toastErrorMock } = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  removeBookmarkMock: vi.fn(async (_url: string) => true),
  copyTextMock: vi.fn(async (_text: string) => undefined),
  toastErrorMock: vi.fn(),
}));

vi.mock("src/view/browser/utils/clipboard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("src/view/browser/utils/clipboard")>()),
  copyText: copyTextMock,
}));

vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabStore: () => mockUseTabStore(),
  // useTabDispatch は dispatch のみを返す安定した関数。ページのフル状態購読回避後もdispatchが使える。
  useTabDispatch: () => dispatchMock,
  useTabViewState: () => ({ state: {}, update: vi.fn() }),
}));

describe("BookmarkListPage", () => {
  const getAllBookmarks = vi.fn<() => unknown[]>();
  let bookmarkUpdatedHandler: (() => void) | null = null;

  beforeEach(() => {
    mockUseTabStore.mockReset();
    getAllBookmarks.mockReset();
    dispatchMock.mockReset();
    removeBookmarkMock.mockReset().mockResolvedValue(true);
    copyTextMock.mockReset().mockResolvedValue(undefined);
    toastErrorMock.mockReset();
    bookmarkUpdatedHandler = null;

    mockUseTabStore.mockReturnValue({
      dispatch: vi.fn(),
      state: {
        tabs: [],
        selectedTabId: "tab-1",
        closedTabs: [],
      },
      viewPage: {
        type: "bookmarkList",
        title: "ブックマークリスト",
      },
    });

    container.message = {
      send: vi.fn(),
      on: (type, callback) => {
        if (type === "bookmark_updated") {
          bookmarkUpdatedHandler = callback as () => void;
        }
      },
      off: (type, callback) => {
        if (type === "bookmark_updated" && bookmarkUpdatedHandler === callback) {
          bookmarkUpdatedHandler = null;
        }
      },
    };
    container.config = {
      get: vi.fn(() => "on"),
      set: vi.fn(),
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    container.bookmark = {
      promiseFirstScan: Promise.resolve(true),
      ready: vi.fn(async () => undefined),
      // 一覧は window.app ではなくサービスコンテナから読む（legacy-window-app-plan の Phase 2）。
      // 画面は保存された値を1件ずつ確かめるため、テストでは欠けた形の値もそのまま返す。
      getAll: getAllBookmarks as unknown as () => IBookmarkEntry[],
      import: vi.fn(async () => true),
      get: vi.fn(),
      add: vi.fn(),
      remove: removeBookmarkMock,
      updateResCount: vi.fn(),
      updateExpired: vi.fn(),
      getByBoard: () => [],
      getAllBoards: () => [],
    };
    container.toast = { notify: vi.fn(), info: vi.fn(), success: vi.fn(), error: toastErrorMock };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each([
    { kind: "スレ", url: "https://example.com/test/read.cgi/sample/1/", type: "thread" },
    { kind: "板", url: "https://example.com/sample/", type: "threadList" },
  ])(
    "$kindの右クリックから現在タブと新規タブで開き、通常・中クリックも維持する",
    async ({ url, type }) => {
      getAllBookmarks.mockReturnValue([{ url, title: "サンプル", boardTitle: "サンプル板" }]);
      render(<BookmarkListPage tabId="tab-1" isActive={true} />);
      const row = (await screen.findByText("サンプル")).closest("tr")!;
      const page =
        type === "thread"
          ? { type, title: "サンプル", threadUrl: url }
          : { type, title: "サンプル", boardUrl: url, boardTitle: "サンプル板" };
      fireEvent.click(row);
      expect(dispatchMock).toHaveBeenLastCalledWith({ type: "NAVIGATE", page });
      fireEvent.mouseDown(row, { button: 1 });
      expect(dispatchMock).toHaveBeenLastCalledWith({
        type: "OPEN_IN_NEW_TAB",
        page,
        background: true,
      });
      dispatchMock.mockClear();
      fireEvent.contextMenu(row);
      expect(dispatchMock).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "現在のタブで開く" }));
      expect(dispatchMock).toHaveBeenLastCalledWith({ type: "NAVIGATE", page });
      fireEvent.contextMenu(row);
      fireEvent.click(screen.getByRole("button", { name: "新しいタブで開く" }));
      expect(dispatchMock).toHaveBeenLastCalledWith({
        type: "OPEN_IN_NEW_TAB",
        page,
        background: false,
      });
    },
  );

  it("削除の完了を待って対象行を消し、失敗した対象は残す", async () => {
    const url = "https://example.com/sample/";
    getAllBookmarks.mockReturnValue([{ url, title: "サンプル板" }]);
    removeBookmarkMock.mockResolvedValueOnce(false);
    loggerMock.error.mockClear();
    render(<BookmarkListPage tabId="tab-1" isActive={true} />);
    const row = (await screen.findByText("サンプル板")).closest("tr")!;
    fireEvent.contextMenu(row);
    fireEvent.click(screen.getByRole("button", { name: "ブックマークを削除" }));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(loggerMock.error).toHaveBeenCalled();
    expect(screen.getByText("サンプル板")).toBeInTheDocument();
    fireEvent.contextMenu(row);
    fireEvent.click(screen.getByRole("button", { name: "ブックマークを削除" }));
    await waitFor(() => expect(screen.queryByText("サンプル板")).not.toBeInTheDocument());
    expect(removeBookmarkMock).toHaveBeenLastCalledWith(url);
  });

  it("コピー対象をクリックした行から取得し、非表示になったらメニューを閉じる", async () => {
    const url = "https://example.com/sample/";
    getAllBookmarks.mockReturnValue([{ url, title: "サンプル板" }]);
    const { rerender } = render(<BookmarkListPage tabId="tab-1" isActive={true} />);
    const row = (await screen.findByText("サンプル板")).closest("tr")!;
    fireEvent.contextMenu(row);
    fireEvent.click(screen.getByRole("button", { name: "タイトル&URLをコピー" }));
    await waitFor(() =>
      expect(copyTextMock).toHaveBeenCalledWith(
        `サンプル板\n${url}`,
        expect.objectContaining({ window, document }),
      ),
    );
    fireEvent.contextMenu(row);
    rerender(<BookmarkListPage tabId="tab-1" isActive={false} />);
    expect(screen.queryByRole("button", { name: "ブックマークを削除" })).not.toBeInTheDocument();
    rerender(<BookmarkListPage tabId="tab-1" isActive={true} />);
    expect(screen.queryByRole("button", { name: "ブックマークを削除" })).not.toBeInTheDocument();
  });

  it("スレと板の両方のブックマークを一覧表示する", async () => {
    getAllBookmarks.mockReturnValue([
      {
        url: "https://example.com/test/read.cgi/software/1/",
        title: "Current Thread",
        resCount: 120,
        readState: { read: 100 },
      },
      {
        url: "https://example.com/software/",
        title: "Software",
      },
    ]);

    render(<BookmarkListPage tabId="tab-1" isActive={true} />);

    expect(await screen.findByText("Current Thread")).toBeInTheDocument();
    expect(screen.getByText("Software")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("ブックマークフィルターバーをメニューイベントで開閉できる", async () => {
    getAllBookmarks.mockReturnValue([
      {
        url: "https://example.com/test/read.cgi/software/1/",
        title: "Current Thread",
      },
    ]);

    render(<BookmarkListPage tabId="tab-1" isActive={true} />);

    await screen.findByText("Current Thread");
    expect(screen.queryByPlaceholderText("検索...")).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new window.CustomEvent(QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE.bookmarkList, {
          detail: { tabId: "tab-1" },
        }),
      );
    });

    const input = screen.getByPlaceholderText("検索...");
    fireEvent.change(input, { target: { value: "Thread" } });
    fireEvent.click(screen.getByRole("button", { name: "✕" }));

    expect(screen.queryByPlaceholderText("検索...")).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new window.CustomEvent(QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE.bookmarkList, {
          detail: { tabId: "tab-1" },
        }),
      );
    });

    expect(screen.getByPlaceholderText("検索...")).toHaveValue("");
  });

  it("bookmark_updated を受けたら一覧を再読込する", async () => {
    getAllBookmarks.mockReturnValueOnce([]).mockReturnValueOnce([
      {
        url: "https://example.com/test/read.cgi/software/1/",
        title: "Current Thread",
      },
    ]);

    render(<BookmarkListPage tabId="tab-1" isActive={true} />);

    expect(screen.queryByText("Current Thread")).not.toBeInTheDocument();

    act(() => {
      bookmarkUpdatedHandler?.();
    });

    expect(await screen.findByText("Current Thread")).toBeInTheDocument();
  });

  it("初回スキャン完了を待ってから既存ブックマークを表示する", async () => {
    let resolveReady: ((value: boolean) => void) | null = null;
    const readyPromise = new Promise<boolean>((resolve) => {
      resolveReady = resolve;
    });

    getAllBookmarks.mockReturnValue([
      {
        url: "https://example.com/test/read.cgi/software/1/",
        title: "Current Thread",
      },
    ]);

    // 初回の走査の完了は window.app ではなくサービスコンテナで待つ（legacy-window-app-plan の Phase 2）。
    container.bookmark = {
      ...container.bookmark,
      ready: async () => {
        await readyPromise;
      },
    };

    render(<BookmarkListPage tabId="tab-1" isActive={true} />);

    expect(screen.getByText("読み込み中...")).toBeInTheDocument();
    expect(getAllBookmarks).not.toHaveBeenCalled();

    resolveReady!(true);

    expect(await screen.findByText("Current Thread")).toBeInTheDocument();
    expect(getAllBookmarks).toHaveBeenCalledTimes(1);
  });
});
