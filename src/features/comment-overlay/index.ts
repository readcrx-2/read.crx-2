// comment-overlay の公開 API。他の機能はここからだけ import する（計画書 §3.5）。
// 機能の中のファイルは自己循環を避けるため、この index を経由せず直接 import する。
export type { CommentCandidate } from "./domain";
export { projectCommentResponse } from "./domain";
export type { CommentOverlayWindowPlatform } from "./platform";
export { COMMENT_OVERLAY_WINDOW_LABEL, commentOverlayWindowPlatform } from "./platform";
// 注意: CSS を import する UI 部品はここから出さない。index を import した別のエントリ
// （replay など）や browser.css に、使わない CSS が入るため（OverlayStage で約 20KB 増えた）。
