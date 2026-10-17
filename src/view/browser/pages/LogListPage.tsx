import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createLogger } from "src/app/logger";
import type { LogRecord } from "src/core/storage/Cache";
import { container } from "src/service-container/index";
import { SearchBar } from "src/view/browser/components/SearchBar";
import { ColumnDef } from "src/view/browser/components/SimpleDataTable";
import { VirtualizedDataTable } from "src/view/browser/components/VirtualizedDataTable";
import { useQuickAccessFilterToolbar } from "src/view/browser/hooks/use-quick-access-filter-toolbar";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { useTabDispatch, useTabViewState } from "src/view/browser/state/tabs/use-tab-store";
import { Spinner } from "src/view/browser/ui/Spinner";
import { formatCompactDateTime } from "src/view/browser/utils/date-time";
import { parseInternalBrowserPage } from "src/view/browser/utils/link-routing";

const logger = createLogger("view/browser");

type SortDirection = "asc" | "desc";
type SortColumn = "title" | "boardTitle" | "resLength" | "lastUpdated";
const PAGE_SIZE = 200;
const SEARCH_CHUNK_SIZE = 50;
const LOAD_MORE_THRESHOLD = 12;

interface SortState {
  column: SortColumn | null;
  direction: SortDirection;
}

const DEFAULT_SORT_STATE: SortState = {
  column: null,
  direction: "asc",
};

interface LogEntry {
  url: string;
  threadUrl: string;
  title: string;
  boardTitle: string;
  resLength: number;
  lastUpdated: number;
}

/** 板URLから表示用の板名（host/board）を導出する。 */
function deriveBoardLabel(boardUrl: string, threadUrl: string): string {
  const source = boardUrl || threadUrl;
  try {
    const parsed = new window.URL(source);
    const pathPart = parsed.pathname.replace(/^\/|\/$/g, "").split("/")[0];
    return pathPart ? `${parsed.hostname}/${pathPart}` : parsed.hostname;
  } catch {
    return "";
  }
}

function toLogEntry(record: LogRecord): LogEntry {
  return {
    url: record.url,
    threadUrl: record.threadUrl,
    title: record.title || record.threadUrl,
    boardTitle: record.boardTitle || deriveBoardLabel(record.boardUrl, record.threadUrl),
    resLength: record.resLength ?? 0,
    lastUpdated: record.lastUpdated,
  };
}

const COLUMNS: ColumnDef<LogEntry>[] = [
  {
    key: "title",
    header: "タイトル",
    headerClassName: "simple-data-table__th--title",
    cellClassName: "simple-data-table__title",
    sortable: true,
    cell: (row) => row.title,
  },
  {
    key: "boardTitle",
    header: "板",
    headerClassName: "simple-data-table__th--history-board",
    cellClassName: "simple-data-table__history-board",
    sortable: true,
    cell: (row) => row.boardTitle || "-",
  },
  {
    key: "resLength",
    header: "レス",
    headerClassName: "simple-data-table__th--count",
    cellClassName: "simple-data-table__count",
    sortable: true,
    cell: (row) => (row.resLength > 0 ? row.resLength : ""),
  },
  {
    key: "lastUpdated",
    header: "取得日時",
    headerClassName: "simple-data-table__th--history-date",
    cellClassName: "simple-data-table__history-date",
    sortable: true,
    cell: (row) => (row.lastUpdated ? formatCompactDateTime(row.lastUpdated) : "-"),
  },
];

const COLUMN_VISIBILITY_STORAGE_KEY = "chlens_browser_log_list_columns_visibility";
const COLUMN_VISIBILITY_LOCKED_KEYS = ["title"] as const;

interface LogListPageProps {
  tabId: string;
  isActive: boolean;
  refreshKey: number;
}

