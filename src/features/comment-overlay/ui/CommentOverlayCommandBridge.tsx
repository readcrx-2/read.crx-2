import { useEffect } from "react";
import { createLogger } from "src/app/logger";
import { isTauriRuntime } from "src/app/platform/runtime";
import { commentOverlayController } from "src/features/comment-overlay/application";
import { toggleCommentOverlayFlow } from "src/features/comment-overlay/application/flow-toggle";
import {
  COMMENT_OVERLAY_FLOW_TOGGLE_EVENT,
  type CommentOverlayFlowToggleDetail,
} from "src/view/browser/utils/comment-overlay-flow-events";

const logger = createLogger("comment-overlay");

/** コマンドパレットからの実況切り替えを、ステータス項目と同じ操作へ接続する。 */
export function CommentOverlayCommandBridge() {
  useEffect(() => {
    if (!isTauriRuntime()) return;

    const handleFlowToggle = (event: Event) => {
      const detail = (event as CustomEvent<CommentOverlayFlowToggleDetail>).detail;
      toggleCommentOverlayFlow(
        commentOverlayController,
        commentOverlayController.getSnapshot(),
        detail?.threadUrl ?? null,
      ).catch((error: unknown) => {
        logger.error("コマンドからのコメント実況切り替えに失敗しました:", error);
      });
    };

    window.addEventListener(COMMENT_OVERLAY_FLOW_TOGGLE_EVENT, handleFlowToggle);
    return () => {
      window.removeEventListener(COMMENT_OVERLAY_FLOW_TOGGLE_EVENT, handleFlowToggle);
    };
  }, []);

  return null;
}
