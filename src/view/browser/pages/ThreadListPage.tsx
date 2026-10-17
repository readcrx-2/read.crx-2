import { ChURL } from "packages/chlib/src/index";
import React, { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createLogger } from "src/app/logger";
import {
  BOARD_AUTO_REFRESH_CONFIG_KEY,
  MIN_BOARD_AUTO_REFRESH_MS,
  readBoardAutoRefreshIntervalMs,
} from "src/features/auto-refresh/browser/auto-refresh-config";
import {
  readBookmarkStatus,
  useBookmarkRevision,
} from "src/features/bookmark/browser/use-bookmark-revision";
import { useNgStatus } from "src/features/ng/browser/use-ng-status";
import { useThreadTitleNgDialog } from "src/features/ng/browser/use-thread-title-ng-dialog";
import { ThreadTitleNgDialog } from "src/features/ng/ui/ThreadTitleNgDialog";
import { useTabCommandRunner } from "src/features/tabs/browser/use-tab-command-runner";
import { useTabViewRuntime } from "src/features/tabs/browser/use-tab-view-runtime";
import { createThreadContextMenuItems } from "src/features/thread/ui/thread-context-menu-items";
import {
  calcHeat,
  createHighlightDividerStyle,
  type DisplayThread,
  getThreadListCache,
  getThreadUnreadCount,
  isSortColumn,
  isSortDirection,
  isThreadVisited,
  readThreadListSortPreference,
  setThreadListCache,
  THREAD_LIST_COLUMN_VISIBILITY_LOCKED_KEYS,
  THREAD_LIST_COLUMN_VISIBILITY_STORAGE_KEY,
  THREAD_LIST_COLUMNS,
  type ThreadListSortColumn,
  type ThreadListSortPreference,
  writeThreadListSortPreference,
} from "src/features/thread-list/ui/thread-list-shared";
import { container } from "src/service-container/index";
import type { IThread } from "src/service-container/interfaces";
import type { CommandRequest } from "src/view/browser/commands/command-runtime";
import { runCommandRequest } from "src/view/browser/commands/command-runtime";
import { TAB_COMMAND_IDS } from "src/view/browser/commands/tab-command-runtime";
import { ContextMenuNavigationActions } from "src/view/browser/components/ContextMenuNavigationActions";
import { SearchBar } from "src/view/browser/components/SearchBar";
import {
  type DataTableSection,
  SimpleDataTable,
} from "src/view/browser/components/SimpleDataTable";
import {
  getThreadListPageCountKey,
  usePageCountStatus,
} from "src/view/browser/hooks/use-page-count-status";
import { useQuickAccessFilterToolbar } from "src/view/browser/hooks/use-quick-access-filter-toolbar";
import { isResolvedBoardTitle } from "src/view/browser/pages/board-list/board-list-utils";
import { useThreadListData } from "src/view/browser/pages/thread-list/use-thread-list-data";
import { useThreadListReadStateSync } from "src/view/browser/pages/thread-list/use-thread-list-read-state-sync";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { useTabStore, useTabViewState } from "src/view/browser/state/tabs/use-tab-store";
import {
  canGoBack,
  canGoForward,
  type Tab,
  type ThreadListPage as ThreadListPageType,
} from "src/view/browser/types";
import { ContextMenu } from "src/view/browser/ui/ContextMenu";
import { Spinner } from "src/view/browser/ui/Spinner";
import { getManualRefreshScopeKey, runManualRefresh } from "src/view/browser/utils/manual-refresh";
import { isPageRefreshable } from "src/view/browser/utils/refreshable-pages";
import { SCOPED_SETTINGS_CONFIG_KEY } from "src/view/browser/utils/scoped-settings";
import { ThreadListView } from "src/view/shared/ThreadListView";

const logger = createLogger("view/browser");

// 既存のページ用ユーティリティの公開位置を維持しつつ、パネル側と同じ定義を共有する。
export {
  calcHeat,
  createHighlightDividerStyle,
  getThreadListCache,
  isSortColumn,
  isSortDirection,
  readThreadListSortPreference,
  setThreadListCache,
  THREAD_LIST_COLUMN_VISIBILITY_LOCKED_KEYS,
  THREAD_LIST_COLUMN_VISIBILITY_STORAGE_KEY,
  THREAD_LIST_COLUMNS,
  writeThreadListSortPreference,
};
export type {
  DisplayThread,
  ThreadListSortColumn,
  ThreadListSortDirection,
  ThreadListSortPreference,
} from "src/features/thread-list/ui/thread-list-shared";