export const LogListPage: React.FC<LogListPageProps> = ({ tabId, isActive, refreshKey }) => {
  const dispatch = useTabDispatch();
  const { state: persistedViewState, update: updateViewState } = useTabViewState(tabId, {
    type: "logList",
    title: "ログ検索",
  });
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const nextOffsetRef = useRef(0);
  const isLoadingPageRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => persistedViewState.searchQuery ?? "");
  const [sortState, setSortState] = useState<SortState>(() => {
    const column = persistedViewState.sortColumn;
    return {
      column:
        typeof column === "string" && COLUMNS.some((candidate) => candidate.key === column)
          ? (column as SortColumn)
          : null,
      direction: persistedViewState.sortDirection === "desc" ? "desc" : "asc",
    };
  });
  // 既定はタイトル検索。ボタンで本文（全文）検索に切り替える。
  const [searchMode, setSearchMode] = useState<"title" | "body">(
    () => persistedViewState.searchMode ?? "title",
  );
  // 本文検索の結果。null のときは本文検索未実行。
  const [bodyMatchedEntries, setBodyMatchedEntries] = useState<LogEntry[] | null>(null);
  const [bodySearchLoading, setBodySearchLoading] = useState(false);

  const { isFilterOpen, closeFilterToolbar } = useQuickAccessFilterToolbar({
    pageType: "logList",
    tabId,
    isActive,
    searchQuery,
    setSearchQuery,
  });

  useEffect(() => {
    updateViewState({
      searchQuery,
      sortColumn: sortState.column,
      sortDirection: sortState.direction,
      searchMode,
    });
  }, [searchMode, searchQuery, sortState, updateViewState]);

  const wasActiveRef = React.useRef(isActive);

  const loadNextPage = useCallback(async (reset = false) => {
    if (isLoadingPageRef.current) {
      return;
    }
    isLoadingPageRef.current = true;
    if (reset) {
      setLoading(true);
      nextOffsetRef.current = 0;
    } else {
      setLoadingMore(true);
    }
    setError(null);
    try {
      // 変更理由: 保存本文を含むログ全件の一括展開を避け、画面表示に必要な分だけ読む。
      const logs = await container.threadLog.listLogs(nextOffsetRef.current, PAGE_SIZE + 1);
      const pageLogs = logs.slice(0, PAGE_SIZE);
      nextOffsetRef.current += pageLogs.length;
      setHasMore(logs.length > PAGE_SIZE);
      setEntries((previous) =>
        reset ? pageLogs.map(toLogEntry) : [...previous, ...pageLogs.map(toLogEntry)],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "ログの読み込みに失敗しました");
      if (reset) {
        setEntries([]);
      }
    } finally {
      isLoadingPageRef.current = false;
      if (reset) {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  }, []);

  const loadEntries = useCallback(async () => {
    await loadNextPage(true);
  }, [loadNextPage]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries, refreshKey]);

  // 本文検索: 保存ログを小分けに走査し、見つかった結果から順に表示する。
  useEffect(() => {
    if (searchMode !== "body") {
      setBodyMatchedEntries(null);
      return;
    }
    const query = searchQuery.trim();
    if (query === "") {
      setBodyMatchedEntries(null);
      return;
    }

    let cancelled = false;
    setBodyMatchedEntries([]);
    setBodySearchLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        let offset = 0;
        const matchedEntries: LogEntry[] = [];
        try {
          while (!cancelled) {
            const page = await container.threadLog.searchLogsPage(query, offset, SEARCH_CHUNK_SIZE);
            offset = page.nextOffset;
            for (const result of page.logs) {
              matchedEntries.push(toLogEntry(result));
            }
            if (!cancelled) {
              setBodyMatchedEntries([...matchedEntries]);
            }
            if (!page.hasMore) {
              break;
            }
            // 変更理由: 大量ログの連続走査中も描画と入力処理へ制御を戻す。
            await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
          }
        } catch (searchError) {
          logger.error("body search failed:", searchError);
          if (!cancelled) {
            setBodyMatchedEntries([]);
          }
        } finally {
          if (!cancelled) {
            setBodySearchLoading(false);
          }
        }
      })();
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setBodySearchLoading(false);
    };
  }, [searchMode, searchQuery]);

  useEffect(() => {
    // hidden のまま保持されたログページが、前面復帰時に新着を取りこぼさないよう再同期する。
    if (isActive && !wasActiveRef.current) {
      void loadEntries();
    }
    wasActiveRef.current = isActive;
  }, [isActive, loadEntries]);

  useEffect(() => {
    // スレ閲覧でログが追加/更新されたら一覧を再読込する（閲覧履歴と同じパターン）。
    const handleLogUpdated = () => {
      void loadEntries();
    };
    container.message.on("log_updated", handleLogUpdated);
    return () => {
      container.message.off("log_updated", handleLogUpdated);
    };
  }, [loadEntries]);

  const handleSort = useCallback((key: string) => {
    if (!COLUMNS.some((column) => column.key === key)) {
      return;
    }
    const column = key as SortColumn;
    setSortState((prev) => {
      if (prev.column !== column) {
        return { column, direction: "asc" };
      }
      if (prev.direction === "asc") {
        return { column, direction: "desc" };
      }
      return DEFAULT_SORT_STATE;
    });
  }, []);

  const filtered = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    let rows = entries;
    if (normalizedQuery) {
      if (searchMode === "body") {
        rows = bodyMatchedEntries ?? [];
      } else {
        rows = entries.filter((entry) =>
          `${entry.title} ${entry.boardTitle}`.toLowerCase().includes(normalizedQuery),
        );
      }
    }

    if (!sortState.column) {
      return rows;
    }

    const sorted = [...rows];
    sorted.sort((a, b) => {
      let result = 0;
      switch (sortState.column) {
        case "title":
          result = a.title.localeCompare(b.title, "ja");
          break;
        case "boardTitle":
          result = a.boardTitle.localeCompare(b.boardTitle, "ja");
          break;
        case "resLength":
          result = a.resLength - b.resLength;
          break;
        case "lastUpdated":
          result = a.lastUpdated - b.lastUpdated;
          break;
      }
      return sortState.direction === "asc" ? result : -result;
    });
    return sorted;
  }, [entries, searchQuery, searchMode, bodyMatchedEntries, sortState]);

  const shouldLoadCompleteDataset =
    searchMode === "title" && (searchQuery.trim().length > 0 || sortState.column !== null);

  useEffect(() => {
    if (!shouldLoadCompleteDataset || loading || loadingMore || error || !hasMore) {
      return;
    }
    void loadNextPage();
  }, [error, hasMore, loadNextPage, loading, loadingMore, shouldLoadCompleteDataset]);

  const openEntry = useCallback(
    (entry: LogEntry) => {
      const parsed = parseInternalBrowserPage(entry.threadUrl);
      if (!parsed) return;
      dispatch(tabActions.navigate({ ...parsed, title: entry.title }));
    },
    [dispatch],
  );

  const openEntryInNewTab = useCallback(
    (entry: LogEntry) => {
      const parsed = parseInternalBrowserPage(entry.threadUrl);
      if (!parsed) return;
      // ミドルクリックは常にバックグラウンドタブで開く。
      dispatch(tabActions.openInNewTab({ ...parsed, title: entry.title }, { background: true }));
    },
    [dispatch],
  );

  const handleEndReached = useCallback(() => {
    if (shouldLoadCompleteDataset || loading || loadingMore || error || !hasMore) {
      return;
    }
    void loadNextPage();
  }, [error, hasMore, loadNextPage, loading, loadingMore, shouldLoadCompleteDataset]);

  if (loading && entries.length === 0) {
    return (
      <div className="page-status">
        <Spinner size="sm" aria-label="ログを読み込み中" />
        <span>読み込み中...</span>
      </div>
    );
  }

  if (error && entries.length === 0) {
    return (
      <div className="page-status page-status--error">
        <p>{error}</p>
        <button className="page-status__retry" onClick={() => void loadEntries()}>
          再試行
        </button>
      </div>
    );
  }

  return (
    <div className="thread-list-page history-list-page">
      {isFilterOpen ? (
        <SearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onClose={closeFilterToolbar}
          hitCount={filtered.length}
          loading={bodySearchLoading}
          placeholder={searchMode === "body" ? "本文を検索..." : "タイトル・板を検索..."}
          prefix={
            <button
              type="button"
              className="search-bar__mode-toggle"
              onClick={() => setSearchMode((prev) => (prev === "title" ? "body" : "title"))}
              title={
                searchMode === "body"
                  ? "本文検索中（クリックでタイトル検索へ）"
                  : "タイトル検索中（クリックで本文検索へ）"
              }
            >
              {searchMode === "body" ? "本文" : "タイトル"}
            </button>
          }
        />
      ) : null}
      {error ? <div className="thread-list-page__notice">{error}</div> : null}
      <div className="history-list-page__table">
        <VirtualizedDataTable
          columns={COLUMNS}
          rows={filtered}
          getRowKey={(row) => row.url}
          getRowTooltip={(row) => row.title}
          onRowClick={openEntry}
          onRowMiddleClick={openEntryInNewTab}
          sortColumn={sortState.column ?? undefined}
          sortDirection={sortState.direction}
          onSort={handleSort}
          estimatedRowHeight={52}
          loadingMore={loadingMore}
          endReachedThreshold={LOAD_MORE_THRESHOLD}
          onEndReached={handleEndReached}
          columnVisibilityStorageKey={COLUMN_VISIBILITY_STORAGE_KEY}
          columnVisibilityLockedKeys={COLUMN_VISIBILITY_LOCKED_KEYS}
        />
      </div>
    </div>
  );
};
