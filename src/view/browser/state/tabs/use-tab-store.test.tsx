import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { container } from "src/service-container/index";
import type { IHistoryService } from "src/service-container/interfaces";
import { stubService } from "src/service-container/test-stubs";
import { getAutoRefreshPageKey } from "src/view/browser/state/tabs/auto-refresh-pages";
import { getCurrentPage, getPageViewStateKey } from "src/view/browser/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { historyAddMock, historyGetByUrlMock, historyRemoveMock } = vi.hoisted(() => ({
  historyAddMock: vi.fn().mockResolvedValue(undefined),
  historyGetByUrlMock: vi.fn().mockResolvedValue([]),
  historyRemoveMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("src/app/platform", () => ({
  // use-tab-store はタイトル更新以外で platform を使わないため、
  // 拡張機能専用 polyfill を読み込まずに reducer の振る舞い検証へ集中する。
  platform: {
    window: {
      setTitle: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

// 実装は src/core/history/History ではなくサービスコンテナの history から使うため、テスト用のサービスを登録する。
container.history = stubService<IHistoryService>("history", {
  add: historyAddMock,
  getByUrl: historyGetByUrlMock,
  remove: historyRemoveMock,
});

// webextension-polyfill は拡張機能環境以外では import 時に例外を投げるため、
// reducer の振る舞い検証に不要な runtime API を最小モックで差し替える。
vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  },
}));

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

describe("TabProvider auto refresh state", () => {
  beforeEach(() => {
    const localStorageMock = createMemoryStorage();
    vi.stubGlobal("localStorage", localStorageMock);
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageMock,
    });
    localStorage.removeItem("chlens_browser_session");
    // 履歴・タブ操作の既存テストは、ホームから明示的に開いた板一覧があるセッションで検証する。
    localStorage.setItem(
      "chlens_browser_session",
      JSON.stringify({
        panes: [
          {
            id: "initial-pane",
            activeTabId: "initial-board-list",
            tabs: [
              {
                id: "initial-board-list",
                history: [{ type: "boardList", title: "板一覧" }],
                currentIndex: 0,
                pinned: false,
                reloadKey: 0,
                autoRefreshEnabled: false,
                autoRefreshPageKey: null,
              },
            ],
          },
        ],
        activePaneId: "initial-pane",
        closedTabs: [],
      }),
    );
    historyAddMock.mockReset();
    historyGetByUrlMock.mockReset();
    historyRemoveMock.mockReset();
    historyAddMock.mockResolvedValue(undefined);
    historyGetByUrlMock.mockResolvedValue([]);
    historyRemoveMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("別ページへ移動した時点で自動更新状態を解除する", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { viewTab, viewPage, dispatch } = useTabStore();
      const isCurrentThreadAutoRefreshEnabled =
        viewPage.type === "thread" &&
        viewTab.autoRefreshEnabled &&
        viewTab.autoRefreshPageKey === getAutoRefreshPageKey(viewPage);

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "thread-1",
                  threadUrl: "https://example.com/test/read.cgi/foo/1/",
                },
              })
            }
          >
            thread-1 へ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "SET_AUTO_REFRESH_ENABLED",
                enabled: true,
                pageKey: "thread:https://example.com/test/read.cgi/foo/1/",
              })
            }
          >
            thread-1 で自動更新ON
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "thread-2",
                  threadUrl: "https://example.com/test/read.cgi/foo/2/",
                },
              })
            }
          >
            thread-2 へ移動
          </button>
          <output data-testid="stored-thread-url">{viewTab.autoRefreshPageKey ?? ""}</output>
          <output data-testid="current-thread-enabled">
            {isCurrentThreadAutoRefreshEnabled ? "enabled" : "disabled"}
          </output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("thread-1 へ移動"));
    fireEvent.click(screen.getByText("thread-1 で自動更新ON"));

    expect(screen.getByTestId("stored-thread-url")).toHaveTextContent(
      "thread:https://example.com/test/read.cgi/foo/1/",
    );
    expect(screen.getByTestId("current-thread-enabled")).toHaveTextContent("enabled");

    fireEvent.click(screen.getByText("thread-2 へ移動"));

    expect(screen.getByTestId("stored-thread-url")).toHaveTextContent("");
    expect(screen.getByTestId("current-thread-enabled")).toHaveTextContent("disabled");
  });

  it("戻るで移動してきたページでも自動更新状態は復元しない", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { viewTab, viewPage, dispatch } = useTabStore();
      const isCurrentThreadAutoRefreshEnabled =
        viewPage.type === "thread" &&
        viewTab.autoRefreshEnabled &&
        viewTab.autoRefreshPageKey === getAutoRefreshPageKey(viewPage);

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "thread-1",
                  threadUrl: "https://example.com/test/read.cgi/foo/1/",
                },
              })
            }
          >
            thread-1 へ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "SET_AUTO_REFRESH_ENABLED",
                enabled: true,
                pageKey: "thread:https://example.com/test/read.cgi/foo/1/",
              })
            }
          >
            thread-1 で自動更新ON
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "thread-2",
                  threadUrl: "https://example.com/test/read.cgi/foo/2/",
                },
              })
            }
          >
            thread-2 へ移動
          </button>
          <button onClick={() => dispatch({ type: "GO_BACK" })}>戻る</button>
          <output data-testid="stored-thread-url">{viewTab.autoRefreshPageKey ?? ""}</output>
          <output data-testid="current-thread-enabled">
            {isCurrentThreadAutoRefreshEnabled ? "enabled" : "disabled"}
          </output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("thread-1 へ移動"));
    fireEvent.click(screen.getByText("thread-1 で自動更新ON"));
    fireEvent.click(screen.getByText("thread-2 へ移動"));
    fireEvent.click(screen.getByText("戻る"));

    expect(screen.getByTestId("stored-thread-url")).toHaveTextContent("");
    expect(screen.getByTestId("current-thread-enabled")).toHaveTextContent("disabled");
  });

  it("セッション保存時に自動更新状態を永続化しない", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { dispatch } = useTabStore();

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "thread-1",
                  threadUrl: "https://example.com/test/read.cgi/foo/1/",
                },
              })
            }
          >
            thread-1 へ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "SET_AUTO_REFRESH_ENABLED",
                enabled: true,
                pageKey: "thread:https://example.com/test/read.cgi/foo/1/",
              })
            }
          >
            thread-1 で自動更新ON
          </button>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("thread-1 へ移動"));
    fireEvent.click(screen.getByText("thread-1 で自動更新ON"));

    const raw = localStorage.getItem("chlens_browser_session");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw ?? "{}") as {
      panes: Array<{
        tabs: Array<{
          autoRefreshEnabled: boolean;
          autoRefreshPageKey: string | null;
        }>;
      }>;
    };

    // 一時状態は保存形式に含めず、復元時に既定値で作り直す。
    expect(parsed.panes[0].tabs[0]).not.toHaveProperty("autoRefreshEnabled");
    expect(parsed.panes[0].tabs[0]).not.toHaveProperty("autoRefreshPageKey");
    expect(parsed.panes[0].tabs[0]).not.toHaveProperty("reloadKey");
  });

  it("セッション復元時に保存済み自動更新状態をリセットする", async () => {
    localStorage.setItem(
      "chlens_browser_session",
      JSON.stringify({
        tabs: [
          {
            id: "tab-1",
            history: [
              {
                type: "thread",
                title: "thread-1",
                threadUrl: "https://example.com/test/read.cgi/foo/1/",
              },
            ],
            currentIndex: 0,
            pinned: false,
            reloadKey: 0,
            autoRefreshEnabled: true,
            autoRefreshPageKey: "thread:https://example.com/test/read.cgi/foo/1/",
            autoRefreshStoppedPageKey: "thread:https://example.com/test/read.cgi/foo/1/",
          },
        ],
        activeTabId: "tab-1",
        closedTabs: [],
      }),
    );

    vi.resetModules();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { viewTab } = useTabStore();
      return (
        <>
          <output data-testid="saved-enabled">
            {viewTab.autoRefreshEnabled ? "enabled" : "disabled"}
          </output>
          <output data-testid="saved-url">{viewTab.autoRefreshPageKey ?? ""}</output>
          <output data-testid="saved-stopped-url">{viewTab.autoRefreshStoppedPageKey ?? ""}</output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    expect(screen.getByTestId("saved-enabled")).toHaveTextContent("disabled");
    expect(screen.getByTestId("saved-url")).toHaveTextContent("");
    expect(screen.getByTestId("saved-stopped-url")).toHaveTextContent("");
  });

  it.each([true, false])(
    "dat落ち時のON状態が%sでも再開連打を拒否し、次スレでは解除する",
    async (initiallyEnabled) => {
      vi.resetModules();
      const { TabProvider, useTabStore } =
        await import("src/view/browser/state/tabs/use-tab-store");

      function Harness() {
        const { viewTab, viewPage, dispatch } = useTabStore();
        const isCurrentThreadAutoRefreshEnabled =
          viewPage.type === "thread" &&
          viewTab.autoRefreshEnabled &&
          viewTab.autoRefreshPageKey === getAutoRefreshPageKey(viewPage);

        return (
          <>
            <button
              onClick={() =>
                dispatch({
                  type: "SET_AUTO_REFRESH_STOPPED_PAGE_KEY",
                  pageKey: "thread:https://example.com/test/read.cgi/foo/1/",
                })
              }
            >
              thread-1をdat落ち停止
            </button>
            <button
              onClick={() =>
                dispatch({
                  type: "NAVIGATE",
                  page: {
                    type: "thread",
                    title: "thread-1",
                    threadUrl: "https://example.com/test/read.cgi/foo/1/",
                  },
                })
              }
            >
              thread-1 へ移動
            </button>
            <button
              onClick={() =>
                dispatch({
                  type: "SET_AUTO_REFRESH_ENABLED",
                  enabled: true,
                  pageKey: "thread:https://example.com/test/read.cgi/foo/1/",
                })
              }
            >
              thread-1 で自動更新ON
            </button>
            <button
              onClick={() =>
                dispatch({
                  type: "FOLLOW_NEXT_THREAD",
                  page: {
                    type: "thread",
                    title: "thread-2",
                    threadUrl: "https://example.com/test/read.cgi/foo/2/",
                  },
                  keepAutoRefresh: true,
                })
              }
            >
              次スレへ追従
            </button>
            <output data-testid="stored-thread-url">{viewTab.autoRefreshPageKey ?? ""}</output>
            <output data-testid="stopped-thread-url">
              {viewTab.autoRefreshStoppedPageKey ?? ""}
            </output>
            <output data-testid="history-length">{viewTab.history.length}</output>
            <output data-testid="current-thread-title">{viewPage.title}</output>
            <output data-testid="current-thread-enabled">
              {isCurrentThreadAutoRefreshEnabled ? "enabled" : "disabled"}
            </output>
          </>
        );
      }

      render(
        <TabProvider>
          <Harness />
        </TabProvider>,
      );

      fireEvent.click(screen.getByText("thread-1 へ移動"));
      if (initiallyEnabled) {
        fireEvent.click(screen.getByText("thread-1 で自動更新ON"));
      }
      fireEvent.click(screen.getByText("thread-1をdat落ち停止"));
      expect(screen.getByTestId("current-thread-enabled")).toHaveTextContent("disabled");
      for (let attempt = 0; attempt < 20; attempt++) {
        fireEvent.click(screen.getByText("thread-1 で自動更新ON"));
      }
      expect(screen.getByTestId("current-thread-enabled")).toHaveTextContent("disabled");
      expect(screen.getByTestId("stored-thread-url").textContent).toBe("");
      expect(screen.getByTestId("stopped-thread-url")).toHaveTextContent(
        "thread:https://example.com/test/read.cgi/foo/1/",
      );
      fireEvent.click(screen.getByText("次スレへ追従"));

      expect(screen.getByTestId("stored-thread-url")).toHaveTextContent(
        "thread:https://example.com/test/read.cgi/foo/2/",
      );
      expect(screen.getByTestId("stopped-thread-url")).toHaveTextContent("");
      // 現仕様の NAVIGATE は祖先(home/板/スレ一覧)を自動補完しないため、
      // 初期[home] → thread-1 で1段 → thread-2 で1段の計3エントリになる。
      expect(screen.getByTestId("history-length")).toHaveTextContent("4");
      expect(screen.getByTestId("current-thread-title")).toHaveTextContent("thread-2");
      expect(screen.getByTestId("current-thread-enabled")).toHaveTextContent("enabled");
    },
  );

  it("OPEN_IN_NEW_TAB では現在タブのページタイトルを変更しない", async () => {
    vi.resetModules();
    // 現仕様では新規タブを開くと既定でそちらへフォーカスが移る。
    // このテストの主眼は「元タブのページが汚染されないこと」なので、
    // 背景オープン設定にしてアクティブタブを元のままに固定して検証する。
    localStorage.setItem("config_focus_new_tab_on_open", "off");
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { state, viewTab, viewPage, dispatch } = useTabStore();

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "threadList",
                  title: "板A",
                  boardUrl: "https://example.com/board-a/",
                  boardTitle: "板A",
                },
              })
            }
          >
            板Aへ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "OPEN_IN_NEW_TAB",
                page: {
                  type: "thread",
                  title: "新規スレ",
                  threadUrl: "https://example.com/test/read.cgi/board-a/1/",
                },
              })
            }
          >
            新規タブで開く
          </button>
          <output data-testid="active-tab-id">{viewTab.id}</output>
          <output data-testid="current-page-title">{viewPage.title}</output>
          <output data-testid="current-page-type">{viewPage.type}</output>
          <output data-testid="tabs-count">{state.tabs.length}</output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("板Aへ移動"));
    const activeTabIdBefore = screen.getByTestId("active-tab-id").textContent;

    expect(screen.getByTestId("current-page-title")).toHaveTextContent("板A");
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("threadList");

    fireEvent.click(screen.getByText("新規タブで開く"));

    expect(screen.getByTestId("tabs-count")).toHaveTextContent("2");
    expect(screen.getByTestId("active-tab-id").textContent).toBe(activeTabIdBefore);
    expect(screen.getByTestId("current-page-title")).toHaveTextContent("板A");
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("threadList");
  });

  it("OPEN_IN_NEW_TAB した背景スレは表示前でも閲覧履歴へ記録する", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { dispatch } = useTabStore();

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "threadList",
                  title: "板A",
                  boardUrl: "https://example.com/board-a/",
                  boardTitle: "板A",
                },
              })
            }
          >
            板Aへ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "OPEN_IN_NEW_TAB",
                page: {
                  type: "thread",
                  title: "背景スレ",
                  threadUrl: "https://example.com/test/read.cgi/board-a/1/",
                },
              })
            }
          >
            背景タブでスレを開く
          </button>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("板Aへ移動"));
    historyAddMock.mockClear();

    fireEvent.click(screen.getByText("背景タブでスレを開く"));

    expect(historyAddMock).toHaveBeenCalledTimes(1);
    expect(historyAddMock).toHaveBeenCalledWith(
      "https://example.com/test/read.cgi/board-a/1/",
      "背景スレ",
      expect.any(Number),
      "board-a",
    );
  });

  it("URL直開きのスレはタイトル解決後に同じ履歴レコードを補正する", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { state, dispatch } = useTabStore();

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "https://example.com/test/read.cgi/board-a/1/",
                  threadUrl: "https://example.com/test/read.cgi/board-a/1/",
                },
              })
            }
          >
            URL直開き
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "UPDATE_TITLE_FOR_TAB",
                tabId: state.selectedTabId,
                title: "解決後タイトル",
              })
            }
          >
            タイトル解決
          </button>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("URL直開き"));

    await waitFor(() => {
      expect(historyAddMock).toHaveBeenCalledWith(
        "https://example.com/test/read.cgi/board-a/1/",
        "https://example.com/test/read.cgi/board-a/1/",
        expect.any(Number),
        "board-a",
      );
    });

    const recordedDate = historyAddMock.mock.calls[0][2] as number;
    historyAddMock.mockClear();

    fireEvent.click(screen.getByText("タイトル解決"));

    await waitFor(() => {
      expect(historyRemoveMock).toHaveBeenCalledWith(
        "https://example.com/test/read.cgi/board-a/1/",
        recordedDate,
      );
      expect(historyAddMock).toHaveBeenCalledWith(
        "https://example.com/test/read.cgi/board-a/1/",
        "解決後タイトル",
        recordedDate,
        "board-a",
      );
    });
  });

  it("新しいタブでURL直開きしたスレも描画中のタブIDで履歴タイトルを補正する", async () => {
    // reducerを2回評価していた頃は、履歴記録に使うタブIDと描画されたタブIDが食い違い、
    // タイトル解決後の補正が対象の閲覧記録を見つけられずURLのまま残っていた。
    vi.resetModules();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");
    const threadUrl = "https://example.com/test/read.cgi/board-a/2/";

    function Harness() {
      const { state, stateRef, dispatch } = useTabStore();
      const openedTab = state.tabs.at(-1);

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "OPEN_IN_NEW_TAB",
                page: { type: "thread", title: threadUrl, threadUrl },
              })
            }
          >
            新しいタブでURL直開き
          </button>
          <button
            onClick={() =>
              openedTab &&
              dispatch({
                type: "UPDATE_TITLE_FOR_TAB",
                tabId: openedTab.id,
                title: "解決後タイトル",
              })
            }
          >
            タイトル解決
          </button>
          <output data-testid="rendered-tab-id">{openedTab?.id}</output>
          <output data-testid="ref-tab-id">{stateRef.current.panes[0].tabs.at(-1)?.id}</output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("新しいタブでURL直開き"));
    expect(screen.getByTestId("ref-tab-id").textContent).toBe(
      screen.getByTestId("rendered-tab-id").textContent,
    );
    await waitFor(() => expect(historyAddMock).toHaveBeenCalledTimes(1));
    const recordedDate = historyAddMock.mock.calls[0][2] as number;
    historyAddMock.mockClear();

    fireEvent.click(screen.getByText("タイトル解決"));

    await waitFor(() => {
      expect(historyRemoveMock).toHaveBeenCalledWith(threadUrl, recordedDate);
      expect(historyAddMock).toHaveBeenCalledWith(
        threadUrl,
        "解決後タイトル",
        recordedDate,
        "board-a",
      );
    });
  });

  it("履歴からURLだけで開いた過去スレは既存タイトルを引き継ぐ", async () => {
    vi.resetModules();
    historyGetByUrlMock.mockResolvedValueOnce([
      {
        url: "https://example.com/test/read.cgi/board-a/1/",
        title: "過去スレのタイトル",
        date: 123,
        boardTitle: "board-a",
        isHttps: true,
      },
    ]);
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { dispatch } = useTabStore();
      return (
        <button
          onClick={() =>
            dispatch({
              type: "NAVIGATE",
              page: {
                type: "thread",
                title: "https://example.com/test/read.cgi/board-a/1/",
                threadUrl: "https://example.com/test/read.cgi/board-a/1/",
              },
            })
          }
        >
          過去スレを開く
        </button>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("過去スレを開く"));

    await waitFor(() => {
      expect(historyAddMock).toHaveBeenCalledWith(
        "https://example.com/test/read.cgi/board-a/1/",
        "過去スレのタイトル",
        expect.any(Number),
        "board-a",
      );
    });
  });

  it.each([
    { focusSetting: "off", background: undefined },
    { focusSetting: "off", background: true },
    { focusSetting: "on", background: true },
  ])(
    "新規スレは背景で開き、既存スレにはフォーカスする（設定=$focusSetting、背景指定=$background）",
    async ({ focusSetting, background }) => {
      vi.resetModules();
      localStorage.setItem("config_focus_new_tab_on_open", focusSetting);
      const { TabProvider, useTabStore } =
        await import("src/view/browser/state/tabs/use-tab-store");

      function Harness() {
        const { state, viewTab, viewPage, dispatch } = useTabStore();

        return (
          <>
            <button
              onClick={() =>
                dispatch({
                  type: "NAVIGATE",
                  page: {
                    type: "threadList",
                    title: "板A",
                    boardUrl: "https://example.com/board-a/",
                    boardTitle: "板A",
                  },
                })
              }
            >
              板Aへ移動
            </button>
            <button
              onClick={() =>
                dispatch({
                  type: "OPEN_IN_NEW_TAB",
                  background,
                  page: {
                    type: "thread",
                    title: "既存スレ",
                    threadUrl: "https://example.com/test/read.cgi/board-a/1/",
                  },
                })
              }
            >
              既存スレを新しいタブで開く
            </button>
            <output data-testid="tabs-count">{state.tabs.length}</output>
            <output data-testid="active-tab-id">{viewTab.id}</output>
            <output data-testid="current-page-title">{viewPage.title}</output>
          </>
        );
      }

      render(
        <TabProvider>
          <Harness />
        </TabProvider>,
      );

      fireEvent.click(screen.getByText("板Aへ移動"));
      const originalActiveTabId = screen.getByTestId("active-tab-id").textContent;

      fireEvent.click(screen.getByText("既存スレを新しいタブで開く"));
      expect(screen.getByTestId("tabs-count")).toHaveTextContent("2");
      expect(screen.getByTestId("active-tab-id").textContent).toBe(originalActiveTabId);

      // 現仕様では重複防止が働くため、同じURLを再度開いても新規タブは増えず、
      // 既存の該当タブへフォーカスが移る（背景設定でも重複時はそのタブを表示する）。
      fireEvent.click(screen.getByText("既存スレを新しいタブで開く"));

      expect(screen.getByTestId("tabs-count")).toHaveTextContent("2");
      expect(screen.getByTestId("active-tab-id").textContent).not.toBe(originalActiveTabId);
      expect(screen.getByTestId("current-page-title")).toHaveTextContent("既存スレ");
    },
  );

  it("OPEN_IN_NEW_TAB は設定オン時に新しいタブをアクティブにする", async () => {
    vi.resetModules();
    localStorage.setItem("config_focus_new_tab_on_open", "on");
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { state, viewTab, viewPage, dispatch } = useTabStore();

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "threadList",
                  title: "板A",
                  boardUrl: "https://example.com/board-a/",
                  boardTitle: "板A",
                },
              })
            }
          >
            板Aへ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "OPEN_IN_NEW_TAB",
                page: {
                  type: "thread",
                  title: "既存スレ",
                  threadUrl: "https://example.com/test/read.cgi/board-a/1/",
                },
              })
            }
          >
            既存スレを新しいタブで開く
          </button>
          <output data-testid="tabs-count">{state.tabs.length}</output>
          <output data-testid="active-tab-id">{viewTab.id}</output>
          <output data-testid="current-page-title">{viewPage.title}</output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("板Aへ移動"));
    const originalActiveTabId = screen.getByTestId("active-tab-id").textContent;

    fireEvent.click(screen.getByText("既存スレを新しいタブで開く"));
    expect(screen.getByTestId("tabs-count")).toHaveTextContent("2");
    expect(screen.getByTestId("active-tab-id").textContent).not.toBe(originalActiveTabId);
    expect(screen.getByTestId("current-page-title")).toHaveTextContent("既存スレ");
  });

  it("NAVIGATE は別タブに同じページがあっても現在タブの履歴に積む", async () => {
    vi.resetModules();
    // 既存スレを別タブで開く操作は背景前提なので、
    // フォーカス移動でアクティブタブが入れ替わらないよう背景オープン設定にする。
    localStorage.setItem("config_focus_new_tab_on_open", "off");
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { state, viewPage, dispatch } = useTabStore();

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "threadList",
                  title: "板A",
                  boardUrl: "https://example.com/board-a/",
                  boardTitle: "板A",
                },
              })
            }
          >
            板Aへ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "OPEN_IN_NEW_TAB",
                page: {
                  type: "thread",
                  title: "既存スレ",
                  threadUrl: "https://example.com/test/read.cgi/board-a/1/",
                },
              })
            }
          >
            既存スレを背景で開く
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "threadList",
                  title: "板B",
                  boardUrl: "https://example.com/board-b/",
                  boardTitle: "板B",
                },
              })
            }
          >
            板Bへ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "既存スレ",
                  threadUrl: "https://example.com/test/read.cgi/board-a/1/",
                },
              })
            }
          >
            既存スレをクリック
          </button>
          <output data-testid="tabs-count">{state.tabs.length}</output>
          <output data-testid="current-page-title">{viewPage.title}</output>
          <output data-testid="tab-titles">
            {state.tabs.map((tab) => tab.history[tab.currentIndex]?.title ?? "").join("|")}
          </output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("板Aへ移動"));
    fireEvent.click(screen.getByText("既存スレを背景で開く"));
    fireEvent.click(screen.getByText("板Bへ移動"));

    expect(screen.getByTestId("current-page-title")).toHaveTextContent("板B");

    fireEvent.click(screen.getByText("既存スレをクリック"));

    // タブ数は変わらず、現在タブの履歴に積まれる（別タブへ飛ばない）
    expect(screen.getByTestId("tabs-count")).toHaveTextContent("2");
    expect(screen.getByTestId("current-page-title")).toHaveTextContent("既存スレ");
    expect(screen.getByTestId("tab-titles")).toHaveTextContent("既存スレ|既存スレ");
  });

  it("描画対象タブを指定した操作はペインのactiveTabへ作用しない", async () => {
    vi.resetModules();
    const { TabProvider, useTabDispatchForTab, useTabStore } =
      await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { state, viewPage, dispatch } = useTabStore();
      const targetTabId = state.tabs[0]?.id ?? "";
      const targetDispatch = useTabDispatchForTab(targetTabId);
      const targetTab = state.tabs[0];

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "アクティブ側",
                  threadUrl: "https://example.com/test/read.cgi/board/active/",
                },
              })
            }
          >
            アクティブ側へ移動
          </button>
          <button onClick={() => dispatch({ type: "ADD_TAB" })}>別タブを追加</button>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "別タブ側",
                  threadUrl: "https://example.com/test/read.cgi/board/other/",
                },
              })
            }
          >
            別タブ側へ移動
          </button>
          <button
            onClick={() =>
              targetDispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "描画対象側",
                  threadUrl: "https://example.com/test/read.cgi/board/target/",
                },
              })
            }
          >
            描画対象側へ移動
          </button>
          <button onClick={() => targetDispatch({ type: "RELOAD" })}>描画対象を更新</button>
          <button onClick={() => targetDispatch({ type: "GO_BACK" })}>描画対象を戻す</button>
          <output data-testid="target-title">
            {targetTab ? getCurrentPage(targetTab).title : ""}
          </output>
          <output data-testid="target-reload-key">{targetTab?.reloadKey ?? -1}</output>
          <output data-testid="active-title">{viewPage.title}</output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("アクティブ側へ移動"));
    fireEvent.click(screen.getByText("別タブを追加"));
    fireEvent.click(screen.getByText("別タブ側へ移動"));
    fireEvent.click(screen.getByText("描画対象側へ移動"));

    expect(screen.getByTestId("target-title")).toHaveTextContent("描画対象側");
    expect(screen.getByTestId("active-title")).toHaveTextContent("別タブ側");

    fireEvent.click(screen.getByText("描画対象を更新"));
    expect(screen.getByTestId("target-reload-key")).toHaveTextContent("1");
    expect(screen.getByTestId("active-title")).toHaveTextContent("別タブ側");

    fireEvent.click(screen.getByText("描画対象を戻す"));
    expect(screen.getByTestId("target-title")).toHaveTextContent("アクティブ側");
    expect(screen.getByTestId("active-title")).toHaveTextContent("別タブ側");
  });

  it("別窓の表示対象とペインの選択対象を分離する", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");
    const { TabViewScopeProvider } = await import("src/view/browser/state/tabs/use-tab-view-scope");
    const { tabActions } = await import("src/view/browser/state/tabs/tab-store-actions");

    function ScopedView() {
      const { selectedTabId, viewTabId, selectedTab, viewPage, dispatch } = useTabStore();

      return (
        <>
          <output data-testid="scoped-selected-id">{selectedTabId}</output>
          <output data-testid="scoped-view-id">{viewTabId}</output>
          <output data-testid="scoped-selected-title">{getCurrentPage(selectedTab).title}</output>
          <output data-testid="scoped-view-title">{viewPage.title}</output>
          <button
            onClick={() =>
              dispatch(
                tabActions.navigate({
                  type: "thread",
                  title: "別窓で移動したスレ",
                  threadUrl: "https://example.com/test/read.cgi/board/detached/",
                }),
              )
            }
          >
            別窓側へ移動
          </button>
        </>
      );
    }

    function Harness() {
      const { state, paneId, selectedTabId, viewTabId, dispatch } = useTabStore();
      // 変更理由: 常設ホームタブを除外し、選択中と異なる通常タブを別窓対象にする。
      const detachedTabId = state.tabs.find((tab) => tab.id !== selectedTabId)?.id;

      return (
        <>
          <output data-testid="main-selected-id">{selectedTabId}</output>
          <output data-testid="main-view-id">{viewTabId}</output>
          <button
            onClick={() =>
              dispatch(
                tabActions.openInNewTab(
                  {
                    type: "thread",
                    title: "別窓候補のスレ",
                    threadUrl: "https://example.com/test/read.cgi/board/candidate/",
                  },
                  { background: true },
                ),
              )
            }
          >
            別窓候補を追加
          </button>
          {detachedTabId ? (
            <TabViewScopeProvider scope={{ paneId, tabId: detachedTabId }}>
              <ScopedView />
            </TabViewScopeProvider>
          ) : null}
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    const mainSelectedId = screen.getByTestId("main-selected-id").textContent;
    expect(mainSelectedId).toBeTruthy();
    expect(screen.getByTestId("main-view-id")).toHaveTextContent(mainSelectedId ?? "");

    fireEvent.click(screen.getByText("別窓候補を追加"));

    const scopedSelectedId = screen.getByTestId("scoped-selected-id").textContent;
    const scopedViewId = screen.getByTestId("scoped-view-id").textContent;
    expect(scopedSelectedId).toBe(mainSelectedId);
    expect(scopedViewId).not.toBe(scopedSelectedId);
    expect(screen.getByTestId("scoped-selected-title")).toHaveTextContent("板一覧");
    expect(screen.getByTestId("scoped-view-title")).toHaveTextContent("別窓候補のスレ");

    fireEvent.click(screen.getByText("別窓側へ移動"));

    expect(screen.getByTestId("scoped-selected-id")).toHaveTextContent(mainSelectedId ?? "");
    expect(screen.getByTestId("scoped-view-id")).toHaveTextContent(scopedViewId ?? "");
    expect(screen.getByTestId("scoped-view-title")).toHaveTextContent("別窓で移動したスレ");
    expect(screen.getByTestId("main-selected-id")).toHaveTextContent(mainSelectedId ?? "");
  });

  it("クイックアクセス間の遷移で既存ページ判定が誤爆せず切り替わる", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { viewPage, dispatch } = useTabStore();

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: { type: "bookmarkList", title: "ブックマークリスト" },
              })
            }
          >
            ブックマークを開く
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: { type: "historyList", title: "閲覧履歴" },
              })
            }
          >
            履歴を開く
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: { type: "writeHistoryList", title: "書き込み履歴" },
              })
            }
          >
            書き込み履歴を開く
          </button>
          <output data-testid="current-page-type">{viewPage.type}</output>
          <output data-testid="current-page-title">{viewPage.title}</output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("ブックマークを開く"));
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("bookmarkList");

    fireEvent.click(screen.getByText("履歴を開く"));
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("historyList");
    expect(screen.getByTestId("current-page-title")).toHaveTextContent("閲覧履歴");

    fireEvent.click(screen.getByText("書き込み履歴を開く"));
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("writeHistoryList");
    expect(screen.getByTestId("current-page-title")).toHaveTextContent("書き込み履歴");
  });

  it("同一タブでスレURLへ遷移した時は戻るで前のスレへ戻る", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { viewPage, viewTab, dispatch } = useTabStore();

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "threadList",
                  title: "板A",
                  boardUrl: "https://example.com/board-a/",
                  boardTitle: "板A",
                },
              })
            }
          >
            板Aへ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "thread-1",
                  threadUrl: "https://example.com/test/read.cgi/board-a/1/",
                },
              })
            }
          >
            thread-1 へ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "thread-2",
                  threadUrl: "https://example.com/test/read.cgi/board-a/2/",
                },
              })
            }
          >
            thread-2 へ移動
          </button>
          <button onClick={() => dispatch({ type: "GO_BACK" })}>戻る</button>
          <output data-testid="current-page-title">{viewPage.title}</output>
          <output data-testid="current-page-type">{viewPage.type}</output>
          <output data-testid="history-titles">
            {viewTab.history.map((page) => page.title).join("|")}
          </output>
          <output data-testid="history-index">{String(viewTab.currentIndex)}</output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("板Aへ移動"));
    fireEvent.click(screen.getByText("thread-1 へ移動"));
    fireEvent.click(screen.getByText("thread-2 へ移動"));

    expect(screen.getByTestId("current-page-title")).toHaveTextContent("thread-2");
    // 祖先の自動補完なし: ユーザーが実際に訪れたページのみ積まれる
    expect(screen.getByTestId("history-titles")).toHaveTextContent("ホーム|板A|thread-1|thread-2");
    expect(screen.getByTestId("history-index")).toHaveTextContent("3");

    fireEvent.click(screen.getByText("戻る"));

    expect(screen.getByTestId("current-page-title")).toHaveTextContent("thread-1");
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("thread");
    expect(screen.getByTestId("history-index")).toHaveTextContent("2");
  });

  it("ホームからURL直開きしたスレはスレ一覧を経由してホームへ戻る", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { viewPage, viewTab, dispatch } = useTabStore();

      return (
        <>
          <button
            onClick={() => {
              dispatch({ type: "GO_TO_HISTORY_INDEX", index: 0 });
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "direct-thread",
                  threadUrl: "https://example.com/test/read.cgi/board-a/1/",
                },
              });
            }}
          >
            スレをURL直開き
          </button>
          <button onClick={() => dispatch({ type: "GO_BACK" })}>戻る</button>
          <output data-testid="current-page-type">{viewPage.type}</output>
          <output data-testid="current-page-title">{viewPage.title}</output>
          <output data-testid="history-titles">
            {viewTab.history.map((page) => page.title).join("|")}
          </output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("スレをURL直開き"));

    // URL直開きでもスレ一覧を補い、同じタブのホームへ戻れるようにする。
    expect(screen.getByTestId("history-titles")).toHaveTextContent(
      "ホーム|https://example.com/board-a/|direct-thread",
    );

    fireEvent.click(screen.getByText("戻る"));
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("threadList");
    fireEvent.click(screen.getByText("戻る"));

    expect(screen.getByTestId("current-page-type")).toHaveTextContent("home");
    expect(screen.getByTestId("current-page-title")).toHaveTextContent("ホーム");
  });

  it("UPDATE_TITLE_FOR_TAB は対象タブだけを更新し、アクティブタブを汚染しない", async () => {
    vi.resetModules();
    // 背景タブを開いた状態を作るため、新規タブのフォーカス移動を無効化する。
    localStorage.setItem("config_focus_new_tab_on_open", "off");
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { state, viewTab, viewPage, dispatch } = useTabStore();

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "threadList",
                  title: "アクティブ板",
                  boardUrl: "https://example.com/board-a/",
                  boardTitle: "アクティブ板",
                },
              })
            }
          >
            activeを板Aへ
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "OPEN_IN_NEW_TAB",
                page: {
                  type: "thread",
                  title: "背景タブ初期",
                  threadUrl: "https://example.com/test/read.cgi/board-a/1/",
                },
              })
            }
          >
            背景タブを開く
          </button>
          <button
            onClick={() => {
              const target = state.tabs.find((tab) => tab.id !== state.selectedTabId);
              if (!target) return;
              dispatch({
                type: "UPDATE_TITLE_FOR_TAB",
                tabId: target.id,
                title: "背景タブ更新後",
              });
            }}
          >
            背景タブのタイトル更新
          </button>
          <output data-testid="tabs-count">{state.tabs.length}</output>
          <output data-testid="active-tab-id">{viewTab.id}</output>
          <output data-testid="active-page-title">{viewPage.title}</output>
          <output data-testid="background-page-title">
            {state.tabs.find((tab) => tab.id !== state.selectedTabId)?.history.at(-1)?.title ?? ""}
          </output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("activeを板Aへ"));
    const activeTabIdBefore = screen.getByTestId("active-tab-id").textContent;

    fireEvent.click(screen.getByText("背景タブを開く"));
    expect(screen.getByTestId("tabs-count")).toHaveTextContent("2");

    fireEvent.click(screen.getByText("背景タブのタイトル更新"));

    expect(screen.getByTestId("active-tab-id").textContent).toBe(activeTabIdBefore);
    expect(screen.getByTestId("active-page-title")).toHaveTextContent("アクティブ板");
    expect(screen.getByTestId("background-page-title")).toHaveTextContent("背景タブ更新後");
  });

  it("ホームから板URLを直接開くと履歴に積まれ、進むは効かない", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { viewPage, viewTab, dispatch } = useTabStore();

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "threadList",
                  title: "板A",
                  boardUrl: "https://example.com/board-a/",
                  boardTitle: "板A",
                },
              })
            }
          >
            板URL直開き
          </button>
          <button onClick={() => dispatch({ type: "GO_FORWARD" })}>進む</button>
          <output data-testid="current-page-type">{viewPage.type}</output>
          <output data-testid="history-titles">
            {viewTab.history.map((page) => page.title).join("|")}
          </output>
          <output data-testid="history-index">{String(viewTab.currentIndex)}</output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("板URL直開き"));
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("threadList");
    // 祖先の自動補完なし: ホームと板だけが積まれる
    expect(screen.getByTestId("history-titles")).toHaveTextContent("ホーム|板A");
    expect(screen.getByTestId("history-index")).toHaveTextContent("1");

    fireEvent.click(screen.getByText("進む"));
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("threadList");
    expect(screen.getByTestId("history-index")).toHaveTextContent("1");
  });

  it("新規タブ操作は通常のホームを追加し、進むは効かない", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { state, viewPage, dispatch } = useTabStore();

      return (
        <>
          <button onClick={() => dispatch({ type: "ADD_TAB" })}>新規タブ</button>
          <button onClick={() => dispatch({ type: "GO_FORWARD" })}>進む</button>
          <output data-testid="tabs-count">{state.tabs.length}</output>
          <output data-testid="current-page-type">{viewPage.type}</output>
          <output data-testid="history-length">
            {String(state.tabs.find((tab) => tab.id === state.selectedTabId)?.history.length ?? 0)}
          </output>
          <output data-testid="history-index">
            {String(state.tabs.find((tab) => tab.id === state.selectedTabId)?.currentIndex ?? -1)}
          </output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("新規タブ"));
    expect(screen.getByTestId("tabs-count")).toHaveTextContent("2");
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("home");
    expect(screen.getByTestId("history-length")).toHaveTextContent("1");
    expect(screen.getByTestId("history-index")).toHaveTextContent("0");

    fireEvent.click(screen.getByText("進む"));
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("home");
    expect(screen.getByTestId("history-index")).toHaveTextContent("0");
  });

  it("関連する板モードの新規タブはスレ履歴内の確定板名を再利用する", async () => {
    localStorage.setItem("config_new_tab_page_mode", "related_board");

    vi.resetModules();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { viewPage, dispatch } = useTabStore();

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "threadList",
                  title: "Software",
                  boardUrl: "https://egg.5ch.net/software/",
                  boardTitle: "Software",
                },
              })
            }
          >
            板へ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "スレA",
                  threadUrl: "https://egg.5ch.net/test/read.cgi/software/1000000004/",
                },
              })
            }
          >
            スレへ移動
          </button>
          <button onClick={() => dispatch({ type: "ADD_TAB" })}>新規タブ</button>
          <output data-testid="current-page-type">{viewPage.type}</output>
          <output data-testid="current-page-title">{viewPage.title}</output>
          <output data-testid="current-page-board-title">
            {viewPage.type === "threadList" ? viewPage.boardTitle : ""}
          </output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("板へ移動"));
    fireEvent.click(screen.getByText("スレへ移動"));
    fireEvent.click(screen.getByText("新規タブ"));

    expect(screen.getByTestId("current-page-type")).toHaveTextContent("threadList");
    expect(screen.getByTestId("current-page-title")).toHaveTextContent("Software");
    expect(screen.getByTestId("current-page-board-title")).toHaveTextContent("Software");
  });

  it("関連板から別板のスレをURL直開きした戻るで前居た板へ戻る", async () => {
    localStorage.setItem("config_new_tab_page_mode", "related_board");

    vi.resetModules();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { viewPage, viewTab, dispatch } = useTabStore();

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "threadList",
                  title: "エッヂ",
                  boardUrl: "http://bbs.eddibb.cc/liveedge/",
                  boardTitle: "エッヂ",
                },
              })
            }
          >
            板Aへ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "スレA",
                  threadUrl: "http://bbs.eddibb.cc/test/read.cgi/liveedge/1000000006/",
                },
              })
            }
          >
            板Aのスレへ移動
          </button>
          <button onClick={() => dispatch({ type: "ADD_TAB" })}>関連板の新規タブ</button>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "スレB",
                  threadUrl: "https://egg.5ch.io/test/read.cgi/software/123/",
                },
              })
            }
          >
            板BのスレをURL直開き
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "UPDATE_TITLE_FOR_TAB",
                tabId: viewTab.id,
                title: "Software",
                boardUrl: "https://egg.5ch.io/software/",
              })
            }
          >
            板B名を解決
          </button>
          <button onClick={() => dispatch({ type: "GO_BACK" })}>戻る</button>
          <output data-testid="current-page-type">{viewPage.type}</output>
          <output data-testid="current-page-title">{viewPage.title}</output>
          <output data-testid="current-page-board-url">
            {viewPage.type === "threadList" ? viewPage.boardUrl : ""}
          </output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("板Aへ移動"));
    fireEvent.click(screen.getByText("板Aのスレへ移動"));
    fireEvent.click(screen.getByText("関連板の新規タブ"));
    fireEvent.click(screen.getByText("板BのスレをURL直開き"));
    fireEvent.click(screen.getByText("板B名を解決"));
    fireEvent.click(screen.getByText("戻る"));

    // 変更理由: 同一タブの遷移は実際に訪れたページだけを積み、前居た関連板へ戻れるようにする。
    expect(screen.getByTestId("current-page-type")).toHaveTextContent("threadList");
    expect(screen.getByTestId("current-page-title")).toHaveTextContent("エッヂ");
    expect(screen.getByTestId("current-page-board-url")).toHaveTextContent(
      "http://bbs.eddibb.cc/liveedge/",
    );
  });

  it("板ページから新規タブで開いたスレは戻る時に板URLではなく板タイトルを維持する", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");

    function Harness() {
      const { state, viewPage, dispatch } = useTabStore();

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "threadList",
                  title: "エッヂ",
                  boardUrl: "http://bbs.eddibb.cc/liveedge/",
                  boardTitle: "エッヂ",
                },
              })
            }
          >
            板へ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "OPEN_IN_NEW_TAB_FORCE",
                page: {
                  type: "thread",
                  title: "スレ1",
                  threadUrl: "http://bbs.eddibb.cc/test/read.cgi/liveedge/1000000006/",
                },
              })
            }
          >
            新規タブでスレ
          </button>
          <button
            onClick={() => {
              const background = state.tabs.find((tab) => tab.id !== state.selectedTabId);
              if (!background) return;
              dispatch({ type: "SELECT_TAB", tabId: background.id });
            }}
          >
            背景タブへ切替
          </button>
          <button onClick={() => dispatch({ type: "GO_BACK" })}>戻る</button>
          <output data-testid="current-page-type">{viewPage.type}</output>
          <output data-testid="current-page-title">{viewPage.title}</output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("板へ移動"));
    fireEvent.click(screen.getByText("新規タブでスレ"));
    fireEvent.click(screen.getByText("背景タブへ切替"));

    expect(screen.getByTestId("current-page-type")).toHaveTextContent("thread");
    expect(screen.getByTestId("current-page-title")).toHaveTextContent("スレ1");

    fireEvent.click(screen.getByText("戻る"));

    expect(screen.getByTestId("current-page-type")).toHaveTextContent("threadList");
    expect(screen.getByTestId("current-page-title")).toHaveTextContent("エッヂ");
  });

  it("タブごとの検索状態をスレ遷移とセッション保存で維持する", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");
    const thread1 = {
      type: "thread" as const,
      title: "スレ1",
      threadUrl: "https://example.com/test/read.cgi/foo/1/",
    };
    const thread2 = {
      type: "thread" as const,
      title: "スレ2",
      threadUrl: "https://example.com/test/read.cgi/foo/2/",
    };

    function Harness() {
      const { viewTab, viewPage, dispatch } = useTabStore();
      const currentViewState = viewTab.viewStates?.[getPageViewStateKey(viewPage)];

      return (
        <>
          <button onClick={() => dispatch({ type: "NAVIGATE", page: thread1 })}>スレ1へ移動</button>
          <button
            onClick={() =>
              dispatch({
                type: "UPDATE_TAB_VIEW_STATE",
                tabId: viewTab.id,
                pageKey: getPageViewStateKey(thread1),
                patch: { searchQuery: "保存する検索語", filter: "image", searchTarget: "name" },
              })
            }
          >
            スレ1の検索状態を保存
          </button>
          <button onClick={() => dispatch({ type: "NAVIGATE", page: thread2 })}>スレ2へ移動</button>
          <button onClick={() => dispatch({ type: "GO_BACK" })}>スレ1へ戻る</button>
          <output data-testid="current-thread-url">
            {viewPage.type === "thread" ? viewPage.threadUrl : ""}
          </output>
          <output data-testid="current-search-query">{currentViewState?.searchQuery ?? ""}</output>
          <output data-testid="current-filter">{currentViewState?.filter ?? ""}</output>
          <output data-testid="current-search-target">
            {currentViewState?.searchTarget ?? ""}
          </output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("スレ1へ移動"));
    fireEvent.click(screen.getByText("スレ1の検索状態を保存"));
    fireEvent.click(screen.getByText("スレ2へ移動"));

    expect(screen.getByTestId("current-thread-url")).toHaveTextContent(thread2.threadUrl);
    expect(screen.getByTestId("current-search-query")).toHaveTextContent("保存する検索語");
    expect(screen.getByTestId("current-filter")).toHaveTextContent("image");
    expect(screen.getByTestId("current-search-target")).toHaveTextContent("name");

    fireEvent.click(screen.getByText("スレ1へ戻る"));

    expect(screen.getByTestId("current-thread-url")).toHaveTextContent(thread1.threadUrl);
    expect(screen.getByTestId("current-search-query")).toHaveTextContent("保存する検索語");
    expect(screen.getByTestId("current-filter")).toHaveTextContent("image");
    expect(screen.getByTestId("current-search-target")).toHaveTextContent("name");

    await waitFor(() => {
      const raw = localStorage.getItem("chlens_browser_session");
      const parsed = JSON.parse(raw ?? "{}") as {
        panes?: Array<{
          tabs?: Array<{
            locked?: boolean;
            viewStates?: Record<string, { searchQuery?: string; searchTarget?: string }>;
          }>;
        }>;
      };
      // 変更理由: 先頭は常設ホームタブのため、通常タブを探して検証する。
      const targetTab = parsed.panes?.[0]?.tabs?.find((tab) => !tab.locked);
      expect(targetTab?.viewStates?.[getPageViewStateKey(thread1)]?.searchQuery).toBe(
        "保存する検索語",
      );
      expect(targetTab?.viewStates?.[getPageViewStateKey(thread1)]?.searchTarget).toBe("name");
    });
  });
});
