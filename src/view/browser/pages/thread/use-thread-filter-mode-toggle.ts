import { useEffect } from "react";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import type { ThreadFilter } from "src/view/browser/types";
import {
  THREAD_FILTER_MODE_TOGGLE_EVENT,
  type ThreadFilterModeToggleDetail,
} from "src/view/browser/utils/filter-toolbar-events";

interface UseThreadFilterModeToggleParams {
  tabId: string;
  isActive: boolean;
  setFilter: (update: (current: ThreadFilter) => ThreadFilter) => void;
  openFilterToolbar: () => void;
}

/**
 * コマンドパレットからのフィルタモード切り替えを、表示中のスレッドタブへ適用する。
 *
 * 変更理由: フィルタの状態はThreadPageの中にあるため、コマンドからは直接触れない。
 * 対象タブが表示中のときだけ反応させ、同じウィンドウ内の別スレッドを誤って絞り込まないようにする。
 */
export function useThreadFilterModeToggle({
  tabId,
  isActive,
  setFilter,
  openFilterToolbar,
}: UseThreadFilterModeToggleParams): void {
  const { window: viewWindow } = useViewSurface();

  useEffect(() => {
    const handleFilterModeToggle = (event: Event) => {
      const detail = (event as CustomEvent<ThreadFilterModeToggleDetail>).detail;
      if (!isActive || detail?.tabId !== tabId) return;

      // フィルタボタンと同じく、選択中のモードをもう一度選ぶと「すべて」へ戻す。
      setFilter((current) => (current === detail.filter ? "all" : detail.filter));
      // 押したモードの結果を確認できるよう、フィルタバーも開いておく。
      openFilterToolbar();
    };

    viewWindow.addEventListener(THREAD_FILTER_MODE_TOGGLE_EVENT, handleFilterModeToggle);
    return () => {
      viewWindow.removeEventListener(THREAD_FILTER_MODE_TOGGLE_EVENT, handleFilterModeToggle);
    };
  }, [isActive, openFilterToolbar, setFilter, tabId, viewWindow]);
}
