import { Window } from "@tauri-apps/api/window";
import { useEffect } from "react";
import { createLogger } from "src/app/logger";
import { isTauriRuntime } from "src/app/platform/runtime";
import { subscribeCommentOverlayJump } from "src/features/comment-overlay/platform/jump-events";
import { useDetachedTabController } from "src/features/tabs/browser/use-detached-tab-controller";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { useTabDispatch, useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import { getCurrentPage, getPageViewStateKey } from "src/view/browser/types";
import { requestThreadResJump } from "src/view/browser/utils/thread-read-state";

const logger = createLogger("comment-overlay");

/** Overlayから受け取ったレス番号を、元スレのタブ選択と本文スクロールへ接続する。 */
export function CommentOverlayJumpBridge() {
  const { stateRef } = useTabStore();
  const dispatch = useTabDispatch();
  const { isDetachedTab, focusTabWindow } = useDetachedTabController();

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    let unsubscribe: (() => void) | null = null;

    void subscribeCommentOverlayJump(({ threadUrl, responseNumber }) => {
      const state = stateRef.current;
      const threadKey = getPageViewStateKey({ type: "thread", title: "", threadUrl });
      const matches = state.panes.flatMap((pane) =>
        pane.tabs
          .filter((tab) => getPageViewStateKey(getCurrentPage(tab)) === threadKey)
          .map((tab) => ({ tab, pane })),
      );
      // 変更理由: 同じスレのタブが複数ある場合は、現在のペインで選択中のものを優先し、
      // 利用者が見ていた場所をできるだけ保ったまま目的のレスへ移動する。
      const target =
        matches.find(
          ({ tab, pane }) => pane.id === state.activePaneId && pane.activeTabId === tab.id,
        ) ??
        matches.find(({ tab, pane }) => pane.activeTabId === tab.id) ??
        matches[0];

      requestThreadResJump(
        threadUrl,
        responseNumber,
        target?.tab.id,
        true,
        target ? isDetachedTab(target.tab.id) : false,
      );
      if (target) {
        dispatch({ ...tabActions.selectTab(target.tab.id), paneId: target.pane.id });
        if (isDetachedTab(target.tab.id)) {
          focusTabWindow(target.tab.id);
          return;
        }
      } else {
        // 変更理由: 実況開始後に元タブを閉じても、コメントからレスへ戻れるよう
        // 現在のペインへ元スレを新規タブとして開く。
        dispatch(
          tabActions.openInNewTabForce(
            { type: "thread", title: threadUrl, threadUrl },
            { focus: true },
          ),
        );
      }

      void Window.getByLabel("main")
        .then((mainWindow) => mainWindow?.setFocus())
        .catch((error: unknown) => {
          logger.error("レスジャンプ先の本体窓へ移動できませんでした:", error);
        });
    })
      .then((cleanup) => {
        if (disposed) cleanup();
        else unsubscribe = cleanup;
      })
      .catch((error: unknown) => {
        logger.error("コメントOverlayのレスジャンプ監視に失敗しました:", error);
      });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [dispatch, focusTabWindow, isDetachedTab, stateRef]);

  return null;
}
