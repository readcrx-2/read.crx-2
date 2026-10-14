import { getPageIdentity } from "src/view/browser/state/tabs/tab-store-new-tab";
import { type TabStoreState } from "src/view/browser/state/tabs/tab-store-types";
import {
  buildHierarchy,
  ensurePaneHasTab,
  getCurrentPage,
  getPageViewStateKey,
  type Page,
  type Pane,
  type Tab,
} from "src/view/browser/types";
import { resolveBoardUrlForBrowser } from "src/view/browser/utils/link-routing";
import { normalizePageLocation } from "src/view/browser/utils/page-location";

// タブストアの状態(ペイン・タブ・履歴スタック)を更新する純粋なヘルパー。
// 閉じたタブの最大保持数
const MAX_CLOSED_TABS = 20;

export function getPane(state: TabStoreState, paneId: string): Pane {
  return state.panes.find((p) => p.id === paneId) ?? state.panes[0];
}

export function getActivePane(state: TabStoreState): Pane {
  return getPane(state, state.activePaneId);
}

export function resolvePaneId(state: TabStoreState, paneId?: string): string {
  if (paneId && state.panes.some((p) => p.id === paneId)) {
    return paneId;
  }
  return state.activePaneId;
}

export function updatePane(
  state: TabStoreState,
  paneId: string,
  updater: (pane: Pane) => Pane,
): TabStoreState {
  return {
    ...state,
    // タブ移動で空になったペインのみ補い、利用者のタブ構成を保つ。
    panes: state.panes.map((pane) => (pane.id === paneId ? ensurePaneHasTab(updater(pane)) : pane)),
  };
}

export function getPaneActiveTab(pane: Pane): Tab {
  return pane.tabs.find((t) => t.id === pane.activeTabId)!;
}

// アクティブペインのアクティブタブ。ウィンドウタイトルなどグローバル文脈で使う。
export function getActivePaneActiveTab(state: TabStoreState): Tab {
  return getPaneActiveTab(getActivePane(state));
}

// 指定ペインのアクティブタブだけを更新する。
function updatePaneActiveTab(
  state: TabStoreState,
  paneId: string,
  updater: (tab: Tab) => Tab,
): TabStoreState {
  return updatePane(state, paneId, (pane) => ({
    ...pane,
    tabs: pane.tabs.map((t) => (t.id === pane.activeTabId ? updater(t) : t)),
  }));
}

function updateTabById(
  state: TabStoreState,
  tabId: string,
  updater: (tab: Tab) => Tab,
): TabStoreState {
  return {
    ...state,
    panes: state.panes.map((pane) => ({
      ...pane,
      tabs: pane.tabs.map((tab) => (tab.id === tabId ? updater(tab) : tab)),
    })),
  };
}

export function updateTargetTab(
  state: TabStoreState,
  paneId: string,
  tabId: string | undefined,
  updater: (tab: Tab) => Tab,
): TabStoreState {
  // 変更理由: 別窓のページは元のPaneProviderのactiveTabとは異なるタブを操作するため、
  // tabIdが渡された場合はペインを跨いで対象を更新し、従来の省略時だけactiveTabへ戻す。
  return tabId ? updateTabById(state, tabId, updater) : updatePaneActiveTab(state, paneId, updater);
}

