import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Command,
  Filter,
  History,
  List as ListIcon,
  Menu,
  Pause,
  PenLine,
  RotateCw,
  Settings,
  Star,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePageBookmark } from "src/features/bookmark/browser/use-page-bookmark";
import { useNavHistoryMenuItems } from "src/features/tabs/browser/use-nav-history-menu-items";
import { useTabBarOrientation } from "src/features/tabs/browser/use-tab-bar-orientation";
import { useTabCommandRunner } from "src/features/tabs/browser/use-tab-command-runner";
import { useResponseJumpDialog } from "src/features/thread/browser/use-response-jump-dialog";
import {
  type BrowserCommandContext,
  resolveBrowserCommands,
} from "src/view/browser/commands/browser-commands";
import { commandPalette } from "src/view/browser/commands/command-palette-store";
import { TAB_COMMAND_IDS } from "src/view/browser/commands/tab-command-runtime";
import { Omnibar } from "src/view/browser/components/Omnibar";
import {
  BOTTOM_PANEL_THREAD_LIST_TAB_ID,
  BOTTOM_PANEL_WRITE_TAB_ID,
  useBottomPanel,
} from "src/view/browser/hooks/use-bottom-panel";
import { useBrowserCommandRunner } from "src/view/browser/hooks/use-browser-command-runner";
import { useOmnibar } from "src/view/browser/hooks/use-omnibar";
import { useToast } from "src/view/browser/hooks/use-toast";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import {
  getAutoRefreshPageKey,
  isAutoRefreshEnabledForPage,
} from "src/view/browser/state/tabs/auto-refresh-pages";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { useTabPanes, useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import { canGoBack, canGoForward, getCurrentPage, getDisplayUrl } from "src/view/browser/types";
import { Button } from "src/view/browser/ui/Button";
import { ContextMenu } from "src/view/browser/ui/ContextMenu";
import { Dialog } from "src/view/browser/ui/Dialog";
import {
  QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE,
  type QuickAccessFilterPageType,
} from "src/view/browser/utils/filter-toolbar-events";
import { useFilterToolbarOpen } from "src/view/browser/utils/filter-toolbar-open-state";
import {
  getManualRefreshScopeKey,
  runManualRefresh,
  useManualRefreshCooldown,
} from "src/view/browser/utils/manual-refresh";
import { loadOmnibarSources } from "src/view/browser/utils/omnibar-sources";
import { isPageRefreshable } from "src/view/browser/utils/refreshable-pages";
import {
  createQuickAccessPage,
  createSettingsPage,
  type QuickAccessPage,
} from "src/view/browser/utils/tab-pages";

import { useCommandPaletteFocus } from "./use-command-palette-focus";
import { useOmnibarNavigation } from "./use-omnibar-navigation";

interface MenuPosition {
  x: number;
  y: number;
}

const OMNIBAR_MAX_SUGGESTIONS = 8;

const NOOP_OPEN_NEXT_THREAD_SEARCH_DIALOG = async (): Promise<void> => undefined;
const NOOP_OPEN_SIMILAR_THREAD_SEARCH_DIALOG = async (): Promise<void> => undefined;
const NOOP_OPEN_ARCHIVE_REPLAY_WINDOW = (): void => undefined;

interface NavigationBarProps {
  openNextThreadSearchDialog?: () => Promise<void>;
  openSimilarThreadSearchDialog?: () => Promise<void>;
  openArchiveReplayWindow?: () => void;
}

const FILTERABLE_PAGE_TYPES = new Set<string>([
  "thread",
  "boardList",
  "threadList",
  "bookmarkList",
  "historyList",
  "writeHistoryList",
  "logList",
]);

function isFilterablePageType(pageType: string): boolean {
  return FILTERABLE_PAGE_TYPES.has(pageType);
}

export const NavigationBar: React.FC<NavigationBarProps> = ({
  openNextThreadSearchDialog = NOOP_OPEN_NEXT_THREAD_SEARCH_DIALOG,
  openSimilarThreadSearchDialog = NOOP_OPEN_SIMILAR_THREAD_SEARCH_DIALOG,
  openArchiveReplayWindow = NOOP_OPEN_ARCHIVE_REPLAY_WINDOW,
}) => {
  const { state, viewTab, viewPage, dispatch, paneId } = useTabStore();
  const manualRefreshScopeKey = getManualRefreshScopeKey(viewTab.id, viewPage);
  const refreshCoolingDown = useManualRefreshCooldown(manualRefreshScopeKey);
  const isFilterToolbarOpen = useFilterToolbarOpen(viewTab.id);
  const viewSurface = useViewSurface();
  const toast = useToast();
  const runTabCommand = useTabCommandRunner(viewTab.id);
  // 2ペイン表示中かどうか（トグルボタンの状態に使う）。
  const { panes, activePaneId } = useTabPanes();
  const isTwoPane = panes.length >= 2;
  const isActivePane = activePaneId === paneId;
  const { isOpen: isPanelOpen, activePanelTabId, togglePanel } = useBottomPanel();

  const back = canGoBack(viewTab);
  const forward = canGoForward(viewTab);
  const displayUrl = getDisplayUrl(viewPage);
  const {
    bookmarkTarget,
    isBookmarked,
    isBookmarkPending,
    toggleBookmark: handleToggleBookmark,
  } = usePageBookmark(viewPage);

  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [backMenuPosition, setBackMenuPosition] = useState<MenuPosition | null>(null);
  const [refreshMenuPosition, setRefreshMenuPosition] = useState<MenuPosition | null>(null);
  const [forwardMenuPosition, setForwardMenuPosition] = useState<MenuPosition | null>(null);
  // 変更理由: URL入力はタイトルのピルをクリックした間だけ、ピルと入れ替わる形で表示する。
  // 常時の行を持たないので、タブと本文に使える高さは変わらない。
  const [isUrlEditing, setIsUrlEditing] = useState(false);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const forwardButtonRef = useRef<HTMLButtonElement>(null);
  const refreshButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const tabBarOrientation = useTabBarOrientation();
  // 変更理由: 水平・垂直どちらでもボタンの位置がタイトルバー右上で変わらないよう、
  // 自ペインの TitleBar 受け口へポータルする。Reactツリー上の位置は変えないため、
  // ペインスコープの各プロバイダ（タブ状態・下部パネル等）はそのまま利用できる。
  // 水平モードの共通タイトルバーはアクティブペインの受け口だけを持つので、
  // アクティブペインが切り替わったときも受け口を探し直す。
  const [titleBarSlot, setTitleBarSlot] = useState<HTMLElement | null>(null);
  // 変更理由: オムニバーの入力欄はボタン群とは別に、タイトルバー中央のピルと同じ位置へ出す。
  const [omnibarSlot, setOmnibarSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalContainer(document.querySelector<HTMLElement>(".browser-shell"));
  }, []);

  useEffect(() => {
    setTitleBarSlot(
      document.querySelector<HTMLElement>(`.title-bar__nav-slot[data-pane-id="${paneId}"]`),
    );
    setOmnibarSlot(
      document.querySelector<HTMLElement>(`.title-bar__omnibar-slot[data-pane-id="${paneId}"]`),
    );
  }, [paneId, tabBarOrientation, activePaneId]);
  // 変更理由: 受け口へポータルしてペイン上部の高さを本文へ返す。
  // スロットが無い環境（テスト等）では従来どおりインライン表示する。
  // blur処理からも参照するため、描画部より前で定義する。
  const useTitleBarSlot = titleBarSlot !== null;
  // 変更理由: 水平モードの共通タイトルバーには受け口がアクティブペインの分しかない。
  // 非アクティブペインのボタンをタブバー横へインライン表示すると位置が変わるため描画しない。
  const hideInactiveChrome =
    tabBarOrientation === "horizontal" && !isActivePane && !useTitleBarSlot;

  const currentAutoRefreshPageKey = getAutoRefreshPageKey(viewPage);
  const isCurrentPageAutoRefreshEnabled = isAutoRefreshEnabledForPage(viewTab, viewPage);

  const {
    isResponseJumpDialogOpen,
    responseJumpValue,
    setResponseJumpValue,
    responseJumpError,
    openResponseJumpDialog,
    closeResponseJumpDialog,
    submitResponseJump,
  } = useResponseJumpDialog(viewPage);

  const { submitUrl, openSuggestion, getDirectInputSuggestion } = useOmnibarNavigation({
    dispatch,
    urlInputRef,
  });

  const context = useMemo<BrowserCommandContext>(
    () => ({
      viewPage,
      viewTab,
      tabs: state.tabs,
      closedTabs: state.closedTabs,
      isTwoPane,
      isWritePanelOpen: isPanelOpen,
      dispatch,
      toggleWritePanel: () => togglePanel(BOTTOM_PANEL_WRITE_TAB_ID),
      openResponseJumpDialog,
      openNextThreadSearchDialog,
      openSimilarThreadSearchDialog,
      openArchiveReplayWindow,
      toast,
      viewSurface,
      runTabCommand,
    }),
    [
      dispatch,
      isPanelOpen,
      isTwoPane,
      openNextThreadSearchDialog,
      openSimilarThreadSearchDialog,
      openArchiveReplayWindow,
      openResponseJumpDialog,
      state.closedTabs,
      state.tabs,
      toast,
      togglePanel,
      runTabCommand,
      viewPage,
      viewSurface,
      viewTab,
    ],
  );
  const { runningCommandIds, recentCommandIds, executeCommand } = useBrowserCommandRunner({
    context,
    onBeforeExecute: () => {
      commandPalette.close();
      urlInputRef.current?.blur();
    },
  });

  const commands = useMemo(
    () => resolveBrowserCommands(context, runningCommandIds),
    [context, runningCommandIds],
  );

  const {
    inputValue,
    isOpen: isOmnibarOpen,
    isLoading: isOmnibarLoading,
    suggestions: omnibarSuggestions,
    commandSuggestions: omnibarCommandSuggestions,
    shouldShowNoMatch,
    activeSuggestionIndex,
    setActiveSuggestionIndex,
    activate,
    mode: omnibarMode,
    handleInputChange,
    handleKeyDown,
    handleFocus,
    handleBlur,
    handleSelectSuggestion,
  } = useOmnibar({
    displayUrl,
    maxSuggestions: OMNIBAR_MAX_SUGGESTIONS,
    loadEntries: loadOmnibarSources,
    onSelectSuggestion: openSuggestion,
    onSubmitInput: submitUrl,
    commands,
    recentCommandIds,
    onSelectCommand: (command) => {
      void executeCommand(command);
    },
    getDirectInputSuggestion,
  });

  const paletteState = useCommandPaletteFocus({
    isActivePane,
    isUrlEditing,
    setIsUrlEditing,
    urlInputRef,
    activate,
    handleBlur,
    omnibarMode,
    isOmnibarOpen,
  });

  const handleOmnibarBlur = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      const nextFocusedElement = event.relatedTarget;
      if (nextFocusedElement instanceof Node && event.currentTarget.contains(nextFocusedElement)) {
        return;
      }

      handleBlur();
      if (paletteState.opened || omnibarMode === "command") {
        commandPalette.close();
      }
      // 変更理由: 入力欄はピルと入れ替わる一時的な表示のため、フォーカスが外れたらピルへ戻す。
      setIsUrlEditing(false);
    },
    [handleBlur, omnibarMode, paletteState.opened],
  );

  const handleRefresh = useCallback(() => {
    setRefreshMenuPosition(null);
    runManualRefresh(manualRefreshScopeKey, () => runTabCommand(TAB_COMMAND_IDS.RELOAD));
  }, [manualRefreshScopeKey, runTabCommand]);

  const openQuickAccessPage = useCallback(
    (page: QuickAccessPage) => {
      dispatch(tabActions.navigate(page));
    },
    [dispatch],
  );

  const openQuickAccessPageInNewTab = useCallback(
    (page: QuickAccessPage) => {
      dispatch(tabActions.openInNewTabForce(page));
    },
    [dispatch],
  );

  const handleRefreshContextMenu = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (viewPage.type !== "thread" && viewPage.type !== "threadList") {
        return;
      }

      e.preventDefault();
      setMenuPosition(null);
      setBackMenuPosition(null);
      setForwardMenuPosition(null);
      setRefreshMenuPosition((prev) => (prev ? null : { x: e.clientX, y: e.clientY }));
    },
    [viewPage.type],
  );

  const closeMenu = useCallback(() => {
    setMenuPosition(null);
  }, []);

  const openSettingsTab = useCallback(() => {
    // 設定タブを毎回増やすより既存タブを再利用した方が往復しやすいため、まず開いている設定を探す。
    const existingSettingsTab = state.tabs.find((tab) => getCurrentPage(tab).type === "settings");

    // 設定ボタンはContextMenuの通常項目経路を通らないため、タブ遷移による再描画より先に
    // menuPositionを解除し、設定タブの追加・再選択後にメニューが再表示されないようにする。
    closeMenu();

    if (existingSettingsTab) {
      dispatch(tabActions.selectTab(existingSettingsTab.id));
      return;
    }

    // 設定ボタンは従来どおり新しい設定タブへフォーカスを移す。
    dispatch(tabActions.openInNewTabForce(createSettingsPage(), { focus: true }));
  }, [closeMenu, dispatch, state.tabs]);

  const handleMenuClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setBackMenuPosition(null);
    setForwardMenuPosition(null);
    setRefreshMenuPosition(null);
    setMenuPosition((prev) => {
      if (prev) {
        return null;
      }
      return {
        x: Math.max(8, rect.right - 220),
        y: rect.bottom + 4,
      };
    });
  }, []);

  const closeBackMenu = useCallback(() => {
    setBackMenuPosition(null);
  }, []);

  const closeForwardMenu = useCallback(() => {
    setForwardMenuPosition(null);
  }, []);

  const closeRefreshMenu = useCallback(() => {
    setRefreshMenuPosition(null);
  }, []);

  const handleMenuRefresh = useCallback(() => {
    handleRefresh();
    closeMenu();
  }, [closeMenu, handleRefresh]);

  const handleMenuBookmark = useCallback(() => {
    handleToggleBookmark();
    closeMenu();
  }, [closeMenu, handleToggleBookmark]);

  const handleBackContextMenu = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (!back) return;
      setMenuPosition(null);
      setRefreshMenuPosition(null);
      setForwardMenuPosition(null);
      setBackMenuPosition({ x: e.clientX, y: e.clientY });
    },
    [back],
  );

  const handleForwardContextMenu = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (!forward) return;
      setMenuPosition(null);
      setRefreshMenuPosition(null);
      setBackMenuPosition(null);
      setForwardMenuPosition({ x: e.clientX, y: e.clientY });
    },
    [forward],
  );

  const canToggleFilter = isFilterablePageType(viewPage.type);

  const toggleFilterFromMenu = useCallback(() => {
    // フィルタUIはメニュー項目からのみ開くことで、
    // メニューボタン押下そのものをトリガーにしない。
    if (viewPage.type === "thread") {
      window.dispatchEvent(new window.CustomEvent("thread-filter-toolbar-toggle"));
      return;
    }

    if (
      viewPage.type === "boardList" ||
      viewPage.type === "threadList" ||
      viewPage.type === "bookmarkList" ||
      viewPage.type === "historyList" ||
      viewPage.type === "writeHistoryList" ||
      viewPage.type === "logList"
    ) {
      const eventName =
        QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE[viewPage.type as QuickAccessFilterPageType];
      window.dispatchEvent(
        new window.CustomEvent(eventName, {
          detail: { tabId: viewTab.id },
        }),
      );
    }
  }, [viewTab.id, viewPage.type]);

  useEffect(() => {
    if (viewPage.type !== "thread") {
      setRefreshMenuPosition(null);
    }
  }, [viewPage.type]);

  const { backHistoryItems, forwardHistoryItems } = useNavHistoryMenuItems(viewTab, dispatch);

  const menuItems = useMemo(
    () => [
      {
        id: "open-command-palette",
        label: "コマンドパレット",
        icon: <Command size={14} />,
        onSelect: () => commandPalette.open("command"),
      },
      ...(canToggleFilter
        ? [
            {
              id: "open-filter-toolbar",
              label: "フィルター",
              icon: <Filter size={14} />,
              onSelect: toggleFilterFromMenu,
            },
          ]
        : []),
      ...(viewPage.type === "thread"
        ? [
            {
              id: "open-thread-list-panel",
              label:
                isPanelOpen && activePanelTabId === BOTTOM_PANEL_THREAD_LIST_TAB_ID
                  ? "スレ一覧パネルを閉じる"
                  : "スレ一覧パネル",
              icon: <ListIcon size={14} />,
              onSelect: () => togglePanel(BOTTOM_PANEL_THREAD_LIST_TAB_ID),
            },
            {
              id: "open-write-panel",
              label:
                isPanelOpen && activePanelTabId === BOTTOM_PANEL_WRITE_TAB_ID
                  ? "書き込みパネルを閉じる"
                  : "書き込みパネル",
              icon: <PenLine size={14} />,
              onSelect: () => togglePanel(BOTTOM_PANEL_WRITE_TAB_ID),
            },
          ]
        : []),
      {
        id: "quick-access-separator",
        separator: true,
      },
      {
        id: "open-bookmark-list",
        label: "ブックマークリスト",
        icon: <Bookmark size={14} />,
        onSelect: () => openQuickAccessPage(createQuickAccessPage("bookmarkList")),
        onAuxSelect: (button: number) => {
          if (button !== 1) return;
          openQuickAccessPageInNewTab(createQuickAccessPage("bookmarkList"));
        },
      },
      {
        id: "open-history-list",
        label: "閲覧履歴",
        icon: <History size={14} />,
        onSelect: () => openQuickAccessPage(createQuickAccessPage("historyList")),
        onAuxSelect: (button: number) => {
          if (button !== 1) return;
          openQuickAccessPageInNewTab(createQuickAccessPage("historyList"));
        },
      },
      {
        id: "open-write-history-list",
        label: "書き込み履歴",
        icon: <PenLine size={14} />,
        onSelect: () => openQuickAccessPage(createQuickAccessPage("writeHistoryList")),
        onAuxSelect: (button: number) => {
          if (button !== 1) return;
          openQuickAccessPageInNewTab(createQuickAccessPage("writeHistoryList"));
        },
      },
      {
        id: "open-log-list",
        label: "ログ検索",
        icon: <Archive size={14} />,
        onSelect: () => openQuickAccessPage(createQuickAccessPage("logList")),
        onAuxSelect: (button: number) => {
          if (button !== 1) return;
          openQuickAccessPageInNewTab(createQuickAccessPage("logList"));
        },
      },
    ],
    [
      viewPage.type,
      activePanelTabId,
      canToggleFilter,
      openQuickAccessPage,
      openQuickAccessPageInNewTab,
      toggleFilterFromMenu,
      isPanelOpen,
      togglePanel,
    ],
  );

  const refreshMenuItems = useMemo(
    () =>
      currentAutoRefreshPageKey != null
        ? [
            {
              id: "toggle-page-auto-refresh",
              label: isCurrentPageAutoRefreshEnabled ? "自動更新を停止" : "自動更新を開始",
              icon: isCurrentPageAutoRefreshEnabled ? <Pause size={14} /> : <RotateCw size={14} />,
              onSelect: () => {
                dispatch(
                  tabActions.setAutoRefreshEnabled(
                    !isCurrentPageAutoRefreshEnabled,
                    currentAutoRefreshPageKey,
                  ),
                );
              },
            },
            {
              id: "page-auto-refresh-note",
              label: "アクティブなタブでのみ動作",
              disabled: true,
            },
          ]
        : [],
    [currentAutoRefreshPageKey, dispatch, isCurrentPageAutoRefreshEnabled],
  );

  // Android版Chromeのように頻繁に使う操作をメニューの最上段へまとめ、本文の横幅を優先する。
  const navigationMenuHeader = (
    <div className="nav-bar__menu-actions" role="group" aria-label="ナビゲーション操作">
      <button
        ref={backButtonRef}
        type="button"
        className="nav-bar__menu-action"
        disabled={!back}
        onClick={() => {
          runTabCommand(TAB_COMMAND_IDS.BACK);
          closeMenu();
        }}
        onContextMenu={handleBackContextMenu}
        title="戻る"
        aria-label="戻る"
      >
        <ArrowLeft size={17} />
      </button>
      <button
        ref={forwardButtonRef}
        type="button"
        className="nav-bar__menu-action"
        disabled={!forward}
        onClick={() => {
          runTabCommand(TAB_COMMAND_IDS.FORWARD);
          closeMenu();
        }}
        onContextMenu={handleForwardContextMenu}
        title="進む"
        aria-label="進む"
      >
        <ArrowRight size={17} />
      </button>
      <button
        ref={refreshButtonRef}
        type="button"
        className="nav-bar__menu-action"
        disabled={!isPageRefreshable(viewPage) || refreshCoolingDown}
        onClick={handleMenuRefresh}
        onContextMenu={handleRefreshContextMenu}
        title="更新"
        aria-label="更新"
      >
        <RotateCw size={17} />
      </button>
      <button
        type="button"
        className={`nav-bar__menu-action${isBookmarked ? " nav-bar__menu-action--active" : ""}`}
        disabled={!bookmarkTarget || isBookmarkPending}
        onClick={handleMenuBookmark}
        title={isBookmarked ? "お気に入りから削除" : "お気に入りに追加"}
        aria-label={isBookmarked ? "お気に入りから削除" : "お気に入りに追加"}
        aria-pressed={isBookmarked}
      >
        <Star size={17} fill={isBookmarked ? "currentColor" : "none"} />
      </button>
      <button
        type="button"
        className="nav-bar__menu-action"
        onClick={openSettingsTab}
        title="設定を開く"
        aria-label="設定を開く"
      >
        <Settings size={17} />
      </button>
    </div>
  );
  const omnibar = (
    <Omnibar
      inputRef={urlInputRef}
      inputValue={inputValue}
      placeholder={omnibarMode === "command" ? "コマンドを検索..." : "URLを入力"}
      isOpen={isOmnibarOpen}
      isLoading={isOmnibarLoading}
      suggestions={omnibarSuggestions}
      commandSuggestions={omnibarCommandSuggestions}
      mode={omnibarMode}
      activeSuggestionIndex={activeSuggestionIndex}
      shouldShowNoMatch={shouldShowNoMatch}
      onInputChange={handleInputChange}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onBlur={handleOmnibarBlur}
      onSuggestionHover={setActiveSuggestionIndex}
      onSuggestionSelect={handleSelectSuggestion}
      onCommandSelect={(command) => void executeCommand(command)}
      trailingAction={
        bookmarkTarget ? (
          <button
            type="button"
            className={`nav-bar__url-action-btn${
              isBookmarked ? " nav-bar__url-action-btn--active" : ""
            }`}
            aria-label={
              isBookmarked ? "このページをブックマークから削除" : "このページをブックマークに追加"
            }
            aria-pressed={isBookmarked}
            title={
              isBookmarked ? "このページをブックマークから削除" : "このページをブックマークに追加"
            }
            disabled={isBookmarkPending}
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={handleToggleBookmark}
          >
            <Star size={16} fill={isBookmarked ? "currentColor" : "none"} />
          </button>
        ) : null
      }
    />
  );
  const chrome = (
    <div className={`nav-bar${useTitleBarSlot ? " nav-bar--titlebar" : ""}`}>
      {canToggleFilter ? (
        // 変更理由: フィルタの開閉をメニューの奥ではなく常に見える位置から行えるよう、
        // URLバーの開閉ボタンの左へ置き、メニュー項目と同じ切り替え処理を使う。
        <button
          type="button"
          className={`nav-bar__filter-toggle${
            isFilterToolbarOpen ? " nav-bar__filter-toggle--active" : ""
          }`}
          aria-pressed={isFilterToolbarOpen}
          onClick={toggleFilterFromMenu}
          title="フィルターを開閉"
          aria-label="フィルターを開閉"
        >
          <Filter size={13} />
        </button>
      ) : null}
      {isUrlEditing && !omnibarSlot ? omnibar : null}

      <button
        ref={menuButtonRef}
        type="button"
        className="nav-bar__btn"
        title="メニュー"
        onClick={handleMenuClick}
        onContextMenu={(e) => {
          e.preventDefault();
          handleMenuClick(e);
        }}
      >
        <Menu size={13} />
      </button>

      {menuPosition && (
        <ContextMenu
          x={menuPosition.x}
          y={menuPosition.y}
          items={menuItems}
          header={navigationMenuHeader}
          onClose={closeMenu}
          triggerRef={menuButtonRef}
        />
      )}

      {backMenuPosition && backHistoryItems.length > 0 && (
        <ContextMenu
          x={backMenuPosition.x}
          y={backMenuPosition.y}
          items={backHistoryItems}
          onClose={closeBackMenu}
          triggerRef={backButtonRef}
        />
      )}

      {forwardMenuPosition && forwardHistoryItems.length > 0 && (
        <ContextMenu
          x={forwardMenuPosition.x}
          y={forwardMenuPosition.y}
          items={forwardHistoryItems}
          onClose={closeForwardMenu}
          triggerRef={forwardButtonRef}
        />
      )}

      {refreshMenuPosition && refreshMenuItems.length > 0 && (
        <ContextMenu
          x={refreshMenuPosition.x}
          y={refreshMenuPosition.y}
          items={refreshMenuItems}
          onClose={closeRefreshMenu}
          triggerRef={refreshButtonRef}
        />
      )}
    </div>
  );

  return (
    <>
      {useTitleBarSlot && titleBarSlot
        ? createPortal(chrome, titleBarSlot)
        : hideInactiveChrome
          ? null
          : chrome}
      {/* 変更理由: 入力欄はタイトルバー中央のピルと同じ位置へ出す。受け口がない環境
          （テスト等）では上のボタン群と同じ場所へインライン表示する。 */}
      {isUrlEditing && omnibarSlot ? createPortal(omnibar, omnibarSlot) : null}

      <Dialog.Root
        open={isResponseJumpDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeResponseJumpDialog();
        }}
      >
        <Dialog.Portal container={portalContainer ?? undefined}>
          <Dialog.Overlay
            className="browser-dialog-overlay"
            style={{ zIndex: "calc(var(--sys-z-dialog) + 1)" }}
          />
          <Dialog.Content
            className="browser-dialog-content command-palette__dialog-content"
            style={{ zIndex: "calc(var(--sys-z-dialog) + 1)" }}
          >
            <Dialog.Title className="browser-dialog-title">レス番号へジャンプ</Dialog.Title>
            <form onSubmit={submitResponseJump}>
              <label className="command-palette__input-label" htmlFor="response-jump-number">
                レス番号
              </label>
              <input
                id="response-jump-number"
                autoFocus
                className="command-palette__input"
                placeholder="例: 42"
                inputMode="numeric"
                value={responseJumpValue}
                onChange={(event) => setResponseJumpValue(event.currentTarget.value)}
                aria-invalid={responseJumpError ? "true" : undefined}
                aria-describedby={responseJumpError ? "response-jump-error" : undefined}
              />
              {responseJumpError ? (
                <p id="response-jump-error" className="command-palette__input-error">
                  {responseJumpError}
                </p>
              ) : null}
              <Button type="submit" className="command-palette__submit">
                ジャンプ
              </Button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};
