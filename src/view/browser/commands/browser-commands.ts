import {
  Archive,
  ArrowLeftRight,
  Bookmark,
  Clipboard,
  Columns2,
  ExternalLink,
  FileJson,
  Filter,
  Hash,
  History,
  Import,
  List,
  type LucideIcon,
  PanelLeft,
  PanelRight,
  PenLine,
  PlayCircle,
  RotateCcw,
  RotateCw,
  Search,
  Settings,
  Star,
  X,
} from "lucide-react";
import { ChURL } from "packages/chlib/src/index";
import type { Dispatch } from "react";
import { isTauriRuntime } from "src/app/platform/runtime";
import { container } from "src/service-container";
import type { IToastService } from "src/service-container/interfaces";
import {
  COMMAND_REQUEST_IDS,
  type CommandTarget,
  executeCommandRequest,
} from "src/view/browser/commands/command-runtime";
import {
  getOpenUrlFromCommandId,
  getOpenUrlInNewTabFromCommandId,
  OPEN_URL_COMMAND_ID,
  OPEN_URL_IN_NEW_TAB_COMMAND_ID,
} from "src/view/browser/commands/open-url-command";
import {
  getResponseJumpResNumFromCommandId,
  RESPONSE_JUMP_COMMAND_ID,
} from "src/view/browser/commands/response-jump-command";
import { TAB_COMMAND_IDS, type TabCommandId } from "src/view/browser/commands/tab-command-runtime";
import type { ViewSurface } from "src/view/browser/hooks/use-view-surface";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import type { ScopedTabAction } from "src/view/browser/state/tabs/use-tab-store";
import type { Page, Tab } from "src/view/browser/types";
import { getCurrentPage } from "src/view/browser/types";
import {
  canQueryExtensionTabs,
  getOpenCompatibleThreadPages,
  removeExtensionTabs,
} from "src/view/browser/utils/extension-tabs";
import {
  QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE,
  type QuickAccessFilterPageType,
} from "src/view/browser/utils/filter-toolbar-events";
import {
  getBoardUrlFromThreadUrl,
  parseInternalBrowserPage,
  parseInternalBrowserPageStrict,
} from "src/view/browser/utils/link-routing";
import { getManualRefreshScopeKey, runManualRefresh } from "src/view/browser/utils/manual-refresh";
import {
  parseSikiLogFile,
  registerSikiLogThread,
  selectSikiLogFile,
} from "src/view/browser/utils/siki-log";
import {
  createQuickAccessPage,
  createSettingsPage,
  type QuickAccessPage,
} from "src/view/browser/utils/tab-pages";
import { requestThreadResJump } from "src/view/browser/utils/thread-read-state";
import { encodeThreadAsToon, estimateToonTokenCount } from "src/view/browser/utils/thread-toon";

export const BROWSER_COMMAND_GROUP_LABELS = {
  navigation: "移動",
  tab: "タブ",
  page: "現在のページ",
  layout: "表示",
  copy: "コピー",
} as const;

export type BrowserCommandGroup = keyof typeof BROWSER_COMMAND_GROUP_LABELS;

export const BROWSER_COMMAND_GROUP_ORDER: readonly BrowserCommandGroup[] = [
  "navigation",
  "tab",
  "page",
  "layout",
  "copy",
];

export interface BrowserCommandContext {
  // コマンドはフォーカス中のペインではなく、実際に表示している窓の対象を操作する。
  viewPage: Page;
  viewTab: Tab;
  tabs: readonly Tab[];
  closedTabs: readonly Tab[];
  isTwoPane: boolean;
  isWritePanelOpen: boolean;
  dispatch: Dispatch<ScopedTabAction>;
  toggleWritePanel: () => void;
  openResponseJumpDialog: () => void;
  openNextThreadSearchDialog: () => Promise<void>;
  openSimilarThreadSearchDialog?: () => Promise<void>;
  openArchiveReplayWindow: () => void;
  // 履歴・再取得・タブライフサイクルは対象タブを明示する実行器へ委譲し、
  // メニューとパレットで挙動を揃える。
  runTabCommand?: (id: TabCommandId) => boolean;
  // 変更理由: コマンドパレットを別窓へ載せた時も、通知とイベントを表示中の窓へ返すため。
  // 既存の外部呼び出しとの互換性を保つため未指定時は従来の共有サービスへフォールバックする。
  viewSurface?: ViewSurface;
  toast?: IToastService;
}

export interface BrowserCommandDefinition {
  id: string;
  label: string | ((context: BrowserCommandContext) => string);
  englishLabel: string | ((context: BrowserCommandContext) => string);
  description?: string;
  keywords?: readonly string[];
  group: BrowserCommandGroup;
  icon: LucideIcon;
  when?: (context: BrowserCommandContext) => boolean;
  isEnabled?: (context: BrowserCommandContext) => boolean;
  run: (context: BrowserCommandContext) => void | Promise<void>;
}

export interface ResolvedBrowserCommand {
  id: string;
  label: string;
  englishLabel: string;
  description?: string;
  keywords: readonly string[];
  group: BrowserCommandGroup;
  icon: LucideIcon;
  enabled: boolean;
}

