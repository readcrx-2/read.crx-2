import type { ParsedBBSMenu } from "packages/chlib/src/index";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OpenedBoardEntry } from "src/core/board/opened-board-entries";
import {
  buildCategoryId,
  deriveOpenedBoardTitle,
  normalizeBoardUrlForRemove,
} from "src/view/browser/pages/board-list/board-list-utils";
import { useTabViewState } from "src/view/browser/state/tabs/use-tab-store";

interface DisplayBoard {
  name: string;
  url: string;
}

interface DisplayCategory {
  name: string;
  boards: DisplayBoard[];
}

interface DisplayMenu {
  name: string;
  categories: DisplayCategory[];
}

/**
 * 板一覧の表示データとフィルタリング・検索ロジック
 * - displayMenus: フィルタリングと検索が適用された表示用メニューリスト
 * - 検索中の自動展開と、検索終了時の状態復元
 * - openedMenuValues: 開いているメニューのリスト
 */
export function useBoardListDisplay(params: {
  tabId: string;
  categories: ParsedBBSMenu[];
  openStates: Record<string, boolean>;
  removedBoardUrls: Set<string>;
  removedMenuNames: Set<string>;
  removedCategoryIds: Set<string>;
  openedBoardEntries: OpenedBoardEntry[];
  updateOpenStates: (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
}) {
  const { state: persistedViewState, update: updateViewState } = useTabViewState(params.tabId, {
    type: "boardList",
    title: "板一覧",
  });
  const [searchQuery, setSearchQuery] = useState(() => persistedViewState.searchQuery ?? "");
  const savedOpenStatesRef = useRef<Record<string, boolean> | null>(null);
  const { openStates, updateOpenStates } = params;

  useEffect(() => {
    updateViewState({ searchQuery });
  }, [searchQuery, updateViewState]);

  const displayMenus = useMemo(() => {
    const {
      categories,
      removedBoardUrls,
      removedCategoryIds,
      removedMenuNames,
      openedBoardEntries,
    } = params;

    const baseMenus = categories
      .filter((menu) => !removedMenuNames.has(menu.name))
      .map((menu) => {
        const nextCategories = menu.categories
          .filter((category) => !removedCategoryIds.has(buildCategoryId(menu.name, category.name)))
          .map((category) => ({
            ...category,
            boards: category.boards.filter(
              (board) => !removedBoardUrls.has(normalizeBoardUrlForRemove(board.url)),
            ),
          }))
          .filter((category) => category.boards.length > 0);

        return {
          ...menu,
          categories: nextCategories,
        };
      })
      .filter((menu) => menu.categories.length > 0);

    const existingUrls = new Set<string>();
    for (const menu of baseMenus) {
      for (const category of menu.categories) {
        for (const board of category.boards) {
          existingUrls.add(normalizeBoardUrlForRemove(board.url));
        }
      }
    }

    const openedBoards = openedBoardEntries
      .filter((entry) => {
        const normalizedUrl = normalizeBoardUrlForRemove(entry.url);
        if (!normalizedUrl) {
          return false;
        }

        if (removedBoardUrls.has(normalizedUrl)) {
          return false;
        }

        return !existingUrls.has(normalizedUrl);
      })
      .map((entry) => ({
        name: deriveOpenedBoardTitle(entry),
        url: normalizeBoardUrlForRemove(entry.url),
      }));

    // 検索クエリの正規化
    const normalizedQuery = searchQuery.trim().toLowerCase();

    // 「一度開いた板」を統合してから検索フィルタリングを適用
    if (
      openedBoards.length > 0 &&
      !removedMenuNames.has("その他") &&
      !removedCategoryIds.has(buildCategoryId("その他", "一度開いた板"))
    ) {
      const merged = [...baseMenus];
      const otherMenuIndex = merged.findIndex((menu) => menu.name === "その他");

      if (otherMenuIndex >= 0) {
        const targetMenu = merged[otherMenuIndex];
        const categoryIndex = targetMenu.categories.findIndex(
          (category) => category.name === "一度開いた板",
        );

        if (categoryIndex >= 0) {
          const nextCategories = [...targetMenu.categories];
          nextCategories[categoryIndex] = {
            ...nextCategories[categoryIndex],
            boards: [...nextCategories[categoryIndex].boards, ...openedBoards],
          };
          merged[otherMenuIndex] = {
            ...targetMenu,
            categories: nextCategories,
          };
        } else {
          merged[otherMenuIndex] = {
            ...targetMenu,
            categories: [...targetMenu.categories, { name: "一度開いた板", boards: openedBoards }],
          };
        }
      } else {
        merged.push({
          name: "その他",
          categories: [{ name: "一度開いた板", boards: openedBoards }],
        });
      }

      if (!normalizedQuery) {
        return merged;
      }

      return applySearchFilter(merged, normalizedQuery);
    }

    if (!normalizedQuery) {
      return baseMenus;
    }

    return applySearchFilter(baseMenus, normalizedQuery);
  }, [
    params.categories,
    params.openedBoardEntries,
    params.removedBoardUrls,
    params.removedCategoryIds,
    params.removedMenuNames,
    searchQuery,
  ]);

  const openedMenuValues = useMemo(
    () => displayMenus.map((menu) => menu.name).filter((name) => params.openStates[name] ?? false),
    [displayMenus, params.openStates],
  );

  // 検索中は全ての階層を自動で開く
  useEffect(() => {
    const hasQuery = searchQuery.trim().length > 0;

    if (hasQuery) {
      // 検索開始時に現在の openStates を保存
      if (savedOpenStatesRef.current === null) {
        savedOpenStatesRef.current = { ...openStates };
      }

      // 全ての階層を開く
      updateOpenStates((prev) => {
        const allOpen: Record<string, boolean> = {};
        for (const menu of displayMenus) {
          allOpen[menu.name] = true;
          for (const category of menu.categories) {
            allOpen[buildCategoryId(menu.name, category.name)] = true;
          }
        }
        // 開閉状態の反映による再描画では、同じ状態を再保存して更新ループを起こさない。
        return Object.keys(prev).length === Object.keys(allOpen).length &&
          Object.entries(allOpen).every(([key, value]) => prev[key] === value)
          ? prev
          : allOpen;
      });
    } else {
      // 検索終了時に元の状態に戻す
      if (savedOpenStatesRef.current !== null) {
        // Reactは更新関数を後から実行できるため、refを解除する前に復元値を確保する。
        const savedOpenStates = savedOpenStatesRef.current;
        savedOpenStatesRef.current = null;
        updateOpenStates(() => savedOpenStates);
      }
    }
  }, [searchQuery, displayMenus, openStates, updateOpenStates]);

  return {
    displayMenus,
    searchQuery,
    setSearchQuery,
    openedMenuValues,
  };
}

/**
 * メニュー・カテゴリ・板に検索クエリを適用
 */
function applySearchFilter(menus: DisplayMenu[], normalizedQuery: string): DisplayMenu[] {
  return menus
    .map((menu) => {
      const menuMatch = menu.name.toLowerCase().includes(normalizedQuery);
      const nextCategories = menu.categories
        .map((category) => {
          const categoryMatch = menuMatch || category.name.toLowerCase().includes(normalizedQuery);
          const filteredBoards = categoryMatch
            ? category.boards
            : category.boards.filter((board) => {
                const title = board.name.toLowerCase();
                const url = board.url.toLowerCase();
                return title.includes(normalizedQuery) || url.includes(normalizedQuery);
              });

          return {
            ...category,
            boards: filteredBoards,
          };
        })
        .filter((category) => category.boards.length > 0);

      return {
        ...menu,
        categories: nextCategories,
      };
    })
    .filter((menu) => menu.categories.length > 0);
}
