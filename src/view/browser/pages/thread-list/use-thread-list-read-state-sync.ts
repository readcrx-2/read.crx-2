import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { getBoardUrlKey } from "src/core/board/BoardUrlNormalizer";
import { container } from "src/service-container/index";
import type { IReadState, IThread } from "src/service-container/interfaces";
import {
  getAutoRefreshThreadPageKey,
  isAutoRefreshEnabledForPage,
} from "src/view/browser/state/tabs/auto-refresh-pages";
import { useActivePaneId, usePaneId, useTabPanes } from "src/view/browser/state/tabs/use-tab-store";
import { getCurrentPage } from "src/view/browser/types";

interface UseThreadListReadStateSyncOptions {
  boardUrl: string;
  isActive: boolean;
  setThreads: Dispatch<SetStateAction<IThread[]>>;
}

/**
 * 既読通知(read_state_updated / read_state_removed)を一覧へ反映する。
 *
 * 変更理由: 裏側の一覧が他ペインのスレ自動更新に合わせて書き換わるとチラつくため、
 * フォアグラウンド判定と保留・復帰時の一括反映をここに閉じ込め、一覧の描画から分離する。
 */
export function useThreadListReadStateSync({
  boardUrl,
  isActive,
  setThreads,
}: UseThreadListReadStateSyncOptions): void {
  // 変更理由: 非表示中の read_state 系 message を保留し、表示復帰時に適用するため。
  // 2ペイン時は自ペインの表タブでもフォーカス外なら裏側扱いにし、スレ側の
  // 自動更新による既読書き換えで一覧がチラつかないようにする。
  // タイマー実行自体は止めない（フォーカス外でも自動更新は継続する）。
  const ownPaneId = usePaneId();
  const focusedPaneId = useActivePaneId();
  const { panes } = useTabPanes();
  const isForeground = isActive && ownPaneId === focusedPaneId;
  const isForegroundRef = useRef(isForeground);
  isForegroundRef.current = isForeground;
  const autoRefreshingThreadPageKeys = useMemo(() => {
    const pageKeys = new Set<string>();

    for (const pane of panes) {
      const activeTab = pane.tabs.find((tab) => tab.id === pane.activeTabId);
      if (!activeTab) {
        continue;
      }

      const activePage = getCurrentPage(activeTab);
      if (activePage.type === "thread" && isAutoRefreshEnabledForPage(activeTab, activePage)) {
        pageKeys.add(getAutoRefreshThreadPageKey(activePage.threadUrl));
      }
    }

    return pageKeys;
  }, [panes]);
  const autoRefreshingThreadPageKeysRef = useRef(autoRefreshingThreadPageKeys);
  autoRefreshingThreadPageKeysRef.current = autoRefreshingThreadPageKeys;
  const pendingReadStateRef = useRef<{ updated: IReadState[]; removed: string[] }>({
    updated: [],
    removed: [],
  });
  // 変更理由: 長時間フォーカスが戻らない場合も想定し、同一スレの古い既読は
  // 最新だけ残して保留列の肥大化を防ぐ。ref のみ触るため useCallback で固定する。
  const enqueuePendingReadState = useCallback((readState: IReadState) => {
    const pending = pendingReadStateRef.current.updated;
    const existingIndex = pending.findIndex((entry) => entry.url === readState.url);
    if (existingIndex >= 0) {
      pending[existingIndex] = readState;
      return;
    }
    pending.push(readState);
    if (pending.length > 500) {
      pending.splice(0, pending.length - 500);
    }
  }, []);
  useEffect(() => {
    const pageBoardKey = getBoardUrlKey(boardUrl);
    const applyReadStateUpdated = (readState: IReadState) => {
      setThreads((prev) =>
        prev.map((thread) => {
          if (thread.url !== readState.url) {
            return thread;
          }

          if (thread.readState && !container.util.isNewerReadState(thread.readState, readState)) {
            return thread;
          }

          return {
            ...thread,
            readState,
          };
        }),
      );
    };

    const applyReadStateRemoved = (url: string) => {
      // 変更理由: スレ一覧タブは非アクティブ時も mounted のまま残るため、
      // 読了後に戻った時点で未読列が古いままにならないよう message で追従する。
      setThreads((prev) =>
        prev.map((thread) =>
          thread.url === url
            ? {
                ...thread,
                readState: undefined,
              }
            : thread,
        ),
      );
    };

    // 変更理由: 2ペイン時、スレ側の自動更新で既読位置が進むたび global な
    // read_state_updated が飛び、裏側の一覧まで毎回書き換わって「勝手に自動更新」
    // に見えていた。フォアグラウンド（一覧タブ表示中かつ自ペインフォーカス中）
    // 以外の間は保留し、復帰時にまとめて適用することで裏側のチラつきを抑えつつ
    // 未読列の鮮度も保つ。タイマー実行自体は止めない。
    const handleReadStateUpdated = ({
      board_url: boardUrlFromMessage,
      read_state: readState,
    }: {
      board_url?: string;
      read_state?: IReadState;
    }) => {
      // 変更理由: エッヂでは一覧の板URLと既読通知の板URLが http/https と
      // 通常形式/旧形式で異なるため、同じ板を表すキーで通知を判定する。
      const sameBoard =
        boardUrlFromMessage === boardUrl ||
        (boardUrlFromMessage != null &&
          pageBoardKey != null &&
          getBoardUrlKey(boardUrlFromMessage) === pageBoardKey);
      if (!readState || !sameBoard) {
        return;
      }

      if (!isForegroundRef.current) {
        enqueuePendingReadState(readState);
        return;
      }

      // 変更理由: フォーカスが一覧側へ移っても、別ペインのスレ自動更新が
      // 既読通知を送るたびに一覧の未読数を書き換えると、一覧自身が自動更新
      // されたように見える。自動更新中のスレ由来の通知は、その処理が終わる
      // まで保留し、一覧の表示をユーザー操作なしで動かさない。
      if (autoRefreshingThreadPageKeysRef.current.has(getAutoRefreshThreadPageKey(readState.url))) {
        enqueuePendingReadState(readState);
        return;
      }
      applyReadStateUpdated(readState);
    };

    const handleReadStateRemoved = ({ url }: { url?: string }) => {
      if (!url) {
        return;
      }

      if (!isForegroundRef.current) {
        pendingReadStateRef.current.removed.push(url);
        return;
      }
      applyReadStateRemoved(url);
    };

    container.message.on("read_state_updated", handleReadStateUpdated);
    container.message.on("read_state_removed", handleReadStateRemoved);

    return () => {
      container.message.off("read_state_updated", handleReadStateUpdated);
      container.message.off("read_state_removed", handleReadStateRemoved);
    };
  }, [boardUrl, enqueuePendingReadState, setThreads]);

  useEffect(() => {
    if (!isForeground) {
      return;
    }
    // フォアグラウンド復帰時に保留分をまとめて反映する。ネットワーク再取得はしない。
    const pending = pendingReadStateRef.current;
    const deferredUpdated = pending.updated.filter((readState) =>
      autoRefreshingThreadPageKeys.has(getAutoRefreshThreadPageKey(readState.url)),
    );
    const applicableUpdated = pending.updated.filter(
      (readState) => !autoRefreshingThreadPageKeys.has(getAutoRefreshThreadPageKey(readState.url)),
    );
    if (applicableUpdated.length === 0 && pending.removed.length === 0) {
      return;
    }
    // 自動更新中のスレ由来の通知は、フォーカスが一覧へ戻っても保留を続ける。
    // タブ側の自動更新状態が解除されたレンダーで、deferredUpdated も反映される。
    pendingReadStateRef.current = { updated: deferredUpdated, removed: [] };
    for (const readState of applicableUpdated) {
      setThreads((prev) =>
        prev.map((thread) => {
          if (thread.url !== readState.url) {
            return thread;
          }
          if (thread.readState && !container.util.isNewerReadState(thread.readState, readState)) {
            return thread;
          }
          return { ...thread, readState };
        }),
      );
    }
    for (const url of pending.removed) {
      setThreads((prev) =>
        prev.map((thread) => (thread.url === url ? { ...thread, readState: undefined } : thread)),
      );
    }
  }, [autoRefreshingThreadPageKeys, isForeground, setThreads]);
}
