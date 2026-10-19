import { useCallback, useEffect, useState } from "react";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import {
  THREAD_FILTER_TOOLBAR_TOGGLE_EVENT,
  type ThreadFilterToolbarToggleDetail,
} from "src/view/browser/utils/filter-toolbar-events";
import { setFilterToolbarOpen } from "src/view/browser/utils/filter-toolbar-open-state";

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
  /** 設定により、検索語やフィルタがなくてもバーを開いた状態で始める。 */
  openByDefault?: boolean;
}

interface UseThreadTopBarResult {
  activeTopBar: TopBarMode;
  closeTopBar: () => void;
  closeTopBarPreservingFilter: () => void;
  openFilterToolbar: () => void;
  searchFocusKey: number;
  /** 設定で開いた直後は、閲覧中のキー操作を奪わないよう入力欄へフォーカスしない。 */
  suppressInitialFocus: boolean;
}

export function useThreadTopBar({
  tabId,
  isActive,
  searchQuery,
  setSearchQuery,
  clearFilter,
  hasActiveFilter = false,
  openByDefault = false,
}: UseThreadTopBarParams): UseThreadTopBarResult {
  const { window: viewWindow } = useViewSurface();
  const [activeTopBar, setActiveTopBarState] = useState<TopBarMode>(() =>
    searchQuery.trim() !== "" || hasActiveFilter || openByDefault ? "filter" : "none",
  );
  const [searchFocusKey, setSearchFocusKey] = useState(0);
  // 検索語やフィルタが無く、設定だけで開いたときに限りフォーカスを移さない。
  const [suppressInitialFocus, setSuppressInitialFocus] = useState(
    () => openByDefault && searchQuery.trim() === "" && !hasActiveFilter,
  );
  // 利用者の操作でバーの状態が変わったら、以降は通常どおり入力欄へフォーカスする。
  const setActiveTopBar = useCallback((mode: TopBarMode) => {
    setSuppressInitialFocus(false);
    setActiveTopBarState(mode);
  }, []);

  useEffect(() => {
    setFilterToolbarOpen(tabId, activeTopBar === "filter");
    return () => {
      setFilterToolbarOpen(tabId, false);
    };
  }, [activeTopBar, tabId]);

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
    suppressInitialFocus,
  };
}
