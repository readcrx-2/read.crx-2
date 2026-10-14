import React, { useCallback, useState } from "react";
import { useTabCommandRunner } from "src/features/tabs/browser/use-tab-command-runner";
import { TAB_COMMAND_IDS } from "src/view/browser/commands/tab-command-runtime";
import { ContextMenuNavigationActions } from "src/view/browser/components/ContextMenuNavigationActions";
import { useQuickAccessFilterToolbar } from "src/view/browser/hooks/use-quick-access-filter-toolbar";
import { buildCategoryId } from "src/view/browser/pages/board-list/board-list-utils";
import { BoardListContent } from "src/view/browser/pages/board-list/BoardListContent";
import { ContextMenuHandler } from "src/view/browser/pages/board-list/ContextMenuHandler";
import { SearchBarSection } from "src/view/browser/pages/board-list/SearchBarSection";
import { useBoardListDisplay } from "src/view/browser/pages/board-list/use-board-list-display";
import { useBoardListLogic } from "src/view/browser/pages/board-list/use-board-list-logic";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import { canGoBack, canGoForward } from "src/view/browser/types";
import { isPageRefreshable } from "src/view/browser/utils/refreshable-pages";

interface BoardListPageProps {
  tabId: string;
  isActive: boolean;
  refreshKey: number;
}

export const BoardListPage: React.FC<BoardListPageProps> = ({ tabId, isActive, refreshKey }) => {
  const { viewTab, viewPage, dispatch } = useTabStore();
  const runTabCommand = useTabCommandRunner(tabId);
  const {
    categories,
    loading,
    error,
    openStates,
    removedBoardUrls,
    removedMenuNames,
    removedCategoryIds,
    openedBoardEntries,
    fetchMenu,
    handleRemoveBoard,
    handleRemoveMenu,
    handleRemoveCategory,
    updateOpenStates,
  } = useBoardListLogic(refreshKey);

  const { displayMenus, searchQuery, setSearchQuery, openedMenuValues } = useBoardListDisplay({
    tabId,
    categories,
    openStates,
    removedBoardUrls,
    removedMenuNames,
    removedCategoryIds,
    openedBoardEntries,
    updateOpenStates,
  });

  const { isFilterOpen, closeFilterToolbar } = useQuickAccessFilterToolbar({
    pageType: "boardList",
    tabId,
    isActive,
    searchQuery,
    setSearchQuery,
  });

  const [contextMenuState, setContextMenuState] = useState<
    | {
        type: "board";
        x: number;
        y: number;
        boardName: string;
        boardUrl: string;
      }
    | { type: "menu"; x: number; y: number; menuName: string }
    | {
        type: "category";
        x: number;
        y: number;
        menuName: string;
        categoryName: string;
      }
    | null
  >(null);

  const handleBoardClick = useCallback(
    (boardUrl: string, boardTitle: string) => {
      dispatch(
        tabActions.navigate({
          type: "threadList",
          title: boardTitle,
          boardUrl,
          boardTitle,
        }),
      );
    },
    [dispatch],
  );

  const handleBoardMiddleClick = useCallback(
    (boardUrl: string, boardTitle: string) => {
      // ミドルクリックはバックグラウンドで開く（設定に関わらず常にバックグラウンドタブ）
      dispatch(
        tabActions.openInNewTab(
          {
            type: "threadList",
            title: boardTitle,
            boardUrl,
            boardTitle,
          },
          { background: true },
        ),
      );
    },
    [dispatch],
  );

  const handleMenuAccordionChange = useCallback(
    (openedMenuNames: string[]) => {
      updateOpenStates((prev) => {
        const next = { ...prev };
        for (const menu of categories) {
          next[menu.name] = openedMenuNames.includes(menu.name);
        }
        return next;
      });
    },
    [categories, updateOpenStates],
  );

  const handleCategoryAccordionChange = useCallback(
    (menuName: string, openedCategoryIds: string[]) => {
      updateOpenStates((prev) => {
        const next = { ...prev };
        const menu = categories.find((entry) => entry.name === menuName);
        if (!menu) {
          return next;
        }

        for (const category of menu.categories) {
          const categoryId = buildCategoryId(menuName, category.name);
          next[categoryId] = openedCategoryIds.includes(categoryId);
        }

        return next;
      });
    },
    [categories, updateOpenStates],
  );

  // 表示されている板数をカウント
  const hitCount = displayMenus.reduce(
    (sum, menu) =>
      sum +
      menu.categories.reduce((categorySum, category) => categorySum + category.boards.length, 0),
    0,
  );

  const contextMenuNavigationActions = contextMenuState ? (
    <ContextMenuNavigationActions
      canGoBack={canGoBack(viewTab)}
      canGoForward={canGoForward(viewTab)}
      canRefresh={isPageRefreshable(viewPage)}
      onBack={() => {
        runTabCommand(TAB_COMMAND_IDS.BACK);
        setContextMenuState(null);
      }}
      onForward={() => {
        runTabCommand(TAB_COMMAND_IDS.FORWARD);
        setContextMenuState(null);
      }}
      onRefresh={() => {
        // 変更理由: 板一覧の更新対象はタブ履歴ではなくBBSメニューなので、
        // この画面では強制取得を直接呼び出して最新の板構成を反映する。
        void fetchMenu(true);
        setContextMenuState(null);
      }}
    />
  ) : null;

  return (
    <div>
      <SearchBarSection
        isOpen={isFilterOpen}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        onClose={closeFilterToolbar}
        hitCount={hitCount}
      />

      <BoardListContent
        loading={loading}
        error={error}
        displayMenus={displayMenus}
        openStates={openStates}
        openedMenuValues={openedMenuValues}
        onMenuAccordionChange={handleMenuAccordionChange}
        onCategoryAccordionChange={handleCategoryAccordionChange}
        onBoardClick={handleBoardClick}
        onBoardMiddleClick={handleBoardMiddleClick}
        onContextMenu={setContextMenuState}
        onRetry={() => fetchMenu(true)}
      />

      <ContextMenuHandler
        state={contextMenuState}
        onRemoveBoard={handleRemoveBoard}
        onRemoveMenu={handleRemoveMenu}
        onRemoveCategory={handleRemoveCategory}
        header={contextMenuNavigationActions}
        onClose={() => setContextMenuState(null)}
      />
    </div>
  );
};
