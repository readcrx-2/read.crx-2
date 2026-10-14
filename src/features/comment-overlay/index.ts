// comment-overlay の公開 API。他の機能はここからだけ import する（計画書 §3.5）。
// 機能の中のファイルは自己循環を避けるため、この index を経由せず直接 import する。
export type { CommentCandidate } from "./domain";
export { projectCommentResponse } from "./domain";
export type { CommentOverlayWindowPlatform } from "./platform";
export { COMMENT_OVERLAY_WINDOW_LABEL, commentOverlayWindowPlatform } from "./platform";
