import { ArrowDown, RefreshCw } from "lucide-react";
import React, { type RefObject, useCallback, useEffect, useState } from "react";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { getResizeObserverForWindow, isHTMLElementInWindow } from "src/view/browser/utils/dom";

interface ThreadScrollFloatingActionsProps {
  rootRef: RefObject<HTMLDivElement | null>;
  isActive: boolean;
  isAutoRefreshEnabled: boolean;
  isFilterEnabled: boolean;
  loading: boolean;
  expired: boolean;
  responseCount: number;
  onEnableAutoRefresh: () => void;
}

interface ScrollFloatingLayout {
  panelLeft: number;
  panelRight: number;
  panelBottom: number;
  distanceToBottom: number;
  isAtBottom: boolean;
  isSlightlyAboveBottom: boolean;
  minimapReservation: number;
}

const BOTTOM_EPSILON = 2;
const NEAR_BOTTOM_DISTANCE = 240;
const ACTION_BOTTOM_OFFSET = 24;

function getScrollContainer(
  root: HTMLElement,
  targetWindow: Window = globalThis.window,
): HTMLElement | null {
  const nearestPanel = root.closest(".content-area__tab-panel");
  if (isHTMLElementInWindow(nearestPanel, targetWindow)) {
    return nearestPanel;
  }

  const contentArea = root.closest(".content-area");
  if (!isHTMLElementInWindow(contentArea, targetWindow)) {
    return null;
  }

  const activePanel = contentArea.querySelector(".content-area__tab-panel[data-active='true']");
  return isHTMLElementInWindow(activePanel, targetWindow) ? activePanel : contentArea;
}

function readMinimapReservation(root: HTMLElement, targetWindow: Window): number {
  const rawValue = targetWindow.getComputedStyle(root).getPropertyValue("--thread-minimap-width");
  const reservation = Number.parseFloat(rawValue);
  return Number.isFinite(reservation) ? Math.max(0, reservation) : 0;
}

function isSameLayout(left: ScrollFloatingLayout | null, right: ScrollFloatingLayout): boolean {
  if (!left) {
    return false;
  }

  return (
    left.panelLeft === right.panelLeft &&
    left.panelRight === right.panelRight &&
    left.panelBottom === right.panelBottom &&
    left.distanceToBottom === right.distanceToBottom &&
    left.isAtBottom === right.isAtBottom &&
    left.isSlightlyAboveBottom === right.isSlightlyAboveBottom &&
    left.minimapReservation === right.minimapReservation
  );
}

/**
 * スレ本文のスクロール位置に合わせて、最下部操作を表示する。
 *
 * ミニマップはfixed配置でペインごとの矩形を使っているため、
 * この操作もviewport基準の座標へ変換する。これにより2ペイン時も
 * 画面全体の中央ではなく、現在のスレペインの中央へ表示できる。
 */
