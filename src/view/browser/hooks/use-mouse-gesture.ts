import { type RefObject, useEffect } from "react";
import type { ViewSurface } from "src/view/browser/hooks/use-view-surface";
import type { GestureDirection, GesturePoint } from "src/view/browser/utils/gesture";
import {
  GESTURE_CONTEXTMENU_SUPPRESS_MS,
  GESTURE_START_THRESHOLD,
  summarizeVerticalGesture,
} from "src/view/browser/utils/gesture";

export function useMouseGesture(
  rootRef: RefObject<HTMLDivElement | null>,
  viewSurface?: ViewSurface,
): void {
  useEffect(() => {
    const host = rootRef.current;
    if (!host) return;

    // 変更理由: 別窓へ同じページを描画したときも、ジェスチャーのイベントと表示用
    // オーバーレイを描画先のWindow/Documentへ揃え、元画面の操作を奪わないようにする。
    const surfaceWindow = viewSurface?.window ?? window;
    const surfaceDocument = viewSurface?.document ?? document;
    const surfaceGlobal = surfaceWindow as Window & typeof globalThis;

    const resolveScrollContainer = (): HTMLElement | null => {
      const nearestPanel = host.closest(".content-area__tab-panel");
      if (nearestPanel instanceof surfaceGlobal.HTMLElement) {
        return nearestPanel;
      }

      const contentArea = host.closest(".content-area");
      if (!(contentArea instanceof surfaceGlobal.HTMLElement)) {
        return null;
      }

      const activePanel = contentArea.querySelector(".content-area__tab-panel[data-active='true']");
      if (activePanel instanceof surfaceGlobal.HTMLElement) {
        return activePanel;
      }

      // 互換性のため、旧構成（content-area 自体がスクロール）の場合は fallback する。
      return contentArea;
    };

    let points: GesturePoint[] = [];
    let isDrawing = false;
    let gestureCandidate = false;
    let gestureJustCompleted = false;
    let detectedGesture: GestureDirection | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let context: CanvasRenderingContext2D | null = null;
    let label: HTMLDivElement | null = null;
    let suppressTimerId: number | null = null;

    const isWithinHost = (target: EventTarget | null): boolean =>
      target instanceof surfaceGlobal.Node && host.contains(target);

    const clearSuppressTimer = (): void => {
      if (suppressTimerId != null) {
        surfaceWindow.clearTimeout(suppressTimerId);
        suppressTimerId = null;
      }
    };

    const resizeCanvas = (): void => {
      if (!canvas) return;
      canvas.width = surfaceWindow.innerWidth;
      canvas.height = surfaceWindow.innerHeight;
    };

    const ensureOverlay = (): void => {
      if (!canvas) {
        canvas = surfaceDocument.createElement("canvas");
        canvas.style.position = "fixed";
        canvas.style.top = "0";
        canvas.style.left = "0";
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.zIndex = "var(--sys-z-gesture)";
        canvas.style.pointerEvents = "none";
        surfaceDocument.body.appendChild(canvas);
        context = canvas.getContext("2d");
        resizeCanvas();
      }

      if (!label) {
        label = surfaceDocument.createElement("div");
        label.style.position = "fixed";
        label.style.top = "50%";
        label.style.left = "50%";
        label.style.transform = "translate(-50%, -50%)";
        label.style.fontSize = "64px";
        label.style.fontWeight = "bold";
        label.style.color = "rgba(0, 123, 255, 0.8)";
        label.style.pointerEvents = "none";
        label.style.zIndex = "var(--sys-z-gesture-label)";
        label.style.textShadow =
          "2px 2px 0 #fff, -2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff";
        label.style.fontFamily = "sans-serif";
        surfaceDocument.body.appendChild(label);
      }

      if (!context) return;

      canvas.style.display = "block";
      label.style.display = "block";
      label.textContent = "";
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.beginPath();
      context.strokeStyle = "rgba(0, 123, 255, 0.8)";
      context.lineWidth = 4;
      context.lineCap = "round";
      context.lineJoin = "round";
    };

    const stopDrawing = (): void => {
      isDrawing = false;
      gestureCandidate = false;
      points = [];
      detectedGesture = null;
      if (canvas) {
        canvas.style.display = "none";
      }
      if (label) {
        label.style.display = "none";
        label.textContent = "";
      }
    };

    const drawLine = (x: number, y: number): void => {
      if (!context) return;
      context.lineTo(x, y);
      context.stroke();
    };

    const handleMouseDown = (e: MouseEvent): void => {
      if (e.button !== 2 || !isWithinHost(e.target)) return;

      gestureCandidate = true;
      isDrawing = false;
      points = [{ x: e.clientX, y: e.clientY }];
      detectedGesture = null;
    };

    const handleMouseMove = (e: MouseEvent): void => {
      if (!gestureCandidate) return;

      points.push({ x: e.clientX, y: e.clientY });

      if (!isDrawing) {
        const start = points[0];
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) < GESTURE_START_THRESHOLD) {
          return;
        }

        ensureOverlay();
        if (!context) return;
        context.moveTo(start.x, start.y);
        isDrawing = true;
      }

      drawLine(e.clientX, e.clientY);

      if (detectedGesture || points.length <= 2 || !label) {
        return;
      }

      const summary = summarizeVerticalGesture(points);
      if (!summary) return;

      detectedGesture = summary.direction;
      label.textContent = summary.direction === "Up" ? "▲ Top" : "▼ Bottom";
    };

    const handleMouseUp = (e: MouseEvent): void => {
      if (e.button !== 2 || !gestureCandidate) return;

      if (!isDrawing) {
        gestureCandidate = false;
        points = [];
        detectedGesture = null;
        return;
      }

      const completedGesture = detectedGesture;
      stopDrawing();
      gestureJustCompleted = true;
      clearSuppressTimer();
      suppressTimerId = surfaceWindow.setTimeout(() => {
        gestureJustCompleted = false;
        suppressTimerId = null;
      }, GESTURE_CONTEXTMENU_SUPPRESS_MS);

      const scrollContainer = resolveScrollContainer();
      if (!scrollContainer) {
        return;
      }

      if (completedGesture === "Up") {
        scrollContainer.scrollTop = 0;
      } else if (completedGesture === "Down") {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    };

    const handleContextMenu = (e: MouseEvent): void => {
      const targetWithinHost = isWithinHost(e.target);

      if (isDrawing || gestureJustCompleted) {
        if (targetWithinHost || gestureJustCompleted) {
          e.preventDefault();
          e.stopPropagation();
          stopDrawing();
          gestureJustCompleted = false;
          clearSuppressTimer();
        }
        return;
      }

      if (gestureCandidate && targetWithinHost) {
        gestureCandidate = false;
        points = [];
        detectedGesture = null;
      }
    };

    const handleWindowBlur = (): void => {
      stopDrawing();
      gestureJustCompleted = false;
      clearSuppressTimer();
    };

    surfaceDocument.addEventListener("mousedown", handleMouseDown, true);
    surfaceDocument.addEventListener("mousemove", handleMouseMove, true);
    surfaceDocument.addEventListener("mouseup", handleMouseUp, true);
    surfaceDocument.addEventListener("contextmenu", handleContextMenu, true);
    surfaceWindow.addEventListener("resize", resizeCanvas);
    surfaceWindow.addEventListener("blur", handleWindowBlur);

    return () => {
      surfaceDocument.removeEventListener("mousedown", handleMouseDown, true);
      surfaceDocument.removeEventListener("mousemove", handleMouseMove, true);
      surfaceDocument.removeEventListener("mouseup", handleMouseUp, true);
      surfaceDocument.removeEventListener("contextmenu", handleContextMenu, true);
      surfaceWindow.removeEventListener("resize", resizeCanvas);
      surfaceWindow.removeEventListener("blur", handleWindowBlur);
      clearSuppressTimer();
      if (canvas) {
        canvas.remove();
      }
      if (label) {
        label.remove();
      }
    };
  }, [rootRef, viewSurface]);
}
