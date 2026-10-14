import { useCallback, useEffect, useState } from "react";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import {
  THREAD_FILTER_TOOLBAR_TOGGLE_EVENT,
  type ThreadFilterToolbarToggleDetail,
} from "src/view/browser/utils/filter-toolbar-events";

const TOP_BAR_EVENT_BY_MODE = {
  search: "thread-search-toggle",
  filter: THREAD_FILTER_TOOLBAR_TOGGLE_EVENT,
} as const;

export type TopBarMode = "none" | "filter";

interface UseThreadTopBarParams {
  tabId: string;
  isActive: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  clearFilter: () => void;
  hasActiveFilter?: boolean;
}

interface UseThreadTopBarResult {
  activeTopBar: TopBarMode;
  closeTopBar: () => void;
  closeTopBarPreservingFilter: () => void;
  openFilterToolbar: () => void;
  searchFocusKey: number;
}

export function useThreadTopBar({
  tabId,
  isActive,
  searchQuery,
  setSearchQuery,
  clearFilter,
  hasActiveFilter = false,
}: UseThreadTopBarParams): UseThreadTopBarResult {
  const { window: viewWindow } = useViewSurface();
  const [activeTopBar, setActiveTopBar] = useState<TopBarMode>(() =>
    searchQuery.trim() !== "" || hasActiveFilter ? "filter" : "none",
  );
  const [searchFocusKey, setSearchFocusKey] = useState(0);

  const closeTopBar = useCallback(() => {
    if (searchQuery) {
      setSearchQuery("");
    }
    // 変更理由: 手動でフィルタバーを閉じた後に見えているレスと内部の絞り込み状態が
    // 食い違わないよう、検索語とフィルタ条件を同じクローズ操作で解除する。
    clearFilter();
    setActiveTopBar("none");
  }, [clearFilter, searchQuery, setSearchQuery]);

  const closeTopBarPreservingFilter = useCallback(() => {
    // 変更理由: ホイールで閉じる操作はツールバーの表示だけを戻し、
    // 入力済みの検索語による絞り込みは維持する。
    setActiveTopBar("none");
  }, []);

  const toggleFilterToolbar = useCallback(() => {
    // 検索欄を同じツールバーへ統合したので、フィルタ操作は表示状態だけを反転させる。
    if (activeTopBar === "filter") {
      closeTopBar();
    } else {
      setActiveTopBar("filter");
    }
  }, [activeTopBar, closeTopBar]);

  const openFilterToolbar = useCallback(() => {
    // 変更理由: ホイールなどの「開くだけでよい」導線では toggle だと閉じ戻り得るため、
    // 明示的な open API を用意して入力欄の表示を安定させる。
    setActiveTopBar("filter");
  }, []);

  const openFilterToolbarForSearch = useCallback(() => {
    // 検索は独立バーではなく同じツールバー内で開き、
    // スクロール中でも即入力欄へ移れるよう focus 用キーを更新する。
    setActiveTopBar("filter");
    setSearchFocusKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    const handleSearchToggle = () => {
      openFilterToolbarForSearch();
    };
    const handleFilterToggle = (event: Event) => {
      const detail = (event as CustomEvent<ThreadFilterToolbarToggleDetail>).detail;
      if (detail?.tabId != null && (!isActive || detail.tabId !== tabId)) {
        return;
      }
      toggleFilterToolbar();
    };

    viewWindow.addEventListener(TOP_BAR_EVENT_BY_MODE.search, handleSearchToggle);
    viewWindow.addEventListener(TOP_BAR_EVENT_BY_MODE.filter, handleFilterToggle);

    return () => {
      viewWindow.removeEventListener(TOP_BAR_EVENT_BY_MODE.search, handleSearchToggle);
      viewWindow.removeEventListener(TOP_BAR_EVENT_BY_MODE.filter, handleFilterToggle);
    };
  }, [isActive, openFilterToolbarForSearch, tabId, toggleFilterToolbar, viewWindow]);

  return {
    activeTopBar,
    closeTopBar,
    closeTopBarPreservingFilter,
    openFilterToolbar,
    searchFocusKey,
  };
}
