import type { Dispatch } from "react";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import {
  canCloseTab,
  canOpenInRightPane,
  canReopenClosedTab,
  findTabLocation,
  hasClosableOtherTabs,
  hasClosableRightTabs,
  type TabLocation,
} from "src/view/browser/state/tabs/tab-store-selectors";
import type { ScopedTabAction, TabStoreState } from "src/view/browser/state/tabs/tab-store-types";
import { canGoBack, canGoForward, getCurrentPage } from "src/view/browser/types";
import { isPageRefreshable } from "src/view/browser/utils/refreshable-pages";

/** タブの履歴・再取得・ライフサイクル操作を共有するコマンドID。 */
export const TAB_COMMAND_IDS = {
  BACK: "tab.back",
  FORWARD: "tab.forward",
  RELOAD: "tab.reload",
  CLOSE: "tab.close",
  PIN_SET: "tab.pin.set",
  CLOSE_OTHER: "tab.close-other",
  CLOSE_RIGHT: "tab.close-right",
  CLOSE_ALL: "tab.close-all",
  REOPEN: "tab.reopen",
  OPEN_RIGHT: "tab.open-right",
} as const;

export type TabCommandId = (typeof TAB_COMMAND_IDS)[keyof typeof TAB_COMMAND_IDS];

export type TabCommandRequest =
  | {
      readonly id: typeof TAB_COMMAND_IDS.PIN_SET;
      readonly args: {
        readonly tabId: string;
        readonly pinned: boolean;
      };
    }
  | {
      readonly id: Exclude<TabCommandId, typeof TAB_COMMAND_IDS.PIN_SET>;
      readonly args: {
        readonly tabId: string;
      };
    };

export interface TabCommandRuntime {
  readonly state: TabStoreState;
  readonly dispatch: Dispatch<ScopedTabAction>;
}

function dispatchForTab(
  runtime: TabCommandRuntime,
  location: TabLocation,
  action: ScopedTabAction,
  includePaneId = false,
): void {
  // 変更理由: 別窓のタブを操作する時は選択中タブへの暗黙フォールバックを避け、
  // コマンドが受け取ったIDだけを更新する必要がある。
  runtime.dispatch({
    ...action,
    ...(includePaneId ? { paneId: location.paneId } : {}),
    tabId: location.tab.id,
  });
}

/**
 * タブの履歴・再取得・ライフサイクルコマンドを対象IDへ限定して実行する。
 *
 * 対象タブが閉じた場合や操作できないページの場合は何もdispatchせずfalseを返す。
 * 別の選択タブへフォールバックしないことで、メイン窓と別窓の履歴が混ざるのを防ぐ。
 */
export function executeTabCommandRequest(
  request: TabCommandRequest,
  runtime: TabCommandRuntime,
): boolean {
  const location = findTabLocation(runtime.state, request.args.tabId);
  if (!location) {
    return false;
  }

  switch (request.id) {
    case TAB_COMMAND_IDS.BACK:
      if (!canGoBack(location.tab)) {
        return false;
      }
      dispatchForTab(runtime, location, tabActions.goBack());
      return true;
    case TAB_COMMAND_IDS.FORWARD:
      if (!canGoForward(location.tab)) {
        return false;
      }
      dispatchForTab(runtime, location, tabActions.goForward());
      return true;
    case TAB_COMMAND_IDS.RELOAD:
      if (!isPageRefreshable(getCurrentPage(location.tab))) {
        return false;
      }
      dispatchForTab(runtime, location, tabActions.reload());
      return true;
    case TAB_COMMAND_IDS.CLOSE:
      // 変更理由: 2ペインなら最後のタブを閉じてそのペインへ戻せるが、
      // 単一ペインでは空のワークスペースを避けるため代替タブを維持する。
      if (
        !canCloseTab(location.tab, location.tabCount, {
          canCloseLastTab: runtime.state.panes.length > 1,
        })
      ) {
        return false;
      }
      // 変更理由: CLOSE_TABはpaneId内だけを検索するため、別ペインの対象を
      // 選択中ペインへ誤送信しないよう所有ペインも明示する。
      dispatchForTab(runtime, location, tabActions.closeTab(location.tab.id), true);
      return true;
    case TAB_COMMAND_IDS.PIN_SET:
      // 変更理由: 固定状態を「切り替える」ではなく「指定状態にする」ことで、
      // メニューの連打や二重イベントでも意図しない反転を起こさない。
      if (typeof request.args.pinned !== "boolean" || location.tab.pinned === request.args.pinned) {
        return false;
      }
      // TOGGLE_PINもpaneId内だけを更新するため、所有ペインを必ず添付する。
      dispatchForTab(runtime, location, tabActions.togglePin(location.tab.id), true);
      return true;
    case TAB_COMMAND_IDS.CLOSE_OTHER:
      // 変更理由: 切り離し中のタブも同じペインの配列に残るため、表示中タブだけでなく
      // ストア上の実体を基準に判定し、既存の一括閉鎖の意味を維持する。
      if (!hasClosableOtherTabs(location.tabs, location.tab.id)) {
        return false;
      }
      // CLOSE_OTHER_TABSはpaneId内だけを検索するため、対象タブの所有ペインを渡す。
      dispatchForTab(runtime, location, tabActions.closeOtherTabs(location.tab.id), true);
      return true;
    case TAB_COMMAND_IDS.CLOSE_RIGHT: {
      if (!hasClosableRightTabs(location.tabs, location.tab.id)) {
        return false;
      }
      // CLOSE_RIGHT_TABSも対象タブのペイン内だけを更新するため、所有ペインを明示する。
      dispatchForTab(runtime, location, tabActions.closeRightTabs(location.tab.id), true);
      return true;
    }
    case TAB_COMMAND_IDS.CLOSE_ALL:
      // 変更理由: 切り離し中のタブを含む対象ペインの一括閉鎖は、既存reducerの
      // 「固定タブを残して新しい1枚へ置き換える」動作に委譲する。
      dispatchForTab(runtime, location, tabActions.closeAllTabs(), true);
      return true;
    case TAB_COMMAND_IDS.REOPEN:
      if (!canReopenClosedTab(runtime.state)) {
        return false;
      }
      // 変更理由: 閉じたタブ履歴は全ペイン共有だが、復元先は操作元タブのペインに
      // 固定し、別窓を閉じた後にメインペインへ復元される競合を避ける。
      dispatchForTab(runtime, location, tabActions.reopenClosedTab(), true);
      return true;
    case TAB_COMMAND_IDS.OPEN_RIGHT:
      // 変更理由: 右ペインの生成・移動先選択はreducerが一括して扱うため、
      // コマンド側では元タブの所有ペインとタブIDだけを明示して委譲する。
      if (!canOpenInRightPane(runtime.state, location.paneId)) {
        return false;
      }
      dispatchForTab(runtime, location, tabActions.openInRightPane(location.tab.id), true);
      return true;
  }
}
