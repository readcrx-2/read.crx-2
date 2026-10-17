import { Star } from "lucide-react";
import { ChURL } from "packages/chlib/src/url/ChURL";
import React from "react";
import { createLogger } from "src/app/logger";
import { getStore2String, setStore2String } from "src/app/Store2Storage";
import type { IThread } from "src/service-container/interfaces";
import type { ColumnDef } from "src/view/browser/components/SimpleDataTable";

const logger = createLogger("thread-list");

const UI_CACHE_STORE = "UICache";
const threadListCacheKey = (boardUrl: string) => `threadList:${boardUrl}`;

// 変更理由: 通常ページと下部パネルは別マウントになるため、一覧を共有のIDBキャッシュから
// 復元し、通信中も直前の表示を維持してページ切替時のちらつきを抑える。
export async function getThreadListCache(boardUrl: string): Promise<IThread[] | null> {
  try {
    // platform はブラウザ用 polyfill を読み込むため、一覧パネルを実際に使う時だけ遅延読込する。
    // これにより書き込みパネルだけを使うテスト・起動経路へ不要な拡張API依存を持ち込まない。
    const { platform } = await import("src/app");
    const store = platform.storage.getStore(UI_CACHE_STORE);
    const entry = (await store.get(threadListCacheKey(boardUrl))) as
      | { url: string; data: IThread[] }
      | undefined;
    return entry?.data ?? null;
  } catch (error) {
    logger.error("cache read failed:", error);
    return null;
  }
}

export async function setThreadListCache(boardUrl: string, threads: IThread[]): Promise<void> {
  try {
    const { platform } = await import("src/app");
    const store = platform.storage.getStore(UI_CACHE_STORE);
    await store.put({ url: threadListCacheKey(boardUrl), data: threads });
  } catch (error) {
    logger.error("cache save failed:", error);
  }
}

export type ThreadListSortColumn = "num" | "title" | "resCount" | "unreadCount" | "heat";
export type ThreadListSortDirection = "asc" | "desc";
export type ThreadListSortPreference = {
  column: ThreadListSortColumn | null;
  direction: ThreadListSortDirection;
};

const THREAD_LIST_SORT_STORAGE_KEY = "chlens_browser_thread_list_sort_by_site";
export const THREAD_LIST_COLUMN_VISIBILITY_STORAGE_KEY =
  "chlens_browser_thread_list_columns_visibility";
export const THREAD_LIST_COLUMN_VISIBILITY_LOCKED_KEYS = ["title"] as const;
const DEFAULT_THREAD_LIST_SORT: ThreadListSortPreference = { column: null, direction: "asc" };

const BG_COLOR_PRESETS: Record<string, string> = {
  yellow: "#ffeb3b",
  blue: "#e3f2fd",
  green: "#c8e6c9",
  red: "#ffcdd2",
  purple: "#e1bee7",
  orange: "#ffe0b2",
  pink: "#f8bbd0",
  cyan: "#b2ebf2",
  lime: "#f0f4c3",
  amber: "#ffecb3",
};

export type DividerStyle = React.CSSProperties & {
  "--data-table-divider-accent"?: string;
};

function resolveHighlightColor(bgColor: string): string {
  return BG_COLOR_PRESETS[bgColor] ?? bgColor;
}

export function createHighlightDividerStyle(bgColor: string): DividerStyle {
  return { "--data-table-divider-accent": resolveHighlightColor(bgColor) };
}

export function isSortColumn(value: string): value is ThreadListSortColumn {
  return (
    value === "num" ||
    value === "title" ||
    value === "resCount" ||
    value === "unreadCount" ||
    value === "heat"
  );
}

export function isSortDirection(value: string): value is ThreadListSortDirection {
  return value === "asc" || value === "desc";
}

function resolveThreadListSortSiteKey(boardUrl: string): string {
  try {
    const tsld = new ChURL(boardUrl).getTsld();
    if (tsld) return tsld;
  } catch {
    // URL 正規化に失敗しても hostname fallback で設定を分離できるようにする。
  }
  try {
    return new window.URL(boardUrl).hostname.toLowerCase();
  } catch {
    return boardUrl;
  }
}

