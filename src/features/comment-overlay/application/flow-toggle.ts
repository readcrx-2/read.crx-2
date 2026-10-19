import type { CommentOverlayController, CommentOverlayControllerSnapshot } from "./controller";

/**
 * 実況の開始・表示切り替え・停止を、ステータス項目と同じ順序で実行する。
 *
 * 変更理由: ステータス項目とコマンドパレットが別々に判定すると、実況中の表示切り替えと
 * 新規開始の境界がずれるため、判定を一箇所へ集約する。
 */
export function toggleCommentOverlayFlow(
  controller: CommentOverlayController,
  snapshot: Pick<CommentOverlayControllerSnapshot, "state" | "visible">,
  threadUrl: string | null,
): Promise<void> {
  if (snapshot.state.status === "running") {
    // 表示中なら停止し、非表示なら実況を止めずに表示だけ戻す。
    return snapshot.visible ? controller.stop() : controller.setVisible(true);
  }

  if (threadUrl == null) {
    // 停止中で対象スレッドもない場合は、開始先が決まらないので何もしない。
    return Promise.resolve();
  }
  return controller.start(threadUrl);
}
