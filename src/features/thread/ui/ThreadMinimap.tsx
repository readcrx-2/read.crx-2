import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { Tooltip } from "src/view/browser/ui/Tooltip";
import { getResizeObserverForWindow, isHTMLElementInWindow } from "src/view/browser/utils/dom";

interface ThreadMinimapProps {
  rootRef: React.RefObject<HTMLDivElement | null>;
  repIndex: Map<number, Set<number>>;
  responseCount: number;
  activeTopBar: "none" | "search" | "filter";
  onMarkerClick: (resNum: number) => void;
}

interface MinimapFrame {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface MinimapMetrics {
  scrollHeight: number;
  clientHeight: number;
  scale: number;
  viewportHeightPx: number;
  viewportTopPx: number;
  maxViewportTop: number;
}

interface MinimapMarkerHit {
  resNum: number;
  x: number;
  y: number;
  radius: number;
}

interface MinimapResponseHit {
  resNum: number;
  top: number;
  bottom: number;
}

const MINIMAP_MIN_WIDTH = 30;
const MINIMAP_MAX_WIDTH = 180;
const MINIMAP_WIDTH_RATIO = 0.08;
const MINIMAP_CONTENT_GAP = 10;
const MINIMAP_MIN_DRAWABLE_HEIGHT = 80;
const MINIMAP_MARKER_SNAP_DISTANCE = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getOffsetTopWithinAncestor(
  el: HTMLElement,
  ancestor: HTMLElement,
  targetWindow: Window = globalThis.window,
): number {
  let top = 0;
  let current: HTMLElement | null = el;

  while (current && current !== ancestor) {
    top += current.offsetTop;
    current = isHTMLElementInWindow(current.offsetParent, targetWindow)
      ? current.offsetParent
      : null;
  }

  if (current === ancestor) {
    return top;
  }

  // offsetParent チェーンで祖先へ辿れないケースは rect 差分で補正する。
  const elRect = el.getBoundingClientRect();
  const ancestorRect = ancestor.getBoundingClientRect();
  return ancestor.scrollTop + (elRect.top - ancestorRect.top);
}

function isSameFrame(left: MinimapFrame | null, right: MinimapFrame | null): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }

  return (
    left.top === right.top &&
    left.left === right.left &&
    left.width === right.width &&
    left.height === right.height
  );
}