function getCommandSurface(context: BrowserCommandContext): ViewSurface {
  return (
    context.viewSurface ?? {
      window: globalThis.window,
      document: globalThis.document,
    }
  );
}

function getCommandToast(context: BrowserCommandContext): IToastService {
  return context.toast ?? container.toast;
}

const RELOADABLE_PAGE_TYPES = new Set<Page["type"]>([
  "thread",
  "threadList",
  "historyList",
  "writeHistoryList",
  "logList",
]);

const FILTERABLE_PAGE_TYPES = new Set<Page["type"]>([
  "thread",
  "boardList",
  "threadList",
  "bookmarkList",
  "historyList",
  "writeHistoryList",
  "logList",
]);

export function getCommandPageTarget(page: Page): CommandTarget | null {
  switch (page.type) {
    case "thread":
      return {
        url: page.threadUrl,
        title: page.title || page.threadUrl,
        kind: "thread",
      };

    case "threadList":
      return {
        url: page.boardUrl,
        title: page.boardTitle || page.title || page.boardUrl,
        kind: "board",
      };

    default:
      return null;
  }
}

function getNormalizedCommandPageUrl(page: Page): string | null {
  const target = getCommandPageTarget(page);
  if (!target) return null;

  const parsed = parseInternalBrowserPage(target.url);
  const normalizedUrl =
    parsed?.type === "thread"
      ? parsed.threadUrl
      : parsed?.type === "threadList"
        ? parsed.boardUrl
        : target.url;

  return normalizedUrl;
}

function deriveRawUrl(page: Page, derive: (url: ChURL) => string | null): string | null {
  const normalizedUrl = getNormalizedCommandPageUrl(page);
  if (!normalizedUrl) return null;

  try {
    return derive(new ChURL(normalizedUrl));
  } catch {
    return null;
  }
}

export function getSubjectUrlForCommand(page: Page): string | null {
  return deriveRawUrl(page, (url) => url.getSubjectUrl());
}

export function getDatUrlForCommand(page: Page): string | null {
  if (page.type !== "thread") return null;
  return deriveRawUrl(page, (url) => url.getDatUrl());
}

function getBoardPageFromThread(page: Page): Extract<Page, { type: "threadList" }> | null {
  if (page.type !== "thread") return null;

  const boardUrl = getBoardUrlFromThreadUrl(page.threadUrl);
  if (boardUrl === page.threadUrl) return null;

  return {
    type: "threadList",
    title: boardUrl,
    boardUrl,
    boardTitle: boardUrl,
  };
}

function openSettings(context: BrowserCommandContext): void {
  const existingSettingsTab = context.tabs.find((tab) => getCurrentPage(tab).type === "settings");

  if (existingSettingsTab) {
    context.dispatch(tabActions.selectTab(existingSettingsTab.id));
    return;
  }

  // 設定を開くコマンドは従来どおり新しいタブへフォーカスを移す。
  context.dispatch(tabActions.openInNewTabForce(createSettingsPage(), { focus: true }));
}

function openQuickAccessPage(context: BrowserCommandContext, page: QuickAccessPage): void {
  context.dispatch(tabActions.navigate(page));
}

async function importOpenThreadTabs(context: BrowserCommandContext): Promise<void> {
  const openThreadPages = await getOpenCompatibleThreadPages();
  const existingThreadUrls = new Set(
    context.tabs
      .map((tab) => getCurrentPage(tab))
      .filter((page): page is Extract<Page, { type: "thread" }> => page.type === "thread")
      // 変更理由: 保存済みタブと正規化済みURLの表記差を吸収し、同じスレッドを重複登録しないため。
      .map((page) => {
        const normalizedPage = parseInternalBrowserPageStrict(page.threadUrl);
        return normalizedPage?.type === "thread" ? normalizedPage.threadUrl : page.threadUrl;
      }),
  );
  const pagesToImport = openThreadPages.filter(
    ({ page }) => !existingThreadUrls.has(page.threadUrl),
  );

  if (pagesToImport.length === 0) {
    getCommandToast(context).info("取り込める新しいスレタブはありません");
    return;
  }

  let failedTabCount = 0;
  for (const { page, tabIds } of pagesToImport) {
    // 変更理由: 一括取り込みで表示中のページを奪わず、確認したいタブを利用者が選べるよう
    // すべてバックグラウンド追加に統一し、追加できたページに対応する元タブだけを閉じる。
    context.dispatch(tabActions.openInNewTab(page, { background: true }));

    const failedTabIds = await removeExtensionTabs(tabIds);
    if (failedTabIds.length > 0) {
      failedTabCount += failedTabIds.length;
      console.error("[ChLens] スレッド取り込み元タブの一部を閉じられませんでした", {
        threadUrl: page.threadUrl,
        failedTabIds,
      });
    }
  }

  if (failedTabCount > 0) {
    getCommandToast(context).error(
      `${pagesToImport.length.toLocaleString("ja-JP")}件のスレタブを取り込みましたが、` +
        `元ブラウザタブ${failedTabCount.toLocaleString("ja-JP")}件を閉じられませんでした`,
    );
    return;
  }

  getCommandToast(context).success(
    `${pagesToImport.length.toLocaleString("ja-JP")}件のスレタブを取り込みました`,
  );
}

