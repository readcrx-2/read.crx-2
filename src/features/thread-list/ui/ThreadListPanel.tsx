import { Check, RotateCw, Search } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createLogger } from "src/app/logger";
import {
  readBookmarkStatus,
  useBookmarkRevision,
} from "src/features/bookmark/browser/use-bookmark-revision";
import { useNgStatus } from "src/features/ng/browser/use-ng-status";
import { useThreadTitleNgDialog } from "src/features/ng/browser/use-thread-title-ng-dialog";
import { ThreadTitleNgDialog } from "src/features/ng/ui/ThreadTitleNgDialog";
import { useTabCommandRunner } from "src/features/tabs/browser/use-tab-command-runner";
import { createThreadContextMenuItems } from "src/features/thread/ui/thread-context-menu-items";
import {
  calcHeat,
  createHighlightDividerStyle,
  type DisplayThread,
  getThreadListCache,
  getThreadUnreadCount,
  isSortColumn,
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
import type { IReadState, IThread } from "src/service-container/interfaces";
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
  THREAD_LIST_AUTO_REFRESH_INTERVALS_SEC,
  useBottomPanel,
} from "src/view/browser/hooks/use-bottom-panel";
import { useToast } from "src/view/browser/hooks/use-toast";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { useTabStore, useTabViewState } from "src/view/browser/state/tabs/use-tab-store";
import { ContextMenu, type ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import {
  getBoardUrlFromThreadUrl,
  resolveBoardUrlForBrowser,
} from "src/view/browser/utils/link-routing";
import { normalizePageLocation } from "src/view/browser/utils/page-location";

const logger = createLogger("thread-list");

interface ThreadListPanelProps {
  threadUrl: string;
}

interface MenuPosition {
  x: number;
  y: number;
}

interface BoardDescriptor {
  boardUrl: string;
  boardTitle: string;
}

function deriveFallbackBoardUrl(threadUrl: string): string {
  return getBoardUrlFromThreadUrl(threadUrl);
}

function resolveBoardTitle(
  boardUrl: string,
  threadTitle: string,
  history: ReturnType<typeof useTabStore>["viewTab"]["history"],
  targetWindow: Window,
): string {
  // 変更理由: ポップアップ側windowのURLコンストラクタで解釈しないと別realm扱いになるため明示して渡す。
  const targetUrl = (targetWindow as Window & typeof globalThis).URL;
  const normalizedBoardUrl = normalizePageLocation(boardUrl, targetUrl);
  const boardPage = [...history]
    .reverse()
    .find(
      (page) =>
        page.type === "threadList" &&
        normalizePageLocation(page.boardUrl, targetUrl) === normalizedBoardUrl,
    );
  if (
    boardPage?.type === "threadList" &&
    boardPage.boardTitle &&
    boardPage.boardTitle !== boardPage.boardUrl
  ) {
    return boardPage.boardTitle;
  }
  if (
    boardPage?.type === "threadList" &&
    boardPage.title &&
    boardPage.title !== boardPage.boardUrl
  ) {
    return boardPage.title;
  }

  const board = resolveBoardUrlForBrowser(boardUrl);
  if (board?.type === "board") {
    const targetWindowWithConstructors = targetWindow as Window & typeof globalThis;
    const host = new targetWindowWithConstructors.URL(board.boardUrl).hostname;
    return `${host}/${board.boardName}`;
  }

  try {
    const targetWindowWithConstructors = targetWindow as Window & typeof globalThis;
    const parsed = new targetWindowWithConstructors.URL(boardUrl);
    const boardKey = parsed.pathname.replace(/^\/+|\/+$/g, "");
    return boardKey ? `${parsed.hostname}/${boardKey}` : parsed.hostname;
  } catch {
    return threadTitle;
  }
}

function createBoardDescriptor(
  threadUrl: string,
  threadTitle: string,
  history: ReturnType<typeof useTabStore>["viewTab"]["history"],
  targetWindow: Window,
): BoardDescriptor {
  const boardUrl = deriveFallbackBoardUrl(threadUrl);
  return {
    boardUrl,
    boardTitle: resolveBoardTitle(boardUrl, threadTitle, history, targetWindow),
  };
}

function refreshThreadNgState(thread: IThread, boardUrl: string): IThread {
  const ngResult = container.ng.isNGBoard(thread.title, boardUrl, thread.resCount);
  const highlight =
    ngResult?.action === "highlight" ||
    ngResult?.type === "HighlightTitle" ||
    ngResult?.type === "RegExpHighlightTitle";
  const demoted = ngResult?.action === "collapse";

  // 変更理由: 板名を変えずにNGルールだけが更新された場合も、パネル上の一覧を
  // 即時に通常／強調／折りたたみへ振り分け直す必要がある。
  return {
    ...thread,
    ng: highlight || demoted ? null : ngResult,
    demoted: demoted ? ngResult : null,
    highlight: highlight ? ngResult : null,
  };
}

export const ThreadListPanel: React.FC<ThreadListPanelProps> = ({ threadUrl }) => {
  const { viewTab, viewPage, dispatch } = useTabStore();
  const runTabCommand = useTabCommandRunner(viewTab.id);
  // 変更理由: 下部パネルのスレ一覧も別窓へ移せるため、可視状態・更新タイマー・URL解析を
  // ページ本体と同じ表示先へ揃え、メイン窓の状態に引きずられないようにする。
  const viewSurface = useViewSurface();
  const { window: viewWindow, document: viewDocument } = viewSurface;
  const toast = useToast();
  const runTargetCommand = useCallback(
    (request: CommandRequest) => {
      void runCommandRequest(request, { surface: viewSurface, toast });
    },
    [toast, viewSurface],
  );
  const { isNgTemporarilyDisabled, setThreadListStats } = useNgStatus();
  const bookmarkRevision = useBookmarkRevision();
  const {
    threadListAutoRefreshEnabled,
    threadListAutoRefreshIntervalSec,
    setThreadListAutoRefreshEnabled,
    setThreadListAutoRefreshIntervalSec,
  } = useBottomPanel();
  const descriptor = useMemo(
    () => createBoardDescriptor(threadUrl, viewPage.title, viewTab.history, viewWindow),
    [threadUrl, viewPage.title, viewTab.history, viewWindow],
  );
  const boardPage = useMemo(
    () => ({
      type: "threadList" as const,
      title: descriptor.boardTitle,
      boardUrl: descriptor.boardUrl,
      boardTitle: descriptor.boardTitle,
    }),
    [descriptor.boardTitle, descriptor.boardUrl],
  );
  const { state: persistedViewState, update: updateViewState } = useTabViewState(
    viewTab.id,
    boardPage,
  );
  const [threads, setThreads] = useState<IThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => persistedViewState.searchQuery ?? "");
  const [isSearchOpen, setIsSearchOpen] = useState(() => Boolean(persistedViewState.searchQuery));
  const [sortPreference, setSortPreference] = useState<ThreadListSortPreference>(() => {
    const column = persistedViewState.sortColumn;
    if (column === null || (typeof column === "string" && isSortColumn(column))) {
      return {
        column: column as ThreadListSortColumn | null,
        direction: persistedViewState.sortDirection === "desc" ? "desc" : "asc",
      };
    }
    return readThreadListSortPreference(descriptor.boardUrl);
  });
  const [refreshMenuPosition, setRefreshMenuPosition] = useState<MenuPosition | null>(null);
  const [contextMenuState, setContextMenuState] = useState<{
    x: number;
    y: number;
    thread: IThread;
  } | null>(null);
  const threadTitleNgDialog = useThreadTitleNgDialog({
    toast,
    logLabel: "ThreadListPanel",
  });
  const { open: openThreadTitleNgDialog } = threadTitleNgDialog;
  const requestIdRef = useRef(0);
  const previousBoardUrlRef = useRef(descriptor.boardUrl);
  const skipViewStateUpdateRef = useRef(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    viewDocument.visibilityState === "visible",
  );

  const fetchThreads = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await container.board.getThreads(descriptor.boardUrl);
      if (requestId !== requestIdRef.current) {
        return;
      }
      setThreads(result.threads);
      void setThreadListCache(descriptor.boardUrl, result.threads);
      if (result.message && result.threads.length === 0) {
        setError(result.message);
      }
    } catch (fetchError) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      const message =
        fetchError instanceof Error ? fetchError.message : "スレッド一覧の取得に失敗しました";
      logger.error("thread list fetch failed:", fetchError);
      setError(message);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [descriptor.boardUrl]);

  useEffect(() => {
    let cancelled = false;
    setThreads([]);
    setLoading(true);
    setError(null);

    void getThreadListCache(descriptor.boardUrl).then((cached) => {
      if (!cancelled && cached && cached.length > 0) {
        setThreads(cached);
      }
    });
    void fetchThreads();

    return () => {
      cancelled = true;
      requestIdRef.current += 1;
    };
  }, [descriptor.boardUrl, fetchThreads]);

  useEffect(() => {
    if (previousBoardUrlRef.current === descriptor.boardUrl) {
      return;
    }

    previousBoardUrlRef.current = descriptor.boardUrl;
    // 板切り替え時は、前の板の検索・ソート状態を新しい板へ一度だけ書き込まない。
    // 次のレンダーで対象板の保存値を反映してから保存を再開する。
    skipViewStateUpdateRef.current = true;
    setSearchQuery(persistedViewState.searchQuery ?? "");
    setIsSearchOpen(Boolean(persistedViewState.searchQuery));
    const column = persistedViewState.sortColumn;
    setSortPreference(
      column === null || (typeof column === "string" && isSortColumn(column))
        ? {
            column: column as ThreadListSortColumn | null,
            direction: persistedViewState.sortDirection === "desc" ? "desc" : "asc",
          }
        : readThreadListSortPreference(descriptor.boardUrl),
    );
  }, [
    descriptor.boardUrl,
    persistedViewState,
    persistedViewState.searchQuery,
    persistedViewState.sortColumn,
    persistedViewState.sortDirection,
  ]);

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
    writeThreadListSortPreference(descriptor.boardUrl, sortPreference);
  }, [descriptor.boardUrl, searchQuery, sortPreference, updateViewState]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsDocumentVisible(viewDocument.visibilityState === "visible");
    };
    viewDocument.addEventListener("visibilitychange", handleVisibilityChange);
    return () => viewDocument.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [viewDocument]);

  useEffect(() => {
    if (!threadListAutoRefreshEnabled || !isDocumentVisible) {
      return;
    }

    const timerId = viewWindow.setInterval(() => {
      if (!loading) {
        void fetchThreads();
      }
    }, threadListAutoRefreshIntervalSec * 1000);
    return () => viewWindow.clearInterval(timerId);
  }, [
    fetchThreads,
    isDocumentVisible,
    loading,
    threadListAutoRefreshEnabled,
    threadListAutoRefreshIntervalSec,
    viewWindow,
  ]);

  useEffect(() => {
    const handleNgChanged = () => {
      setThreads((current) =>
        current.map((thread) => refreshThreadNgState(thread, descriptor.boardUrl)),
      );
    };
    container.message.on("ng_changed", handleNgChanged);
    return () => container.message.off("ng_changed", handleNgChanged);
  }, [descriptor.boardUrl]);

  useEffect(() => {
    const handleReadStateUpdated = ({ read_state: readState }: { read_state?: IReadState }) => {
      if (!readState) return;
      setThreads((current) =>
        current.map((thread) => {
          if (thread.url !== readState.url) return thread;
          if (thread.readState && !container.util.isNewerReadState(thread.readState, readState)) {
            return thread;
          }
          return { ...thread, readState };
        }),
      );
    };
    const handleReadStateRemoved = ({ url }: { url?: string }) => {
      if (!url) return;
      setThreads((current) =>
        current.map((thread) =>
          thread.url === url ? { ...thread, readState: undefined } : thread,
        ),
      );
    };
    container.message.on("read_state_updated", handleReadStateUpdated);
    container.message.on("read_state_removed", handleReadStateRemoved);
    return () => {
      container.message.off("read_state_updated", handleReadStateUpdated);
      container.message.off("read_state_removed", handleReadStateRemoved);
    };
  }, []);

  const { column: sortColumn, direction: sortDirection } = sortPreference;
  const displayThreads = useMemo(() => {
    // 変更理由: ブックマークは一覧取得とは別に更新されるため、revision を明示的に
    // 参照して、このメモ化結果だけを再計算すれば星表示を同期できるようにする。
    void bookmarkRevision;
    const now = Date.now();
    const list = threads.map((thread, index) => ({
      thread,
      originalIndex: index + 1,
      isBookmarked: readBookmarkStatus(thread.url),
      unreadCount: getThreadUnreadCount(thread),
      heat: Number.parseFloat(calcHeat(now, thread.createdAt, thread.resCount)),
    }));

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      list.splice(
        0,
        list.length,
        ...list.filter(({ thread }) => thread.title.toLowerCase().includes(query)),
      );
    }

    if (sortColumn) {
      list.sort((left, right) => {
        let comparison = 0;
        switch (sortColumn) {
          case "num":
            comparison = left.originalIndex - right.originalIndex;
            break;
          case "title":
            comparison = left.thread.title.localeCompare(right.thread.title, "ja");
            break;
          case "resCount":
            comparison = left.thread.resCount - right.thread.resCount;
            break;
          case "unreadCount":
            comparison = left.unreadCount - right.unreadCount;
            break;
          case "heat":
            comparison = left.heat - right.heat;
            break;
        }
        return sortDirection === "asc" ? comparison : -comparison;
      });
    }
    return list;
  }, [bookmarkRevision, searchQuery, sortColumn, sortDirection, threads]);

  const visibleDisplayThreads = useMemo(
    () => displayThreads.filter(({ thread }) => thread.ng == null || isNgTemporarilyDisabled),
    [displayThreads, isNgTemporarilyDisabled],
  );
  const threadSections = useMemo<DataTableSection<DisplayThread>[]>(() => {
    const highlightGroups = new Map<
      string,
      { label: string; color?: string; order: number; rows: DisplayThread[] }
    >();
    for (const item of visibleDisplayThreads) {
      const result = item.thread.highlight;
      if (!result) continue;
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

  const ngCount = useMemo(
    () => threads.filter((thread) => thread.ng != null || thread.demoted != null).length,
    [threads],
  );
  const highlightCount = useMemo(
    () => threads.filter((thread) => thread.highlight != null).length,
    [threads],
  );

  useEffect(() => {
    setThreadListStats({ ngCount, highlightCount });
    return () => setThreadListStats({ ngCount: 0, highlightCount: 0 });
  }, [highlightCount, ngCount, setThreadListStats]);

  const handleSort = useCallback((column: ThreadListSortColumn) => {
    setSortPreference((current) => {
      if (current.column !== column) return { column, direction: "asc" };
      if (current.direction === "asc") return { column, direction: "desc" };
      return { column: null, direction: "asc" };
    });
  }, []);

  const handleSearchToggle = useCallback(() => {
    if (isSearchOpen) {
      setSearchQuery("");
      setIsSearchOpen(false);
    } else {
      setIsSearchOpen(true);
    }
  }, [isSearchOpen]);

  const contextMenuItems = useMemo<ContextMenuItem[]>(() => {
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
      canGoBack={viewTab.currentIndex > 0}
      canGoForward={viewTab.currentIndex < viewTab.history.length - 1}
      canRefresh={!loading}
      onBack={() => {
        runTabCommand(TAB_COMMAND_IDS.BACK);
        closeContextMenu();
      }}
      onForward={() => {
        runTabCommand(TAB_COMMAND_IDS.FORWARD);
        closeContextMenu();
      }}
      onRefresh={() => {
        // 変更理由: 下部パネルは現在タブのページ再マウントではなく、パネル自身の板URLで
        // 取得しているため、RELOADではなく一覧取得を直接実行する。
        void fetchThreads();
        closeContextMenu();
      }}
    />
  ) : null;

  const refreshMenuItems = useMemo<ContextMenuItem[]>(
    () => [
      {
        id: "auto-off",
        label: "自動更新しない",
        icon: !threadListAutoRefreshEnabled ? <Check size={14} /> : undefined,
        onSelect: () => setThreadListAutoRefreshEnabled(false),
      },
      { id: "refresh-options", separator: true },
      ...THREAD_LIST_AUTO_REFRESH_INTERVALS_SEC.map((seconds) => ({
        id: `auto-${seconds}`,
        label: `${seconds}秒`,
        icon:
          threadListAutoRefreshEnabled && threadListAutoRefreshIntervalSec === seconds ? (
            <Check size={14} />
          ) : undefined,
        onSelect: () => {
          setThreadListAutoRefreshIntervalSec(seconds);
          setThreadListAutoRefreshEnabled(true);
        },
      })),
    ],
    [
      setThreadListAutoRefreshEnabled,
      setThreadListAutoRefreshIntervalSec,
      threadListAutoRefreshEnabled,
      threadListAutoRefreshIntervalSec,
    ],
  );

  const currentThreadUrl = viewPage.type === "thread" ? viewPage.threadUrl : threadUrl;

  return (
    <div className="thread-list-panel">
      <div className="thread-list-panel__toolbar" role="toolbar" aria-label="スレ一覧操作">
        <span className="thread-list-panel__board-title" title={descriptor.boardUrl}>
          {descriptor.boardTitle}
        </span>
        <div className="thread-list-panel__toolbar-actions">
          <button
            type="button"
            className={`thread-list-panel__toolbar-btn${isSearchOpen ? " thread-list-panel__toolbar-btn--active" : ""}`}
            title="スレタイ検索"
            aria-label="スレタイ検索"
            aria-pressed={isSearchOpen}
            onClick={handleSearchToggle}
          >
            <Search size={14} />
          </button>
          {/* 変更理由: メイン側の更新操作とアイコン・寸法・状態表示を揃え、一覧間の見た目の差をなくす。 */}
          <button
            type="button"
            className={`thread-list-panel__toolbar-btn nav-bar__menu-action${threadListAutoRefreshEnabled ? " nav-bar__menu-action--active" : ""}`}
            title={`一覧を更新（左クリック: 今すぐ更新、右クリック: 自動更新設定${threadListAutoRefreshEnabled ? `・現在 ${threadListAutoRefreshIntervalSec}秒` : ""}）`}
            aria-label="スレ一覧を更新"
            onClick={() => void fetchThreads()}
            onContextMenu={(event) => {
              event.preventDefault();
              setRefreshMenuPosition({ x: event.clientX, y: event.clientY });
            }}
          >
            <RotateCw size={17} className={loading ? "icon--spinning" : undefined} />
          </button>
        </div>
      </div>
      {isSearchOpen && (
        <SearchBar
          className="thread-list-panel__search-bar"
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onClose={() => {
            setSearchQuery("");
            setIsSearchOpen(false);
          }}
          hitCount={visibleDisplayThreads.length}
          placeholder="スレタイを検索..."
        />
      )}
      <div className="thread-list-panel__table-scroller">
        {error && threads.length > 0 && <div className="thread-list-page__notice">{error}</div>}
        {loading && threads.length === 0 ? (
          <div className="thread-list-panel__status">読み込み中...</div>
        ) : error && threads.length === 0 ? (
          <div className="thread-list-panel__status thread-list-panel__status--error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void fetchThreads()}>
              再試行
            </button>
          </div>
        ) : (
          <>
            {!loading && visibleDisplayThreads.length === 0 && (
              <div className="thread-list-panel__status">該当するスレはありません</div>
            )}
            <SimpleDataTable
              columns={THREAD_LIST_COLUMNS}
              rows={visibleDisplayThreads}
              sections={threadSections}
              getRowKey={({ thread }) => thread.url}
              getRowTooltip={({ thread }) => thread.title}
              getRowClassName={({ thread }) => {
                const classes: string[] = [];
                if (isThreadVisited(thread)) classes.push("thread-list__row--visited");
                if (thread.url === currentThreadUrl)
                  classes.push("thread-list-panel__row--current");
                if (thread.demoted && !isNgTemporarilyDisabled)
                  classes.push("thread-list__row--ng");
                if (thread.highlight) classes.push("thread-list__row--highlight");
                return classes.join(" ") || undefined;
              }}
              onRowClick={({ thread }) =>
                dispatch(
                  tabActions.navigate({
                    type: "thread",
                    title: thread.title,
                    threadUrl: thread.url,
                  }),
                )
              }
              onRowMiddleClick={({ thread }) =>
                dispatch(
                  tabActions.openInNewTab(
                    { type: "thread", title: thread.title, threadUrl: thread.url },
                    { background: true },
                  ),
                )
              }
              onRowContextMenu={({ thread }, x, y) => setContextMenuState({ thread, x, y })}
              sortColumn={sortColumn ?? undefined}
              sortDirection={sortDirection}
              onSort={(column) => {
                if (isSortColumn(column)) handleSort(column);
              }}
              columnVisibilityStorageKey={THREAD_LIST_COLUMN_VISIBILITY_STORAGE_KEY}
              columnVisibilityLockedKeys={THREAD_LIST_COLUMN_VISIBILITY_LOCKED_KEYS}
            />
          </>
        )}
      </div>
      {contextMenuState && (
        <ContextMenu
          x={contextMenuState.x}
          y={contextMenuState.y}
          items={contextMenuItems}
          header={contextMenuNavigationActions}
          onClose={closeContextMenu}
        />
      )}
      {refreshMenuPosition && (
        <ContextMenu
          x={refreshMenuPosition.x}
          y={refreshMenuPosition.y}
          items={refreshMenuItems}
          onClose={() => setRefreshMenuPosition(null)}
        />
      )}
      <ThreadTitleNgDialog controller={threadTitleNgDialog} />
    </div>
  );
};
