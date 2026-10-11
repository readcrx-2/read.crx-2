import { AlertTriangle, MessagesCircle, Move } from "lucide-react";
import React, { useCallback, useRef, useState } from "react";
import { isTauriRuntime } from "src/app/platform/runtime";
import { useCommentOverlay } from "src/features/comment-overlay/application/use-comment-overlay";
import { useOpenOverlayPlacementWindow } from "src/features/comment-overlay/ui/OverlayPlacementWindow";
import { useTabStore } from "src/features/tabs/browser/use-tab-store";
import { MiniWindow } from "src/view/browser/components/MiniWindow";
import {
  MiniWindowNote,
  MiniWindowSection,
  MiniWindowSeparator,
  MiniWindowToggle,
} from "src/view/browser/components/MiniWindowControls";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { StatusBarItem } from "src/view/browser/components/StatusBar";
import { useMiniWindowTrigger } from "src/view/browser/hooks/use-mini-window-trigger";

interface CommentOverlayStatusItemProps {
  isActive: boolean;
}

/** Tauri版のスレッドだけに実況操作を表示し、Browser版のUI契約を変えない。 */
export const CommentOverlayStatusItem: React.FC<CommentOverlayStatusItemProps> = ({ isActive }) => {
  const { viewPage } = useTabStore();
  const { controller, snapshot } = useCommentOverlay();
  const openOverlayPlacementWindow = useOpenOverlayPlacementWindow();
  const [isFlowChanging, setIsFlowChanging] = useState(false);
  const flowChangingRef = useRef(false);
  const isTauri = isTauriRuntime();
  const threadUrl = viewPage.type === "thread" ? viewPage.threadUrl : null;
  // 変更理由: 別スレッドへ移動した後に、直前のスレッド向け操作が開いたままに
  // 見えないよう、ステータス項目の対象が変わるタイミングで小窓を閉じる。
  const {
    triggerRef: miniWindowTriggerRef,
    anchor: miniWindowAnchor,
    toggle: toggleMiniWindow,
    close: closeMiniWindow,
  } = useMiniWindowTrigger(threadUrl);

  const isRunning = snapshot.state.status === "running";
  const isFlowing = isRunning && snapshot.visible;
  const errorLabel = snapshot.error == null ? null : `コメント実況エラー: ${snapshot.error}`;

  const handleFlowToggle = useCallback(() => {
    if (flowChangingRef.current || (!isRunning && !threadUrl)) return;
    // Reactの次の描画前の連打もrefで抑え、完了前の古いON/OFF状態で逆操作を始めない。
    flowChangingRef.current = true;
    setIsFlowChanging(true);
    // 変更理由: Overlay表示と実況開始は利用者にとって同じ操作なので、単一ボタンから
    // controller.startへ渡し、表示だけONで新着が流れない中間状態を作らない。
    const operation = isFlowing
      ? controller.stop()
      : isRunning
        ? controller.setVisible(true)
        : controller.start(threadUrl!);
    void operation
      .catch((error: unknown) => {
        console.error("[ChLens] コメント実況の切り替えに失敗しました:", error);
      })
      .finally(() => {
        flowChangingRef.current = false;
        setIsFlowChanging(false);
      });
  }, [controller, isFlowing, isRunning, threadUrl]);

  const openPlacementWindow = useCallback(() => {
    // 調整は別窓で行うため小窓は閉じる。切り離したタブの窓から開いた場合も、
    // クリック元の窓を起点にしてポップアップ許可を引き継ぐ。
    const sourceWindow = miniWindowTriggerRef.current?.ownerDocument.defaultView ?? undefined;
    closeMiniWindow();
    openOverlayPlacementWindow(sourceWindow);
  }, [closeMiniWindow, miniWindowTriggerRef, openOverlayPlacementWindow]);

  if (!isTauri || !isActive || (threadUrl == null && !isRunning)) return null;

  const flowLabel = isFlowing ? "コメントを画面に流す: ON" : "コメントを画面に流す: OFF";
  const statusLabel =
    errorLabel ??
    (isFlowing ? "コメントOverlay制御: 実況中・表示中" : "コメントOverlay制御: 停止中");

  return (
    <>
      {/* 実況操作を左端へ置き、実況中も共通のボタン色を使ってバー全体の見た目を揃える。 */}
      <StatusBarItem
        id="comment-overlay-status"
        alignment="left"
        priority={STATUS_BAR_PRIORITY.left.commentOverlay}
        title={statusLabel}
        interactive
      >
        <button
          ref={miniWindowTriggerRef}
          type="button"
          className="status-bar__btn"
          onClick={toggleMiniWindow}
          title={statusLabel}
          aria-label={statusLabel}
        >
          {/* 変更理由: 通常の単一メッセージと区別し、複数レスの実況機能を示す。 */}
          {errorLabel ? (
            <AlertTriangle size={13} aria-hidden="true" />
          ) : (
            <MessagesCircle size={13} aria-hidden="true" />
          )}
          <span className="status-bar__btn-label">実況</span>
        </button>
      </StatusBarItem>

      {miniWindowAnchor && (
        <MiniWindow
          title="コメントOverlay"
          anchor={miniWindowAnchor}
          onClose={closeMiniWindow}
          triggerRef={miniWindowTriggerRef}
        >
          <MiniWindowSection>
            <MiniWindowToggle
              label="コメントを画面に流す"
              checked={isFlowing}
              onToggle={handleFlowToggle}
              disabled={isFlowChanging || (!isRunning && threadUrl == null)}
              busy={isFlowChanging}
              buttonLabel={flowLabel}
            />
            <MiniWindowNote>表示中のスレッドの新着レスをOverlayへ流します</MiniWindowNote>
          </MiniWindowSection>

          <MiniWindowSeparator />

          <MiniWindowSection>
            <button type="button" className="mini-window__action-btn" onClick={openPlacementWindow}>
              <Move size={14} aria-hidden="true" />
              <span>表示位置を調整…</span>
            </button>
          </MiniWindowSection>

          {errorLabel && (
            <>
              <MiniWindowSeparator />
              <MiniWindowSection>
                <MiniWindowNote>{errorLabel}</MiniWindowNote>
              </MiniWindowSection>
            </>
          )}
        </MiniWindow>
      )}
    </>
  );
};
