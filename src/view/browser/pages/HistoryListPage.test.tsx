import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { container } from "src/service-container";
import { HistoryListPage } from "src/view/browser/pages/HistoryListPage";
import { QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE } from "src/view/browser/utils/filter-toolbar-events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mockUseTabStore = vi.fn();
const virtualizedTableState = vi.hoisted(() => ({
  onEndReached: undefined as (() => void) | undefined,
}));
const { cacheGetMock, cachePutMock } = vi.hoisted(() => ({
  cacheGetMock: vi.fn(),
  cachePutMock: vi.fn(),
}));

vi.mock("src/app", () => ({
  platform: {
    storage: {
      // UIキャッシュの検証はページ表示の責務と分け、拡張機能APIを読まずに単体テストできるようにする。
      getStore: () => ({
        get: cacheGetMock,
        put: cachePutMock,
      }),
    },
  },
}));

vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabStore: () => mockUseTabStore(),
  // useTabDispatch は dispatch のみを返す安定した関数。ページのフル状態購読回避後もdispatchが使える。
  useTabDispatch: () => vi.fn(),
  useTabViewState: () => ({ state: {}, update: vi.fn() }),
}));

vi.mock("src/view/browser/components/VirtualizedDataTable", () => ({
  VirtualizedDataTable: ({
    columns,
    rows,
    getRowKey,
    onEndReached,
  }: {
    columns: Array<{
      key: string;
      header: React.ReactNode;
      cell: (row: unknown) => React.ReactNode;
    }>;
    rows: unknown[];
    getRowKey: (row: unknown) => string;
    onEndReached?: () => void;
  }) => {
    virtualizedTableState.onEndReached = onEndReached;

    return (
      <div data-testid="virtualized-table">
        <div>
          {columns.map((column) => (
            <span key={column.key}>{column.header}</span>
          ))}
        </div>
        {rows.map((row) => (
          <div key={getRowKey(row)}>
            {columns.map((column) => (
              <span key={column.key}>{column.cell(row)}</span>
            ))}
          </div>
        ))}
      </div>
    );
  },
}));

interface HistoryService {
  get: (offset?: number, count?: number) => Promise<unknown[]>;
}

interface ReadStateService {
  getAll: () => Promise<unknown[]>;
}

type AppLikeWindow = {
  app?: {
    History?: HistoryService;
    ReadState?: ReadStateService;
  };
};

type MessageListener = (data?: unknown) => void;

let messageListeners = new Map<string, Set<MessageListener>>();

function emitMessage(type: string, data?: unknown): void {
  const listeners = messageListeners.get(type);
  if (!listeners) {
    return;
  }

  for (const listener of listeners) {
    listener(data);
  }
}

function createHistoryItem(url: string, title: string, boardTitle: string, date: number) {
  return {
    url,
    title,
    boardTitle,
    date,
  };
}

function createReadStateItem(url: string, read: number, received: number) {
  return {
    url,
    read,
    received,
  };
}

