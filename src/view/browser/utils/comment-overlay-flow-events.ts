// コマンドパレットからコメント実況の開始・表示切り替えを要求するイベント。
// 変更理由: コマンドは実況の状態を持たないため、実況を扱う機能側の購読へイベントで渡す。
export const COMMENT_OVERLAY_FLOW_TOGGLE_EVENT = "comment-overlay-flow-toggle";

export interface CommentOverlayFlowToggleDetail {
  /** 表示中のページがスレッドならそのURL。実況中の停止・表示切り替えでは使わない。 */
  threadUrl: string | null;
}
