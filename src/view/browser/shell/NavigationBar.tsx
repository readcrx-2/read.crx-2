import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  ChevronDown,
  ChevronUp,
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
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { useUrlBarVisibility } from "src/view/browser/hooks/use-url-bar-visibility";
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

export const NavigationBar: React.FC<NavigationBarProps> = ({
  openNextThreadSearchDialog = NOOP_OPEN_NEXT_THREAD_SEARCH_DIALOG,
  openSimilarThreadSearchDialog = NOOP_OPEN_SIMILAR_THREAD_SEARCH_DIALOG,
  openArchiveReplayWindow = NOOP_OPEN_ARCHIVE_REPLAY_WINDOW,
}) => {
  const { state, viewTab, viewPage, dispatch, paneId } = useTabStore();
  const manualRefreshScopeKey = getManualRefreshScopeKey(viewTab.id, viewPage);
  const refreshCoolingDown = useManualRefreshCooldown(manualRefreshScopeKey);
  const viewSurface = useViewSurface();
  const toast = useToast();
  const runTabCommand = useTabCommandRunner(viewTab.id);
  // 2ペイン表示中かどうか（トグルボタンの状態に使う）。
  const { panes, activePaneId } = useTabPanes();
  const isTwoPane = panes.length >= 2;
  const isActivePane = activePaneId === paneId;
  const { isOpen: isPanelOpen, activePanelTabId, togglePanel } = useBottomPanel();
  const { setExpanded: setUrlBarExpanded } = useUrlBarVisibility(paneId);

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
  // URL入力は必要なときだけ展開し、タブと本文に使える高さを初期状態で確保する。
  const [isUrlExpanded, setIsUrlExpanded] = useState(false);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const forwardButtonRef = useRef<HTMLButtonElement>(null);
  const refreshButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const tabBarOrientation = useTabBarOrientation();
  // 変更理由: 垂直モードではペイン上部のボタン行をなくし、自ペインの TitleBar 受け口へ
  // ポータルする。Reactツリー上の位置は変えないため、ペインスコープの各プロバイダ
  // （タブ状態・下部パネル等）はそのまま利用できる。
  // 受け口はペインごとに分かれるため、アクティブ切り替え時の表示制御は不要である。
  const [titleBarSlot, setTitleBarSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalContainer(document.querySelector<HTMLElement>(".browser-shell"));
  }, []);

  useEffect(() => {
    setTitleBarSlot(
      document.querySelector<HTMLElement>(`.title-bar__nav-slot[data-pane-id="${paneId}"]`),
    );
  }, [paneId, tabBarOrientation]);
  // 変更理由: 垂直モードでは自ペインの受け口へポータルし、ペイン上部の高さを本文へ返す。
  // スロットが無い環境（テスト等）では従来どおりインライン表示する。
  // blur処理からも参照するため、描画部より前で定義する。
  const useTitleBarSlot = tabBarOrientation === "vertical" && titleBarSlot !== null;

  useEffect(() => {
    // 変更理由: グローバルなトーストはペイン内のURLバーと別階層にあるため、
    // 展開中のペインを共有してURLバーの有無に応じた位置へ表示する。
    setUrlBarExpanded(isUrlExpanded);
    return () => {
      setUrlBarExpanded(false);
    };
  }, [isUrlExpanded, setUrlBarExpanded]);

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
    isUrlExpanded,
    setIsUrlExpanded,
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
      // 変更理由: 垂直モードのURL行は本文へ重なるオーバーレイのため、フォーカスが外れたら
      // 行ごと閉じて本文へ返す。水平モードは従来どおりchevron操作でのみ開閉する。
      if (useTitleBarSlot) {
        setIsUrlExpanded(false);
      }
    },
    [handleBlur, omnibarMode, paletteState.opened, useTitleBarSlot],
  );

  const handleRefresh = useCallback(() => {
    setRefreshMenuPosition(null);
    runManualRefresh(manualRefreshScopeKey, () => runTabCommand(TAB_COMMAND_IDS.RELOAD));
  }, [manualRefreshScopeKey, runTabCommand]);

  const handleUrlBarToggle = useCallback(() => {
    commandPalette.close();
    if (isUrlExpanded) {
      handleBlur();
      setIsUrlExpanded(false);
      return;
    }

    activate("navigation");
    setIsUrlExpanded(true);
  }, [activate, handleBlur, isUrlExpanded]);

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
      ...(viewPage.type === "thread" ||
      viewPage.type === "boardList" ||
      viewPage.type === "threadList" ||
      viewPage.type === "bookmarkList" ||
      viewPage.type === "historyList" ||
      viewPage.type === "writeHistoryList" ||
      viewPage.type === "logList"
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
  const chrome = (
    <div className={`nav-bar${useTitleBarSlot ? " nav-bar--titlebar" : ""}`}>
      <button
        type="button"
        className="nav-bar__url-toggle"
        onClick={handleUrlBarToggle}
        aria-expanded={isUrlExpanded}
        title={isUrlExpanded ? "URLバーを折りたたむ" : "URLバーを表示"}
        aria-label={isUrlExpanded ? "URLバーを折りたたむ" : "URLバーを表示"}
      >
        {isUrlExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
      </button>

      {isUrlExpanded && (
        <div className="nav-bar__url-row">
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
                    isBookmarked
                      ? "このページをブックマークから削除"
                      : "このページをブックマークに追加"
                  }
                  aria-pressed={isBookmarked}
                  title={
                    isBookmarked
                      ? "このページをブックマークから削除"
                      : "このページをブックマークに追加"
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
        </div>
      )}

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
        <Menu size={18} />
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
      {useTitleBarSlot && titleBarSlot ? createPortal(chrome, titleBarSlot) : chrome}

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
