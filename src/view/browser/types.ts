import { getBoardUrlFromThreadUrl } from "src/view/browser/utils/link-routing";
import { normalizePageLocation } from "src/view/browser/utils/page-location";

// ページ種別の定義
// すべてのタブがホームを起点とし、同じタブでスレ一覧・スレッドへ移動する。
export type PageType =
  | "home"
  | "newTab"
  | "boardList"
  | "threadList"
  | "thread"
  | "settings"
  | "bookmarkList"
  | "historyList"
  | "writeHistoryList"
  | "logList";

// スレッドの絞り込みはタブのviewStatesへ保存されるため、
// スレッド画面だけでなくタブ状態モデルからも参照できる共通型としてここに置く。
export type ThreadFilter = "all" | "popular" | "image" | "video" | "link";

// 変更理由: 検索対象も検索語と同じスレッド単位で復元し、タブを切り替えても
// ユーザーが選んだ本文・名前・IDの検索条件を失わないようにする。
export type ThreadSearchTarget = "all" | "body" | "name" | "id";

export interface HomePage {
  type: "home";
  title: string;
}

// 保存済みセッションの旧ページ種別を読み取り、復元時にhomeへ移行する。
export interface NewTabPage {
  type: "newTab";
  title: string;
}

export interface BoardListPage {
  type: "boardList";
  title: string;
}

export interface ThreadListPage {
  type: "threadList";
  title: string;
  boardUrl: string;
  boardTitle: string;
}

export interface ThreadPage {
  type: "thread";
  title: string;
  threadUrl: string;
}

export interface SettingsPage {
  type: "settings";
  title: string;
  sectionId?: string;
}

export interface BookmarkListPage {
  type: "bookmarkList";
  title: string;
}

export interface HistoryListPage {
  type: "historyList";
  title: string;
}

export interface WriteHistoryListPage {
  type: "writeHistoryList";
  title: string;
}

export interface LogListPage {
  type: "logList";
  title: string;
}

export type Page =
  | HomePage
  | NewTabPage
  | BoardListPage
  | ThreadListPage
  | ThreadPage
  | SettingsPage
  | BookmarkListPage
  | HistoryListPage
  | WriteHistoryListPage
  | LogListPage;

// 設定画面のセクションの種類。タブの表示状態に保存されるため、設定画面ではなくここに置く。
export type SettingsSectionId =
  | "general"
  | "display"
  | "site-board"
  | "reload"
  | "overlay"
  | "ng"
  | "other"
  | "debug"
  | "data";

// 設定画面の表示状態。TabViewState.settingsPage としてタブ単位で保存・復元される。
export interface SettingsPageUiState {
  activeSectionId?: SettingsSectionId | "thumbnail";
  // 再読み込みと別カテゴリへの明示的なリンク遷移を区別するため、直前のリンク先を残す。
  linkedSectionId?: string;
  mainScrollTop?: number;
  ngSettingsTab?: "ng" | "replacement";
  replacementExamplesOpen?: boolean;
  ngExamplesOpen?: boolean;
  ngAdvancedOpen?: boolean;
}

export interface TabViewState {
  // 設定画面の表示状態をタブ単位で保持し、再読み込みや閉じたタブの復元で引き継ぐ。
  settingsPage?: SettingsPageUiState;
  searchQuery?: string;
  filter?: ThreadFilter;
  // 人気フィルタの判定条件もフィルタ状態と同じスレッド単位で復元する。
  popularReplyThreshold?: number;
  searchTarget?: ThreadSearchTarget;
  // 旧版が既定値の「すべて」を自動保存していたため、移行済みかを記録する。
  searchTargetDefaultMigrated?: boolean;
  sortColumn?: string | null;
  sortDirection?: "asc" | "desc";
  searchMode?: "title" | "body";
}

export type TabViewStates = Record<string, TabViewState>;

/**
 * セッションへ保存し、再起動後に復元するタブの状態。
 *
 * 変更理由: 以前は保存する値と実行中だけの値が Tab に混在し、保存時・復元時に
 * 一時状態を個別に消していた。新しい一時状態を足すと消し忘れて保存されるため、
 * 保存対象をこの型に限定し、セッション保存はこの型の項目だけを書き出す。
 */
export interface PersistedTab {
  id: string;
  history: Page[];
  currentIndex: number;
  pinned: boolean;
  // ページごとの検索・絞り込み・並び順をタブに保持する。
  // URLをキーに含めることで、同じタブ内で板やスレを移動しても状態が混ざらない。
  viewStates?: TabViewStates;
}

/**
 * 実行中だけ意味を持つタブの状態。セッションへは保存せず、復元時は既定値で作り直す。
 */
