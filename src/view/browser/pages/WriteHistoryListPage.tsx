import React, { useCallback, useEffect, useMemo, useState } from "react";
import { platform } from "src/app";
import { container } from "src/service-container/index";
import { SearchBar } from "src/view/browser/components/SearchBar";
import { ColumnDef, SimpleDataTable } from "src/view/browser/components/SimpleDataTable";
import { useQuickAccessFilterToolbar } from "src/view/browser/hooks/use-quick-access-filter-toolbar";
import {
  type TabAction,
  useTabDispatch,
  useTabViewState,
} from "src/view/browser/state/tabs/use-tab-store";
import { Spinner } from "src/view/browser/ui/Spinner";
import { formatCompactDateTime, normalizeLegacyTimestamp } from "src/view/browser/utils/date-time";
import { parseInternalBrowserPage } from "src/view/browser/utils/link-routing";
import { requestThreadResJump } from "src/view/browser/utils/thread-read-state";

type SortDirection = "asc" | "desc";
type SortColumn = "title" | "writtenRes" | "name" | "mail" | "message" | "writtenDate";

interface SortState {
  column: SortColumn | null;
  direction: SortDirection;
}

const DEFAULT_SORT_STATE: SortState = {
  column: null,
  direction: "asc",
};

interface WriteHistoryEntry {
  url: string;
  title: string;
  writtenRes: number;
  name: string;
  mail: string;
  message: string;
  writtenDate: number;
  originalIndex: number;
}

// 変更理由: タブ再マウント時やブラウザ再起動後に「読み込み中」しか表示されないのを防ぐため、
// 前回の取得結果をIDBに永続化し、新しいデータの取得中は古い結果を表示し続ける。
const UI_CACHE_STORE = "UICache";
const WRITE_HISTORY_CACHE_KEY = "writeHistoryList";

const getWriteHistoryCache = async (): Promise<WriteHistoryEntry[] | null> => {
  try {
    const store = platform.storage.getStore(UI_CACHE_STORE);
    const entry = (await store.get(WRITE_HISTORY_CACHE_KEY)) as
      | { url: string; data: WriteHistoryEntry[] }
      | undefined;
    return entry?.data ?? null;
  } catch {
    return null;
  }
};

const setWriteHistoryCache = async (entries: WriteHistoryEntry[]): Promise<void> => {
  try {
    const store = platform.storage.getStore(UI_CACHE_STORE);
    await store.put({ url: WRITE_HISTORY_CACHE_KEY, data: entries });
  } catch (error) {
    console.error("[WriteHistoryListPage] cache save failed:", error);
  }
};