export function pushPageToTabHistory(tab: Tab, page: Page): Tab {
  const currentPage = getCurrentPage(tab);
  if (getPageIdentity(currentPage) === getPageIdentity(page)) {
    return tab;
  }

  // 現在位置以降の「進む」履歴を切り捨て、新ページを追加する。
  // 実際の閲覧順を優先し、ホームからのスレ直開きには板の戻る先だけを補う。
  const historyUntilCurrent = tab.history.slice(0, tab.currentIndex + 1);
  // 板一覧から板を選んだ後はホームへ戻り、検索状態はviewStatesに残す。
  if (currentPage.type === "boardList" && page.type === "threadList") historyUntilCurrent.pop();
  if (currentPage.type === "home" && page.type === "thread") {
    return { ...tab, history: buildCanonicalThreadStack(page, null), currentIndex: 2 };
  }

  const inheritViewStateForNextThread = (): Tab["viewStates"] => {
    if (currentPage.type !== "thread" || page.type !== "thread") {
      return tab.viewStates;
    }

    const currentPageKey = getPageViewStateKey(currentPage);
    const nextPageKey = getPageViewStateKey(page);
    const currentViewState = tab.viewStates?.[currentPageKey];
    if (!currentViewState || tab.viewStates?.[nextPageKey]) {
      return tab.viewStates;
    }

    // 変更理由: 次スレへの移動では、同じタブで適用していた検索・レス絞り込みを
    // そのまま使える方が自然なため、対象スレに個別状態が無い場合だけ引き継ぐ。
    return {
      ...tab.viewStates,
      [nextPageKey]: currentViewState,
    };
  };

  // 変更理由: ブラウザ標準と同じく、同一タブ内の遷移は実際に訪れたページだけを積む。
  // 別板スレへ移動したときも前居た場所へ戻れるようにし、対象板の自動補完は行わない。
  // 新規タブの正規履歴は buildHierarchyForNewTab が担う。
  const newHistory = [...historyUntilCurrent, page];
  return {
    ...tab,
    history: newHistory,
    currentIndex: newHistory.length - 1,
    viewStates: inheritViewStateForNextThread(),
  };
}

export function deriveBoardUrlFromThreadUrl(threadUrl: string): string | null {
  // 変更理由: 履歴スタックの親板は、形式を解釈せずchlibの意味解析結果から得る。
  const resolved = resolveBoardUrlForBrowser(threadUrl);
  return resolved?.type === "thread" ? resolved.boardUrl : null;
}

function buildCanonicalThreadListStack(
  threadListPage: Extract<Page, { type: "threadList" }>,
): Page[] {
  // 戻る先は同じタブのホームとし、履歴へ板一覧を自動で挟まない。
  return [{ type: "home", title: "ホーム" }, threadListPage];
}

function buildCanonicalThreadStack(
  threadPage: Extract<Page, { type: "thread" }>,
  sourceThreadListPage: Extract<Page, { type: "threadList" }> | null,
): Page[] {
  const targetBoardUrl = deriveBoardUrlFromThreadUrl(threadPage.threadUrl);
  const normalizedTargetBoardUrl = targetBoardUrl ? normalizePageLocation(targetBoardUrl) : null;

  const boardPageFromSource =
    sourceThreadListPage &&
    normalizedTargetBoardUrl &&
    normalizePageLocation(sourceThreadListPage.boardUrl) === normalizedTargetBoardUrl
      ? sourceThreadListPage
      : null;

  const boardPage: Extract<Page, { type: "threadList" }> = boardPageFromSource ?? {
    type: "threadList",
    title: targetBoardUrl ?? threadPage.threadUrl,
    boardUrl: targetBoardUrl ?? threadPage.threadUrl,
    boardTitle: targetBoardUrl ?? threadPage.threadUrl,
  };

  return [...buildCanonicalThreadListStack(boardPage), threadPage];
}

// 新規タブ専用: 現在ページをコンテキストにカノニカルな祖先履歴を生成する。
// 現在タブでは実際の履歴を優先し、ホームからのスレ直開きだけ板を補う。
export function buildHierarchyForNewTab(sourcePage: Page, targetPage: Page): Page[] {
  if (targetPage.type === "thread") {
    return buildCanonicalThreadStack(
      targetPage,
      sourcePage.type === "threadList" ? sourcePage : null,
    );
  }

  if (targetPage.type === "threadList") {
    return buildCanonicalThreadListStack(targetPage);
  }

  return buildHierarchy(targetPage);
}

// 閉じたタブを記録するヘルパー
export function pushClosed(closedTabs: Tab[], tab: Tab): Tab[] {
  // 「閉じたタブを開く」は閉じる操作の取り消しなので、設定画面の表示状態も記録する。
  // 新しく開く設定タブは別のタブとして作られるため、この記録を引き継がない。
  return [tab, ...closedTabs].slice(0, MAX_CLOSED_TABS);
}
