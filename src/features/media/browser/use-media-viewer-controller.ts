import {
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { platformDownloadManager } from "src/app/platform/DownloadManager";
import { isTauriRuntime } from "src/app/platform/runtime";
import { useToast } from "src/view/browser/hooks/use-toast";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";

import type { ViewerState } from "./media-viewer-types";
import {
  approachViewerTransform,
  isViewerTransformSettled,
  type ViewerTransform,
} from "./media-viewer-zoom";
import { useMediaViewerStore } from "./use-media-viewer-store";

interface ViewerSize {
  width: number;
  height: number;
}

interface ViewerPoint {
  x: number;
  y: number;
}

export interface MediaViewerProps {
  viewer: ViewerState;
  viewerStageRef: RefObject<HTMLDivElement | null>;
  viewerCanvasRef: RefObject<HTMLDivElement | null>;
  viewerImageRef: RefObject<HTMLImageElement | null>;
  canNavigateViewerPrev: boolean;
  canNavigateViewerNext: boolean;
  isLoading: boolean;
  onOverlayClick: () => void;
  onChromeClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomIn: () => void;
  onSave: () => void;
  onClose: () => void;
  onImageLoad: () => void;
  onImageError: () => void;
}

function sanitizeDownloadFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
}

function getViewerDownloadFilename(url: string): string {
  try {
    const parsed = new window.URL(url);
    const lastSegment = parsed.pathname.split("/").filter(Boolean).at(-1);
    if (lastSegment) {
      return sanitizeDownloadFilename(lastSegment);
    }
  } catch {
    // URL パース失敗時は fallback 名で保存する。
  }

  return "image";
}

function getViewerStageViewportSize(stage: HTMLDivElement): ViewerSize {
  const styles = (stage.ownerDocument.defaultView ?? window).getComputedStyle(stage);
  const borderX =
    Number.parseFloat(styles.borderLeftWidth || "0") +
    Number.parseFloat(styles.borderRightWidth || "0");
  const borderY =
    Number.parseFloat(styles.borderTopWidth || "0") +
    Number.parseFloat(styles.borderBottomWidth || "0");

  // border-box 基準で安定したサイズを取り、スクロールバー由来の揺れを避ける。
  const rect = stage.getBoundingClientRect();

  return {
    width: Math.max(1, Math.round(rect.width - borderX)),
    height: Math.max(1, Math.round(rect.height - borderY)),
  };
}

function isSameViewerSize(current: ViewerSize | null, next: ViewerSize): boolean {
  return current?.width === next.width && current?.height === next.height;
}

function getViewerStageCenter(size: ViewerSize): ViewerPoint {
  return { x: size.width / 2, y: size.height / 2 };
}

function getPointWithinStage(stage: HTMLDivElement, clientX: number, clientY: number): ViewerPoint {
  const rect = stage.getBoundingClientRect();
  const styles = (stage.ownerDocument.defaultView ?? window).getComputedStyle(stage);
  const borderLeft = Number.parseFloat(styles.borderLeftWidth || "0");
  const borderTop = Number.parseFloat(styles.borderTopWidth || "0");

  return {
    x: clientX - rect.left - borderLeft,
    y: clientY - rect.top - borderTop,
  };
}