interface Props {
  tabId: string;
  // ContentAreaから描画対象を明示して受け取り、別の表示ホストでもペインのactiveTabに依存しない。
  tab?: Tab;
  page: ThreadListPageType;
  refreshKey: number;
  isActive: boolean;
  isAutoRefreshEnabled?: boolean;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}

function resolveInitialBoardTitle(page: ThreadListPageType): string | null {
  if (isResolvedBoardTitle(page.boardUrl, page.title)) {
    return page.title;
  }

  if (isResolvedBoardTitle(page.boardUrl, page.boardTitle)) {
    return page.boardTitle;
  }

  return null;
}

export const ThreadListPage: React.FC<Props> = ({
  tabId,
  tab,
  page,
  refreshKey,
  isActive,
  isAutoRefreshEnabled = false,
}) => {
  const { surface: viewSurface, dispatch, toast } = useTabViewRuntime(tabId);
  const { window: viewWindow, document: viewDocument } = viewSurface;
  const runTargetCommand = useCallback(
    (request: CommandRequest) => {
      void runCommandRequest(request, { surface: viewSurface, toast });
    },
    [toast, viewSurface],
  );
  const { viewTab } = useTabStore();
  const visitedBoardRef = useRef<{ url: string; lastVisited: number } | null>(null);
  const resolvedBoardTitlesRef = useRef(new Map<string, string>());
  const initialBoardTitle = resolveInitialBoardTitle(page);
  useEffect(() => {
    // スレ一覧の取得より前に名前が分かる経路も、取得確認後の保存へ引き継ぐ。
    if (initialBoardTitle) resolvedBoardTitlesRef.current.set(page.boardUrl, initialBoardTitle);
  }, [initialBoardTitle, page.boardUrl]);
  const runTabCommand = useTabCommandRunner(tabId);
  const manualRefreshScopeKey = getManualRefreshScopeKey(tabId, page);
  const requestManualRefresh = useCallback(
    () => runManualRefresh(manualRefreshScopeKey, () => runTabCommand(TAB_COMMAND_IDS.RELOAD)),
    [manualRefreshScopeKey, runTabCommand],
  );
  // 既存の直接利用者との互換性のため渡されたtabを残し、通常の描画経路ではそれを優先する。
  const navigationTab = tab ?? viewTab;
  const { state: persistedViewState, update: updateViewState } = useTabViewState(tabId, page);
  const persistedSearchQuery = persistedViewState.searchQuery;
  const persistedSortColumn = persistedViewState.sortColumn;
  const persistedSortDirection = persistedViewState.sortDirection;
  const { isNgTemporarilyDisabled, setThreadListStats } = useNgStatus();
  const { setPageCount } = usePageCountStatus();
  const pageCountKey = getThreadListPageCountKey(tabId, page.boardUrl);
  const bookmarkRevision = useBookmarkRevision();
  const { threads, setThreads, loading, showRefreshOverlay, error, fetchThreads } =
    useThreadListData({
      boardUrl: page.boardUrl,
      refreshKey,
      manualRefreshScopeKey,
      visitedBoardRef,
      resolvedBoardTitlesRef,
    });
  useThreadListReadStateSync({ boardUrl: page.boardUrl, isActive, setThreads });
  const [boardAutoRefreshIntervalMs, setBoardAutoRefreshIntervalMs] = useState(() =>
    readBoardAutoRefreshIntervalMs(page.boardUrl),
  );
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    viewDocument.visibilityState === "visible",
  );
  const [sortPreference, setSortPreference] = useState<ThreadListSortPreference>(() => {
    const column = persistedSortColumn;
    if (column === null) {
      return {
        column: null,
        direction: persistedSortDirection === "desc" ? "desc" : "asc",
      };
    }
    if (typeof column === "string" && isSortColumn(column)) {
      return {
        column,
        direction: persistedSortDirection === "desc" ? "desc" : "asc",
      };
    }
    return readThreadListSortPreference(page.boardUrl);
  });
  const [searchQuery, setSearchQuery] = useState(() => persistedSearchQuery ?? "");
  const previousBoardUrlRef = useRef(page.boardUrl);
  const skipViewStateUpdateRef = useRef(false);
  const { isFilterOpen, closeFilterToolbar } = useQuickAccessFilterToolbar({
    pageType: "threadList",
    tabId,
    isActive,
    searchQuery,
    setSearchQuery,
  });
  const [contextMenuState, setContextMenuState] = useState<{
    x: number;
    y: number;
    thread: IThread;
  } | null>(null);
  const threadTitleNgDialog = useThreadTitleNgDialog({
    toast,
    logLabel: "ThreadListPage",
  });
  const { open: openThreadTitleNgDialog } = threadTitleNgDialog;
  const { column: sortColumn, direction: sortDirection } = sortPreference;

  useEffect(() => {
    if (previousBoardUrlRef.current === page.boardUrl) {
      return;
    }

    // 保存値は板を切り替えたときだけ復元する。入力中にも view state が更新されるため、
    // そのたびに同じ値をローカル状態へ戻すと、入力イベントと競合して文字が点滅する。
    previousBoardUrlRef.current = page.boardUrl;
    // 板切り替え直後は、復元前のローカル状態を新しい板へ保存しない。
    skipViewStateUpdateRef.current = true;
    const column = persistedSortColumn;
    const nextSortPreference: ThreadListSortPreference =
      column === null
        ? {
            column: null,
            direction: persistedSortDirection === "desc" ? "desc" : "asc",
          }
        : typeof column === "string" && isSortColumn(column)
          ? {
              column,
              direction: persistedSortDirection === "desc" ? "desc" : "asc",
            }
          : readThreadListSortPreference(page.boardUrl);

    setSortPreference((previous) =>
      previous.column === nextSortPreference.column &&
      previous.direction === nextSortPreference.direction
        ? previous
        : nextSortPreference,
    );
    setSearchQuery(persistedSearchQuery ?? "");
  }, [page.boardUrl, persistedSearchQuery, persistedSortColumn, persistedSortDirection]);

  useEffect(() => {
    if (skipViewStateUpdateRef.current) {
      skipViewStateUpdateRef.current = false;
      return;
    }

    updateViewState({
      searchQuery,
      sortColumn: sortPreference.column,
      sortDirection: sortPreference.direction,
    });
  }, [searchQuery, sortPreference, updateViewState]);

  useEffect(() => {
    writeThreadListSortPreference(page.boardUrl, sortPreference);
  }, [page.boardUrl, sortPreference]);

  useEffect(() => {
    container.openedBoards.upsertOpenedBoardEntry(page.boardUrl, initialBoardTitle);
  }, [initialBoardTitle, page.boardUrl]);

  useEffect(() => {
    // スレを開かず板だけを開いた場合や既存タブの再選択も記録する。板名解決では日時を進めない。
    if (visitedBoardRef.current?.url !== page.boardUrl || isActive) {
      visitedBoardRef.current = { url: page.boardUrl, lastVisited: Date.now() };
      container.openedBoards.upsertOpenedBoardEntry(
        page.boardUrl,
        null,
        visitedBoardRef.current.lastVisited,
      );
    }
  }, [isActive, page.boardUrl]);

  useEffect(() => {
    let cancelled = false;

    // 変更理由: スレ一覧コンポーネントは再マウントされない経路があるため、
    // 「初回だけ取得」だと別板へ遷移した後のタイトルが更新されないことがある。
    if (initialBoardTitle) {
      if (initialBoardTitle !== page.title) {
        dispatch(tabActions.updateTitleForTab(tabId, initialBoardTitle, page.boardUrl));
      }
      return;
    }

    container.boardTitle
      .ask(new ChURL(page.boardUrl))
      .then((title) => {
        if (title && isResolvedBoardTitle(page.boardUrl, title)) {
          resolvedBoardTitlesRef.current.set(page.boardUrl, title);
          // タブの再描画を保存の前提にせず、遷移後に届いた名前も元の板へ残す。
          // 板名解決の遅延では閲覧日時を進めず、板を開いた時刻をそのまま保つ。
          container.openedBoards.upsertOpenedBoardEntry(page.boardUrl, title);
        }
        if (!cancelled && title) {
          dispatch(tabActions.updateTitleForTab(tabId, title, page.boardUrl));
        }
      })
      .catch((err) => {
        logger.error(err);
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch, initialBoardTitle, page.boardUrl, page.title, tabId]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsDocumentVisible(viewDocument.visibilityState === "visible");
    };

    viewDocument.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      viewDocument.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [viewDocument]);

  useEffect(() => {
    const applyInterval = () => {
      setBoardAutoRefreshIntervalMs(readBoardAutoRefreshIntervalMs(page.boardUrl));
    };

    // 変更理由: 板一覧のタイマーも対象板の上書きを読むため、
    // 共通設定とスコープ設定のどちらが変わっても現在値を再評価する。
    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (key === BOARD_AUTO_REFRESH_CONFIG_KEY || key === SCOPED_SETTINGS_CONFIG_KEY) {
        applyInterval();
      }
    };

    container.config.ready(applyInterval);
    container.message.on("config_updated", handleConfigUpdated);

    return () => {
      container.message.off("config_updated", handleConfigUpdated);
    };
  }, [page.boardUrl]);

  useEffect(() => {
    if (
      !isAutoRefreshEnabled ||
      !isActive ||
      !isDocumentVisible ||
      boardAutoRefreshIntervalMs < MIN_BOARD_AUTO_REFRESH_MS
    ) {
      return;
    }

    const timerId = viewWindow.setInterval(() => {
      if (loading) {
        return;
      }

      // タブを切り替えた瞬間に旧タブの更新が走ると体感が悪いため、
      // 一覧の自動更新は表示中タブの RELOAD 経路だけを使って発火する。
      runTabCommand(TAB_COMMAND_IDS.RELOAD);
    }, boardAutoRefreshIntervalMs);

    return () => {
      viewWindow.clearInterval(timerId);
    };
  }, [
    boardAutoRefreshIntervalMs,
    isActive,
    isAutoRefreshEnabled,
    isDocumentVisible,
    loading,
    runTabCommand,
    viewWindow,
  ]);

  // Ctrl+Fで検索バーを開く
  // useEffect(() => {
  //   const handleKeyDown = (e: KeyboardEvent) => {
  //     if (e.ctrlKey && e.key === "f") {
  //       e.preventDefault();
  //       setShowSearch(true);
  //     }
  //   };
  //   window.addEventListener("keydown", handleKeyDown);
  //   return () => window.removeEventListener("keydown", handleKeyDown);
  // }, []);

  const handleSort = useCallback((column: ThreadListSortColumn) => {
    setSortPreference((prev) => {
      if (prev.column !== column) {
        return {
          column,
          direction: "asc",
        };
      }

      if (prev.direction === "asc") {
        return {
          column,
          direction: "desc",
        };
      }

      // 3状態ソート: 昇順 → 降順 → デフォルト(未ソート)
      return {
        column: null,
        direction: "asc",
      };
    });
  }, []);

  // ソート・検索フィルタ適用後のスレッド一覧
  const displayThreads = useMemo(() => {
    // 変更理由: ブックマークは一覧取得とは別に更新されるため、revision を明示的に
    // 参照して、このメモ化結果だけを再計算すれば星表示を同期できるようにする。
    void bookmarkRevision;
    const now = Date.now();
    let list = threads.map((t, i) => ({
      thread: t,
      originalIndex: i + 1,
      isBookmarked: readBookmarkStatus(t.url),
      unreadCount: getThreadUnreadCount(t),
      heat: parseFloat(calcHeat(now, t.createdAt, t.resCount)),
    }));

    // テキスト検索フィルタ
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(({ thread }) => thread.title.toLowerCase().includes(q));
    }

    // sortColumn が null の間は取得順を維持し、デフォルト状態へ戻せるようにする。
    if (sortColumn) {
      list.sort((a, b) => {
        let cmp = 0;
        switch (sortColumn) {
          case "num":
            cmp = a.originalIndex - b.originalIndex;
            break;
          case "title":
            cmp = a.thread.title.localeCompare(b.thread.title, "ja");
            break;
          case "resCount":
            cmp = a.thread.resCount - b.thread.resCount;
            break;
          case "unreadCount":
            cmp = a.unreadCount - b.unreadCount;
            break;
          case "heat":
            cmp = a.heat - b.heat;
            break;
        }
        return sortDirection === "asc" ? cmp : -cmp;
      });
    }

    return list;
  }, [bookmarkRevision, threads, sortColumn, sortDirection, searchQuery]);

  const handleThreadClick = useCallback(
    ({ thread }: DisplayThread) => {
      dispatch(tabActions.navigate({ type: "thread", title: thread.title, threadUrl: thread.url }));
    },
    [dispatch],
  );

  // 空白部分のダブルクリックによる更新。
  // 設定が有効な場合に動作し、誤操作防止のためリンクやテキスト選択中などは除外する。
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (container.config.get("dblclick_reload") !== "on") {
        return;
      }

      const target = e.target as HTMLElement;

      // リンク、ボタン、入力系要素などは除外
      if (target.closest("a, button, input, textarea")) {
        return;
      }

      // テキスト選択中はリロードしない
      if (viewWindow.getSelection()?.toString()) {
        return;
      }

      requestManualRefresh();
    },
    [requestManualRefresh, viewWindow],
  );

  const openThreadInNewTab = useCallback(
    ({ thread }: DisplayThread) => {
      // ミドルクリックの新規スレは設定に関わらず背景で開き、既存スレの選択はTabStoreに任せる。
      dispatch(
        tabActions.openInNewTab(
          { type: "thread", title: thread.title, threadUrl: thread.url },
          { background: true },
        ),
      );
    },
    [dispatch],
  );

  const handleTableSort = useCallback(
    (key: string) => {
      if (isSortColumn(key)) handleSort(key);
    },
    [handleSort],
  );

  const contextMenuItems = useMemo(() => {
    if (!contextMenuState) return [];
    const { thread } = contextMenuState;
    // ブックマークの外部更新でもメニューの表示を取り直すため、revisionを依存値に含める。
    void bookmarkRevision;
    return createThreadContextMenuItems({
      target: { title: thread.title, url: thread.url },
      isBookmarked: readBookmarkStatus(thread.url),
      onRegisterTitleNg: () => openThreadTitleNgDialog(thread),
      runCommand: runTargetCommand,
    });
  }, [bookmarkRevision, contextMenuState, openThreadTitleNgDialog, runTargetCommand]);

  const closeContextMenu = useCallback(() => setContextMenuState(null), []);
  const contextMenuNavigationActions = contextMenuState ? (
    <ContextMenuNavigationActions
      canGoBack={canGoBack(navigationTab)}
      canGoForward={canGoForward(navigationTab)}
      canRefresh={isPageRefreshable(page)}
      onBack={() => {
        runTabCommand(TAB_COMMAND_IDS.BACK);
        closeContextMenu();
      }}
      onForward={() => {
        runTabCommand(TAB_COMMAND_IDS.FORWARD);
        closeContextMenu();
      }}
      onRefresh={() => {
        requestManualRefresh();
        closeContextMenu();
      }}
    />
  ) : null;

  const threadListNgCount = useMemo(
    () => threads.filter((thread) => thread.ng != null || thread.demoted != null).length,
    [threads],
  );
  const threadListHighlightCount = useMemo(
    () => threads.filter((thread) => thread.highlight != null).length,
    [threads],
  );
  const visibleDisplayThreads = useMemo(
    () => displayThreads.filter(({ thread }) => thread.ng == null || isNgTemporarilyDisabled),
    [displayThreads, isNgTemporarilyDisabled],
  );

  useEffect(() => {
    // 変更理由: 一覧の検索・NG適用後に実際に見えているスレ数を示し、
    // ステータスバーの件数と画面上の一覧件数を一致させる。
    setPageCount(pageCountKey, {
      kind: "threadList",
      count: loading && threads.length === 0 ? null : visibleDisplayThreads.length,
    });
    return () => setPageCount(pageCountKey, null);
  }, [loading, pageCountKey, setPageCount, threads.length, visibleDisplayThreads.length]);

  const threadSections = useMemo<DataTableSection<DisplayThread>[]>(() => {
    const highlightGroups = new Map<
      string,
      { label: string; color?: string; order: number; rows: DisplayThread[] }
    >();
    for (const item of visibleDisplayThreads) {
      const result = item.thread.highlight;
      if (!result) continue;
      // 変更理由: labelやcolorが同じでも、別のDSLルールなら独立したセクションとして扱う。
      const key =
        result.ruleIndex != null
          ? `rule-${result.ruleIndex}`
          : `legacy-${result.name ?? ""}-${result.params?.label ?? ""}-${result.params?.bgColor ?? ""}`;
      const existing = highlightGroups.get(key);
      if (existing) {
        existing.rows.push(item);
      } else {
        highlightGroups.set(key, {
          label: result.params?.label || result.name || "注目スレ",
          color: result.params?.bgColor,
          order: result.ruleIndex ?? Number.MAX_SAFE_INTEGER,
          rows: [item],
        });
      }
    }
    const normal = visibleDisplayThreads.filter(
      ({ thread }) =>
        thread.highlight == null && (isNgTemporarilyDisabled || thread.demoted == null),
    );
    const demoted = isNgTemporarilyDisabled
      ? []
      : visibleDisplayThreads.filter(({ thread }) => thread.demoted != null);

    return [
      ...Array.from(highlightGroups.entries())
        .sort(([, left], [, right]) => left.order - right.order)
        .map(([key, group]) => ({
          key: `highlight-${key}`,
          label: `${group.label}（${group.rows.length}）`,
          rows: group.rows,
          ...(group.color ? { dividerStyle: createHighlightDividerStyle(group.color) } : {}),
        })),
      ...(normal.length > 0
        ? [{ key: "normal", label: `スレ一覧（${normal.length}）`, rows: normal }]
        : []),
      ...(demoted.length > 0
        ? [
            {
              key: "demoted",
              label: `折りたたんだスレ（${demoted.length}）`,
              rows: demoted,
              collapsible: true,
              defaultCollapsed: true,
            },
          ]
        : []),
    ];
  }, [isNgTemporarilyDisabled, visibleDisplayThreads]);

  useEffect(() => {
    // 件数表示は検索/ソートの表示結果ではなく、取得済み一覧全体を基準にする。
    setThreadListStats({
      ngCount: threadListNgCount,
      highlightCount: threadListHighlightCount,
    });
    return () => {
      setThreadListStats({ ngCount: 0, highlightCount: 0 });
    };
  }, [setThreadListStats, threadListHighlightCount, threadListNgCount]);

  // 条件付きで早期返却するとhooksの呼び出し数が変わってReactエラーになるため、
  // JSXレベルで条件分岐をして、すべてのhooksをレンダーパスの上部で呼び出す
  if (loading && threads.length === 0) {
    return (
      <div className="page-status">
        <Spinner size="sm" aria-label="スレ一覧を読み込み中" />
        <span>読み込み中...</span>
      </div>
    );
  }

  if (error && threads.length === 0) {
    return (
      <div className="page-status page-status--error">
        <p>{error}</p>
        <button className="page-status__retry" onClick={fetchThreads}>
          再試行
        </button>
      </div>
    );
  }

  return (
    <ThreadListView
      rows={[]}
      loading={false}
      error={null}
      query={searchQuery}
      onQueryChange={setSearchQuery}
      searchMode="custom"
      searchContent={
        isFilterOpen ? (
          <SearchBar
            query={searchQuery}
            onQueryChange={setSearchQuery}
            onClose={closeFilterToolbar}
            hitCount={visibleDisplayThreads.length}
          />
        ) : null
      }
      onDoubleClick={handleDoubleClick}
    >
      {showRefreshOverlay && (
        <div
          className={`thread-list-page__loading-overlay${loading ? " thread-list-page__loading-overlay--visible" : ""}`}
          role="status"
          aria-live="polite"
        >
          <Spinner size="sm" aria-label="スレ一覧を読み込み中" />
          <span>スレ一覧を読み込み中...</span>
        </div>
      )}
      {error && <div className="thread-list-page__notice">{error}</div>}
      <SimpleDataTable
        columns={THREAD_LIST_COLUMNS}
        rows={visibleDisplayThreads}
        sections={threadSections}
        getRowKey={({ thread }) => thread.url}
        getRowTooltip={({ thread }) => thread.title}
        getRowClassName={({ thread }) => {
          const classes: string[] = [];
          if (isThreadVisited(thread)) classes.push("thread-list__row--visited");
          if (thread.demoted && !isNgTemporarilyDisabled) classes.push("thread-list__row--ng");
          if (thread.highlight) classes.push("thread-list__row--highlight");
          return classes.join(" ") || undefined;
        }}
        onRowClick={handleThreadClick}
        onRowMiddleClick={openThreadInNewTab}
        onRowContextMenu={({ thread }, x, y) => setContextMenuState({ x, y, thread })}
        sortColumn={sortColumn ?? undefined}
        sortDirection={sortDirection}
        onSort={handleTableSort}
        columnVisibilityStorageKey={THREAD_LIST_COLUMN_VISIBILITY_STORAGE_KEY}
        columnVisibilityLockedKeys={THREAD_LIST_COLUMN_VISIBILITY_LOCKED_KEYS}
      />
      {contextMenuState && (
        <ContextMenu
          x={contextMenuState.x}
          y={contextMenuState.y}
          items={contextMenuItems}
          header={contextMenuNavigationActions}
          onClose={closeContextMenu}
        />
      )}
      <ThreadTitleNgDialog controller={threadTitleNgDialog} />
    </ThreadListView>
  );
};