export const ThreadMinimap: React.FC<ThreadMinimapProps> = ({
  rootRef,
  repIndex,
  responseCount,
  activeTopBar,
  onMarkerClick,
}) => {
  const { window: viewWindow } = useViewSurface();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRafRef = useRef<number | null>(null);
  const markerHitsRef = useRef<MinimapMarkerHit[]>([]);
  const responseHitsRef = useRef<MinimapResponseHit[]>([]);
  const hoverLineYRef = useRef<number | null>(null);
  // 変更理由: pointerUp時のコールバックから最新のスティッチ先を読むため、
  // hoveredResNum stateと同期したrefを持つ。stateだけではclosureが古くなる。
  const hoveredResNumRef = useRef<number | null>(null);
  const pointerStateRef = useRef({
    isDragging: false,
    pointerId: -1,
    mode: "idle" as "idle" | "scroll" | "marker",
    dragOffset: 0,
    startX: 0,
    startY: 0,
    markerResNum: null as number | null,
  });
  const [frame, setFrame] = useState<MinimapFrame | null>(null);
  const [hoveredResNum, setHoveredResNum] = useState<number | null>(null);

  const getScrollContainer = useCallback((): HTMLElement | null => {
    const host = rootRef.current;
    if (!host) {
      return null;
    }

    const panel = host.closest(".content-area__tab-panel");
    return isHTMLElementInWindow(panel, viewWindow) ? panel : null;
  }, [rootRef, viewWindow]);

  const getResponsesRoot = useCallback((): HTMLElement | null => {
    const host = rootRef.current;
    if (!host) {
      return null;
    }
    const responses = host.querySelector(".thread-page__responses");
    return isHTMLElementInWindow(responses, viewWindow) ? responses : null;
  }, [rootRef, viewWindow]);

  const getTopBarRoot = useCallback((): HTMLElement | null => {
    const host = rootRef.current;
    if (!host) {
      return null;
    }
    const topBar = host.querySelector(".thread-page__top-bar");
    return isHTMLElementInWindow(topBar, viewWindow) ? topBar : null;
  }, [rootRef, viewWindow]);

  const setHostMinimapWidth = useCallback(
    (widthPx: number) => {
      const host = rootRef.current;
      if (!host) {
        return;
      }
      host.style.setProperty("--thread-minimap-width", `${Math.max(0, widthPx)}px`);
      host.classList.toggle("thread-page--with-minimap", widthPx > 0);
    },
    [rootRef],
  );

  const updateFrame = useCallback(() => {
    const scrollContainer = getScrollContainer();
    const topBar = getTopBarRoot();
    if (!scrollContainer || responseCount === 0) {
      setFrame((prev) => (prev === null ? prev : null));
      setHostMinimapWidth(0);
      return;
    }

    const rect = scrollContainer.getBoundingClientRect();
    const topBarRect = topBar?.getBoundingClientRect() ?? null;
    // 上部バーの種類に関係なく bottom をミニマップ上端に揃え、重なりを避ける。
    const top = clamp(topBarRect?.bottom ?? rect.top, rect.top, rect.bottom);
    const availableHeight = rect.bottom - top;
    if (availableHeight < MINIMAP_MIN_DRAWABLE_HEIGHT || rect.width < 280) {
      setFrame((prev) => (prev === null ? prev : null));
      setHostMinimapWidth(0);
      return;
    }

    const width = clamp(
      Math.round(viewWindow.innerWidth * MINIMAP_WIDTH_RATIO),
      MINIMAP_MIN_WIDTH,
      MINIMAP_MAX_WIDTH,
    );

    const scrollbarWidth = Math.max(0, scrollContainer.offsetWidth - scrollContainer.clientWidth);
    // スクロールバーと重なるとドラッグ操作が失敗しやすいので、バー幅ぶん左へ逃がす。
    // 変更理由: 右端の余白は設けず、ペイン基準の右端へスクロールバー直前まで寄せる。
    const preferredLeft = rect.right - scrollbarWidth - width;
    const left = Math.max(rect.left + 8, preferredLeft);

    const nextFrame: MinimapFrame = {
      // ミニマップ上端 = toolbar bottom を満たし、重なりを完全に避ける。
      top,
      left,
      width,
      height: availableHeight,
    };

    setFrame((prev) => {
      // レイアウトが不変なのに毎回新しい object を入れると、
      // frame 依存 callback/effect が連鎖して passive effect loop になる。
      return isSameFrame(prev, nextFrame) ? prev : nextFrame;
    });
    // 本文をミニマップの下に潜り込ませないため、同じ幅を右余白として予約する。
    setHostMinimapWidth(width + MINIMAP_CONTENT_GAP);
  }, [getScrollContainer, getTopBarRoot, responseCount, setHostMinimapWidth, viewWindow]);

  const getMetrics = useCallback((): MinimapMetrics | null => {
    const scrollContainer = getScrollContainer();
    const currentFrame = frame;
    if (!scrollContainer || !currentFrame) {
      return null;
    }

    const scrollHeight = Math.max(scrollContainer.scrollHeight, 1);
    const clientHeight = Math.max(scrollContainer.clientHeight, 1);
    const scale = currentFrame.height / scrollHeight;
    const viewportHeightPx = Math.max(clientHeight * scale, 6);
    const viewportTopPx = scrollContainer.scrollTop * scale;
    const maxViewportTop = Math.max(currentFrame.height - viewportHeightPx, 0);

    return {
      scrollHeight,
      clientHeight,
      scale,
      viewportHeightPx,
      viewportTopPx,
      maxViewportTop,
    };
  }, [frame, getScrollContainer]);

  const draw = useCallback(() => {
    markerHitsRef.current = [];
    responseHitsRef.current = [];
    const canvas = canvasRef.current;
    const scrollContainer = getScrollContainer();
    const responsesRoot = getResponsesRoot();
    const metrics = getMetrics();
    const currentFrame = frame;
    if (!canvas || !scrollContainer || !responsesRoot || !metrics || !currentFrame) {
      return;
    }

    const dpr = viewWindow.devicePixelRatio || 1;
    const cssWidth = Math.max(1, Math.round(currentFrame.width));
    const cssHeight = Math.max(1, Math.round(currentFrame.height));
    const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
    const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const responsesTop = getOffsetTopWithinAncestor(responsesRoot, scrollContainer, viewWindow);
    const minY = 6;
    const maxY = cssHeight - 6;
    const markerX = cssWidth - 6;
    const markerHitRadius = 12;
    const markerHits: MinimapMarkerHit[] = [];
    const responseHits: MinimapResponseHit[] = [];

    for (const resEl of responsesRoot.querySelectorAll<HTMLElement>("[data-res-num]")) {
      const resNum = Number.parseInt(resEl.dataset.resNum ?? "", 10);
      if (!Number.isFinite(resNum) || resNum <= 0 || resEl.offsetHeight === 0) {
        continue;
      }

      const top = (responsesTop + resEl.offsetTop) * metrics.scale;
      responseHits.push({
        resNum,
        top,
        bottom: top + resEl.offsetHeight * metrics.scale,
      });
    }
    responseHitsRef.current = responseHits;

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = "bold 12px system-ui, sans-serif";

    for (const [resNum, responders] of repIndex.entries()) {
      const count = responders.size;
      if (count < 3) {
        continue;
      }

      const resEl = responsesRoot.querySelector(`[data-res-num="${resNum}"]`);
      if (!isHTMLElementInWindow(resEl, viewWindow) || resEl.offsetHeight === 0) {
        continue;
      }

      const markerHeight = Math.max(resEl.offsetHeight * metrics.scale, 4);
      const centerY = (responsesTop + resEl.offsetTop) * metrics.scale + markerHeight / 2;
      const y = clamp(centerY, minY, maxY);

      ctx.fillStyle = count >= 5 ? "rgba(220, 40, 40, 0.95)" : "rgba(255, 140, 0, 0.9)";
      ctx.fillText("◀", markerX, y);
      // 実際の三角記号より広い当たり判定を持たせ、細いミニマップでもクリックしやすくする。
      markerHits.push({
        resNum,
        x: markerX,
        y,
        radius: markerHitRadius,
      });
    }
    markerHitsRef.current = markerHits;

    ctx.fillStyle = "rgba(26, 115, 232, 0.28)";
    ctx.fillRect(0, metrics.viewportTopPx, cssWidth, metrics.viewportHeightPx);

    ctx.strokeStyle = "rgba(26, 115, 232, 0.82)";
    ctx.strokeRect(
      0.5,
      metrics.viewportTopPx + 0.5,
      cssWidth - 1,
      Math.max(metrics.viewportHeightPx - 1, 1),
    );

    if (hoverLineYRef.current != null) {
      const hoverLineY = hoverLineYRef.current;
      ctx.beginPath();
      ctx.moveTo(0, hoverLineY + 0.5);
      ctx.lineTo(cssWidth, hoverLineY + 0.5);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(26, 115, 232, 0.95)";
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(0, 0, 0, 0.12)";
    ctx.strokeRect(0.5, 0.5, cssWidth - 1, cssHeight - 1);
    ctx.restore();
  }, [frame, getMetrics, getResponsesRoot, getScrollContainer, repIndex, viewWindow]);

  const findMarkerByPoint = useCallback(
    (relativeX: number, relativeY: number): MinimapMarkerHit | null => {
      let nearest: MinimapMarkerHit | null = null;
      let nearestDistSq = Number.POSITIVE_INFINITY;

      for (const marker of markerHitsRef.current) {
        const dx = relativeX - marker.x;
        const dy = relativeY - marker.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= marker.radius * marker.radius && distSq < nearestDistSq) {
          nearest = marker;
          nearestDistSq = distSq;
        }
      }

      return nearest;
    },
    [],
  );

  const scheduleDraw = useCallback(() => {
    if (drawRafRef.current != null) {
      return;
    }
    // 同期的な requestAnimationFrame stub でも完了後に予約済み扱いへ戻らないよう、
    // callback が先に走った場合は null を維持する。
    drawRafRef.current = -1;
    const requestId = viewWindow.requestAnimationFrame(() => {
      drawRafRef.current = null;
      draw();
    });
    if (drawRafRef.current != null) {
      drawRafRef.current = requestId;
    }
  }, [draw, viewWindow]);

  const updateHoverLine = useCallback(
    (relativeY: number) => {
      let nextY = relativeY;
      let nearestDistance = MINIMAP_MARKER_SNAP_DISTANCE + 1;
      let nextResNum: number | null = null;

      for (const marker of markerHitsRef.current) {
        const distance = Math.abs(relativeY - marker.y);
        if (distance <= MINIMAP_MARKER_SNAP_DISTANCE && distance < nearestDistance) {
          nextY = marker.y;
          nearestDistance = distance;
          nextResNum = marker.resNum;
        }
      }

      if (nextResNum == null) {
        let nearestResponseDistance = Number.POSITIVE_INFINITY;
        for (const response of responseHitsRef.current) {
          const distance =
            nextY < response.top
              ? response.top - nextY
              : nextY > response.bottom
                ? nextY - response.bottom
                : 0;
          if (distance < nearestResponseDistance) {
            nextResNum = response.resNum;
            nearestResponseDistance = distance;
          }
        }
      }

      // 人気レスの近傍だけマーカー位置へ吸着させ、細いミニマップでも狙いやすくする。
      hoverLineYRef.current = nextY;
      hoveredResNumRef.current = nextResNum;
      setHoveredResNum((current) => (current === nextResNum ? current : nextResNum));
      scheduleDraw();
    },
    [scheduleDraw],
  );

  const scrollByPointer = useCallback(
    (relativeY: number, useDragOffset: boolean) => {
      const scrollContainer = getScrollContainer();
      const metrics = getMetrics();
      if (!scrollContainer || !metrics) {
        return;
      }

      const dragOffset = pointerStateRef.current.dragOffset;
      let viewportTop = useDragOffset
        ? relativeY - dragOffset
        : relativeY - metrics.viewportHeightPx / 2;
      viewportTop = clamp(viewportTop, 0, metrics.maxViewportTop);

      const scrollableRange = metrics.scrollHeight - metrics.clientHeight;
      const ratio = metrics.maxViewportTop === 0 ? 0 : viewportTop / metrics.maxViewportTop;
      const targetTop = scrollableRange <= 0 ? 0 : ratio * scrollableRange;

      scrollContainer.scrollTo({ top: targetTop, behavior: "auto" });
    },
    [getMetrics, getScrollContainer],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      const metrics = getMetrics();
      const currentFrame = frame;
      if (!metrics || !currentFrame) {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);

      const relativeX = event.clientX - currentFrame.left;
      const relativeY = clamp(event.clientY - currentFrame.top, 0, currentFrame.height);
      updateHoverLine(relativeY);
      const markerHit = findMarkerByPoint(relativeX, relativeY);
      if (markerHit) {
        pointerStateRef.current.isDragging = true;
        pointerStateRef.current.pointerId = event.pointerId;
        pointerStateRef.current.mode = "marker";
        pointerStateRef.current.dragOffset = 0;
        pointerStateRef.current.startX = relativeX;
        pointerStateRef.current.startY = relativeY;
        pointerStateRef.current.markerResNum = markerHit.resNum;
        return;
      }

      const inViewport =
        relativeY >= metrics.viewportTopPx &&
        relativeY <= metrics.viewportTopPx + metrics.viewportHeightPx;

      pointerStateRef.current.isDragging = true;
      pointerStateRef.current.pointerId = event.pointerId;
      pointerStateRef.current.mode = "scroll";
      pointerStateRef.current.dragOffset = inViewport
        ? relativeY - metrics.viewportTopPx
        : metrics.viewportHeightPx / 2;
      pointerStateRef.current.startX = relativeX;
      pointerStateRef.current.startY = relativeY;
      pointerStateRef.current.markerResNum = null;

      scrollByPointer(relativeY, inViewport);
    },
    [findMarkerByPoint, frame, getMetrics, scrollByPointer, updateHoverLine],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const currentFrame = frame;
      if (!currentFrame) {
        return;
      }
      const relativeY = clamp(event.clientY - currentFrame.top, 0, currentFrame.height);
      updateHoverLine(relativeY);

      if (
        !pointerStateRef.current.isDragging ||
        pointerStateRef.current.pointerId !== event.pointerId
      ) {
        return;
      }
      if (pointerStateRef.current.mode !== "scroll") {
        return;
      }

      event.preventDefault();
      scrollByPointer(relativeY, true);
    },
    [frame, scrollByPointer, updateHoverLine],
  );

  const handlePointerLeave = useCallback(() => {
    if (pointerStateRef.current.isDragging) {
      return;
    }
    hoverLineYRef.current = null;
    hoveredResNumRef.current = null;
    setHoveredResNum(null);
    scheduleDraw();
  }, [scheduleDraw]);

  const releasePointerState = useCallback(() => {
    pointerStateRef.current.isDragging = false;
    pointerStateRef.current.pointerId = -1;
    pointerStateRef.current.mode = "idle";
    pointerStateRef.current.dragOffset = 0;
    pointerStateRef.current.startX = 0;
    pointerStateRef.current.startY = 0;
    pointerStateRef.current.markerResNum = null;
  }, []);

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (
        !pointerStateRef.current.isDragging ||
        pointerStateRef.current.pointerId !== event.pointerId
      ) {
        return;
      }

      event.preventDefault();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (pointerStateRef.current.mode === "marker") {
        const currentFrame = frame;
        if (currentFrame && pointerStateRef.current.markerResNum != null) {
          const relativeX = event.clientX - currentFrame.left;
          const relativeY = clamp(event.clientY - currentFrame.top, 0, currentFrame.height);
          const moveX = relativeX - pointerStateRef.current.startX;
          const moveY = relativeY - pointerStateRef.current.startY;
          const movedDistanceSq = moveX * moveX + moveY * moveY;
          // 軽微なブレはクリックとして扱い、既存のジャンプ＆ハイライトへ委譲する。
          if (movedDistanceSq <= 144) {
            onMarkerClick(pointerStateRef.current.markerResNum);
          }
        }
      } else if (pointerStateRef.current.mode === "scroll") {
        const currentFrame = frame;
        if (currentFrame) {
          const relativeX = event.clientX - currentFrame.left;
          const relativeY = clamp(event.clientY - currentFrame.top, 0, currentFrame.height);
          const moveX = relativeX - pointerStateRef.current.startX;
          const moveY = relativeY - pointerStateRef.current.startY;
          const movedDistanceSq = moveX * moveX + moveY * moveY;
          // 変更理由: マーカー直上以外へのクリックはスクロールだけだったため、
          // カーソルが注目レスへスティッチ表示されているときのクリックでは
          // そのレスへ飛んで強調する。ドラッグによるスクロールでは強調しない。
          if (movedDistanceSq <= 144 && hoveredResNumRef.current != null) {
            onMarkerClick(hoveredResNumRef.current);
          }
        }
      }

      releasePointerState();
    },
    [frame, onMarkerClick, releasePointerState],
  );

  useEffect(() => {
    updateFrame();
  }, [activeTopBar, responseCount, updateFrame]);

  useEffect(() => {
    // 描画は frame/返信分布の変化にだけ追従させ、
    // レイアウト計算 effect と分離して再入ループを防ぐ。
    scheduleDraw();
  }, [frame, repIndex, responseCount, scheduleDraw]);

  useEffect(() => {
    const scrollContainer = getScrollContainer();
    if (!scrollContainer) {
      return;
    }

    const onPanelScroll = () => {
      scheduleDraw();
    };
    const onWindowResize = () => {
      updateFrame();
      scheduleDraw();
    };

    scrollContainer.addEventListener("scroll", onPanelScroll, {
      passive: true,
    });
    viewWindow.addEventListener("resize", onWindowResize);

    const ResizeObserverConstructor = getResizeObserverForWindow(viewWindow);
    const resizeObserver = ResizeObserverConstructor
      ? new ResizeObserverConstructor(() => {
          updateFrame();
          scheduleDraw();
        })
      : null;
    if (resizeObserver) {
      resizeObserver.observe(scrollContainer);
    }

    return () => {
      scrollContainer.removeEventListener("scroll", onPanelScroll);
      viewWindow.removeEventListener("resize", onWindowResize);
      resizeObserver?.disconnect();
    };
  }, [getScrollContainer, scheduleDraw, updateFrame, viewWindow]);

  useEffect(() => {
    return () => {
      if (drawRafRef.current != null) {
        viewWindow.cancelAnimationFrame(drawRafRef.current);
        drawRafRef.current = null;
      }
      setHostMinimapWidth(0);
      releasePointerState();
    };
  }, [releasePointerState, setHostMinimapWidth, viewWindow]);

  const style = useMemo<React.CSSProperties | undefined>(() => {
    if (!frame) {
      return undefined;
    }
    return {
      top: `${frame.top}px`,
      left: `${frame.left}px`,
      width: `${frame.width}px`,
      height: `${frame.height}px`,
    };
  }, [frame]);

  if (!frame) {
    return null;
  }

  return (
    <div className="thread-page__minimap" style={style} aria-hidden="true">
      <Tooltip
        label={hoveredResNum == null ? "" : `レス ${hoveredResNum}`}
        disabled={hoveredResNum == null}
        open={hoveredResNum != null}
        position="left"
        offset={12}
        zIndex="var(--sys-z-tooltip)"
      >
        <canvas
          ref={canvasRef}
          className="thread-page__minimap-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </Tooltip>
    </div>
  );
};
