import { useCallback, useEffect, useRef, useState } from "react";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { getEventTargetElement } from "src/view/browser/utils/dom";
import {
  QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE,
  type QuickAccessFilterPageType,
  type QuickAccessFilterToggleDetail,
} from "src/view/browser/utils/filter-toolbar-events";

interface UseQuickAccessFilterToolbarParams {
  pageType: QuickAccessFilterPageType;
  tabId: string;
  isActive: boolean;
  isWheelToggleEnabled?: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

interface UseQuickAccessFilterToolbarResult {
  isFilterOpen: boolean;
  closeFilterToolbar: () => void;
}

export function useQuickAccessFilterToolbar({
  pageType,
  tabId,
  isActive,
  isWheelToggleEnabled = true,
  searchQuery,
  setSearchQuery,
}: UseQuickAccessFilterToolbarParams): UseQuickAccessFilterToolbarResult {
  const { window: viewWindow } = useViewSurface();
  const [isFilterOpen, setIsFilterOpen] = useState(() => searchQuery.trim().length > 0);
  const openedByWheelRef = useRef(false);

  const closeFilterToolbar = useCallback(() => {
    if (searchQuery) {
      setSearchQuery("");
    }
    setIsFilterOpen(false);
  }, [searchQuery, setSearchQuery]);

  useEffect(() => {
    if (!isFilterOpen) {
      openedByWheelRef.current = false;
    }
  }, [isFilterOpen]);

  useEffect(() => {
    const eventName = QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE[pageType];
    const handleToggle = (event: Event) => {
      const detail = (event as CustomEvent<QuickAccessFilterToggleDetail>).detail;
      if (!isActive || detail?.tabId !== tabId) {
        return;
      }

      if (isFilterOpen) {
        closeFilterToolbar();
      } else {
        setIsFilterOpen(true);
      }
    };

    viewWindow.addEventListener(eventName, handleToggle);

    return () => {
      viewWindow.removeEventListener(eventName, handleToggle);
    };
  }, [closeFilterToolbar, isActive, isFilterOpen, pageType, tabId, viewWindow]);

  useEffect(() => {
    // 変更理由: 一覧上端の上ホイールはフィルタを開く操作として使うため、
    // 一覧ページ側でホイール更新を登録せず、この開閉処理だけを受け付ける。
    if (!isActive || !isWheelToggleEnabled) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        return;
      }

      const eventTarget = getEventTargetElement(event.target, viewWindow);
      if (!eventTarget) return;

      // メニューやポップアップ上のホイール操作はフィルタ開閉に反映しない。
      if (
        eventTarget.closest("[data-popup='true']") ||
        eventTarget.closest(".mini-window") ||
        eventTarget.closest(".media-viewer") ||
        eventTarget.closest(".bookmark-root-dialog")
      ) {
        return;
      }

      const tabPanel = eventTarget.closest<HTMLElement>(".content-area__tab-panel");
      if (!tabPanel || tabPanel.dataset.tabPanelId !== tabId) {
        return;
      }

      const table = tabPanel.querySelector(".simple-data-table");
      if (!table) {
        return;
      }

      const scrollContainer =
        table.closest<HTMLElement>(".simple-data-table__scroller") ?? tabPanel;

      if (event.deltaY > 0 && isFilterOpen && openedByWheelRef.current) {
        // 変更理由: ホイールで開いた直後の逆方向操作はフィルタを戻す意図として消費し、
        // 同じ一操作で一覧までスクロールして位置が飛ぶのを防ぐ。
        event.preventDefault();
        openedByWheelRef.current = false;
        // 変更理由: ホイール操作はツールバー表示だけを戻す操作として扱い、
        // 適用中の検索語と絞り込み結果はそのまま維持する。
        setIsFilterOpen(false);
        return;
      }

      if (event.deltaY >= 0 || isFilterOpen) {
        return;
      }

      if (scrollContainer.scrollTop > 1) {
        return;
      }

      // 変更理由: 通常テーブルと仮想テーブルでスクロール要素が異なるため、
      // ホイール発生元のテーブルから実際のスクロール要素をたどって上端判定を統一する。
      openedByWheelRef.current = true;
      setIsFilterOpen(true);
    };

    viewWindow.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      viewWindow.removeEventListener("wheel", handleWheel);
    };
  }, [isActive, isFilterOpen, isWheelToggleEnabled, tabId, viewWindow]);

  return {
    isFilterOpen,
    closeFilterToolbar,
  };
}
