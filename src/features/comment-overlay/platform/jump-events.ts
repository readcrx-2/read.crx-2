import { emit, listen } from "@tauri-apps/api/event";
import { createLogger } from "src/app/logger";

const logger = createLogger("comment-overlay");

export const COMMENT_OVERLAY_JUMP_EVENT_NAME = "chlens://comment-overlay-jump";

export interface CommentOverlayJumpRequest {
  threadUrl: string;
  responseNumber: number;
}

/** Overlayと本体は別WebViewなので、レスの移動要求は専用のTauri eventで渡す。 */
export async function publishCommentOverlayJump(request: CommentOverlayJumpRequest): Promise<void> {
  await emit(COMMENT_OVERLAY_JUMP_EVENT_NAME, request);
}

export async function subscribeCommentOverlayJump(
  listener: (request: CommentOverlayJumpRequest) => void,
): Promise<() => void> {
  return listen<unknown>(COMMENT_OVERLAY_JUMP_EVENT_NAME, ({ payload }) => {
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("threadUrl" in payload) ||
      typeof payload.threadUrl !== "string" ||
      !("responseNumber" in payload) ||
      typeof payload.responseNumber !== "number" ||
      !Number.isInteger(payload.responseNumber) ||
      payload.responseNumber <= 0
    ) {
      logger.error("コメントOverlayのレスジャンプ要求を検証できません:", payload);
      return;
    }
    listener({ threadUrl: payload.threadUrl, responseNumber: payload.responseNumber });
  });
}
