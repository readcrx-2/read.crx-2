import { DEFAULT_CONFIG } from "src/app/config-defaults";
import { getAutoRefreshPageKey } from "src/view/browser/state/tabs/auto-refresh-pages";
import { readConfigValue } from "src/view/browser/state/tabs/tab-store-config";
import { deriveBoardUrlFromThreadUrl } from "src/view/browser/state/tabs/tab-store-state-helpers";
import {
  buildHierarchy,
  createHomeTab,
  createTabRuntimeState,
  ensurePaneHasTab,
  getCurrentPage,
  type Page,
  type Pane,
  type Tab,
} from "src/view/browser/types";
import { parseInternalBrowserPage } from "src/view/browser/utils/link-routing";
import { normalizePageLocation } from "src/view/browser/utils/page-location";

// 新規タブ・ペインの生成と、設定に応じた初期ページの解決。
type NewTabPageMode = "home" | "related_board" | "custom_board";

function resolveNewTabPageMode(raw: string | null): NewTabPageMode {
  if (raw === "home" || raw === "related_board" || raw === "custom_board") {
    return raw;
  }

  // 未設定時だけホームを既定にし、利用者が指定した初期ページの設定は維持する。
  return DEFAULT_CONFIG.new_tab_page_mode as NewTabPageMode;
}

export function shouldFocusNewTabOnOpen(): boolean {
  const rawValue = readConfigValue("focus_new_tab_on_open");
  if (rawValue === null) {
    return DEFAULT_CONFIG.focus_new_tab_on_open === "on";
  }
  return rawValue === "on";
}

export function getPageIdentity(page: Page): string {
  switch (page.type) {
    case "home":
    case "newTab":
      return page.type;
    case "boardList":
      return "boardList";
    case "settings":
      return "settings";
    // クイックアクセス3種を別IDとして扱い、
    // 「既に開いている判定」で相互に潰し合って遷移不能になる回帰を防ぐ。
    case "bookmarkList":
      return "bookmarkList";
    case "historyList":
      return "historyList";
    case "writeHistoryList":
      return "writeHistoryList";
    case "logList":
      return "logList";
    case "threadList":
      return getAutoRefreshPageKey(page) ?? "threadList";
    case "thread":
      return getAutoRefreshPageKey(page) ?? "thread";
  }

  throw new Error("Unsupported page type");
}

function createThreadListPageFromBoardUrl(boardUrl: string): Extract<Page, { type: "threadList" }> {
  const normalized = normalizePageLocation(boardUrl);
  return {
    type: "threadList",
    title: normalized,
    boardUrl: normalized,
    boardTitle: normalized,
  };
}

function resolveRelatedBoardPage(
  sourcePage: Page | null,
): Extract<Page, { type: "threadList" }> | null {
  if (!sourcePage) {
    return null;
  }

  if (sourcePage.type === "threadList") {
    return {
      ...sourcePage,
      boardUrl: normalizePageLocation(sourcePage.boardUrl),
      boardTitle: sourcePage.boardTitle || normalizePageLocation(sourcePage.boardUrl),
      title:
        sourcePage.title || sourcePage.boardTitle || normalizePageLocation(sourcePage.boardUrl),
    };
  }

  if (sourcePage.type === "thread") {
    const boardUrl = deriveBoardUrlFromThreadUrl(sourcePage.threadUrl);
    if (!boardUrl) {
      return null;
    }

    return createThreadListPageFromBoardUrl(boardUrl);
  }

  return null;
}

function resolveRelatedBoardPageFromTabHistory(
  sourceTab: Tab | null,
): Extract<Page, { type: "threadList" }> | null {
  if (!sourceTab) {
    return null;
  }

  const currentPage = getCurrentPage(sourceTab);
  if (currentPage.type !== "thread") {
    return null;
  }

  const targetBoardUrl = deriveBoardUrlFromThreadUrl(currentPage.threadUrl);
  if (!targetBoardUrl) {
    return null;
  }

  const normalizedTargetBoardUrl = normalizePageLocation(targetBoardUrl);

  for (let index = sourceTab.currentIndex - 1; index >= 0; index -= 1) {
    const candidate = sourceTab.history[index];
    if (candidate.type !== "threadList") {
      continue;
    }

    if (normalizePageLocation(candidate.boardUrl) !== normalizedTargetBoardUrl) {
      continue;
    }

    return {
      ...candidate,
      boardUrl: normalizedTargetBoardUrl,
      boardTitle: candidate.boardTitle || candidate.title || normalizedTargetBoardUrl,
      title: candidate.title || candidate.boardTitle || normalizedTargetBoardUrl,
    };
  }

  return null;
}

function resolveConfiguredNewTabPage(sourcePage: Page | null, sourceTab: Tab | null = null): Page {
  const mode = resolveNewTabPageMode(readConfigValue("new_tab_page_mode"));

  if (mode === "home") {
    // 新しいタブもホームから始め、板一覧はホームのボタンから開く。
    return { type: "home", title: "ホーム" };
  }

  if (mode === "custom_board") {
    const rawBoardUrl = readConfigValue("new_tab_page_board_url");
    if (typeof rawBoardUrl === "string" && rawBoardUrl.trim() !== "") {
      return createThreadListPageFromBoardUrl(rawBoardUrl);
    }

    return { type: "home", title: "ホーム" };
  }

  // 変更理由: 「関連する板」タブをスレッドから開くとき、
  // 直前の threadList 履歴にある確定板名を再利用して URL 仮タイトルの残留を防ぐ。
  const relatedBoardPage =
    resolveRelatedBoardPageFromTabHistory(sourceTab) ?? resolveRelatedBoardPage(sourcePage);
  if (relatedBoardPage) {
    return relatedBoardPage;
  }

  return { type: "home", title: "ホーム" };
}

export function createTab(sourcePage: Page | null = null, sourceTab: Tab | null = null): Tab {
  const initialPage = resolveConfiguredNewTabPage(sourcePage, sourceTab);
  if (initialPage.type === "home") return createHomeTab();
  return {
    id: crypto.randomUUID(),
    history: buildHierarchy(initialPage),
    currentIndex: buildHierarchy(initialPage).length - 1,
    pinned: false,
    ...createTabRuntimeState(),
  };
}

export function createTabFromPage(page: Page): Tab {
  const history = buildHierarchy(page);
  return {
    id: crypto.randomUUID(),
    history,
    currentIndex: history.length - 1,
    pinned: false,
    ...createTabRuntimeState(),
  };
}

// 単一タブを内包する新規ペインを生成する。
// 新しいペインは入口のページだけを持ち、専用の固定タブを追加しない。
export function createPane(initialTab: Tab): Pane {
  return ensurePaneHasTab({
    id: crypto.randomUUID(),
    tabs: [initialTab],
    activeTabId: initialTab.id,
  });
}

export function readInitialPageFromLocation(): Page | null {
  try {
    const query = new window.URL(window.location.href).searchParams.get("q");
    if (typeof query !== "string" || query.trim() === "") {
      return null;
    }

    return parseInternalBrowserPage(query);
  } catch {
    return null;
  }
}