interface LegacyWriteHistoryLike {
  url?: unknown;
  title?: unknown;
  res?: unknown;
  writtenRes?: unknown;
  name?: unknown;
  mail?: unknown;
  message?: unknown;
  date?: unknown;
  writtenDate?: unknown;
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function readWriteHistoryEntries(): Promise<WriteHistoryEntry[]> {
  // window.app ではなくサービスコンテナの書き込み履歴から読む（legacy-window-app-plan の Phase 1）。
  const raw = await container.writeHistory.get(undefined, 5000);
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((value, index) => {
      const item = value as LegacyWriteHistoryLike;
      const url = normalizeString(item.url);
      if (!url) {
        return null;
      }

      // 変更理由: 旧UIの書込履歴は `date` フィールドで残っている場合があるため、
      // new-ui でも両形式を受けて日時列を欠損させない。
      const parsedDate = normalizeLegacyTimestamp(item.writtenDate ?? item.date);

      return {
        url,
        title: normalizeString(item.title, url),
        writtenRes: Math.max(0, Math.trunc(normalizeNumber(item.writtenRes ?? item.res))),
        name: normalizeString(item.name),
        mail: normalizeString(item.mail),
        message: normalizeString(item.message),
        writtenDate: parsedDate,
        originalIndex: index,
      } satisfies WriteHistoryEntry;
    })
    .filter((item): item is WriteHistoryEntry => item !== null);
}

export function navigateToWriteHistoryEntry(
  dispatch: React.Dispatch<TabAction>,
  entry: Pick<WriteHistoryEntry, "url" | "title" | "writtenRes">,
  mode: "current" | "new-tab" = "current",
): void {
  const parsed = parseInternalBrowserPage(entry.url);
  if (!parsed || parsed.type !== "thread") {
    return;
  }

  requestThreadResJump(parsed.threadUrl, entry.writtenRes);
  dispatch({
    type: mode === "new-tab" ? "OPEN_IN_NEW_TAB" : "NAVIGATE",
    page: {
      ...parsed,
      title: entry.title,
    },
    ...(mode === "new-tab" ? { background: true } : {}),
  });
}

const COLUMNS: ColumnDef<WriteHistoryEntry>[] = [
  {
    key: "title",
    header: "タイトル",
    headerClassName: "simple-data-table__th--title",
    cellClassName: "simple-data-table__title",
    sortable: true,
    cell: (row) => row.title,
  },
  {
    key: "writtenRes",
    header: "レス",
    headerClassName: "simple-data-table__th--writehistory-res",
    cellClassName: "simple-data-table__writehistory-res",
    sortable: true,
    cell: (row) => (row.writtenRes > 0 ? row.writtenRes : "-"),
  },
  {
    key: "name",
    header: "名前",
    headerClassName: "simple-data-table__th--writehistory-name",
    cellClassName: "simple-data-table__writehistory-name",
    sortable: true,
    cell: (row) => row.name || "-",
  },
  {
    key: "mail",
    header: "メール",
    headerClassName: "simple-data-table__th--writehistory-mail",
    cellClassName: "simple-data-table__writehistory-mail",
    sortable: true,
    cell: (row) => row.mail || "-",
  },
  {
    key: "message",
    header: "本文",
    cellClassName: "simple-data-table__writehistory-message",
    sortable: true,
    cell: (row) => row.message || "-",
  },
  {
    key: "writtenDate",
    header: "書込日時",
    headerClassName: "simple-data-table__th--writehistory-date",
    cellClassName: "simple-data-table__writehistory-date",
    sortable: true,
    cell: (row) => (row.writtenDate ? formatCompactDateTime(row.writtenDate) : "-"),
  },
];

const COLUMN_VISIBILITY_STORAGE_KEY = "chlens_browser_write_history_list_columns_visibility";
const COLUMN_VISIBILITY_LOCKED_KEYS = ["title"] as const;

interface WriteHistoryListPageProps {
  tabId: string;
  isActive: boolean;
  refreshKey: number;
}

export const WriteHistoryListPage: React.FC<WriteHistoryListPageProps> = ({
  tabId,
  isActive,
  refreshKey,
}) => {
  // タブ切り替えなど他タブ操作のたびにフル状態を再購読して再レンダリングされないよう、
  // dispatch のみ取得する安定したフックを使う。isActive は親から props で受け取る。
  const dispatch = useTabDispatch();
  const { state: persistedViewState, update: updateViewState } = useTabViewState(tabId, {
    type: "writeHistoryList",
    title: "書き込み履歴",
  });
  const [entries, setEntries] = useState<WriteHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    updateViewState({
      searchQuery,
      sortColumn: sortState.column,
      sortDirection: sortState.direction,
    });
  }, [searchQuery, sortState, updateViewState]);

  const { isFilterOpen, closeFilterToolbar } = useQuickAccessFilterToolbar({
    pageType: "writeHistoryList",
    tabId,
    isActive,
    searchQuery,
    setSearchQuery,
  });

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await readWriteHistoryEntries();
      setEntries(rows);
      void setWriteHistoryCache(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "書き込み履歴の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  // 変更理由: IDBキャッシュから前回の書き込み履歴を復元し、新しいデータの取得中は古い結果を表示し続ける。
  useEffect(() => {
    void (async () => {
      const cached = await getWriteHistoryCache();
      if (cached && cached.length > 0) {
        setEntries(cached);
      }
    })();
  }, []);

  useEffect(() => {
    // 変更理由: ナビバー更新ボタンの RELOAD を受けて、
    // 書き込み履歴一覧でも明示的に最新データを再取得できるようにする。
    void loadEntries();
  }, [loadEntries, refreshKey]);

  useEffect(() => {
    const handleWriteHistoryUpdated = () => {
      // 変更理由: 書き込み履歴タブは hidden のまま保持されるため、
      // 投稿直後の仮追加や確定更新を通知で取り込み stale 一覧を避ける。
      void loadEntries();
    };

    container.message.on("write_history_updated", handleWriteHistoryUpdated);

    return () => {
      container.message.off("write_history_updated", handleWriteHistoryUpdated);
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
      // 3段階ソート: asc -> desc -> default(未ソート)
      return DEFAULT_SORT_STATE;
    });
  }, []);

  const filtered = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const rows = normalizedQuery
      ? entries.filter((entry) =>
          `${entry.title} ${entry.name} ${entry.mail} ${entry.message}`
            .toLowerCase()
            .includes(normalizedQuery),
        )
      : entries;

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
        case "writtenRes":
          result = a.writtenRes - b.writtenRes;
          break;
        case "name":
          result = a.name.localeCompare(b.name, "ja");
          break;
        case "mail":
          result = a.mail.localeCompare(b.mail, "ja");
          break;
        case "message":
          result = a.message.localeCompare(b.message, "ja");
          break;
        case "writtenDate":
          result = a.writtenDate - b.writtenDate;
          break;
      }
      return sortState.direction === "asc" ? result : -result;
    });

    return sorted;
  }, [entries, searchQuery, sortState]);

  const openEntry = useCallback(
    (entry: WriteHistoryEntry) => {
      navigateToWriteHistoryEntry(dispatch, entry, "current");
    },
    [dispatch],
  );

  const openEntryInNewTab = useCallback(
    (entry: WriteHistoryEntry) => {
      navigateToWriteHistoryEntry(dispatch, entry, "new-tab");
    },
    [dispatch],
  );

  // 変更理由: 前回の結果がある場合は「読み込み中」ではなく古い結果を表示し続ける。
  // 新しいデータの取得が完了したら自動的に新しい結果に置き換わる。
  if (loading && entries.length === 0) {
    return (
      <div className="page-status">
        <Spinner size="sm" aria-label="書き込み履歴を読み込み中" />
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
    <div className="thread-list-page">
      {error && <div className="thread-list-page__notice">{error}</div>}
      {isFilterOpen ? (
        <SearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onClose={closeFilterToolbar}
          hitCount={filtered.length}
        />
      ) : null}
      <SimpleDataTable
        columns={COLUMNS}
        rows={filtered}
        getRowKey={(row) => `${row.url}:${row.originalIndex}`}
        getRowTooltip={(row) => row.title}
        onRowClick={openEntry}
        onRowMiddleClick={openEntryInNewTab}
        sortColumn={sortState.column ?? undefined}
        sortDirection={sortState.direction}
        onSort={handleSort}
        columnVisibilityStorageKey={COLUMN_VISIBILITY_STORAGE_KEY}
        columnVisibilityLockedKeys={COLUMN_VISIBILITY_LOCKED_KEYS}
      />
    </div>
  );
};