async function openSikiLogFile(context: BrowserCommandContext): Promise<void> {
  const file = await selectSikiLogFile();
  if (!file) {
    return;
  }

  try {
    const parsed = await parseSikiLogFile(file);
    const page = registerSikiLogThread(parsed);
    // 変更理由: Sikiログは通信で再取得できないため、選択直後に本文を登録してから
    // 通常のスレッドタブ経路へ渡し、既存の検索・アンカー・ポップアップ表示を共有する。
    context.dispatch(tabActions.openInNewTab(page));
    getCommandToast(context).success(`Sikiログ「${parsed.title}」を開きました`);
  } catch (error: unknown) {
    // ファイル選択後の解析失敗は画面上でも知らせつつ、元のエラーをログへ残す。
    console.error("[BrowserCommand] Sikiログを開けませんでした", {
      fileName: file.name,
      error,
    });
    getCommandToast(context).error(
      error instanceof Error ? error.message : "Sikiログを開けませんでした",
    );
  }
}

function toggleFilter(context: BrowserCommandContext): void {
  const { window: viewWindow } = getCommandSurface(context);
  const viewWindowWithConstructors = viewWindow as Window & typeof globalThis;
  if (context.viewPage.type === "thread") {
    viewWindow.dispatchEvent(
      new viewWindowWithConstructors.CustomEvent("thread-filter-toolbar-toggle"),
    );
    return;
  }

  const pageType = context.viewPage.type as QuickAccessFilterPageType;
  const eventName = QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE[pageType];
  if (!eventName) return;

  viewWindow.dispatchEvent(
    new viewWindowWithConstructors.CustomEvent(eventName, {
      detail: { tabId: context.viewTab.id },
    }),
  );
}

async function toggleBookmark(context: BrowserCommandContext): Promise<void> {
  const target = getCommandPageTarget(context.viewPage);
  if (!target) return;

  const isBookmarked = Boolean(container.bookmark.get(target.url));
  // 変更理由: パレットとコンテキストメニューが同じ対象コマンドを通ることで、
  // 非同期の保存完了と別窓の通知先を入口ごとに実装しないようにする。
  await executeCommandRequest(
    { id: COMMAND_REQUEST_IDS.TARGET_BOOKMARK_TOGGLE, args: { target } },
    { surface: getCommandSurface(context), toast: getCommandToast(context) },
  );
  getCommandToast(context).info(
    isBookmarked ? "ブックマークを削除しました" : "ブックマークに追加しました",
  );
}

async function copyWithNotice(
  context: BrowserCommandContext,
  text: string,
  label: string,
): Promise<void> {
  // 変更理由: パレットからの任意文字列コピーも他のコピー操作と同じ実行器を通し、
  // 別窓の表示先とエラー処理を一つの経路へ集約する。
  await executeCommandRequest(
    { id: COMMAND_REQUEST_IDS.CLIPBOARD_COPY_TEXT, args: { text } },
    { surface: getCommandSurface(context), toast: getCommandToast(context) },
  );
  getCommandToast(context).success(`${label}をコピーしました`);
}

async function copyTargetWithNotice(
  context: BrowserCommandContext,
  target: CommandTarget,
  format: "title" | "url" | "title-url" | "markdown",
  label: string,
): Promise<void> {
  // 変更理由: ページ用コマンドも対象付きコマンドへ橋渡しし、一覧・タブメニューと
  // 同じ形式判定と別窓のclipboard surfaceを共有する。
  await executeCommandRequest(
    { id: COMMAND_REQUEST_IDS.TARGET_COPY, args: { target, format } },
    { surface: getCommandSurface(context), toast: getCommandToast(context) },
  );
  getCommandToast(context).success(`${label}をコピーしました`);
}

async function retryBoardTitle(context: BrowserCommandContext): Promise<void> {
  const page = context.viewPage;
  if (page.type !== "threadList") return;

  // 板名解決系は旧コアと拡張機能APIへ依存するため、コマンド実行時だけ読み込む。
  const { askByUrl } = await import("src/core/board/BoardTitleSolver.js");
  const title = await askByUrl(page.boardUrl);
  if (!title) {
    throw new Error(`板名を取得できませんでした: ${page.boardUrl}`);
  }

  // 変更理由: 通信完了までに別ページへ移動しても、板URLを手掛かりに
  // 対象タブの履歴中にある板一覧へ取得結果を反映できるようにする。
  context.dispatch(tabActions.updateTitleForTab(context.viewTab.id, title, page.boardUrl));
  getCommandToast(context).success(`板名を「${title}」に更新しました`);
}

function getCommandLabel(
  label: BrowserCommandDefinition["label"],
  context: BrowserCommandContext,
): string {
  return typeof label === "function" ? label(context) : label;
}

