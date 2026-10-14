import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import type { Dispatch } from "react";
import type { ScopedTabAction, TabStoreState } from "src/view/browser/state/tabs/tab-store-types";
import { canGoBack, createHomeTab, getCurrentPage, type Tab } from "src/view/browser/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("src/app/platform", () => ({
  platform: { window: { setTitle: vi.fn(async () => undefined) } },
}));
vi.mock("src/core/history/History", () => ({
  add: vi.fn(async () => undefined),
  getByUrl: vi.fn(async () => []),
  remove: vi.fn(async () => undefined),
}));
vi.mock("webextension-polyfill", () => ({
  default: { runtime: { onMessage: { addListener: vi.fn(), removeListener: vi.fn() } } },
}));

const board = {
  type: "threadList" as const,
  title: "サンプル板",
  boardTitle: "サンプル板",
  boardUrl: "https://example.com/sample/",
};
let dispatch: Dispatch<ScopedTabAction>;
let stateRef: { current: TabStoreState };

beforeEach(() => {
  vi.resetModules();
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
  };
  vi.stubGlobal("localStorage", storage);
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function mount(saved?: TabStoreState) {
  if (saved) localStorage.setItem("chlens_browser_session", JSON.stringify(saved));
  const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");
  function Harness() {
    const store = useTabStore();
    dispatch = store.dispatch;
    stateRef = store.stateRef;
    return <output data-testid="page">{store.viewPage.type}</output>;
  }
  render(
    <TabProvider>
      <Harness />
    </TabProvider>,
  );
}

function activeTab() {
  const pane = stateRef.current.panes.find(
    (candidate) => candidate.id === stateRef.current.activePaneId,
  )!;
  return pane.tabs.find((tab) => tab.id === pane.activeTabId)!;
}

describe("通常タブのホームと閲覧履歴", () => {
  it("初期ホームは固定されず、新規タブもそれぞれ独立したホームになる", async () => {
    await mount();
    const first = activeTab().id;
    expect(activeTab().pinned).toBe(false);
    expect(activeTab()).not.toHaveProperty("locked");
    act(() => dispatch({ type: "ADD_TAB" }));
    const second = activeTab().id;
    act(() => dispatch({ type: "ADD_TAB" }));
    expect(new Set([first, second, activeTab().id]).size).toBe(3);
    expect(stateRef.current.panes[0].tabs).toHaveLength(3);
    expect(screen.getByTestId("page")).toHaveTextContent("home");
  });

  it("同じタブでホーム・板・スレを開き、戻ると進むで往復できる", async () => {
    await mount();
    const id = activeTab().id;
    act(() => dispatch({ type: "NAVIGATE", page: board }));
    act(() =>
      dispatch({
        type: "NAVIGATE",
        page: {
          type: "thread",
          title: "スレ",
          threadUrl: "https://example.com/test/read.cgi/sample/1/",
        },
      }),
    );
    expect(activeTab().history.map((page) => page.type)).toEqual(["home", "threadList", "thread"]);
    act(() => dispatch({ type: "GO_BACK" }));
    expect(screen.getByTestId("page")).toHaveTextContent("threadList");
    act(() => dispatch({ type: "GO_BACK" }));
    expect(screen.getByTestId("page")).toHaveTextContent("home");
    expect(canGoBack(activeTab())).toBe(false);
    act(() => dispatch({ type: "GO_FORWARD" }));
    expect(screen.getByTestId("page")).toHaveTextContent("threadList");
    expect(activeTab().id).toBe(id);
    expect(stateRef.current.panes[0].tabs).toHaveLength(1);
  });

  it("板一覧から板を選ぶと、板一覧を挟まず同じタブのホームへ戻る", async () => {
    await mount();
    const id = activeTab().id;
    act(() => dispatch({ type: "NAVIGATE", page: { type: "boardList", title: "板一覧" } }));
    act(() => dispatch({ type: "NAVIGATE", page: board }));
    expect(activeTab().history.map((page) => page.type)).toEqual(["home", "threadList"]);
    act(() => dispatch({ type: "GO_BACK" }));
    expect(activeTab().id).toBe(id);
    expect(screen.getByTestId("page")).toHaveTextContent("home");
  });

  it("スレを新規タブで直接開いても板とホームの戻る先を持つ", async () => {
    await mount();
    act(() =>
      dispatch({
        type: "OPEN_IN_NEW_TAB_FORCE",
        focus: true,
        page: {
          type: "thread",
          title: "スレ",
          threadUrl: "https://example.com/test/read.cgi/sample/1/",
        },
      }),
    );
    expect(activeTab().history.map((page) => page.type)).toEqual(["home", "threadList", "thread"]);
    const id = activeTab().id;
    act(() => dispatch({ type: "GO_BACK" }));
    act(() => dispatch({ type: "GO_BACK" }));
    expect(activeTab().id).toBe(id);
    expect(screen.getByTestId("page")).toHaveTextContent("home");
  });

  it("分割したペインを統合してもホームを重複扱いせず選択を保つ", async () => {
    await mount();
    act(() => dispatch({ type: "SPLIT_PANE" }));
    const id = activeTab().id;
    act(() => dispatch({ type: "CLOSE_PANE" }));
    expect(stateRef.current.panes).toHaveLength(1);
    expect(stateRef.current.panes[0].tabs).toHaveLength(2);
    expect(activeTab().id).toBe(id);
  });

  it("旧固定ホームと旧空タブをIDを保って通常ホームへ移行する", async () => {
    // 旧セッションの常設ホームはlockedを持つため、現行のTab型に余分な項目を足して再現する。
    const oldHome: Tab & { locked: boolean } = {
      ...createHomeTab("old-home"),
      locked: true,
      pinned: true,
    };
    const oldBlank: Tab = {
      ...createHomeTab("old-blank"),
      history: [{ type: "newTab", title: "新しいタブ" }],
    };
    await mount({
      panes: [{ id: "pane", tabs: [oldHome, oldBlank], activeTabId: oldBlank.id }],
      activePaneId: "pane",
      closedTabs: [],
    });
    expect(stateRef.current.panes[0].tabs.map((tab) => tab.id)).toEqual([oldHome.id, oldBlank.id]);
    expect(stateRef.current.panes[0].tabs.every((tab) => !tab.pinned && !("locked" in tab))).toBe(
      true,
    );
    expect(activeTab().id).toBe(oldBlank.id);
    expect(screen.getByTestId("page")).toHaveTextContent("home");
  });

  it("別ペインの戻る操作は対象タブの履歴だけを戻す", async () => {
    const tab: Tab = {
      ...createHomeTab("right-board"),
      history: [{ type: "boardList", title: "板一覧" }, board],
      currentIndex: 1,
    };
    const left = createHomeTab("left-home");
    await mount({
      panes: [
        { id: "left", tabs: [left], activeTabId: left.id },
        { id: "right", tabs: [tab], activeTabId: tab.id },
      ],
      activePaneId: "left",
      closedTabs: [],
    });
    act(() => dispatch({ type: "GO_BACK", paneId: "right", tabId: tab.id }));
    expect(stateRef.current.activePaneId).toBe("left");
    expect(stateRef.current.panes[1].activeTabId).toBe(tab.id);
    expect(getCurrentPage(stateRef.current.panes[1].tabs[0]).type).toBe("home");
  });

  it("ホームもピン留めと終了ができ、全終了後は通常ホームを一つ開く", async () => {
    await mount();
    const id = activeTab().id;
    act(() => dispatch({ type: "TOGGLE_PIN", tabId: id }));
    expect(activeTab().pinned).toBe(true);
    act(() => dispatch({ type: "TOGGLE_PIN", tabId: id }));
    act(() => dispatch({ type: "ADD_TAB" }));
    act(() => dispatch({ type: "CLOSE_TAB", tabId: id }));
    expect(stateRef.current.panes[0].tabs.some((tab) => tab.id === id)).toBe(false);
    act(() => dispatch({ type: "CLOSE_ALL_TABS" }));
    expect(stateRef.current.panes[0].tabs).toHaveLength(1);
    expect(activeTab().pinned).toBe(false);
    expect(getCurrentPage(activeTab()).type).toBe("home");
  });
});
