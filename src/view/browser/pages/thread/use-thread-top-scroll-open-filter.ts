import { useEffect, useRef } from "react";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import type { TopBarMode } from "src/view/browser/pages/thread/use-thread-top-bar";
import { getEventTargetElement } from "src/view/browser/utils/dom";
import { findThreadScrollContainer } from "src/view/browser/utils/thread-read-state";

interface UseThreadTopScrollOpenFilterParams {
  activeTopBar: TopBarMode;
  closeTopBar: () => void;
  isActive: boolean;
  openFilterToolbar: () => void;
  rootRef: React.RefObject<HTMLDivElement | null>;
}

const TOP_SCROLL_TOLERANCE_PX = 1;

export function useThreadTopScrollOpenFilter({
  activeTopBar,
  closeTopBar,
  isActive,
  openFilterToolbar,
  rootRef,
}: UseThreadTopScrollOpenFilterParams): void {
  const { window: viewWindow } = useViewSurface();
  const openedByWheelRef = useRef(false);

  useEffect(() => {
    if (activeTopBar === "none") {
      openedByWheelRef.current = false;
    }
  }, [activeTopBar]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const scrollContainer = findThreadScrollContainer(rootRef.current);
    if (!scrollContainer) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        return;
      }

      // メニューやポップアップ上のホイール操作はフィルタ開閉に反映しない。
      // ポップアップは data-popup="true" 属性を持ち、
      // その他オーバーレイ要素も独自のスクロール挙動を持つため除外する。
      const eventTarget = getEventTargetElement(event.target, viewWindow);
      if (
        eventTarget?.closest("[data-popup='true']") ||
        eventTarget?.closest(".mini-window") ||
        eventTarget?.closest(".media-viewer") ||
        eventTarget?.closest(".bookmark-root-dialog")
      ) {
        return;
      }

      if (event.deltaY > 0 && activeTopBar === "filter" && openedByWheelRef.current) {
        // 変更理由: メニューやショートカットで開いたフィルタまでスクロールで閉じると
        // 入力中の意図を壊すため、上端ホイールで開いたセッションだけ逆方向で閉じる。
        // この一度はスクロール自体も抑止し、フィルタを閉じた先の本文位置を維持する。
        event.preventDefault();
        openedByWheelRef.current = false;
        closeTopBar();
        return;
      }

      if (event.deltaY >= 0 || activeTopBar !== "none") {
        return;
      }

      if (scrollContainer.scrollTop > TOP_SCROLL_TOLERANCE_PX) {
        return;
      }

      // 変更理由: スレ最上部でさらに上へ送った操作だけを「フィルタを見たい」意思として扱い、
      // 通常のスクロール途中やピンチズームでは誤ってツールバーを開かないようにする。
      openedByWheelRef.current = true;
      openFilterToolbar();
    };

    scrollContainer.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      scrollContainer.removeEventListener("wheel", handleWheel);
    };
  }, [activeTopBar, closeTopBar, isActive, openFilterToolbar, rootRef, viewWindow]);
}