describe("HistoryListPage", () => {
  const historyGet = vi.fn<HistoryService["get"]>();
  const readStateGetAll = vi.fn<ReadStateService["getAll"]>();

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    cacheGetMock.mockReset();
    cacheGetMock.mockResolvedValue(undefined);
    cachePutMock.mockReset();
    mockUseTabStore.mockReset();
    historyGet.mockReset();
    readStateGetAll.mockReset();
    virtualizedTableState.onEndReached = undefined;
    messageListeners = new Map();

    mockUseTabStore.mockReturnValue({
      dispatch: vi.fn(),
      state: {
        tabs: [],
        selectedTabId: "tab-1",
        closedTabs: [],
      },
      viewPage: {
        type: "historyList",
        title: "閲覧履歴",
      },
    });

    // テストで使うレガシーAPIだけを差し替えるため、実アプリのwindow.app型から切り離す。
    (window as unknown as AppLikeWindow).app = {
      History: {
        get: historyGet,
      },
      ReadState: {
        getAll: readStateGetAll,
      },
    };

    container.message = {
      send: vi.fn(),
      on: vi.fn((type: string, listener: MessageListener) => {
        const listeners = messageListeners.get(type) ?? new Set();
        listeners.add(listener);
        messageListeners.set(type, listeners);
      }),
      off: vi.fn((type: string, listener: MessageListener) => {
        messageListeners.get(type)?.delete(listener);
      }),
    };

    readStateGetAll.mockResolvedValue([]);
  });

  it("旧履歴の date を閲覧日時として表示する", async () => {
    historyGet.mockResolvedValueOnce([
      createHistoryItem(
        "https://hayabusa.5ch.io/test/read.cgi/live/1/",
        "スレ1",
        "なんでも実況J",
        new Date(2026, 4, 3, 1, 2).getTime(),
      ),
    ]);
    readStateGetAll.mockResolvedValueOnce([
      createReadStateItem("https://*.5ch.io/test/read.cgi/live/1/", 4, 9),
    ]);

    render(<HistoryListPage tabId="tab-1" isActive={true} refreshKey={0} />);

    await screen.findByTestId("virtualized-table");

    expect(screen.getByText("2026/05/03 01:02")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(historyGet).toHaveBeenCalledWith(undefined, 500);
    expect(readStateGetAll).toHaveBeenCalledTimes(1);
  });

  it("スクロール終端で次ページを読み込み、URL重複を除外する", async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) =>
      createHistoryItem(
        "https://example.com/test/read.cgi/live/1/",
        index === 0 ? "スレ1" : `スレ1重複-${index}`,
        "板A",
        new Date(2026, 4, 3, 1, 2).getTime(),
      ),
    );

    historyGet
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([
        createHistoryItem(
          "https://example.com/test/read.cgi/live/1/",
          "スレ1(重複)",
          "板A",
          new Date(2026, 4, 3, 1, 3).getTime(),
        ),
        createHistoryItem(
          "https://example.com/test/read.cgi/live/2/",
          "スレ2",
          "板B",
          new Date(2026, 4, 3, 1, 4).getTime(),
        ),
      ]);

    render(<HistoryListPage tabId="tab-1" isActive={true} refreshKey={0} />);

    await screen.findByText("スレ1");

    await act(async () => {
      virtualizedTableState.onEndReached?.();
    });

    await waitFor(() => {
      expect(historyGet).toHaveBeenNthCalledWith(2, 500, 500);
    });

    expect(screen.getByText("スレ2")).toBeInTheDocument();
    expect(screen.getAllByText(/スレ1/)).toHaveLength(1);
  });

  it("履歴フィルターバーをメニューイベントで開閉できる", async () => {
    historyGet.mockResolvedValueOnce([
      createHistoryItem(
        "https://example.com/test/read.cgi/live/1/",
        "スレ1",
        "なんでも実況J",
        new Date(2026, 4, 3, 1, 2).getTime(),
      ),
    ]);

    render(<HistoryListPage tabId="tab-1" isActive={true} refreshKey={0} />);

    await screen.findByTestId("virtualized-table");
    expect(screen.queryByPlaceholderText("検索...")).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new window.CustomEvent(QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE.historyList, {
          detail: { tabId: "tab-1" },
        }),
      );
    });

    const input = screen.getByPlaceholderText("検索...");
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "スレ1" } });
    fireEvent.click(screen.getByRole("button", { name: "✕" }));

    expect(screen.queryByPlaceholderText("検索...")).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new window.CustomEvent(QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE.historyList, {
          detail: { tabId: "tab-1" },
        }),
      );
    });

    expect(screen.getByPlaceholderText("検索...")).toHaveValue("");
  });

  it("history_updated 通知で一覧を再読込する", async () => {
    historyGet
      .mockResolvedValueOnce([
        createHistoryItem(
          "https://example.com/test/read.cgi/live/1/",
          "スレ1",
          "板A",
          new Date(2026, 4, 3, 1, 2).getTime(),
        ),
      ])
      .mockResolvedValueOnce([
        createHistoryItem(
          "https://example.com/test/read.cgi/live/2/",
          "スレ2",
          "板B",
          new Date(2026, 4, 3, 1, 3).getTime(),
        ),
      ]);

    render(<HistoryListPage tabId="tab-1" isActive={true} refreshKey={0} />);

    await screen.findByText("スレ1");

    act(() => {
      emitMessage("history_updated", { type: "added" });
    });

    await waitFor(() => {
      expect(historyGet).toHaveBeenNthCalledWith(2, undefined, 500);
    });

    expect(screen.getByText("スレ2")).toBeInTheDocument();
    expect(screen.queryByText("スレ1")).not.toBeInTheDocument();
  });

  it("履歴の読込中に届いたタイトル更新をまとめて再読込する", async () => {
    const url = "https://example.com/test/read.cgi/sample/123/";
    let resolveInitial!: (rows: unknown[]) => void;
    historyGet
      .mockReturnValueOnce(new Promise((resolve) => (resolveInitial = resolve)))
      .mockResolvedValueOnce([createHistoryItem(url, "過去ログのタイトル", "サンプル板", 100)]);
    render(<HistoryListPage tabId="tab-1" isActive={true} refreshKey={0} />);
    await waitFor(() => expect(historyGet).toHaveBeenCalledTimes(1));

    // 仮タイトルの読込が終わる前に削除・再保存の通知が届く順序を再現する。
    await act(async () => {
      emitMessage("history_updated", { type: "removed" });
      emitMessage("history_updated", { type: "added" });
      resolveInitial([createHistoryItem(url, url, "サンプル板", 100)]);
    });

    await screen.findByText("過去ログのタイトル");
    expect(historyGet).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(url)).not.toBeInTheDocument();
  });

  it("遅れて復元されたURLのキャッシュで取得済みタイトルを上書きしない", async () => {
    const url = "https://example.com/test/read.cgi/sample/123/";
    let resolveCache!: (entry: unknown) => void;
    cacheGetMock.mockReturnValueOnce(new Promise((resolve) => (resolveCache = resolve)));
    historyGet.mockResolvedValueOnce([
      createHistoryItem(url, "過去ログのタイトル", "サンプル板", 100),
    ]);
    render(<HistoryListPage tabId="tab-1" isActive={true} refreshKey={0} />);
    await screen.findByText("過去ログのタイトル");

    // 保存済みキャッシュと履歴DBは独立して読むため、キャッシュが後着する場合もある。
    await act(async () => {
      resolveCache({
        data: [{ url, title: url, boardTitle: "サンプル板", unreadCount: 0, viewedDate: 100 }],
      });
    });

    expect(screen.getByText("過去ログのタイトル")).toBeInTheDocument();
    expect(screen.queryByText(url)).not.toBeInTheDocument();
  });

  it("非アクティブから再表示された時に一覧を再読込する", async () => {
    historyGet
      .mockResolvedValueOnce([
        createHistoryItem(
          "https://example.com/test/read.cgi/live/1/",
          "スレ1",
          "板A",
          new Date(2026, 4, 3, 1, 2).getTime(),
        ),
      ])
      .mockResolvedValueOnce([
        createHistoryItem(
          "https://example.com/test/read.cgi/live/2/",
          "スレ2",
          "板B",
          new Date(2026, 4, 3, 1, 3).getTime(),
        ),
      ]);

    const { rerender } = render(<HistoryListPage tabId="tab-1" isActive={false} refreshKey={0} />);

    await screen.findByText("スレ1");

    rerender(<HistoryListPage tabId="tab-1" isActive={true} refreshKey={0} />);

    await waitFor(() => {
      expect(historyGet).toHaveBeenNthCalledWith(2, undefined, 500);
    });

    expect(screen.getByText("スレ2")).toBeInTheDocument();
    expect(screen.queryByText("スレ1")).not.toBeInTheDocument();
  });

  it("refreshKey が変わった時に一覧を再読込する", async () => {
    historyGet
      .mockResolvedValueOnce([
        createHistoryItem(
          "https://example.com/test/read.cgi/live/1/",
          "スレ1",
          "板A",
          new Date(2026, 4, 3, 1, 2).getTime(),
        ),
      ])
      .mockResolvedValueOnce([
        createHistoryItem(
          "https://example.com/test/read.cgi/live/2/",
          "スレ2",
          "板B",
          new Date(2026, 4, 3, 1, 3).getTime(),
        ),
      ]);

    const { rerender } = render(<HistoryListPage tabId="tab-1" isActive={true} refreshKey={0} />);

    await screen.findByText("スレ1");

    rerender(<HistoryListPage tabId="tab-1" isActive={true} refreshKey={1} />);

    await waitFor(() => {
      expect(historyGet).toHaveBeenNthCalledWith(2, undefined, 500);
    });

    expect(screen.getByText("スレ2")).toBeInTheDocument();
    expect(screen.queryByText("スレ1")).not.toBeInTheDocument();
  });
});
