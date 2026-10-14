import { queryDebugLogs, resetDebugLogForTest } from "src/app/debug/debug-log";
import { getAutoRefreshPageKey } from "src/view/browser/state/tabs/auto-refresh-pages";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { recordAutoRefreshTransitions } from "src/view/browser/state/tabs/tab-store-debug";
import { createPane, createTabFromPage } from "src/view/browser/state/tabs/tab-store-new-tab";
import { tabReducer } from "src/view/browser/state/tabs/tab-store-reducer";
import type { TabStoreState } from "src/view/browser/state/tabs/tab-store-types";
import type { Page } from "src/view/browser/types";
import { afterEach, describe, expect, it } from "vite-plus/test";

const threadPage: Extract<Page, { type: "thread" }> = {
  type: "thread",
  title: "架空のスレ",
  threadUrl: "https://example.com/test/read.cgi/board/123/",
};

function createState(stoppedPageKey: string | null): TabStoreState {
  const tab = { ...createTabFromPage(threadPage), autoRefreshStoppedPageKey: stoppedPageKey };
  const pane = createPane(tab);
  return { panes: [pane], activePaneId: pane.id, closedTabs: [] };
}

function dispatchAndRecord(state: TabStoreState, action: Parameters<typeof tabReducer>[1]) {
  const next = tabReducer(state, action);
  recordAutoRefreshTransitions(action, state, next);
  return next;
}

afterEach(() => {
  resetDebugLogForTest();
});

describe("自動更新状態のデバッグ記録", () => {
  it("停止記録による開始拒否を記録する", () => {
    const pageKey = getAutoRefreshPageKey(threadPage)!;
    dispatchAndRecord(createState(pageKey), tabActions.setAutoRefreshEnabled(true, pageKey));

    const [entry] = queryDebugLogs({ category: "auto-refresh" });

    expect(entry.message).toBe("停止記録があるため自動更新の開始を拒否しました");
    expect(entry.data).toMatchObject({
      pageKey,
      after: { autoRefreshEnabled: false, autoRefreshStoppedPageKey: pageKey },
    });
  });

  it("開始・停止の変化を原因のactionつきで記録する", () => {
    const pageKey = getAutoRefreshPageKey(threadPage)!;
    const enabled = dispatchAndRecord(
      createState(null),
      tabActions.setAutoRefreshEnabled(true, pageKey),
    );
    dispatchAndRecord(enabled, tabActions.setAutoRefreshStoppedPageKey(pageKey));

    const logs = queryDebugLogs({ category: "auto-refresh" });

    expect(logs.map((entry) => entry.data)).toMatchObject([
      { action: "SET_AUTO_REFRESH_ENABLED", after: { autoRefreshEnabled: true } },
      {
        action: "SET_AUTO_REFRESH_STOPPED_PAGE_KEY",
        after: { autoRefreshEnabled: false, autoRefreshStoppedPageKey: pageKey },
      },
    ]);
  });

  it("自動更新に関係しない操作は記録しない", () => {
    dispatchAndRecord(createState(null), tabActions.reload());

    expect(queryDebugLogs({ category: "auto-refresh" })).toEqual([]);
  });
});
