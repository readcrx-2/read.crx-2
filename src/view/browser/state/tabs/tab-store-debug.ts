import { recordDebugEvent } from "src/app/debug/debug-log";
import { getAutoRefreshPageKey } from "src/view/browser/state/tabs/auto-refresh-pages";
import { findTabAcrossPanes } from "src/view/browser/state/tabs/tab-store-selectors";
import {
  getPane,
  getPaneActiveTab,
  resolvePaneId,
} from "src/view/browser/state/tabs/tab-store-state-helpers";
import {
  type ScopedTabAction,
  TAB_ACTION_TYPES,
  type TabStoreState,
} from "src/view/browser/state/tabs/tab-store-types";
import { getCurrentPage, type Tab } from "src/view/browser/types";

interface AutoRefreshFields {
  autoRefreshEnabled: boolean;
  autoRefreshPageKey: string | null;
  autoRefreshStoppedPageKey: string | null;
}

function pickAutoRefreshFields(tab: Tab): AutoRefreshFields {
  return {
    autoRefreshEnabled: tab.autoRefreshEnabled,
    autoRefreshPageKey: tab.autoRefreshPageKey,
    autoRefreshStoppedPageKey: tab.autoRefreshStoppedPageKey ?? null,
  };
}

function isSameAutoRefreshFields(a: AutoRefreshFields, b: AutoRefreshFields): boolean {
  return (
    a.autoRefreshEnabled === b.autoRefreshEnabled &&
    a.autoRefreshPageKey === b.autoRefreshPageKey &&
    a.autoRefreshStoppedPageKey === b.autoRefreshStoppedPageKey
  );
}

/**
 * 自動更新に関わるタブ状態の変化を、原因のactionと呼び出し元つきで記録する。
 *
 * 変更理由: 停止記録による開始拒否は通知を出さないため、利用者からは「ONにしたのにOFFへ戻る」
 * としか見えず、どの経路が状態を変えたのか追えなかった。dispatchの前後を比べ、
 * reducerの全経路（ページ遷移による解除も含む）を一か所で記録する。
 */
export function recordAutoRefreshTransitions(
  action: ScopedTabAction,
  prevState: TabStoreState,
  nextState: TabStoreState,
): void {
  // reducerと同じ規則で操作対象のタブを決め、他ペインのOFFのタブを拒否と誤記録しない。
  const targetTabId =
    action.tabId ??
    getPaneActiveTab(getPane(prevState, resolvePaneId(prevState, action.paneId))).id;
  for (const nextTab of nextState.panes.flatMap((pane) => pane.tabs)) {
    const prevTab = findTabAcrossPanes(prevState, nextTab.id);
    if (!prevTab) continue;

    const before = pickAutoRefreshFields(prevTab);
    const after = pickAutoRefreshFields(nextTab);
    const pageKey = getAutoRefreshPageKey(getCurrentPage(nextTab));

    const isRejectedEnable =
      action.type === TAB_ACTION_TYPES.SET_AUTO_REFRESH_ENABLED &&
      action.enabled &&
      !after.autoRefreshEnabled &&
      targetTabId === nextTab.id;
    if (isRejectedEnable) {
      recordDebugEvent("auto-refresh", "停止記録があるため自動更新の開始を拒否しました", {
        tabId: nextTab.id,
        pageKey,
        requestedPageKey: action.pageKey ?? null,
        before,
        after,
      });
      continue;
    }

    if (isSameAutoRefreshFields(before, after)) continue;
    recordDebugEvent("auto-refresh", "タブの自動更新状態が変わりました", {
      tabId: nextTab.id,
      action: action.type,
      pageKey,
      before,
      after,
    });
  }
}