export const ThreadScrollFloatingActions: React.FC<ThreadScrollFloatingActionsProps> = ({
  rootRef,
  isActive,
  isAutoRefreshEnabled,
  isFilterEnabled,
  loading,
  expired,
  responseCount,
  onEnableAutoRefresh,
}) => {
  const { window: viewWindow } = useViewSurface();
  const [layout, setLayout] = useState<ScrollFloatingLayout | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!isActive || !root) {
      setLayout(null);
      return;
    }

    const scrollContainer = getScrollContainer(root, viewWindow);
    if (!scrollContainer || scrollContainer.dataset.active === "false") {
      setLayout(null);
      return;
    }

    let frameId: number | null = null;
    const updateLayout = () => {
      frameId = null;
      const currentRoot = rootRef.current;
      const currentScrollContainer = currentRoot
        ? getScrollContainer(currentRoot, viewWindow)
        : null;
      if (
        !currentRoot ||
        !currentScrollContainer ||
        currentScrollContainer.dataset.active === "false"
      ) {
        setLayout(null);
        return;
      }

      const rect = currentScrollContainer.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        setLayout(null);
        return;
      }

      const distanceToBottom = Math.max(
        0,
        currentScrollContainer.scrollHeight -
          (currentScrollContainer.scrollTop + currentScrollContainer.clientHeight),
      );
      const isAtBottom = distanceToBottom <= BOTTOM_EPSILON;
      const nextLayout: ScrollFloatingLayout = {
        panelLeft: rect.left,
        panelRight: rect.right,
        panelBottom: rect.bottom,
        distanceToBottom,
        isAtBottom,
        // 「ちょっとだけ上」は固定値とviewport高さの大きい方にして、
        // 小さいペインでも下端操作を見失いにくくする。
        isSlightlyAboveBottom:
          !isAtBottom && distanceToBottom <= Math.max(NEAR_BOTTOM_DISTANCE, rect.height * 0.4),
        minimapReservation: readMinimapReservation(currentRoot, viewWindow),
      };

      setLayout((previous) => (isSameLayout(previous, nextLayout) ? previous : nextLayout));
    };
    const scheduleLayout = () => {
      if (frameId != null) {
        return;
      }
      // 同期的なrequestAnimationFrame stubでも、callback内で解除した予約状態を
      // 返却後に上書きして以後のスクロール更新を止めないようにする。
      frameId = -1;
      const requestId = viewWindow.requestAnimationFrame(() => {
        frameId = null;
        updateLayout();
      });
      if (frameId != null) {
        frameId = requestId;
      }
    };

    const ResizeObserverConstructor = getResizeObserverForWindow(viewWindow);
    const resizeObserver = ResizeObserverConstructor
      ? new ResizeObserverConstructor(scheduleLayout)
      : null;
    resizeObserver?.observe(scrollContainer);
    resizeObserver?.observe(root);
    scrollContainer.addEventListener("scroll", scheduleLayout, { passive: true });
    viewWindow.addEventListener("resize", scheduleLayout);
    scheduleLayout();

    return () => {
      if (frameId != null) {
        viewWindow.cancelAnimationFrame(frameId);
      }
      resizeObserver?.disconnect();
      scrollContainer.removeEventListener("scroll", scheduleLayout);
      viewWindow.removeEventListener("resize", scheduleLayout);
    };
  }, [isActive, responseCount, rootRef, viewWindow]);

  const scrollToBottom = useCallback(() => {
    const root = rootRef.current;
    const scrollContainer = root ? getScrollContainer(root, viewWindow) : null;
    if (!scrollContainer) {
      return;
    }

    // スクロール位置を即時に確定させ、既存の自動更新境界判定も同じフレームで追従させる。
    scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: "auto" });
  }, [rootRef, viewWindow]);

  if (!layout || !isActive || isFilterEnabled || loading || expired || responseCount === 0) {
    return null;
  }

  const jumpBottom = Math.max(
    ACTION_BOTTOM_OFFSET,
    viewWindow.innerHeight - layout.panelBottom + ACTION_BOTTOM_OFFSET,
  );
  // 縦にステータスバーの下へ移動させず、上端に重ねてz-indexだけを下げて背後へ沈める。
  const autoLoadBottom = Math.max(0, viewWindow.innerHeight - layout.panelBottom);
  const centerLeft = layout.panelLeft + (layout.panelRight - layout.panelLeft) / 2;
  // CSS変数は「ミニマップ幅 + 左右の逃がし」を予約しているので、
  // その開始位置から少し左へボタンを置けばミニマップに重ならない。
  const jumpRightEdge = layout.panelRight - layout.minimapReservation - 8;
  const jumpLeft = Math.max(layout.panelLeft + 48, jumpRightEdge);

  return (
    <>
      {layout.isAtBottom && !isAutoRefreshEnabled && (
        <button
          type="button"
          className="thread-page__floating-action thread-page__floating-action--auto-load"
          style={{ left: `${centerLeft}px`, bottom: `${autoLoadBottom}px` }}
          aria-label="自動読み込みを開始"
          title="自動読み込みを開始"
          onClick={onEnableAutoRefresh}
        >
          <RefreshCw size={16} aria-hidden="true" />
          <span>自動読み込み</span>
        </button>
      )}

      {/* 少し上の範囲では本文の操作を邪魔しないよう出さず、さらに上へ離れた時だけ戻り道を示す。 */}
      {!layout.isAtBottom && !layout.isSlightlyAboveBottom && (
        <button
          type="button"
          className="thread-page__floating-action thread-page__floating-action--jump"
          style={{ left: `${jumpLeft}px`, bottom: `${jumpBottom}px` }}
          aria-label="下へジャンプ"
          title="下へジャンプ"
          onClick={scrollToBottom}
        >
          <ArrowDown size={18} aria-hidden="true" />
        </button>
      )}
    </>
  );
};