export interface TabRuntimeState {
  // ページの強制再読み込みに使うカウンター。インクリメントするとContentAreaがページを再マウントする
  reloadKey: number;
  // 自動更新は現在ページだけに結び付け、別ページへ移動した時点で解除する。
  // スレ/スレ一覧を同じロジックで扱うため、URLそのものではなくページ識別キーを保持する。
  autoRefreshEnabled: boolean;
  autoRefreshPageKey: string | null;
  // dat落ち・満了・次スレ探索の期限終了を記録し、同じページの開始連打による再開を防ぐ。
  autoRefreshStoppedPageKey?: string | null;
}

export interface Tab extends PersistedTab, TabRuntimeState {}

export function createTabRuntimeState(): TabRuntimeState {
  return {
    reloadKey: 0,
    autoRefreshEnabled: false,
    autoRefreshPageKey: null,
    autoRefreshStoppedPageKey: null,
  };
}

// 横分割の1カラム。各ペインが独立したタブ群とアクティブタブを持つ。
// 配列順がそのまま画面上の横並び順になる。
export interface Pane {
  id: string;
  tabs: Tab[];
  activeTabId: string;
}

// --- Core API の型定義 ---
// app_core.js から提供されるモジュールの型

export interface ThreadListItem {
  title: string;
  url: string;
  resCount: number;
  ng?: unknown;
  highlight?: unknown;
  isNet?: boolean;
  readState?: unknown;
  threadNumber?: string;
}

export interface BoardResult {
  threads: ThreadListItem[];
  message?: string;
}

export interface ThreadRes {
  num: number;
  name: string;
  mail: string;
  message: string;
  other: string;
  id?: string;
  trip?: string;
  slip?: string;
  be?: string;
  date?: string;
  ng?: unknown;
}

export interface ThreadDetail {
  url: string;
  title: string;
  res: ThreadRes[];
  expired: boolean;
  message?: string;
}

// --- ユーティリティ関数 ---

export function getCurrentPage(tab: Tab): Page {
  return tab.history[tab.currentIndex];
}

// 新規タブと空ペインの入口は通常のホームに揃え、固定扱いしない。
export function createHomeTab(id?: string): Tab {
  return {
    id: id ?? crypto.randomUUID(),
    history: [{ type: "home", title: "ホーム" }],
    currentIndex: 0,
    pinned: false,
    ...createTabRuntimeState(),
  };
}

// タブの移動で空になったペインにだけ入口を補い、既存のタブ順を保つ。
export function ensurePaneHasTab<T extends { tabs: Tab[]; activeTabId: string }>(pane: T): T {
  // 常設タブは追加せず、移動や終了で空になったペインだけホームで補う。
  if (pane.tabs.length > 0) return pane;
  const home = createHomeTab();
  return { ...pane, tabs: [home], activeTabId: home.id };
}

export function getPageViewStateKey(page: Page): string {
  switch (page.type) {
    case "threadList":
      return `threadList:${normalizePageLocation(page.boardUrl)}`;
    case "thread":
      return `thread:${normalizePageLocation(page.threadUrl)}`;
    default:
      return page.type;
  }
}

export function canGoBack(tab: Tab): boolean {
  // ホームへの戻るも同じタブの履歴で行い、他のタブを選択しない。
  return tab.currentIndex > 0;
}

export function canGoForward(tab: Tab): boolean {
  return tab.currentIndex < tab.history.length - 1;
}

export function getDisplayUrl(page: Page): string {
  switch (page.type) {
    case "home":
    case "newTab":
      return "";
    case "boardList":
      return "板一覧";
    case "settings":
      return "設定";
    case "bookmarkList":
      return "ブックマーク";
    case "historyList":
      return "閲覧履歴";
    case "writeHistoryList":
      return "書き込み履歴";
    case "logList":
      return "ログ検索";
    case "threadList":
      return (page as ThreadListPage).boardUrl;
    case "thread":
      return (page as ThreadPage).threadUrl;
  }
}

// 変更理由: 板URLの形式ごとの差をUIのページ階層へ持ち込まないため、導出は共通処理へ委譲する。
function threadUrlToBoardUrl(threadUrl: string): string {
  return getBoardUrlFromThreadUrl(threadUrl);
}

// 新規タブ用: ページに対してカノニカルな階層スタックを構築する
// 板一覧はホームから明示的に開く入口に限定し、祖先として自動生成しない。
export function buildHierarchy(page: Page): Page[] {
  switch (page.type) {
    case "home":
    case "newTab":
      return [{ type: "home", title: "ホーム" }];
    case "boardList":
    case "settings":
    case "bookmarkList":
    case "historyList":
    case "writeHistoryList":
    case "logList":
    case "threadList":
      // URLや別タブから直接開いた場合も、同じタブのホームへ戻れる履歴を持たせる。
      return [{ type: "home", title: "ホーム" }, page];

    case "thread": {
      const boardUrl = threadUrlToBoardUrl(page.threadUrl);
      return [
        { type: "home", title: "ホーム" },
        {
          type: "threadList",
          title: boardUrl,
          boardUrl,
          boardTitle: boardUrl,
        },
        page,
      ];
    }
  }
}
