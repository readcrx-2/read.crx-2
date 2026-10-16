import { useEffect, useRef } from "react";
import { createLogger } from "src/app/logger";
import { isTauriRuntime } from "src/app/platform/runtime";
import {
  type TabStoreState,
  useTabDispatch,
  useTabStore,
} from "src/view/browser/state/tabs/use-tab-store";

import { normalizeArchiveReplayThreadUrl } from "../domain";
import {
  type ArchiveReplayMainThreadRequest,
  subscribeArchiveReplayMainThreadRequests,
} from "../platform";
import { useArchiveReplayPositionStore } from "./position-store";

const logger = createLogger("archive-replay");

interface MainThreadSyncTarget {
  sessionId: string;
  generation: number;
  paneId: string;
  tabId: string;
}

/**
 * 過去実況窓から通知された現在スレを、Mainの専用ThreadViewタブへ反映する。
 * 変更理由: 再生対象を現在の閲覧タブへ直接上書きすると、実況とは無関係の読書状態を
 * 破壊するため、最初の通知で専用タブを作り、その後は同じタブだけを再利用する。
 */
export function useArchiveReplayMainThreadSync(): void {
  const dispatch = useTabDispatch();
  const { stateRef } = useTabStore();
  const targetRef = useRef<MainThreadSyncTarget | null>(null);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let disposed = false;
    let unsubscribe: (() => void) | null = null;

    const handleRequest = (request: ArchiveReplayMainThreadRequest): void => {
      const previousTarget = targetRef.current;
      if (
        previousTarget?.sessionId === request.sessionId &&
        request.generation <= previousTarget.generation
      ) {
        return;
      }

      const page = {
        type: "thread" as const,
        title: request.title,
        threadUrl: request.threadUrl,
      };
      let target = previousTarget ? findTabById(stateRef.current, previousTarget.tabId) : null;
      // 購読の再作成やタブ移動で一時的に専用タブIDを失っても、同じスレを新規タブ化しない。
      target ??= findThreadTabByUrl(stateRef.current, request.threadUrl);

      if (target) {
        dispatch({
          type: "NAVIGATE_TAB",
          paneId: target.paneId,
          tabId: target.tabId,
          page,
        });
      } else {
        const beforeTabIds = new Set(
          stateRef.current.panes.flatMap((pane) => pane.tabs.map((tab) => tab.id)),
        );
        // Reducer内で生成したIDは同期refと実描画で異なるため、通知を受けた時点で固定する。
        dispatch({ type: "OPEN_IN_NEW_TAB_FORCE", page, focus: true, tabId: crypto.randomUUID() });

        // TabStoreのdispatchはstateRefを同期更新するため、追加されたタブを直ちに特定できる。
        const inserted = stateRef.current.panes
          .flatMap((pane) => pane.tabs.map((tab) => ({ pane, tab })))
          .find(({ tab }) => !beforeTabIds.has(tab.id));
        if (!inserted) {
          logger.error("Main同期用ThreadViewタブを作成できませんでした", {
            request,
          });
          return;
        }

        target = { paneId: inserted.pane.id, tabId: inserted.tab.id };
      }

      targetRef.current = {
        sessionId: request.sessionId,
        generation: request.generation,
        paneId: target.paneId,
        tabId: target.tabId,
      };
      useArchiveReplayPositionStore.setState({ position: { ...request, tabId: target.tabId } });
    };

    void subscribeArchiveReplayMainThreadRequests(handleRequest)
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }
        unsubscribe = cleanup;
      })
      .catch((error: unknown) => {
        logger.error("MainのThreadView同期購読に失敗しました", error);
      });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [dispatch, stateRef]);
}

function findTabById(
  state: TabStoreState,
  tabId: string,
): { paneId: string; tabId: string } | null {
  // タブを別ペインへ移動しても、同じ実況専用タブを再利用できるよう全ペインから探す。
  const pane = state.panes.find((candidate) => candidate.tabs.some((tab) => tab.id === tabId));
  return pane ? { paneId: pane.id, tabId } : null;
}

function findThreadTabByUrl(
  state: TabStoreState,
  threadUrl: string,
): { paneId: string; tabId: string } | null {
  const normalizedUrl = normalizeArchiveReplayThreadUrl(threadUrl);
  for (const pane of state.panes) {
    for (const tab of pane.tabs) {
      const page = tab.history[tab.currentIndex];
      if (
        page?.type === "thread" &&
        normalizeArchiveReplayThreadUrl(page.threadUrl) === normalizedUrl
      ) {
        return { paneId: pane.id, tabId: tab.id };
      }
    }
  }
  return null;
}
