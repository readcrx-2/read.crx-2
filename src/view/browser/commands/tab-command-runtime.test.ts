import {
  executeTabCommandRequest,
  TAB_COMMAND_IDS,
  type TabCommandRuntime,
} from "src/view/browser/commands/tab-command-runtime";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import type { TabStoreState } from "src/view/browser/state/tabs/tab-store-types";
import type { Tab } from "src/view/browser/types";
import { describe, expect, it, vi } from "vite-plus/test";

function createTab(overrides: Partial<Tab> = {}): Tab {
  const page = { type: "boardList" as const, title: "ホーム" };
  return {
    id: "tab-1",
    history: [page, { type: "settings", title: "設定" }],
    currentIndex: 1,
    pinned: false,
    reloadKey: 0,
    autoRefreshEnabled: false,
    autoRefreshPageKey: null,
    ...overrides,
  };
}

function createRuntime(tab: Tab): TabCommandRuntime {
  const state: TabStoreState = {
    panes: [
      {
        id: "pane-1",
        tabs: [tab],
        activeTabId: tab.id,
      },
    ],
    activePaneId: "pane-1",
    closedTabs: [],
  };
  return { state, dispatch: vi.fn() };
}

describe("tab-command-runtime", () => {
  it("指定タブの履歴だけを戻す", () => {
    const tab = createTab();
    const runtime = createRuntime(tab);

    expect(
      executeTabCommandRequest({ id: TAB_COMMAND_IDS.BACK, args: { tabId: tab.id } }, runtime),
    ).toBe(true);
    expect(runtime.dispatch).toHaveBeenCalledWith({ ...tabActions.goBack(), tabId: tab.id });
  });

  it("再取得も指定タブへ限定する", () => {
    const tab = createTab({
      history: [{ type: "thread", title: "スレッド", threadUrl: "https://example.com/thread/" }],
      currentIndex: 0,
    });
    const runtime = createRuntime(tab);

    expect(
      executeTabCommandRequest({ id: TAB_COMMAND_IDS.RELOAD, args: { tabId: tab.id } }, runtime),
    ).toBe(true);
    expect(runtime.dispatch).toHaveBeenCalledWith({ ...tabActions.reload(), tabId: tab.id });
  });

  it("閉じたタブへ暗黙にフォールバックしない", () => {
    const runtime = createRuntime(createTab({ id: "other-tab" }));

    expect(
      executeTabCommandRequest(
        { id: TAB_COMMAND_IDS.BACK, args: { tabId: "closed-tab" } },
        runtime,
      ),
    ).toBe(false);
    expect(runtime.dispatch).not.toHaveBeenCalled();
  });

  it("更新できないページでは再取得をdispatchしない", () => {
    const tab = createTab();
    const runtime = createRuntime(tab);

    expect(
      executeTabCommandRequest({ id: TAB_COMMAND_IDS.RELOAD, args: { tabId: tab.id } }, runtime),
    ).toBe(false);
    expect(runtime.dispatch).not.toHaveBeenCalled();
  });

  it("別ペインのタブを閉じる時は所有ペインを指定する", () => {
    const target = createTab({ id: "target-tab" });
    const other = createTab({ id: "other-tab" });
    const paneSibling = createTab({ id: "pane-2-sibling" });
    const runtime = createRuntime(target);
    runtime.state.panes = [
      { id: "pane-1", tabs: [other], activeTabId: other.id },
      { id: "pane-2", tabs: [target, paneSibling], activeTabId: target.id },
    ];
    runtime.state.activePaneId = "pane-1";

    expect(
      executeTabCommandRequest({ id: TAB_COMMAND_IDS.CLOSE, args: { tabId: target.id } }, runtime),
    ).toBe(true);
    expect(runtime.dispatch).toHaveBeenCalledWith({
      ...tabActions.closeTab(target.id),
      paneId: "pane-2",
      tabId: target.id,
    });
  });

  it("固定状態は指定値と異なる時だけ変更する", () => {
    const target = createTab({ id: "target-tab" });
    const runtime = createRuntime(target);

    expect(
      executeTabCommandRequest(
        { id: TAB_COMMAND_IDS.PIN_SET, args: { tabId: target.id, pinned: true } },
        runtime,
      ),
    ).toBe(true);
    expect(runtime.dispatch).toHaveBeenCalledWith({
      ...tabActions.togglePin(target.id),
      paneId: "pane-1",
      tabId: target.id,
    });

    expect(
      executeTabCommandRequest(
        { id: TAB_COMMAND_IDS.PIN_SET, args: { tabId: target.id, pinned: false } },
        runtime,
      ),
    ).toBe(false);
    expect(runtime.dispatch).toHaveBeenCalledTimes(1);
  });

  it("固定タブとペイン最後のタブは閉じない", () => {
    const pinnedRuntime = createRuntime(createTab({ pinned: true }));
    expect(
      executeTabCommandRequest(
        { id: TAB_COMMAND_IDS.CLOSE, args: { tabId: "tab-1" } },
        pinnedRuntime,
      ),
    ).toBe(false);
    expect(pinnedRuntime.dispatch).not.toHaveBeenCalled();

    const lastTabRuntime = createRuntime(createTab());
    expect(
      executeTabCommandRequest(
        { id: TAB_COMMAND_IDS.CLOSE, args: { tabId: "tab-1" } },
        lastTabRuntime,
      ),
    ).toBe(false);
    expect(lastTabRuntime.dispatch).not.toHaveBeenCalled();
  });

  it("他のタブを閉じる時は対象タブの所有ペインを指定する", () => {
    const target = createTab({ id: "target-tab" });
    const other = createTab({ id: "other-tab" });
    const pinned = createTab({ id: "pinned-tab", pinned: true });
    const runtime = createRuntime(target);
    runtime.state.panes = [{ id: "pane-1", tabs: [target, other, pinned], activeTabId: target.id }];

    expect(
      executeTabCommandRequest(
        { id: TAB_COMMAND_IDS.CLOSE_OTHER, args: { tabId: target.id } },
        runtime,
      ),
    ).toBe(true);
    expect(runtime.dispatch).toHaveBeenCalledWith({
      ...tabActions.closeOtherTabs(target.id),
      paneId: "pane-1",
      tabId: target.id,
    });
  });

  it("右側のタブを閉じる時は対象タブの所有ペインを指定する", () => {
    const target = createTab({ id: "target-tab" });
    const right = createTab({ id: "right-tab" });
    const pinnedRight = createTab({ id: "pinned-right-tab", pinned: true });
    const runtime = createRuntime(target);
    runtime.state.panes = [
      { id: "pane-2", tabs: [target, right, pinnedRight], activeTabId: target.id },
    ];

    expect(
      executeTabCommandRequest(
        { id: TAB_COMMAND_IDS.CLOSE_RIGHT, args: { tabId: target.id } },
        runtime,
      ),
    ).toBe(true);
    expect(runtime.dispatch).toHaveBeenCalledWith({
      ...tabActions.closeRightTabs(target.id),
      paneId: "pane-2",
      tabId: target.id,
    });
  });

  it("すべてのタブを閉じる時は対象タブの所有ペインを指定する", () => {
    const target = createTab({ id: "target-tab" });
    const runtime = createRuntime(target);
    runtime.state.panes = [{ id: "pane-2", tabs: [target], activeTabId: target.id }];

    expect(
      executeTabCommandRequest(
        { id: TAB_COMMAND_IDS.CLOSE_ALL, args: { tabId: target.id } },
        runtime,
      ),
    ).toBe(true);
    expect(runtime.dispatch).toHaveBeenCalledWith({
      ...tabActions.closeAllTabs(),
      paneId: "pane-2",
      tabId: target.id,
    });
  });

  it("閉じたタブを対象タブの所有ペインへ復元する", () => {
    const target = createTab({ id: "target-tab" });
    const closed = createTab({ id: "closed-tab" });
    const runtime = createRuntime(target);
    runtime.state.panes = [{ id: "pane-2", tabs: [target], activeTabId: target.id }];
    runtime.state.closedTabs = [closed];

    expect(
      executeTabCommandRequest({ id: TAB_COMMAND_IDS.REOPEN, args: { tabId: target.id } }, runtime),
    ).toBe(true);
    expect(runtime.dispatch).toHaveBeenCalledWith({
      ...tabActions.reopenClosedTab(),
      paneId: "pane-2",
      tabId: target.id,
    });
  });

  it("右ペインで開く時は元タブの所有ペインを指定する", () => {
    const target = createTab({ id: "target-tab" });
    const runtime = createRuntime(target);
    runtime.state.panes = [{ id: "pane-1", tabs: [target], activeTabId: target.id }];

    expect(
      executeTabCommandRequest(
        { id: TAB_COMMAND_IDS.OPEN_RIGHT, args: { tabId: target.id } },
        runtime,
      ),
    ).toBe(true);
    expect(runtime.dispatch).toHaveBeenCalledWith({
      ...tabActions.openInRightPane(target.id),
      paneId: "pane-1",
      tabId: target.id,
    });
  });

  it("右隣がなくペイン上限に達している時はdispatchしない", () => {
    const first = createTab({ id: "first-tab" });
    const target = createTab({ id: "target-tab" });
    const runtime = createRuntime(target);
    runtime.state.panes = [
      { id: "pane-1", tabs: [first], activeTabId: first.id },
      { id: "pane-2", tabs: [target], activeTabId: target.id },
    ];

    expect(
      executeTabCommandRequest(
        { id: TAB_COMMAND_IDS.OPEN_RIGHT, args: { tabId: target.id } },
        runtime,
      ),
    ).toBe(false);
    expect(runtime.dispatch).not.toHaveBeenCalled();
  });
});