export function readThreadListSortPreference(boardUrl: string): ThreadListSortPreference {
  try {
    const raw = getStore2String(THREAD_LIST_SORT_STORAGE_KEY);
    if (!raw) return DEFAULT_THREAD_LIST_SORT;
    const stored = JSON.parse(raw) as Record<string, Partial<ThreadListSortPreference> | undefined>;
    const preference = stored[resolveThreadListSortSiteKey(boardUrl)];
    const direction = preference?.direction ?? "";
    if (preference?.column === null) return DEFAULT_THREAD_LIST_SORT;
    if (preference?.column && isSortColumn(preference.column) && isSortDirection(direction)) {
      return { column: preference.column, direction };
    }
  } catch (error) {
    logger.error("sort preference read failed:", error);
  }
  return DEFAULT_THREAD_LIST_SORT;
}

export function writeThreadListSortPreference(
  boardUrl: string,
  preference: ThreadListSortPreference,
): void {
  try {
    const raw = getStore2String(THREAD_LIST_SORT_STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as Record<string, ThreadListSortPreference>) : {};
    stored[resolveThreadListSortSiteKey(boardUrl)] = preference;
    void setStore2String(THREAD_LIST_SORT_STORAGE_KEY, JSON.stringify(stored));
  } catch (error) {
    logger.error("sort preference save failed:", error);
  }
}

export function calcHeat(now: number, created: number, resCount: number): string {
  if (!Number.isFinite(created) || created > now) return "0.0";
  const elapsed = Math.max((now - created) / 1000, 1) / (24 * 60 * 60);
  return (resCount / elapsed).toFixed(1);
}

export function isThreadVisited(thread: Pick<IThread, "readState">): boolean {
  // 変更理由: readState が存在するスレは一度開かれたと判断し、未読表示と同じ基準で
  // 一覧上の文字色を控えめにして未閲覧スレとの視認性を分ける。
  return thread.readState != null;
}

export type DisplayThread = {
  thread: IThread;
  originalIndex: number;
  unreadCount: number;
  heat: number;
  isBookmarked: boolean;
};

export function getThreadUnreadCount(thread: Pick<IThread, "resCount" | "readState">): number {
  // 変更理由: 既読位置がないスレはまだ閲覧していないため、レス数全体を
  // 未読として表示すると未閲覧スレまで未読バッジの対象になる。
  if (!thread.readState) return 0;

  // 変更理由: read_state_updated で受信レス数が先行する場合もあるため、
  // 一覧のレス数と既読状態が把握している受信数の大きい方を基準にする。
  return Math.max(Math.max(thread.resCount, thread.readState.received) - thread.readState.read, 0);
}

export const THREAD_LIST_COLUMNS: ColumnDef<DisplayThread>[] = [
  {
    key: "num",
    header: "No.",
    headerClassName: "thread-list__th--num",
    cellClassName: "thread-list__num",
    sortable: true,
    cell: ({ originalIndex }) => originalIndex,
  },
  {
    key: "title",
    header: "タイトル",
    headerClassName: "thread-list__th--title",
    cellClassName: "thread-list__title",
    sortable: true,
    cell: ({ thread, isBookmarked }) => {
      return (
        <span className="thread-list__title-content">
          {isBookmarked ? (
            <Star
              className="thread-list__bookmark-star"
              size={14}
              fill="currentColor"
              aria-label="ブックマーク済み"
            />
          ) : null}
          <span className="thread-list__title-text">{thread.title}</span>
          {/* 変更理由: ハイライトの識別はセクション先頭の縦線と見出しで十分なため、
              各アイテムへ補助バッヂを重ねずタイトルの視認性を保つ。 */}
        </span>
      );
    },
  },
  {
    key: "resCount",
    header: "レス",
    headerClassName: "thread-list__th--count",
    cellClassName: "thread-list__count",
    sortable: true,
    cell: ({ thread }) => thread.resCount,
  },
  {
    key: "unreadCount",
    header: "未読",
    headerClassName: "thread-list__th--count",
    cellClassName: "thread-list__count",
    sortable: true,
    cell: ({ unreadCount }) =>
      unreadCount > 0 ? <span className="thread-list__unread-badge">{unreadCount}</span> : null,
  },
  {
    key: "heat",
    header: "勢い",
    headerClassName: "thread-list__th--heat",
    cellClassName: "thread-list__heat",
    sortable: true,
    cell: ({ heat }) => heat.toFixed(1),
  },
];
