import "./OverlayPlacementDialog.css";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useViewSurface } from "src/features/auxiliary-window/browser/use-view-surface";
import {
  type CommentOverlayGeometry,
  type CommentOverlayMonitor,
  commentOverlayWindowPlatform,
} from "src/features/comment-overlay/platform";
import { OverlayControlPanel } from "src/features/comment-overlay/ui/OverlayControlPanel";
import { WindowAttachmentControl } from "src/features/comment-overlay/ui/WindowAttachmentControl";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";
import { Button } from "src/view/browser/ui/Button";
import { Dialog } from "src/view/browser/ui/Dialog";

interface OverlayPlacementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * コメントOverlayの追従先と表示領域を調整するダイアログ。
 * 変更理由: モニタープレビューを含む調整UIはステータスバーのミニウィンドウには大きすぎ、
 * 開くと小窓の幅が倍になっていたため、ミニウィンドウからは入口だけを残して分離した。
 */
export const OverlayPlacementDialog: React.FC<OverlayPlacementDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { document: viewDocument } = useViewSurface();
  const [monitors, setMonitors] = useState<readonly CommentOverlayMonitor[]>([]);
  const [geometry, setGeometry] = useState<CommentOverlayGeometry | null>(null);
  const { value: lockAspectRatio, setValue: setLockAspectRatio } = useConfigBooleanSetting(
    "comment_overlay_lock_aspect_ratio",
  );
  const geometryWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // テーマトークンを継承したシェル内へPortalし、ダークテーマでも色を揃える。
  const portalContainer = viewDocument.querySelector<HTMLElement>(".browser-shell");

  useEffect(() => {
    if (!open) return;
    // 変更理由: Overlayは表示専用に固定したため、実モニターと現在geometryを
    // Mainの調整ダイアログを開いた時だけ取得し、Overlay側の再計測を発生させない。
    let disposed = false;
    void Promise.all([
      commentOverlayWindowPlatform.getMonitors(),
      commentOverlayWindowPlatform.getGeometry(),
    ])
      .then(([nextMonitors, nextGeometry]) => {
        if (disposed) return;
        setMonitors(nextMonitors);
        setGeometry(nextGeometry);
      })
      .catch((error: unknown) => {
        console.error("[ChLens] コメントOverlay表示領域ダイアログの初期化に失敗しました:", error);
      });

    return () => {
      disposed = true;
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (geometryWriteTimerRef.current) clearTimeout(geometryWriteTimerRef.current);
    };
  }, []);

  const handleGeometryChange = useCallback((nextGeometry: CommentOverlayGeometry) => {
    // 変更理由: ドラッグ中の連続座標を40ms単位へまとめ、表示の追従性とnative IPC量を両立する。
    setGeometry(nextGeometry);
    if (geometryWriteTimerRef.current) clearTimeout(geometryWriteTimerRef.current);
    geometryWriteTimerRef.current = setTimeout(() => {
      geometryWriteTimerRef.current = null;
      void commentOverlayWindowPlatform
        .setGeometry(nextGeometry)
        .then(() => commentOverlayWindowPlatform.saveGeometry(nextGeometry))
        .catch((error: unknown) => {
          console.error(
            "[ChLens] コメントOverlay表示領域ダイアログからのgeometry反映に失敗しました:",
            error,
          );
        });
    }, 40);
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={portalContainer ?? undefined}>
        <Dialog.Overlay className="browser-dialog-overlay" />
        <Dialog.Content
          className="browser-dialog-content overlay-placement-dialog"
          aria-describedby={undefined}
        >
          <Dialog.Title className="browser-dialog-title">コメントの表示位置</Dialog.Title>
          {commentOverlayWindowPlatform.attachment && (
            <WindowAttachmentControl attachment={commentOverlayWindowPlatform.attachment} />
          )}
          <OverlayControlPanel
            monitors={monitors}
            geometry={geometry}
            lockAspectRatio={lockAspectRatio}
            onLockAspectRatioChange={setLockAspectRatio}
            onGeometryChange={handleGeometryChange}
            captureMonitorPreview={commentOverlayWindowPlatform.captureMonitorPreview}
          />
          <div className="overlay-placement-dialog__actions">
            <Dialog.Close asChild>
              <Button variant="subtle">閉じる</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
