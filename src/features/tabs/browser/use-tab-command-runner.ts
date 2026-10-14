import { useCallback, useRef } from "react";
import {
  executeTabCommandRequest,
  TAB_COMMAND_IDS,
  type TabCommandId,
} from "src/view/browser/commands/tab-command-runtime";
import { useTabStore } from "src/view/browser/state/tabs/use-tab-store";

export interface TabCommandRunnerOptions {
  /** 一覧から任意のタブを操作する時だけ指定する。 */
  readonly tabId?: string;
  /** 固定状態を設定するコマンドの目標値。 */
  readonly pinned?: boolean;
}

/**
 * 表示中のタブIDを明示して履歴・再取得・ライフサイクルコマンドを実行する。
 *
 * 変更理由: タイトルバーやコンテキストメニューが個別にdispatchを組み立てると、
 * 別窓で選択中タブへ誤送信しやすいため、対象IDの付与をフックへ集約する。
 */
export function useTabCommandRunner(
  tabId: string,
): (id: TabCommandId, options?: TabCommandRunnerOptions) => boolean {
  const tabStore = useTabStore();
  const { dispatch, stateRef, paneId } = tabStore;
  const paneState = tabStore.state;
  const fallbackStateRef = useRef({
    panes: [
      {
        id: paneId,
        tabs: paneState?.tabs ?? [],
        activeTabId: paneState?.selectedTabId ?? tabId,
      },
    ],
    activePaneId: paneId,
    closedTabs: paneState?.closedTabs ?? [],
  });
  fallbackStateRef.current = {
    panes: [
      {
        id: paneId,
        tabs: paneState?.tabs ?? [],
        activeTabId: paneState?.selectedTabId ?? tabId,
      },
    ],
    activePaneId: paneId,
    closedTabs: paneState?.closedTabs ?? [],
  };

  return useCallback(
    (id: TabCommandId, options?: TabCommandRunnerOptions) => {
      // 変更理由: 埋め込み先が古いTabStore互換実装でも、現在ペインの状態から
      // 最小限のスナップショットを組み立ててコマンド境界を利用できるようにする。
      const currentState = stateRef?.current ?? fallbackStateRef.current;
      const targetTabId = options?.tabId ?? tabId;
      if (id === TAB_COMMAND_IDS.PIN_SET) {
        // 変更理由: 固定状態を省略した呼び出しを型だけでなく実行時にも拒否し、
        // 意図しない反転を発生させない。
        if (options?.pinned === undefined) {
          return false;
        }
        return executeTabCommandRequest(
          { id, args: { tabId: targetTabId, pinned: options.pinned } },
          { state: currentState, dispatch },
        );
      }
      return executeTabCommandRequest(
        { id, args: { tabId: targetTabId } },
        { state: currentState, dispatch },
      );
    },
    [dispatch, fallbackStateRef, stateRef, tabId],
  );
}
