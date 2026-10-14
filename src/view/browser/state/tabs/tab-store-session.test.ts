import { loadTabStoreSession } from "src/view/browser/state/tabs/tab-store-session";
import { createHomeTab, getCurrentPage, type Tab } from "src/view/browser/types";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const storage = vi.hoisted(() => ({ json: "" }));
vi.mock("src/view/browser/state/tabs/browser-session-storage", () => ({
  getBrowserSessionJson: () => storage.json,
  setBrowserSessionJson: vi.fn(async () => undefined),
}));

const boardPage = {
  type: "threadList",
  title: "サンプル板",
  boardUrl: "https://example.com/sample/",
  boardTitle: "サンプル板",
};

describe("ホーム統合後のセッション移行", () => {
  beforeEach(() => {
    storage.json = "";
  });

  it("旧セッションのタブ単位の表示形式は読み捨て、自動更新は開始しない", () => {
    storage.json = JSON.stringify({
      panes: [
        {
          id: "pane",
          activeTabId: "tab",
          tabs: [
            { ...createHomeTab("tab"), threadDisplayMode: "live-chat", autoRefreshEnabled: true },
          ],
        },
      ],
      activePaneId: "pane",
      closedTabs: [],
    });
    const restoredTab = loadTabStoreSession()!.panes[0].tabs[0];
    expect(restoredTab).toMatchObject({ autoRefreshEnabled: false });
    expect(restoredTab).not.toHaveProperty("threadDisplayMode");
  });

  it.each([0, 1, 2, 3])(
    "旧階層の選択位置%sを保ち、板一覧への二重の戻る操作をなくす",
    (currentIndex) => {
      storage.json = JSON.stringify({
        panes: [
          {
            id: "pane",
            activeTabId: "tab",
            tabs: [
              {
                ...createHomeTab("tab"),
                locked: false,
                pinned: false,
                currentIndex,
                history: [
                  { type: "boardTree", title: "板ツリー" },
                  { type: "boardList", title: "板一覧" },
                  boardPage,
                  {
                    type: "thread",
                    title: "サンプルスレ",
                    threadUrl: "https://example.com/test/read.cgi/sample/1/",
                  },
                ],
              },
            ],
          },
        ],
        activePaneId: "pane",
        closedTabs: [],
      });
      const state = loadTabStoreSession()!;
      const tab = state.panes[0].tabs.find((item) => item.id === "tab")!;
      expect(tab.history.map((page) => page.type)).toEqual(
        currentIndex === 1
          ? ["home", "boardList", "threadList", "thread"]
          : ["home", "threadList", "thread"],
      );
      expect(tab.currentIndex).toBe(currentIndex === 1 ? 1 : Math.max(0, currentIndex - 1));
      expect(state.panes[0].activeTabId).toBe("tab");
      expect(state.panes[0].tabs).toHaveLength(1);
      expect(getCurrentPage(tab).type).toBe(
        ["home", "boardList", "threadList", "thread"][currentIndex],
      );
    },
  );

  it.each(["home", "boardTree"])("旧形式%sの通常タブと閉じたタブをホームへ移行する", (type) => {
    const tab = { ...createHomeTab("tab"), locked: false, history: [{ type, title: "ホーム" }] };
    storage.json = JSON.stringify({ tabs: [tab], activeTabId: "tab", closedTabs: [tab] });
    const state = loadTabStoreSession()!;
    expect(state.panes[0].tabs[0].history).toEqual([{ type: "home", title: "ホーム" }]);
    expect(state.closedTabs[0].history).toEqual([{ type: "home", title: "ホーム" }]);
  });

  it("旧常設ホームのIDと選択を保ち、専用homeページへ移行する", () => {
    storage.json = JSON.stringify({
      tabs: [
        {
          ...createHomeTab("home-tab"),
          locked: true,
          pinned: true,
          history: [{ type: "boardTree", title: "ホーム" }],
        },
      ],
      activeTabId: "home-tab",
      closedTabs: [],
    });
    const pane = loadTabStoreSession()!.panes[0];
    expect(pane.tabs).toHaveLength(1);
    expect(pane.activeTabId).toBe("home-tab");
    expect(pane.tabs[0]).not.toHaveProperty("locked");
    expect(pane.tabs[0]).toMatchObject({
      pinned: false,
      history: [{ type: "home", title: "ホーム" }],
    });
  });
});

describe("セッション保存形式", () => {
  it("一時状態を書き出さず、履歴から外れたページの表示状態を切り捨てる", async () => {
    const { toPersistedTab } = await import("src/view/browser/state/tabs/tab-store-session");
    const threadPage = {
      type: "thread" as const,
      title: "サンプルスレ",
      threadUrl: "https://example.com/test/read.cgi/sample/1/",
    };
    const tab: Tab = {
      ...createHomeTab("tab"),
      history: [{ type: "home", title: "ホーム" }, boardPage as never, threadPage],
      currentIndex: 2,
      reloadKey: 5,
      autoRefreshEnabled: true,
      autoRefreshPageKey: "thread:https://example.com/test/read.cgi/sample/1/",
      viewStates: {
        "thread:https://example.com/test/read.cgi/sample/1/": { searchQuery: "残す" },
        "thread:https://example.com/test/read.cgi/sample/99/": { searchQuery: "捨てる" },
      },
    };
    const persisted = toPersistedTab(tab);

    expect(persisted).toEqual({
      id: "tab",
      history: [{ type: "home", title: "ホーム" }, boardPage, threadPage],
      currentIndex: 2,
      pinned: false,
      viewStates: {
        "thread:https://example.com/test/read.cgi/sample/1/": { searchQuery: "残す" },
      },
    });
  });
});