export const BROWSER_COMMAND_DEFINITIONS: readonly BrowserCommandDefinition[] = [
  {
    id: "navigation.open-settings",
    label: "設定を開く",
    englishLabel: "Open Settings",
    description: "アプリの設定画面を開きます",
    keywords: ["preferences", "config", "オプション"],
    group: "navigation",
    icon: Settings,
    run: openSettings,
  },
  {
    id: OPEN_URL_COMMAND_ID,
    label: "URLを開く",
    englishLabel: "Open URL",
    description: "入力したURLのページを開きます",
    keywords: ["url", "アドレス", "リンク"],
    group: "navigation",
    icon: ExternalLink,
    run: () => {
      // 変更理由: URLなしの素振り実行では遷移先が定まらないため、
      // 動的ID付き候補からの実行だけを受け付ける。
    },
  },
  {
    id: OPEN_URL_IN_NEW_TAB_COMMAND_ID,
    label: "URLを新しいタブで開く",
    englishLabel: "Open URL in New Tab",
    description: "入力したURLのページを新しいタブで開きます",
    keywords: ["url", "アドレス", "リンク", "新しいタブ", "new tab"],
    group: "navigation",
    icon: ExternalLink,
    run: () => {
      // 変更理由: URLなしの素振り実行では遷移先が定まらないため、
      // 動的ID付き候補からの実行だけを受け付ける。
    },
  },
  {
    id: "navigation.reopen-closed-tab",
    label: "閉じたタブを開く",
    englishLabel: "Reopen Closed Tab",
    description: "最後に閉じたタブを現在のペインで開きます",
    keywords: ["reopen", "closed tab", "閉じたタブ"],
    group: "navigation",
    icon: RotateCcw,
    isEnabled: ({ closedTabs }) => closedTabs.length > 0,
    // 変更理由: タブメニューと同じ reducer action を使い、復元時の新しいID付与と
    // 自動更新状態のリセットを共通化して、入口ごとの挙動差を防ぐ。
    run: ({ dispatch, runTabCommand }) => {
      if (runTabCommand) {
        // 変更理由: 別窓のコマンドパレットから復元しても、表示中ペインへ戻す。
        runTabCommand(TAB_COMMAND_IDS.REOPEN);
        return;
      }
      dispatch(tabActions.reopenClosedTab());
    },
  },
  {
    id: "navigation.open-bookmarks",
    label: "ブックマークリストを開く",
    englishLabel: "Open Bookmarks",
    keywords: ["お気に入り", "favorite", "bookmark"],
    group: "navigation",
    icon: Bookmark,
    run: (context) => openQuickAccessPage(context, createQuickAccessPage("bookmarkList")),
  },
  {
    id: "navigation.open-history",
    label: "閲覧履歴を開く",
    englishLabel: "Open Browsing History",
    keywords: ["history", "最近見た"],
    group: "navigation",
    icon: History,
    run: (context) => openQuickAccessPage(context, createQuickAccessPage("historyList")),
  },
  {
    id: "navigation.open-write-history",
    label: "書き込み履歴を開く",
    englishLabel: "Open Post History",
    keywords: ["投稿履歴", "write history"],
    group: "navigation",
    icon: PenLine,
    run: (context) => openQuickAccessPage(context, createQuickAccessPage("writeHistoryList")),
  },
  {
    id: "navigation.open-log-search",
    label: "ログ検索を開く",
    englishLabel: "Open Archive Search",
    keywords: ["過去ログ", "archive", "log"],
    group: "navigation",
    icon: Archive,
    run: (context) => openQuickAccessPage(context, createQuickAccessPage("logList")),
  },
  {
    id: "navigation.open-archive-replay",
    label: "過去実況再生を開く",
    englishLabel: "Open Archive Replay",
    description: "複数の実況スレッドを投稿時刻順につないで再生します",
    keywords: ["過去実況", "実況再生", "コメント再生", "archive replay", "replay"],
    group: "navigation",
    icon: PlayCircle,
    when: () => isTauriRuntime(),
    // 変更理由: 過去ログ検索とは別に、複数スレッドを時刻順で再生する入口を
    // Tauri版のコマンドパレットへ限定して公開し、ブラウザ版で未対応の再生窓を
    // 誤って開かないようにする。
    run: ({ openArchiveReplayWindow }) => {
      if (!isTauriRuntime()) return;
      openArchiveReplayWindow();
    },
  },
  {
    id: "navigation.open-siki-log",
    label: "Sikiの掲示板ログファイルを開く",
    englishLabel: "Open Siki Board Log File",
    description: "SikiのJSONログを読み込み、スレッドを新しいタブで開きます",
    keywords: ["Siki", "ログ", "JSON", "過去ログ", "ファイル"],
    group: "navigation",
    icon: FileJson,
    run: openSikiLogFile,
  },
  {
    id: "navigation.import-open-thread-tabs",
    label: "開いているスレタブをすべて取り込む",
    englishLabel: "Import All Open Thread Tabs",
    description: "ブラウザで開いている5ch互換スレをアプリのタブとして追加します",
    keywords: ["一括", "import", "browser tabs", "5ch", "スレッド"],
    group: "navigation",
    icon: Import,
    when: canQueryExtensionTabs,
    run: importOpenThreadTabs,
  },
  {
    id: "tab.close-other-tabs",
    label: "他のタブを閉じる",
    englishLabel: "Close Other Tabs",
    description: "アクティブなタブ以外のタブを現在のペインで閉じます",
    keywords: ["他のタブ", "close others"],
    group: "tab",
    icon: X,
    // 変更理由: タブの右クリックメニューと同じ操作をコマンドパレットからも行えるようにし、
    // 対象は右クリック位置ではなくアクティブなタブにする。
    isEnabled: ({ tabs, viewTab }) => tabs.some((tab) => tab.id !== viewTab.id && !tab.pinned),
    run: ({ dispatch, viewTab, runTabCommand }) => {
      if (runTabCommand) {
        // 変更理由: コマンドパレットを別窓へ載せた場合も、表示中タブの所有ペインへ
        // 一括閉鎖を限定し、メイン窓の選択タブへ誤送信しないようにする。
        runTabCommand(TAB_COMMAND_IDS.CLOSE_OTHER);
        return;
      }
      dispatch(tabActions.closeOtherTabs(viewTab.id));
    },
  },
  {
    id: "tab.close-right-tabs",
    label: "右側のタブを閉じる",
    englishLabel: "Close Tabs to the Right",
    description: "アクティブなタブの右側にあるタブを現在のペインで閉じます",
    keywords: ["右側", "close right"],
    group: "tab",
    icon: X,
    isEnabled: ({ tabs, viewTab }) => {
      const index = tabs.findIndex((tab) => tab.id === viewTab.id);
      return index !== -1 && tabs.slice(index + 1).some((tab) => !tab.pinned);
    },
    run: ({ dispatch, viewTab, runTabCommand }) => {
      if (runTabCommand) {
        // 変更理由: 右側のタブ判定も実行時のストア状態で行い、対象タブが消えた時に
        // 別の選択タブへフォールバックしないようにする。
        runTabCommand(TAB_COMMAND_IDS.CLOSE_RIGHT);
        return;
      }
      dispatch(tabActions.closeRightTabs(viewTab.id));
    },
  },
  {
    id: "tab.close-all-tabs",
    label: "すべてのタブを閉じる",
    englishLabel: "Close All Tabs",
    description: "固定タブを残してすべてのタブを現在のペインで閉じます",
    keywords: ["すべて", "close all"],
    group: "tab",
    icon: X,
    run: ({ dispatch, runTabCommand }) => {
      if (runTabCommand) {
        // 変更理由: 別窓からの一括閉鎖でも、メイン窓の選択ペインを巻き込まない。
        runTabCommand(TAB_COMMAND_IDS.CLOSE_ALL);
        return;
      }
      dispatch(tabActions.closeAllTabs());
    },
  },
  {
    id: "tab.open-in-right-pane",
    label: "右のペインで開く",
    englishLabel: "Open in Right Pane",
    description: "アクティブなタブを右隣のペインへ移動します",
    keywords: ["ペイン", "右", "right pane"],
    group: "tab",
    icon: PanelRight,
    run: ({ dispatch, viewTab, runTabCommand }) => {
      if (runTabCommand) {
        // 変更理由: 別窓から移動しても、表示中タブを所有するペインを起点にする。
        runTabCommand(TAB_COMMAND_IDS.OPEN_RIGHT);
        return;
      }
      dispatch(tabActions.openInRightPane(viewTab.id));
    },
  },
  {
    id: "page.reload",
    label: "現在のページを更新",
    englishLabel: "Reload Current Page",
    keywords: ["再読み込み", "reload", "refresh"],
    group: "page",
    icon: RotateCw,
    when: ({ viewPage }) => RELOADABLE_PAGE_TYPES.has(viewPage.type),
    run: ({ dispatch, viewPage, viewTab, runTabCommand }) => {
      // 変更理由: コマンドパレットからの手動再読み込みもボタンと同じscope受付を通し、
      // 同じページでwheel/ボタンと交互に実行してcooldownを迂回できないようにする。
      runManualRefresh(getManualRefreshScopeKey(viewTab.id, viewPage), () => {
        if (runTabCommand) {
          // 変更理由: 実行器が対象タブの消滅や非対応ページを検出した時に、
          // 旧dispatchへフォールバックすると別タブを再取得する危険がある。
          runTabCommand(TAB_COMMAND_IDS.RELOAD);
          return;
        }

        // 変更理由: 古い埋め込み元が実行器を注入しなくても、コマンドパレットを
        // 別窓から実行した対象タブだけを更新できるよう明示IDへフォールバックする。
        dispatch({ ...tabActions.reload(), tabId: viewTab.id });
      });
    },
  },
  {
    id: "page.retry-board-title",
    label: "板名を再取得",
    englishLabel: "Retry Board Title",
    description: "板一覧やSETTING.TXTから現在の板名を再取得します",
    keywords: ["板タイトル", "板名更新", "再試行", "retry", "board title"],
    group: "page",
    icon: RotateCw,
    when: ({ viewPage }) => viewPage.type === "threadList",
    run: retryBoardTitle,
  },
  {
    id: RESPONSE_JUMP_COMMAND_ID,
    label: "レス番号を指定してジャンプ",
    englishLabel: "Jump to Response Number",
    description: "入力ダイアログでレス番号を指定します",
    keywords: ["レス移動", "番号", "jump", "response"],
    group: "page",
    icon: Hash,
    when: ({ viewPage }) => viewPage.type === "thread",
    run: ({ openResponseJumpDialog }) => openResponseJumpDialog(),
  },
  {
    id: "page.search-next-thread",
    label: "次スレ候補を検索",
    englishLabel: "Find Next Thread Candidates",
    description: "積極判定で現在のスレに続く候補を一覧表示します",
    keywords: ["次スレ", "候補", "thread", "next", "search"],
    group: "page",
    icon: Search,
    when: ({ viewPage }) => viewPage.type === "thread",
    run: ({ openNextThreadSearchDialog }) => openNextThreadSearchDialog(),
  },
  {
    id: "page.search-similar-threads",
    label: "類似スレを検索",
    englishLabel: "Find Similar Threads",
    description: "現在のスレとタイトルが似ているスレを板一覧から検索します",
    keywords: ["類似スレ", "似たスレ", "関連スレ", "similar", "thread", "search"],
    group: "page",
    icon: Search,
    when: ({ viewPage }) => viewPage.type === "thread",
    run: ({ openSimilarThreadSearchDialog }) => openSimilarThreadSearchDialog?.(),
  },
  {
    id: "page.toggle-filter",
    label: "フィルターを切り替え",
    englishLabel: "Toggle Filter",
    keywords: ["検索", "絞り込み", "filter"],
    group: "page",
    icon: Filter,
    when: ({ viewPage }) => FILTERABLE_PAGE_TYPES.has(viewPage.type),
    run: toggleFilter,
  },
  {
    id: "page.toggle-write-panel",
    label: ({ isWritePanelOpen }) =>
      isWritePanelOpen ? "書き込みパネルを閉じる" : "書き込みパネルを開く",
    englishLabel: ({ isWritePanelOpen }) =>
      isWritePanelOpen ? "Close Write Panel" : "Open Write Panel",
    keywords: ["投稿", "write", "レス"],
    group: "page",
    icon: PenLine,
    when: ({ viewPage }) => viewPage.type === "thread",
    run: ({ toggleWritePanel }) => toggleWritePanel(),
  },
  {
    id: "page.toggle-bookmark",
    label: "現在のページのブックマークを切り替え",
    englishLabel: "Toggle Bookmark for Current Page",
    keywords: ["お気に入り", "star", "bookmark"],
    group: "page",
    icon: Star,
    when: ({ viewPage }) => getCommandPageTarget(viewPage) != null,
    run: toggleBookmark,
  },
  {
    id: "page.open-board",
    label: "このスレッドの板を新しいタブで開く",
    englishLabel: "Open This Thread's Board in New Tab",
    keywords: ["板に移動", "board", "掲示板"],
    group: "page",
    icon: List,
    when: ({ viewPage }) => getBoardPageFromThread(viewPage) != null,
    run: ({ viewPage, dispatch }) => {
      const boardPage = getBoardPageFromThread(viewPage);
      if (!boardPage) return;
      dispatch(tabActions.openInNewTab(boardPage));
    },
  },
  {
    id: "page.open-external",
    label: "現在のページを外部ブラウザで開く",
    englishLabel: "Open Current Page in External Browser",
    keywords: ["browser", "web", "外部"],
    group: "page",
    icon: ExternalLink,
    when: ({ viewPage }) => getCommandPageTarget(viewPage) != null,
    run: (context) => {
      const target = getCommandPageTarget(context.viewPage);
      if (!target) return;
      getCommandSurface(context).window.open(target.url, "_blank", "noopener,noreferrer");
    },
  },
  {
    id: "layout.toggle-pane",
    label: ({ isTwoPane }) => (isTwoPane ? "2ペイン表示を解除" : "2ペインで表示"),
    englishLabel: ({ isTwoPane }) => (isTwoPane ? "Close Two-Pane View" : "Show in Two Panes"),
    keywords: ["分割", "split", "pane", "レイアウト"],
    group: "layout",
    icon: Columns2,
    run: ({ dispatch, isTwoPane }) =>
      dispatch(isTwoPane ? tabActions.closePane() : tabActions.splitPane()),
  },
  {
    id: "layout.swap-pane-tabs",
    label: "ペインのタブを入れ替え",
    englishLabel: "Swap Pane Tabs",
    description: "左右のペインで選択中のタブを入れ替えます",
    keywords: ["入れ替え", "交換", "swap", "pane", "ペイン"],
    group: "layout",
    icon: ArrowLeftRight,
    // 変更理由: 交換相手が存在しない1ペイン時に候補を表示すると、実行しても
    // 何も起きないコマンドが一覧へ混ざるため、2ペイン時だけ公開する。
    when: ({ isTwoPane }) => isTwoPane,
    run: ({ dispatch }) => {
      // 変更理由: 選択中タブの所属ペインはdispatch側で解決し、コマンドから
      // ペインIDを直接扱わないことで、別窓やアクティブペインの境界を保つ。
      dispatch(tabActions.swapPaneTabs());
    },
  },
  {
    id: "layout.toggle-tab-orientation",
    label: () => {
      // 変更理由: タブバーの右クリックメニューと同じ操作をコマンドパレットからも行えるようにする。
      // 設定画面を開かずに方向を試せるよう、現在の保存値から次の表示名を導出する。
      try {
        return container.config.get("tab_bar_orientation") === "vertical"
          ? "タブバーを水平にする"
          : "タブバーを垂直にする";
      } catch {
        return "タブバーを垂直にする";
      }
    },
    englishLabel: () => {
      try {
        return container.config.get("tab_bar_orientation") === "vertical"
          ? "Show Tab Bar Horizontally"
          : "Show Tab Bar Vertically";
      } catch {
        return "Show Tab Bar Vertically";
      }
    },
    keywords: ["タブバー", "垂直", "水平", "tab", "vertical", "horizontal", "レイアウト"],
    group: "layout",
    icon: PanelLeft,
    run: () => {
      const current = (() => {
        try {
          return container.config.get("tab_bar_orientation");
        } catch {
          return "horizontal";
        }
      })();
      const next = current === "vertical" ? "horizontal" : "vertical";
      // 変更理由: タブバーの右クリックメニューと同じ保存経路にし、config_updated 経由で即時反映する。
      void Promise.resolve(container.config.set("tab_bar_orientation", next)).catch((error) => {
        console.error("[BrowserCommand] タブバー方向の保存に失敗しました", error);
      });
    },
  },
  {
    id: "copy.page-title",
    label: "現在のページタイトルをコピー",
    englishLabel: "Copy Current Page Title",
    keywords: ["スレタイ", "板名", "title"],
    group: "copy",
    icon: Clipboard,
    when: ({ viewPage }) => getCommandPageTarget(viewPage) != null,
    run: async (context) => {
      const target = getCommandPageTarget(context.viewPage);
      if (!target) return;
      await copyTargetWithNotice(context, target, "title", "ページタイトル");
    },
  },
  {
    id: "copy.page-url",
    label: "現在のページURLをコピー",
    englishLabel: "Copy Current Page URL",
    keywords: ["アドレス", "link", "URL"],
    group: "copy",
    icon: Clipboard,
    when: ({ viewPage }) => getCommandPageTarget(viewPage) != null,
    run: async (context) => {
      const target = getCommandPageTarget(context.viewPage);
      if (!target) return;
      await copyTargetWithNotice(context, target, "url", "ページURL");
    },
  },
  {
    id: "copy.page-title-url",
    label: "ページタイトルとURLをコピー",
    englishLabel: "Copy Page Title and URL",
    keywords: ["スレタイ&URL", "title link"],
    group: "copy",
    icon: Clipboard,
    when: ({ viewPage }) => getCommandPageTarget(viewPage) != null,
    run: async (context) => {
      const target = getCommandPageTarget(context.viewPage);
      if (!target) return;
      await copyTargetWithNotice(context, target, "title-url", "タイトルとURL");
    },
  },
  {
    id: "copy.page-title-url-markdown",
    label: "スレタイとURLをMarkdownでコピー",
    englishLabel: "Copy Thread Title and URL as Markdown",
    description: "スレタイとURLをMarkdownリンク形式でコピーします",
    keywords: ["スレタイ&URL", "Markdown", "マークダウン", "title link"],
    group: "copy",
    icon: Clipboard,
    // 変更理由: 板一覧にはスレタイがないため、スレッドのタイトルと正規URLを組み合わせる操作に限定する。
    when: ({ viewPage }) => viewPage.type === "thread",
    run: async (context) => {
      const target = getCommandPageTarget(context.viewPage);
      if (!target) return;
      // 変更理由: 改行形式の既存コマンドを残し、Markdownを必要とする貼り付け先だけ選べるようにする。
      await copyTargetWithNotice(context, target, "markdown", "Markdownリンク");
    },
  },
  {
    id: "copy.subject-url",
    label: "subject.txtのURLをコピー",
    englishLabel: "Copy subject.txt URL",
    description: "現在の板のスレッド一覧取得URLをコピーします",
    keywords: ["subject", "raw", "板一覧", "生URL"],
    group: "copy",
    icon: Clipboard,
    when: ({ viewPage }) => getSubjectUrlForCommand(viewPage) != null,
    run: async (context) => {
      const subjectUrl = getSubjectUrlForCommand(context.viewPage);
      if (!subjectUrl) return;
      await copyWithNotice(context, subjectUrl, "subject.txtのURL");
    },
  },
  {
    id: "copy.dat-url",
    label: "datのURLをコピー",
    englishLabel: "Copy dat URL",
    description: "現在のスレッドのdat取得URLをコピーします",
    keywords: ["dat", "raw", "過去ログ", "生URL"],
    group: "copy",
    icon: Clipboard,
    when: ({ viewPage }) => getDatUrlForCommand(viewPage) != null,
    run: async (context) => {
      const datUrl = getDatUrlForCommand(context.viewPage);
      if (!datUrl) return;
      await copyWithNotice(context, datUrl, "datのURL");
    },
  },
  {
    id: "copy.thread-toon",
    label: "スレ全体をTOON形式でコピー",
    englishLabel: "Copy Entire Thread as TOON",
    description: "LLM向けのTOON形式で全レスをコピーし、推定トークン数を表示します",
    keywords: ["TOON", "AI", "LLM", "全レス", "スレッド全体"],
    group: "copy",
    icon: Clipboard,
    when: ({ viewPage }) => viewPage.type === "thread",
    run: async (context) => {
      const { viewPage } = context;
      if (viewPage.type !== "thread") return;

      const thread = await container.thread.getThread(viewPage.threadUrl);
      if (thread.res.length === 0) {
        throw new Error(thread.message || "コピーできるレスがありません");
      }

      const toon = encodeThreadAsToon({
        title: thread.title || viewPage.title,
        url: thread.url || viewPage.threadUrl,
        res: thread.res,
      });
      const tokenCount = estimateToonTokenCount(toon);

      await executeCommandRequest(
        { id: COMMAND_REQUEST_IDS.CLIPBOARD_COPY_TEXT, args: { text: toon } },
        { surface: getCommandSurface(context), toast: getCommandToast(context) },
      );
      getCommandToast(context).success(
        `スレ全体をTOON形式でコピーしました（推定 ${tokenCount.toLocaleString("ja-JP")} トークン）`,
      );
    },
  },
];

