import { container } from "src/service-container/index";
import {
  getBoardUrlFromThreadUrl,
  parseInternalBrowserPage,
} from "src/view/browser/utils/link-routing";
import {
  mergeOmnibarSources,
  type OmnibarBoardSource,
  type OmnibarBookmarkSource,
  type OmnibarHistorySource,
} from "src/view/browser/utils/omnibar";

interface LegacyReadStateLike {
  read?: unknown;
}

interface LegacyBookmarkLike {
  url?: unknown;
  title?: unknown;
  boardTitle?: unknown;
  readState?: LegacyReadStateLike | undefined;
}

interface LegacyHistoryLike {
  url?: unknown;
  title?: unknown;
  boardTitle?: unknown;
  viewedDate?: unknown;
  date?: unknown;
}

const OMNIBAR_HISTORY_FETCH_COUNT = 300;

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeLegacyTimestamp(value: unknown): number {
  const normalized = Math.trunc(toFiniteNumber(value));
  return normalized > 0 ? normalized : 0;
}

function deriveBoardTitle(threadUrl: string): string {
  try {
    const parsed = new window.URL(threadUrl);
    // 変更理由: URLから板名を再抽出せず、共有処理の結果を表示名だけこの関数で整形する。
    const boardUrl = getBoardUrlFromThreadUrl(threadUrl);
    if (boardUrl !== threadUrl) {
      const boardParsed = new window.URL(boardUrl);
      if (/^\/[^/]+\/$/.test(boardParsed.pathname)) {
        return `${parsed.hostname}/${boardParsed.pathname.replace(/^\//, "").replace(/\/$/, "")}`;
      }
    }

    return parsed.hostname;
  } catch {
    return "";
  }
}

function deriveBoardTitleFromBoardUrl(boardUrl: string): string {
  try {
    const parsed = new URL(boardUrl);
    const pathPart = parsed.pathname.replace(/^\/|\/$/g, "");
    return pathPart ? `${parsed.hostname}/${pathPart}` : parsed.hostname;
  } catch {
    return "";
  }
}

async function readBookmarkSources(): Promise<OmnibarBookmarkSource[]> {
  // window.app ではなくサービスコンテナから読む（legacy-window-app-plan の Phase 2）。
  // 以前は getAll がない場合に getAllThreads・getAllBoards をつなげていたが、Bookmark は常に getAll を持つ。
  await container.bookmark.ready();
  // 保存されている値の形は信用せず、下で1件ずつ確かめるため unknown として扱う。
  const rawItems: unknown[] = container.bookmark.getAll();

  return rawItems
    .map<OmnibarBookmarkSource | null>((rawItem) => {
      const item = rawItem as LegacyBookmarkLike;
      const url = normalizeString(item.url);
      if (!url) {
        return null;
      }

      const parsed = parseInternalBrowserPage(url);
      const boardTitle = normalizeString(item.boardTitle);

      return {
        url,
        title: normalizeString(item.title, url),
        boardTitle:
          parsed?.type === "threadList"
            ? boardTitle || deriveBoardTitleFromBoardUrl(url)
            : boardTitle || deriveBoardTitle(url),
      };
    })
    .filter((item): item is OmnibarBookmarkSource => item !== null);
}

async function readHistorySources(): Promise<OmnibarHistorySource[]> {
  // window.app ではなくサービスコンテナの閲覧履歴から読む（legacy-window-app-plan の Phase 1）。
  const raw = await container.history.get(0, OMNIBAR_HISTORY_FETCH_COUNT);
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map<OmnibarHistorySource | null>((value) => {
      const item = value as LegacyHistoryLike;
      const url = normalizeString(item.url);
      if (!url) {
        return null;
      }

      return {
        url,
        title: normalizeString(item.title, url),
        boardTitle: normalizeString(item.boardTitle, deriveBoardTitle(url)),
        viewedDate: normalizeLegacyTimestamp(item.viewedDate ?? item.date),
      };
    })
    .filter((item): item is OmnibarHistorySource => item !== null);
}

async function readBBSMenuBoardSources(): Promise<OmnibarBoardSource[]> {
  try {
    const result = await container.bbsMenu.get(false);
    if (result.status !== "success" || !result.menu) {
      return [];
    }
    return result.menu.flatMap((menu) =>
      menu.categories.flatMap((category) =>
        category.boards.map((board) => ({
          url: board.url,
          name: board.name,
          // 変更理由: bbsmenu の板候補は board.name が既に正式な板名なので、
          // URL 派生ラベルを boardTitle に入れると遷移直後の再解決判定を誤らせる。
          boardTitle: normalizeString(board.name),
        })),
      ),
    );
  } catch (error) {
    // 板一覧が取得できなくても履歴・お気に入り候補は使えるよう空扱いにするが、原因はログに残す。
    console.error("[omnibar] bbsmenuの板候補を取得できませんでした", error);
    return [];
  }
}

/**
 * URLバー候補の元になる履歴・お気に入り・bbsmenu板を取得して統合する。
 *
 * 変更理由: 候補の収集と統合は画面状態に依存しないため、NavigationBar から切り離して
 * 単体で差し替え・検証できるようにする。
 */
export async function loadOmnibarSources() {
  const [historyItems, bookmarkItems, boardItems] = await Promise.all([
    readHistorySources(),
    readBookmarkSources(),
    readBBSMenuBoardSources(),
  ]);

  // 変更理由: URLバー候補は履歴・お気に入り・bbsmenu板を統合し、
  // 利用者の直近行動と明示的なお気に入りおよび板一覧を1ストロークで辿れるようにする。
  return mergeOmnibarSources(bookmarkItems, historyItems, boardItems);
}
