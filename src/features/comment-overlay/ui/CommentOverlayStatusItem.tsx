import { AlertTriangle, MessagesCircle } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { isTauriRuntime } from "src/app/platform/runtime";
import { useCommentOverlay } from "src/features/comment-overlay/application/use-comment-overlay";
import {
  type CommentOverlayGeometry,
  type CommentOverlayMonitor,
  commentOverlayWindowPlatform,
} from "src/features/comment-overlay/platform";
import { OverlayControlPanel } from "src/features/comment-overlay/ui/OverlayControlPanel";
import { WindowAttachmentControl } from "src/features/comment-overlay/ui/WindowAttachmentControl";
import { useTabStore } from "src/features/tabs/browser/use-tab-store";
import { MiniWindow } from "src/view/browser/components/MiniWindow";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { StatusBarItem } from "src/view/browser/components/StatusBar";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";

interface CommentOverlayStatusItemProps {
  isActive: boolean;
}

/** Tauri版のスレッドだけに実況操作を表示し、Browser版のUI契約を変えない。 */
export const CommentOverlayStatusItem: React.FC<CommentOverlayStatusItemProps> = ({ isActive }) => {
  const { viewPage } = useTabStore();
  const { controller, snapshot } = useCommentOverlay();
  const [isWindowOpen, setIsWindowOpen] = useState(false);
  const [isControlPanelOpen, setIsControlPanelOpen] = useState(false);
  const [monitors, setMonitors] = useState<readonly CommentOverlayMonitor[]>([]);
  const [panelGeometry, setPanelGeometry] = useState<CommentOverlayGeometry | null>(null);
  const [isFlowChanging, setIsFlowChanging] = useState(false);
  const flowChangingRef = useRef(false);
  const { value: lockAspectRatio, setValue: setLockAspectRatio } = useConfigBooleanSetting(
    "comment_overlay_lock_aspect_ratio",
  );
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTauri = isTauriRuntime();
  const threadUrl = viewPage.type === "thread" ? viewPage.threadUrl : null;

  const isRunning = snapshot.state.status === "running";
  const isFlowing = isRunning && snapshot.visible;
  const errorLabel = snapshot.error == null ? null : `コメント実況エラー: ${snapshot.error}`;

  useEffect(() => {
    // 変更理由: 別スレッドへ移動した後に、直前のスレッド向け操作が開いたままに
    // 見えないよう、ステータス項目の対象が変わるタイミングで小窓を閉じる。
    setIsWindowOpen(false);
    setIsControlPanelOpen(false);
  }, [threadUrl]);

  useEffect(() => {
    if (!isWindowOpen || !isControlPanelOpen) return;
    // 変更理由: Overlayは表示専用に固定したため、実モニターと現在geometryを
    // Mainの操作パネルを開いた時だけ取得し、Overlay側の再計測を発生させない。
    let disposed = false;
    void Promise.all([
      commentOverlayWindowPlatform.getMonitors(),
      commentOverlayWindowPlatform.getGeometry(),
    ])
      .then(([nextMonitors, nextGeometry]) => {
        if (disposed) return;
        setMonitors(nextMonitors);
        setPanelGeometry(nextGeometry);
      })
      .catch((error: unknown) => {
        console.error("[ChLens] コメントOverlay操作パネルの初期化に失敗しました:", error);
      });

    return () => {
      disposed = true;
    };
  }, [isControlPanelOpen, isWindowOpen]);

  useEffect(() => {
    return () => {
      if (panelWriteTimerRef.current) clearTimeout(panelWriteTimerRef.current);
    };
  }, []);

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

  const handleWindowToggle = useCallback(() => {
    if (btnRef.current) {
      setAnchorRect(btnRef.current.getBoundingClientRect());
    }
    setIsWindowOpen((current) => !current);
  }, []);

  const closeWindow = useCallback(() => setIsWindowOpen(false), []);

  const handlePanelGeometryChange = useCallback((nextGeometry: CommentOverlayGeometry) => {
    // 変更理由: ドラッグ中の連続座標を40ms単位へまとめ、表示の追従性とnative IPC量を両立する。
    setPanelGeometry(nextGeometry);
    if (panelWriteTimerRef.current) clearTimeout(panelWriteTimerRef.current);
    panelWriteTimerRef.current = setTimeout(() => {
      panelWriteTimerRef.current = null;
      void commentOverlayWindowPlatform
        .setGeometry(nextGeometry)
        .then(() => commentOverlayWindowPlatform.saveGeometry(nextGeometry))
        .catch((error: unknown) => {
          console.error(
            "[ChLens] コメントOverlay操作パネルからのgeometry反映に失敗しました:",
            error,
          );
        });
    }, 40);
  }, []);

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
          ref={btnRef}
          type="button"
          className="status-bar__btn"
          onClick={handleWindowToggle}
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

      {isWindowOpen && anchorRect && (
        <MiniWindow
          title={isControlPanelOpen ? "コメントOverlay表示領域" : "コメントOverlay"}
          anchor={anchorRect}
          onClose={closeWindow}
          triggerRef={btnRef}
          width={isControlPanelOpen ? 560 : 280}
        >
          <div className="mini-window__section">
            <div className="mini-window__toggle-row">
              <span className="mini-window__toggle-label">コメントを画面に流す</span>
              <button
                type="button"
                className={`mini-window__toggle-btn${
                  isFlowing ? " mini-window__toggle-btn--on" : ""
                }`}
                onClick={handleFlowToggle}
                disabled={isFlowChanging || (!isRunning && threadUrl == null)}
                aria-busy={isFlowChanging}
                title={flowLabel}
                aria-label={flowLabel}
              >
                {isFlowing ? "ON" : "OFF"}
              </button>
            </div>
            <p className="mini-window__note">表示中のスレッドの新着レスをOverlayへ流します</p>
          </div>

          <div className="mini-window__separator" />

          <div className="mini-window__section">
            <button
              type="button"
              className="mini-window__action-btn"
              onClick={() => setIsControlPanelOpen((current) => !current)}
            >
              {isControlPanelOpen ? "表示領域パネルを閉じる" : "表示領域を調整"}
            </button>
          </div>

          {isControlPanelOpen && (
            <>
              <div className="mini-window__separator" />
              {commentOverlayWindowPlatform.attachment && (
                <WindowAttachmentControl attachment={commentOverlayWindowPlatform.attachment} />
              )}
              <OverlayControlPanel
                monitors={monitors}
                geometry={panelGeometry}
                lockAspectRatio={lockAspectRatio}
                onLockAspectRatioChange={setLockAspectRatio}
                onGeometryChange={handlePanelGeometryChange}
                captureMonitorPreview={commentOverlayWindowPlatform.captureMonitorPreview}
              />
            </>
          )}

          {errorLabel && (
            <>
              <div className="mini-window__separator" />
              <div className="mini-window__section">
                <p className="mini-window__note">{errorLabel}</p>
              </div>
            </>
          )}
        </MiniWindow>
      )}
    </>
  );
};