export function resolveBrowserCommands(
  context: BrowserCommandContext,
  runningCommandIds: ReadonlySet<string> = new Set(),
): ResolvedBrowserCommand[] {
  return BROWSER_COMMAND_DEFINITIONS.filter((definition) => definition.when?.(context) ?? true).map(
    (definition) => ({
      id: definition.id,
      label: getCommandLabel(definition.label, context),
      englishLabel: getCommandLabel(definition.englishLabel, context),
      description: definition.description,
      keywords: definition.keywords ?? [],
      group: definition.group,
      icon: definition.icon,
      enabled: !runningCommandIds.has(definition.id) && (definition.isEnabled?.(context) ?? true),
    }),
  );
}

export async function executeBrowserCommand(
  commandId: string,
  context: BrowserCommandContext,
): Promise<boolean> {
  const openUrl = getOpenUrlFromCommandId(commandId);
  if (openUrl !== null) {
    // 変更理由: ブラウザ標準と同じく、URL直入力は実際に訪れたページだけを履歴へ積み、
    // 前居た場所へ戻れるようにする。対象スレの板の自動補完は行わない。
    const parsed = parseInternalBrowserPage(openUrl);
    if (!parsed) return false;
    context.dispatch(tabActions.navigate(parsed));
    return true;
  }

  const openUrlInNewTab = getOpenUrlInNewTabFromCommandId(commandId);
  if (openUrlInNewTab !== null) {
    // 変更理由: URL直入力の「新しいタブで開く」は新規タブの正規履歴に乗せてフォーカスを移し、
    // 同一タブの履歴へ対象板を補完しない方針と両立させる。
    const parsed = parseInternalBrowserPage(openUrlInNewTab);
    if (!parsed) return false;
    context.dispatch(tabActions.openInNewTabForce(parsed, { focus: true }));
    return true;
  }

  const responseJumpResNum = getResponseJumpResNumFromCommandId(commandId);
  const definitionId = responseJumpResNum === null ? commandId : RESPONSE_JUMP_COMMAND_ID;
  const definition = BROWSER_COMMAND_DEFINITIONS.find((command) => command.id === definitionId);
  if (!definition) return false;

  // 変更理由: パレットを開いたままページ状態が変わる可能性があるため、
  // 表示時の判定を信用せず実行直前にも可否を確認する。
  if (!(definition.when?.(context) ?? true)) return false;
  if (!(definition.isEnabled?.(context) ?? true)) return false;

  if (responseJumpResNum !== null) {
    if (context.viewPage.type !== "thread") return false;

    // 変更理由: 数字入力候補は追加ダイアログを開かず、既存の保留ジャンプ経路へ
    // 直接渡して、表示中・再表示後のどちらのスレッドでも同じ処理を利用する。
    return requestThreadResJump(context.viewPage.threadUrl, responseJumpResNum) !== null;
  }

  await definition.run(context);
  return true;
}

export function getBrowserCommandLabel(commandId: string, context: BrowserCommandContext): string {
  const openUrl = getOpenUrlFromCommandId(commandId);
  if (openUrl !== null) {
    return `このURLを開く`;
  }

  const openUrlInNewTab = getOpenUrlInNewTabFromCommandId(commandId);
  if (openUrlInNewTab !== null) {
    return `このURLを新しいタブで開く`;
  }

  const responseJumpResNum = getResponseJumpResNumFromCommandId(commandId);
  if (responseJumpResNum !== null) {
    return `レス${responseJumpResNum}へジャンプ`;
  }

  const definition = BROWSER_COMMAND_DEFINITIONS.find((command) => command.id === commandId);
  return definition ? getCommandLabel(definition.label, context) : commandId;
}
