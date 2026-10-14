import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import { startTransition } from "react";
import { container } from "src/service-container/index";
import type { IHistoryService } from "src/service-container/interfaces";
import { stubService } from "src/service-container/test-stubs";
import type { ScopedTabAction, TabStoreState } from "src/view/browser/state/tabs/tab-store-types";
import { createHomeTab, getCurrentPage } from "src/view/browser/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("src/app/platform", () => ({
  platform: { window: { setTitle: vi.fn(async () => undefined) } },
}));
// 実装は src/core/history/History ではなくサービスコンテナの history から使うため、テスト用のサービスを登録する。
container.history = stubService<IHistoryService>("history", {
  add: vi.fn(async () => undefined),
  getByUrl: vi.fn(async () => []),
  remove: vi.fn(async () => undefined),
});
vi.mock("webextension-polyfill", () => ({
  default: { runtime: { onMessage: { addListener: vi.fn(), removeListener: vi.fn() } } },
}));

const SESSION_KEY = "chlens_browser_session";
const originalUrl = window.location.href;

function savedState(): TabStoreState {
  const boardTab = {
    ...createHomeTab("board-tab"),
    pinned: true,
    currentIndex: 1,
    history: [
      { type: "home" as const, title: "ホーム" },
      {
        type: "threadList" as const,
        title: "サンプル板",
        boardUrl: "https://example.com/sample/",
        boardTitle: "サンプル板",
      },
    ],
    viewState: { "threadList:https://example.com/sample/": { searchQuery: "保存済み検索" } },
  };
  return {
    panes: [
      { id: "left", tabs: [createHomeTab("left-home"), boardTab], activeTabId: "board-tab" },
      { id: "right", tabs: [createHomeTab("right-home")], activeTabId: "right-home" },
    ],
    activePaneId: "left",
    closedTabs: [{ ...boardTab, id: "closed-tab" }],
  };
}

async function renderViewer() {
  const { TabProvider, useTabStore, useTabPanes } =
    await import("src/view/browser/state/tabs/use-tab-store");
  let dispatchForTest: (action: ScopedTabAction) => void = () => {
    throw new Error("未マウントです");
  };
  function State() {
    const { state, viewPage, dispatch } = useTabStore();
    const panes = useTabPanes();
    dispatchForTest = dispatch;
    return (
      <>
        <output data-testid="state">
          {JSON.stringify({ ...panes, closedTabs: state.closedTabs })}
        </output>
        <output data-testid="active-title">{viewPage.title}</output>
      </>
    );
  }
  render(
    <TabProvider>
      <State />
    </TabProvider>,
  );
  return (action: ScopedTabAction) => dispatchForTest(action);
}

describe("タブセッションの操作時保存と再読み込み", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const values = new Map<string, string>();
    const storage: Storage = {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      key: (index) => [...values.keys()][index] ?? null,
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    };
    vi.stubGlobal("localStorage", storage);
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
    vi.resetModules();
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", originalUrl);
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("外部リンク起動で保存済みのタブ・ペイン・閉じたタブを保ち、F5相当の再マウントでも復元する", async () => {
    const saved = savedState();
    localStorage.setItem(SESSION_KEY, JSON.stringify(saved));
    const url = new URL(window.location.href);
    url.searchParams.set("q", "https://example.com/launch/");
    url.searchParams.set("keep", "1");
    url.hash = "section";
    window.history.replaceState(null, "", url.href);
    await renderViewer();
    expect(screen.getByTestId("active-title")).toHaveTextContent("https://example.com/launch/");
    expect(new URL(window.location.href).searchParams.has("q")).toBe(false);
    expect(new URL(window.location.href).searchParams.get("keep")).toBe("1");
    expect(window.location.hash).toBe("#section");
    const state = JSON.parse(localStorage.getItem(SESSION_KEY)!) as TabStoreState;
    expect(state.panes).toHaveLength(2);
    const savedBoardTab = saved.panes[0].tabs[1];
    const persistedBoardTab = state.panes[0].tabs.find((tab) => tab.id === "board-tab");
    // 保存対象の項目だけが書き出され、自動更新などの一時状態や未知の項目は保存しない。
    expect(persistedBoardTab).toEqual({
      id: savedBoardTab.id,
      history: savedBoardTab.history,
      currentIndex: savedBoardTab.currentIndex,
      pinned: savedBoardTab.pinned,
    });
    expect(state.closedTabs[0].id).toBe("closed-tab");
    cleanup();
    vi.resetModules();
    await renderViewer();
    expect(JSON.parse(screen.getByTestId("state").textContent!)).toMatchObject(state);
  });

  it("起動先が保存済みタブと同じなら重複追加せず、保存済みの板名を使う", async () => {
    const saved = savedState();
    localStorage.setItem(SESSION_KEY, JSON.stringify(saved));
    const url = new URL(window.location.href);
    url.searchParams.set("q", "https://example.com/sample/");
    window.history.replaceState(null, "", url.href);
    await renderViewer();
    expect(screen.getByTestId("active-title")).toHaveTextContent("サンプル板");
    const state = JSON.parse(localStorage.getItem(SESSION_KEY)!) as TabStoreState;
    expect(state.panes[0].tabs).toHaveLength(saved.panes[0].tabs.length);
  });

  it("ChLensで開く起動先のスレを履歴に記録し、取得後のタイトルを同じ日時へ反映する", async () => {
    const threadUrl = "https://example.com/test/read.cgi/sample/123/";
    const url = new URL(window.location.href);
    url.searchParams.set("q", threadUrl);
    window.history.replaceState(null, "", url.href);
    const { add, remove } = container.history;
    const dispatch = await renderViewer();
    await vi.waitFor(() =>
      expect(add).toHaveBeenCalledWith(threadUrl, threadUrl, expect.any(Number), "sample"),
    );
    const date = vi.mocked(add).mock.calls[0][2];
    const state = JSON.parse(screen.getByTestId("state").textContent!) as TabStoreState;
    const pane = state.panes.find((item) => item.id === state.activePaneId)!;

    // 起動先を初期stateへ入れる経路でも、通常のタイトル解決と同じ履歴補正が必要。
    await act(async () =>
      dispatch({
        type: "UPDATE_TITLE_FOR_TAB",
        tabId: pane.activeTabId,
        title: "過去ログのタイトル",
      }),
    );
    await vi.waitFor(() =>
      expect(add).toHaveBeenCalledWith(threadUrl, "過去ログのタイトル", date, "sample"),
    );
    expect(remove).toHaveBeenCalledWith(threadUrl, date);

    cleanup();
    vi.mocked(add).mockClear();
    vi.resetModules();
    await renderViewer();
    expect(add).not.toHaveBeenCalled();
  });

  it("Reactの描画完了を待たず、タブを開いた操作の直後に保存する", async () => {
    const dispatch = await renderViewer();
    act(() => {
      // 描画を遅延させる経路でも、直後のF5が参照する永続データには操作結果が必要。
      startTransition(() =>
        dispatch({
          type: "OPEN_IN_NEW_TAB_FORCE",
          tabId: "new-tab",
          focus: true,
          page: {
            type: "threadList",
            title: "新しい板",
            boardUrl: "https://example.com/new/",
            boardTitle: "新しい板",
          },
        }),
      );
      const state = JSON.parse(localStorage.getItem(SESSION_KEY)!) as TabStoreState;
      expect(state.panes[0].activeTabId).toBe("new-tab");
      expect(getCurrentPage(state.panes[0].tabs.find((tab) => tab.id === "new-tab")!).title).toBe(
        "新しい板",
      );
    });
  });
});