export function useMediaViewerController(
  scopeId: string,
  surfaceKey: object | null = null,
): MediaViewerProps | null {
  // 変更理由: 書き込み別窓でもキー操作・ドラッグ・リサイズのイベントを
  // ビューアが表示されている窓で受け取り、メイン窓への誤登録を防ぐ。
  const { window: viewWindow } = useViewSurface();
  const toast = useToast();
  const viewer = useMediaViewerStore((state) =>
    state.viewerScopeId === scopeId ? state.viewer : null,
  );
  const viewerScale = useMediaViewerStore((state) =>
    state.viewerScopeId === scopeId ? state.viewerScale : 1,
  );
  const isLoading = useMediaViewerStore((state) =>
    state.viewerScopeId === scopeId ? state.isLoading : false,
  );
  const closeViewer = useMediaViewerStore((state) => state.closeViewer);
  const navigateViewer = useMediaViewerStore((state) => state.navigateViewer);
  const zoomIn = useMediaViewerStore((state) => state.zoomIn);
  const zoomOut = useMediaViewerStore((state) => state.zoomOut);
  const resetScale = useMediaViewerStore((state) => state.resetScale);
  const zoomByWheel = useMediaViewerStore((state) => state.zoomByWheel);
  const setImageLoading = useMediaViewerStore((state) => state.setImageLoading);
  const closeViewerForScope = useCallback(() => closeViewer(scopeId), [closeViewer, scopeId]);

  useEffect(() => {
    return () => {
      // 変更理由: スレッド画面を離れても共有ストアの画像だけが残ると、
      // 同じスレッドを開き直した時に前回のビューアーが再表示されるため、
      // 破棄されたスレッドの所有分だけを解放する。
      closeViewerForScope();
    };
  }, [closeViewerForScope]);

  const viewerStageRef = useRef<HTMLDivElement>(null);
  const viewerCanvasRef = useRef<HTMLDivElement>(null);
  const viewerImageRef = useRef<HTMLImageElement>(null);
  const viewerBaseSizeRef = useRef<ViewerSize | null>(null);
  const viewerStageSizeRef = useRef<ViewerSize | null>(null);
  const viewerPanRef = useRef<ViewerPoint>({ x: 0, y: 0 });
  const viewerScaleRef = useRef(1);
  const currentTransformRef = useRef<ViewerTransform | null>(null);
  const animationFrameRef = useRef<{ window: Window; id: number } | null>(null);
  const zoomPivotRef = useRef<ViewerPoint | null>(null);
  const panStateRef = useRef<{
    active: boolean;
    startPointer: ViewerPoint;
    startPan: ViewerPoint;
  }>({
    active: false,
    startPointer: { x: 0, y: 0 },
    startPan: { x: 0, y: 0 },
  });

  const stopViewerAnimation = useCallback(() => {
    const frame = animationFrameRef.current;
    if (frame) {
      frame.window.cancelAnimationFrame(frame.id);
      animationFrameRef.current = null;
    }
  }, []);

  const renderViewerTransform = useCallback(
    (animate = false) => {
      const canvas = viewerCanvasRef.current;
      const baseSize = viewerBaseSizeRef.current;
      if (!canvas || !baseSize) {
        return;
      }

      canvas.style.width = `${baseSize.width}px`;
      canvas.style.height = `${baseSize.height}px`;
      const goal: ViewerTransform = { ...viewerPanRef.current, scale: viewerScaleRef.current };
      const animationWindow = canvas.ownerDocument.defaultView ?? window;
      const paint = (view: ViewerTransform) => {
        currentTransformRef.current = view;
        canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
      };

      stopViewerAnimation();
      if (
        !animate ||
        !currentTransformRef.current ||
        animationWindow.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ) {
        paint(goal);
        return;
      }

      // 目標と描画中の状態を分け、連続入力でも表示中の位置から滑らかに追従させる。
      // 別窓へ移動した後は、その窓の時計と描画フレームを使う。
      let last = animationWindow.performance.now();
      const step = (now: number) => {
        animationFrameRef.current = null;
        const current = currentTransformRef.current;
        if (!current) return;
        const next = approachViewerTransform(current, goal, now - last);
        last = now;
        if (isViewerTransformSettled(next, goal)) {
          paint(goal);
          return;
        }
        paint(next);
        animationFrameRef.current = {
          window: animationWindow,
          id: animationWindow.requestAnimationFrame(step),
        };
      };
      animationFrameRef.current = {
        window: animationWindow,
        id: animationWindow.requestAnimationFrame(step),
      };
    },
    [stopViewerAnimation],
  );

  useLayoutEffect(() => {
    // Portalの付け替えや破棄後に、古い窓・画像へ描画し続けないようにする。
    return stopViewerAnimation;
  }, [stopViewerAnimation, surfaceKey, viewWindow]);

  const centerViewer = useCallback((stageSize: ViewerSize, baseSize: ViewerSize) => {
    const scale = viewerScaleRef.current;
    const stageCenter = getViewerStageCenter(stageSize);
    viewerPanRef.current = {
      x: stageCenter.x - (baseSize.width * scale) / 2,
      y: stageCenter.y - (baseSize.height * scale) / 2,
    };
  }, []);

  const measureViewerLayout = useCallback(() => {
    const stage = viewerStageRef.current;
    const image = viewerImageRef.current;
    if (
      !stage ||
      !image ||
      // img.src が切り替わった直後は前の画像の naturalWidth/naturalHeight が残っていることがある。
      // image.complete が false の間は旧画像の寸法で誤ったレイアウトを組んでしまうため、
      // 必ず読み込み完了（onLoad 発火済み）を確認してから計算する。
      !image.complete ||
      image.naturalWidth <= 0 ||
      image.naturalHeight <= 0
    ) {
      return;
    }

    const nextStageSize = getViewerStageViewportSize(stage);
    const fitRatio = Math.min(
      1,
      nextStageSize.width / image.naturalWidth,
      nextStageSize.height / image.naturalHeight,
    );

    const nextBaseSize: ViewerSize = {
      width: Math.max(1, Math.round(image.naturalWidth * fitRatio)),
      height: Math.max(1, Math.round(image.naturalHeight * fitRatio)),
    };

    const previousStageSize = viewerStageSizeRef.current;
    const previousBaseSize = viewerBaseSizeRef.current;

    if (
      isSameViewerSize(previousStageSize, nextStageSize) &&
      isSameViewerSize(previousBaseSize, nextBaseSize)
    ) {
      renderViewerTransform();
      return;
    }

    viewerStageSizeRef.current = nextStageSize;
    viewerBaseSizeRef.current = nextBaseSize;

    if (!previousStageSize || !previousBaseSize) {
      centerViewer(nextStageSize, nextBaseSize);
      renderViewerTransform();
      return;
    }

    // リサイズ時は viewport 中央に見えていた画像上の点を維持し、
    // 半画面化や分割表示でも「勝手に別の場所へ飛ぶ」違和感を減らす。
    const previousStageCenter = getViewerStageCenter(previousStageSize);
    const nextStageCenter = getViewerStageCenter(nextStageSize);
    const scaledPreviousWidth = previousBaseSize.width * viewerScaleRef.current;
    const scaledPreviousHeight = previousBaseSize.height * viewerScaleRef.current;
    const focusRatioX =
      scaledPreviousWidth > 0
        ? (previousStageCenter.x - viewerPanRef.current.x) / scaledPreviousWidth
        : 0.5;
    const focusRatioY =
      scaledPreviousHeight > 0
        ? (previousStageCenter.y - viewerPanRef.current.y) / scaledPreviousHeight
        : 0.5;

    viewerPanRef.current = {
      x: nextStageCenter.x - focusRatioX * nextBaseSize.width * viewerScaleRef.current,
      y: nextStageCenter.y - focusRatioY * nextBaseSize.height * viewerScaleRef.current,
    };
    renderViewerTransform();
  }, [centerViewer, renderViewerTransform]);

  const setZoomPivotToStageCenter = useCallback(() => {
    const stageSize = viewerStageSizeRef.current;
    if (!stageSize) {
      return;
    }
    zoomPivotRef.current = getViewerStageCenter(stageSize);
  }, []);

  const resetViewerSurface = useCallback(() => {
    stopViewerAnimation();
    currentTransformRef.current = null;
    viewerBaseSizeRef.current = null;
    viewerStageSizeRef.current = null;
    viewerPanRef.current = { x: 0, y: 0 };
    viewerScaleRef.current = 1;
    zoomPivotRef.current = null;
    panStateRef.current = {
      active: false,
      startPointer: { x: 0, y: 0 },
      startPan: { x: 0, y: 0 },
    };

    viewerStageRef.current?.classList.remove("media-viewer__stage--panning");

    const canvas = viewerCanvasRef.current;
    if (!canvas) {
      return;
    }

    canvas.style.removeProperty("width");
    canvas.style.removeProperty("height");
    canvas.style.removeProperty("transform");
  }, [stopViewerAnimation]);

  useLayoutEffect(() => {
    // src 切り替え直後の1フレームで旧transformが見えると拡大ちらつきになるため、
    // paint前にサーフェス状態を初期化してから次画像の描画に入る。
    resetViewerSurface();
  }, [resetViewerSurface, viewer?.src]);

  useEffect(() => {
    if (!viewer) {
      return;
    }

    const stage = viewerStageRef.current;
    if (!stage) {
      return;
    }

    measureViewerLayout();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        measureViewerLayout();
      });
      observer.observe(stage);
      return () => observer.disconnect();
    }

    viewWindow.addEventListener("resize", measureViewerLayout);
    return () => viewWindow.removeEventListener("resize", measureViewerLayout);
  }, [measureViewerLayout, surfaceKey, viewer, viewWindow]);

  useLayoutEffect(() => {
    if (!viewer) {
      return;
    }

    const stageSize = viewerStageSizeRef.current;
    if (stageSize && viewerBaseSizeRef.current) {
      // 描画途中の倍率ではなく前回の目標倍率から位置を計算し、連続入力を累積する。
      // ズーム中心にある画像上の点を固定し、ホイール操作で注目箇所がずれないようにする。
      const pivot = zoomPivotRef.current ?? getViewerStageCenter(stageSize);
      const ratio = viewerScale / viewerScaleRef.current;
      viewerPanRef.current = {
        x: pivot.x - (pivot.x - viewerPanRef.current.x) * ratio,
        y: pivot.y - (pivot.y - viewerPanRef.current.y) * ratio,
      };
    }
    viewerScaleRef.current = viewerScale;
    zoomPivotRef.current = null;
    renderViewerTransform(true);
  }, [renderViewerTransform, viewer, viewerScale]);

  useEffect(() => {
    if (!viewer) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeViewerForScope();
      } else if (event.key === "ArrowLeft") {
        navigateViewer(-1);
      } else if (event.key === "ArrowRight") {
        navigateViewer(1);
      }
    };

    viewWindow.addEventListener("keydown", onKeyDown);
    return () => viewWindow.removeEventListener("keydown", onKeyDown);
  }, [closeViewerForScope, navigateViewer, viewer, viewWindow]);

  useEffect(() => {
    if (!viewer) {
      return;
    }

    const stage = viewerStageRef.current;
    if (!stage) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomPivotRef.current = getPointWithinStage(stage, event.clientX, event.clientY);
      zoomByWheel(event.deltaY);
    };

    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [surfaceKey, viewer, zoomByWheel]);

  useEffect(() => {
    if (!viewer) {
      return;
    }

    const stage = viewerStageRef.current;
    if (!stage) {
      return;
    }

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 && event.button !== 1) {
        return;
      }

      event.preventDefault();
      panStateRef.current = {
        active: true,
        startPointer: { x: event.clientX, y: event.clientY },
        startPan: { ...viewerPanRef.current },
      };
      stage.classList.add("media-viewer__stage--panning");
    };

    const onMouseMove = (event: globalThis.MouseEvent) => {
      if (!panStateRef.current.active) {
        return;
      }

      viewerPanRef.current = {
        x: panStateRef.current.startPan.x + (event.clientX - panStateRef.current.startPointer.x),
        y: panStateRef.current.startPan.y + (event.clientY - panStateRef.current.startPointer.y),
      };
      renderViewerTransform();
    };

    const onMouseUp = (event: globalThis.MouseEvent) => {
      if ((event.button !== 0 && event.button !== 1) || !panStateRef.current.active) {
        return;
      }

      panStateRef.current.active = false;
      stage.classList.remove("media-viewer__stage--panning");
    };

    stage.addEventListener("mousedown", onMouseDown);
    viewWindow.addEventListener("mousemove", onMouseMove);
    viewWindow.addEventListener("mouseup", onMouseUp);
    return () => {
      stage.removeEventListener("mousedown", onMouseDown);
      viewWindow.removeEventListener("mousemove", onMouseMove);
      viewWindow.removeEventListener("mouseup", onMouseUp);
      stage.classList.remove("media-viewer__stage--panning");
    };
  }, [renderViewerTransform, surfaceKey, viewer, viewWindow]);

  if (!viewer) {
    return null;
  }

  const saveViewerImage = async () => {
    try {
      await platformDownloadManager.save(viewer.src, getViewerDownloadFilename(viewer.src));
      if (isTauriRuntime()) {
        // メディアビューア表示中でも結果が分かるよう、共通Toast（ビューアより高いz順）で通知する。
        toast.success("画像をダウンロードしました");
      }
    } catch (error) {
      console.error("画像の保存に失敗しました", { url: viewer.src, error });
      if (isTauriRuntime()) {
        toast.error("画像をダウンロードできませんでした");
      }
      // Tauri版では外部ブラウザへのフォールバックもWebView制約で失敗するため、
      // 取得失敗をログへ残して、意図しない別ウィンドウを開かない。
      if (!isTauriRuntime()) {
        viewWindow.open(viewer.src, "_blank", "noopener,noreferrer");
      }
    }
  };

  return {
    viewer,
    viewerStageRef,
    viewerCanvasRef,
    viewerImageRef,
    canNavigateViewerPrev: !!viewer.images && (viewer.currentIndex ?? 0) > 0,
    canNavigateViewerNext: !!viewer.images && (viewer.currentIndex ?? 0) < viewer.images.length - 1,
    isLoading,
    onOverlayClick: closeViewerForScope,
    onChromeClick: (event) => event.stopPropagation(),
    onNavigatePrev: () => navigateViewer(-1),
    onNavigateNext: () => navigateViewer(1),
    onZoomOut: () => {
      setZoomPivotToStageCenter();
      zoomOut();
    },
    onZoomReset: () => {
      setZoomPivotToStageCenter();
      resetScale();
    },
    onZoomIn: () => {
      setZoomPivotToStageCenter();
      zoomIn();
    },
    onSave: () => {
      void saveViewerImage();
    },
    onClose: closeViewerForScope,
    onImageLoad: () => {
      setImageLoading(false);
      measureViewerLayout();
    },
    onImageError: () => {
      // Rust側の取得にも失敗した場合はローディング表示を解除し、操作不能な状態を残さない。
      setImageLoading(false);
    },
  };
}
