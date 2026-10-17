import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createLogger } from "src/app/logger";
import {
  type CommentOverlayGeometry,
  type CommentOverlayMonitor,
  type CommentOverlayWindowPlatform,
} from "src/features/comment-overlay/platform";
import { OverlayControlPanel } from "src/features/comment-overlay/ui/OverlayControlPanel";
import { WindowAttachmentControl } from "src/features/comment-overlay/ui/WindowAttachmentControl";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";

const logger = createLogger("comment-overlay");

type PlacementMode = "manual" | "follow";

interface OverlayPlacementPanelProps {
  platform: CommentOverlayWindowPlatform;
}

/**
 * コメントOverlayの配置方法（範囲指定／ウィンドウ追従）を排他的に切り替えて調整する。
 *
 * 変更理由: 追従中の表示領域は追従先ウィンドウの内側サイズで決まるため、
 * 「縦横比を固定」と同時に成立しない。配置方法を一つだけ選ばせ、縦横比固定と
 * 範囲のドラッグは範囲指定のときだけ操作できるようにして、矛盾した組み合わせを作らせない。
 */
export const OverlayPlacementPanel: React.FC<OverlayPlacementPanelProps> = ({ platform }) => {
  const { attachment } = platform;
  const modeName = useId();
  const [mode, setMode] = useState<PlacementMode>(() =>
    attachment?.getState().targetId != null || attachment?.getState().processPath
      ? "follow"
      : "manual",
  );
  const [isModeChanging, setIsModeChanging] = useState(platform.restorePlacement != null);
  const [monitors, setMonitors] = useState<readonly CommentOverlayMonitor[]>([]);
  const [geometry, setGeometry] = useState<CommentOverlayGeometry | null>(null);
  const [hostMonitorId, setHostMonitorId] = useState<string | null>(null);
  const { value: lockAspectRatio, setValue: setLockAspectRatio } = useConfigBooleanSetting(
    "comment_overlay_lock_aspect_ratio",
  );
  const { value: alwaysOnTop, setValue: setAlwaysOnTop } = useConfigBooleanSetting(
    "comment_overlay_always_on_top",
  );
  const geometryWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingGeometryRef = useRef<CommentOverlayGeometry | null>(null);
  const geometryQueueRef = useRef<Promise<void>>(Promise.resolve());

  const applyPendingGeometry = useCallback(() => {
    const pending = pendingGeometryRef.current;
    pendingGeometryRef.current = null;
    if (!pending) return;
    geometryQueueRef.current = geometryQueueRef.current
      .then(() => platform.setGeometry(pending))
      .catch((error: unknown) => {
        logger.error("コメントOverlay表示位置の反映に失敗しました:", error);
      });
  }, [platform]);

  useEffect(() => {
    // 変更理由: Overlayは表示専用に固定したため、実モニターと現在geometryを
    // 調整窓を開いた時だけ取得し、Overlay側の再計測を発生させない。
    let disposed = false;
    // ChLensのあるモニターが判定できなくても調整はできるため、失敗はログに残して続ける。
    const hostMonitorRequest = (platform.getHostMonitorId?.() ?? Promise.resolve(null)).catch(
      (error: unknown) => {
        logger.error("ChLensを表示しているモニターの判定に失敗しました:", error);
        return null;
      },
    );
    void (async () => {
      await platform.restorePlacement?.();
      if (!disposed) {
        const state = attachment?.getState();
        setMode(state?.targetId != null || state?.processPath ? "follow" : "manual");
      }
      return Promise.all([platform.getMonitors(), platform.getGeometry(), hostMonitorRequest]);
    })()
      .then(([nextMonitors, nextGeometry, nextHostMonitorId]) => {
        if (disposed) return;
        // 別画面を一瞬表示してから切り替わらないよう、モニター一覧と同時に反映する。
        setMonitors(nextMonitors);
        setGeometry(nextGeometry);
        setHostMonitorId(nextHostMonitorId);
      })
      .catch((error: unknown) => {
        logger.error("コメントOverlay表示位置の初期化に失敗しました:", error);
      })
      .finally(() => {
        if (!disposed) setIsModeChanging(false);
      });
    return () => {
      disposed = true;
    };
  }, [attachment, platform]);

  useEffect(() => {
    // 追従による移動・サイズ変更もプレビュー上の枠へ反映する。
    let disposed = false;
    let unwatch: (() => void) | null = null;
    void platform
      .watchGeometry((nextGeometry) => {
        if (!disposed) setGeometry(nextGeometry);
      })
      .then((dispose) => {
        if (disposed) dispose();
        else unwatch = dispose;
      })
      .catch((error: unknown) => {
        logger.error("コメントOverlay表示位置の監視に失敗しました:", error);
      });
    return () => {
      disposed = true;
      unwatch?.();
    };
  }, [platform]);

  useEffect(() => {
    return () => {
      if (geometryWriteTimerRef.current) clearTimeout(geometryWriteTimerRef.current);
      // 調整直後に窓を閉じても、最後の座標を取りこぼさずnative側へ反映する。
      applyPendingGeometry();
    };
  }, [applyPendingGeometry]);

  const handleGeometryChange = useCallback(
    (nextGeometry: CommentOverlayGeometry) => {
      // 変更理由: ドラッグ中の連続座標を40ms単位へまとめ、表示の追従性とnative IPC量を両立する。
      setGeometry(nextGeometry);
      pendingGeometryRef.current = nextGeometry;
      // native反映の間引きとは分け、閉じる直前の変更も保存する。
      void platform.saveGeometry(nextGeometry).catch((error: unknown) => {
        logger.error("コメントOverlay表示位置の保存に失敗しました:", error);
      });
      if (geometryWriteTimerRef.current) clearTimeout(geometryWriteTimerRef.current);
      geometryWriteTimerRef.current = setTimeout(() => {
        geometryWriteTimerRef.current = null;
        applyPendingGeometry();
      }, 40);
    },
    [applyPendingGeometry, platform],
  );

  const handleModeChange = useCallback(
    (nextMode: PlacementMode) => {
      if (nextMode === mode) return;
      if (nextMode === "follow" || !attachment) {
        if (geometryWriteTimerRef.current) clearTimeout(geometryWriteTimerRef.current);
        applyPendingGeometry();
        // 追従先を選ぶまでは現在の位置のまま動かさない。
        setMode(nextMode);
        return;
      }
      // 範囲指定へ戻すときは先に追従を解除し、解除前の追従で範囲が上書きされないようにする。
      setIsModeChanging(true);
      void attachment
        .setTarget(null)
        .then(() => setMode("manual"))
        .catch((error: unknown) => {
          logger.error("コメントOverlayの追従解除に失敗しました:", error);
        })
        .finally(() => setIsModeChanging(false));
    },
    [applyPendingGeometry, attachment, mode],
  );

  const isFollowing = mode === "follow";

  return (
    <div className="overlay-placement">
      {platform.setAlwaysOnTop && (
        <label className="overlay-control-panel__aspect-ratio">
          <input
            type="checkbox"
            checked={alwaysOnTop}
            onChange={(event) => setAlwaysOnTop(event.target.checked)}
          />
          常に最前面に表示する
        </label>
      )}
      {attachment && (
        <fieldset className="overlay-placement__mode" disabled={isModeChanging}>
          <legend>配置方法</legend>
          <label>
            <input
              type="radio"
              name={modeName}
              checked={!isFollowing}
              onChange={() => handleModeChange("manual")}
            />
            範囲を指定
          </label>
          <label>
            <input
              type="radio"
              name={modeName}
              checked={isFollowing}
              onChange={() => handleModeChange("follow")}
            />
            ウィンドウに追従
          </label>
        </fieldset>
      )}
      {attachment && isFollowing && <WindowAttachmentControl attachment={attachment} />}
      <OverlayControlPanel
        monitors={monitors}
        geometry={geometry}
        lockAspectRatio={lockAspectRatio}
        onLockAspectRatioChange={setLockAspectRatio}
        onGeometryChange={handleGeometryChange}
        captureMonitorPreview={platform.captureMonitorPreview}
        readOnly={isFollowing}
        initialMonitorId={hostMonitorId}
      />
    </div>
  );
};
