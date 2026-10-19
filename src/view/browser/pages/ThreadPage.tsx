import React, { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { registerDebugStateProvider } from "src/app/debug/debug-api";
import { recordDebugEvent } from "src/app/debug/debug-log";
import { createLogger } from "src/app/logger";
import { useArchiveReplayPositionStore } from "src/features/archive-replay/browser/position-store";
import { normalizeArchiveReplayThreadUrl } from "src/features/archive-replay/domain";
import {
  ArchiveReplayPositionLine,
  getReplayBoundaryIndex,
} from "src/features/archive-replay/ui/ArchiveReplayPositionLine";
import { readThreadAutoRefreshIntervalSec } from "src/features/auto-refresh/browser/auto-refresh-config";
import {
  resolveThreadAutoRefreshStop,
  shouldDeferExpiredAutoRefreshStop,
} from "src/features/auto-refresh/browser/auto-refresh-stop";
import { usePopupAutoScrollPauseSetting } from "src/features/auto-refresh/browser/use-popup-auto-scroll-pause-setting";
import { useThreadAutoRefresh } from "src/features/auto-refresh/browser/use-thread-auto-refresh";
import { useCommentOverlay } from "src/features/comment-overlay/application/use-comment-overlay";
import { useLiveChatReplyIndex } from "src/features/live-chat/browser/use-live-chat-reply-index";
import { useLiveChatResponses } from "src/features/live-chat/browser/use-live-chat-responses";
import { useThreadDisplayModeSetting } from "src/features/live-chat/browser/use-thread-display-mode-setting";
import { useMediaViewerStore } from "src/features/media/browser/use-media-viewer-store";
import { MediaViewerContainer } from "src/features/media/ui/MediaViewerContainer";
import { useAutoNextThread } from "src/features/next-thread/browser/use-auto-next-thread";
import { useAutoNextThreadSetting } from "src/features/next-thread/browser/use-auto-next-thread-setting";
import { NextThreadSearchDialog } from "src/features/next-thread/ui/NextThreadSearchDialog";
import type { ContextMenuPopupItem } from "src/features/popup/browser/popup-types";
import { useThreadPopupManager } from "src/features/popup/browser/use-popup-manager";
import { PopupRenderer } from "src/features/popup/ui/PopupRenderer";
import { useTabCommandRunner } from "src/features/tabs/browser/use-tab-command-runner";
import { useTabViewRuntime } from "src/features/tabs/browser/use-tab-view-runtime";
import { useThreadData } from "src/features/thread/browser/use-thread-data";
import { useThreadRefreshController } from "src/features/thread/browser/use-thread-refresh-controller";
import {
  useWheelPagination,
  WHEEL_THRESHOLD,
} from "src/features/thread/browser/useWheelPagination";
import { ResItem } from "src/features/thread/ui/ResItem";
import { ThreadMinimap } from "src/features/thread/ui/ThreadMinimap";
import { ThreadScrollFloatingActions } from "src/features/thread/ui/ThreadScrollFloatingActions";
import { WheelScrollIndicator } from "src/features/thread/ui/WheelScrollIndicator";
import { container } from "src/service-container/index";
import type { IThread } from "src/service-container/interfaces";
import { TAB_COMMAND_IDS } from "src/view/browser/commands/tab-command-runtime";
import { ContextMenuNavigationActions } from "src/view/browser/components/ContextMenuNavigationActions";
import { OperationStatusItem } from "src/view/browser/components/OperationStatusItem";
import { useLatestRef } from "src/view/browser/hooks/use-latest-ref";
import { useMouseGesture } from "src/view/browser/hooks/use-mouse-gesture";
import { ThreadPageTopBar } from "src/view/browser/pages/thread/ThreadPageTopBar";
import { useCommentOverlaySync } from "src/view/browser/pages/thread/use-comment-overlay-sync";
import { useImageBlurConfig } from "src/view/browser/pages/thread/use-image-blur-config";
import { useOwnResTracking } from "src/view/browser/pages/thread/use-own-res-tracking";
import { useResInteractionHandlers } from "src/view/browser/pages/thread/use-res-interaction-handlers";
import { useThreadFilterDefaultOpenSetting } from "src/view/browser/pages/thread/use-thread-filter-default-open-setting";
import { useThreadFilterModeToggle } from "src/view/browser/pages/thread/use-thread-filter-mode-toggle";
import { useThreadReadState } from "src/view/browser/pages/thread/use-thread-read-state";
import { useThreadResContextMenu } from "src/view/browser/pages/thread/use-thread-res-context-menu";
import { useThreadStatusSync } from "src/view/browser/pages/thread/use-thread-status-sync";
import { useThreadTopBar } from "src/view/browser/pages/thread/use-thread-top-bar";
import { useThreadTopScrollOpenFilter } from "src/view/browser/pages/thread/use-thread-top-scroll-open-filter";
import { useUrlHandlers } from "src/view/browser/pages/thread/use-url-handlers";
import {
  getAutoRefreshPageKey,
  isAutoRefreshStoppedForPage,
} from "src/view/browser/state/tabs/auto-refresh-pages";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import {
  canGoBack,
  canGoForward,
  type Tab,
  type ThreadPage as ThreadPageType,
} from "src/view/browser/types";
import { Spinner } from "src/view/browser/ui/Spinner";
import { getManualRefreshScopeKey, runManualRefresh } from "src/view/browser/utils/manual-refresh";
import { isPageRefreshable } from "src/view/browser/utils/refreshable-pages";
import {
  buildBlurredResSet,
  buildReplyToWrittenResSet,
  countNewRepliesToWrittenResponses,
} from "src/view/browser/utils/thread-emphasis";
import { subscribeThreadResJump } from "src/view/browser/utils/thread-read-state";

const logger = createLogger("view/browser");
interface ThreadPageProps {
  tabId: string;
  // ContentAreaから描画対象を明示して受け取り、別の表示ホストでもペインのactiveTabに依存しない。
  tab?: Tab;
  page: ThreadPageType;
  refreshKey: number;
  isActive: boolean;
  isOverlayTarget?: boolean;
  isAutoRefreshEnabled: boolean;
  startAutoRefreshAtBottom: boolean;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}

export const ThreadPage: React.FC<ThreadPageProps> = ({
  tabId,
  tab,
  page,
  refreshKey,
  isActive,
  isOverlayTarget = isActive,
  isAutoRefreshEnabled,
  startAutoRefreshAtBottom,
  scrollContainerRef,
}) => {
  const { surface: viewSurface, dispatch, toast } = useTabViewRuntime(tabId);
  const runTabCommand = useTabCommandRunner(tabId);
  const { window: viewWindow } = viewSurface;
  const manualRefreshScopeKey = getManualRefreshScopeKey(tabId, page);
  const rootRef = useRef<HTMLDivElement>(null);
  // 変更理由: refの代入だけでは再描画されないため、別窓の初回描画でもPortal先を
  // 直ちに渡せるよう、同じrootをstateにも同期する。
  const [popupHost, setPopupHost] = useState<HTMLDivElement | null>(null);
  const setThreadRoot = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    setPopupHost((current) => (current === node ? current : node));
  }, []);
  const fallbackScrollContainerRef = useRef<HTMLDivElement>(null);
  const effectiveScrollContainerRef = scrollContainerRef ?? fallbackScrollContainerRef;
  const refreshController = useThreadRefreshController(refreshKey);
  const {
    responses,
    loading,
    isInitialLoading,
    isCacheResolved,
    error,
    expired,
    missingFromSubject,
    indexes,
    filteredResponses,
    filterCounts,
    filter,
    setFilter,
    searchTarget,
    setSearchTarget,
    searchQuery,
    setSearchQuery,
    fetchThread,
    idPositions,
    setResponses,
    messageProtocol,
  } = useThreadData(tabId, page, rootRef, refreshController);
  const requestManualRefresh = useCallback(
    () => runManualRefresh(manualRefreshScopeKey, () => runTabCommand(TAB_COMMAND_IDS.RELOAD)),
    [manualRefreshScopeKey, runTabCommand],
  );
  useEffect(
    () =>
      subscribeThreadResJump((jump) => {
        if (
          !jump.clearFilter ||
          jump.threadUrl !== page.threadUrl ||
          (jump.targetTabId && jump.targetTabId !== tabId)
        )
          return;
        // 変更理由: Overlayから選んだレスが絞り込みでDOMから消えていると、
        // タブだけ移っても目的のレスを表示できないため、移動時に絞り込みを解除する。
        setFilter("all");
        setSearchQuery("");
      }),
    [page.threadUrl, setFilter, setSearchQuery, tabId],
  );
  const clearFilter = useCallback(() => {
    // 変更理由: フィルタバーを閉じた後に再表示したとき、前回の絞り込みだけが
    // 残っている状態を避け、本文と操作欄の状態を一致させる。
    setFilter("all");
  }, [setFilter]);
  const { controller: commentOverlayController, snapshot: commentOverlaySnapshot } =
    useCommentOverlay();
  const { ownResNums, handleWriteHistoryAdded, handleWriteHistoryRemoved } = useOwnResTracking({
    threadUrl: page.threadUrl,
    threadTitle: page.title,
    responses,
  });
  const replyToOwnResNums = useMemo(
    () => buildReplyToWrittenResSet(ownResNums, indexes.repIndex),
    [indexes.repIndex, ownResNums],
  );
  const { viewTab } = useTabStore();
  // 既存の直接利用者との互換性のため渡されたtabを残し、通常の描画経路ではそれを優先する。
  const navigationTab = tab ?? viewTab;
  const { mode: threadDisplayMode } = useThreadDisplayModeSetting();
  const isLiveChat = threadDisplayMode === "live-chat";
  const isFilterEnabled = filter !== "all" || searchQuery.trim() !== "";
  const isCommentOverlayTarget =
    commentOverlaySnapshot.state.status === "running" &&
    commentOverlaySnapshot.state.targetThreadUrl === page.threadUrl;
  const isCommentOverlayVisible =
    commentOverlaySnapshot.state.status === "running" && commentOverlaySnapshot.visible;
  const isCommentOverlayFlowing = isCommentOverlayTarget && commentOverlaySnapshot.visible;

  useCommentOverlaySync({
    controller: commentOverlayController,
    threadUrl: page.threadUrl,
    responses,
    // 変更理由: Overlay対象のタブを画面上で隠しても、新着snapshotの共有を続けて
    // コメント表示を止めない。未開始スレッドのsnapshot保持はフォーカス中だけでよい。
    isActive: isOverlayTarget || isCommentOverlayTarget,
    isAutoRefreshEnabled,
    ownResponseNumbers: ownResNums,
  });

  useEffect(() => {
    if (
      !isOverlayTarget ||
      !isAutoRefreshEnabled ||
      !isCommentOverlayVisible ||
      loading ||
      responses.length === 0
    ) {
      return;
    }
    const previousPage = navigationTab.history[navigationTab.currentIndex - 1];
    if (
      previousPage?.type !== "thread" ||
      previousPage.threadUrl !== commentOverlaySnapshot.state.targetThreadUrl ||
      page.threadUrl === commentOverlaySnapshot.state.targetThreadUrl
    ) {
      return;
    }

    // 変更理由: 次スレ移動では同じタブの直前スレッドをOverlay対象としているため、
    // 新スレッドの初回取得完了後にbaselineごと切り替え、旧レスを流さず表示を継続する。
    void commentOverlayController
      .start(page.threadUrl, responses, {
        preserveVisibleComments: true,
        ownResponseNumbers: ownResNums,
      })
      .catch((error: unknown) => {
        logger.error("次スレ移動後のコメント実況引き継ぎに失敗しました:", error);
      });
  }, [
    navigationTab.currentIndex,
    navigationTab.history,
    commentOverlayController,
    commentOverlaySnapshot.state.targetThreadUrl,
    isAutoRefreshEnabled,
    isCommentOverlayVisible,
    isOverlayTarget,
    loading,
    ownResNums,
    page.threadUrl,
    responses,
  ]);
  // 変更理由: 更新開始後のloading中もwheel更新の共有cooldownとindicatorを維持し、
  // 画面切替で別の一覧/スレッドから連続更新できる隙間を作らない。RELOADへ集約することで、
  // ホイール更新も自動更新・更新ボタンと同じsubject.txt再確認の対象にする。
  const wheelPagination = useWheelPagination({
    isEnabled: isActive,
    isLoading: loading,
    cooldownScopeKey: manualRefreshScopeKey,
    containerRef: effectiveScrollContainerRef,
    edge: "bottom",
    onRefresh: requestManualRefresh,
  });
  const mediaViewerScopeId = `${tabId}\u0000${page.threadUrl}`;
  const openMedia = useMediaViewerStore((state) => state.openMediaFromUrl);
  const openMediaFromUrl = useCallback(
    (url: string, resImages?: string[]) => {
      // 変更理由: 画像ビューアーのストアは画面全体で共有されるため、
      // 開いたスレッドを識別して、別スレッドの破棄処理が表示中の画像へ影響しないようにする。
      openMedia(url, resImages, mediaViewerScopeId);
    },
    [mediaViewerScopeId, openMedia],
  );
  const {
    enabled: isAutoNextThreadEnabled,
    mode: autoNextThreadMode,
    searchDurationSeconds: nextThreadSearchDurationSeconds,
  } = useAutoNextThreadSetting();
  const autoNextThreadResponseMessages = useMemo(
    () => responses.map((response) => response.message),
    [responses],
  );

  const isFilterDefaultOpen = useThreadFilterDefaultOpenSetting();
  const [miniAaResNums, setMiniAaResNums] = useState<Set<number>>(new Set());
  const {
    activeTopBar,
    closeTopBar,
    closeTopBarPreservingFilter,
    openFilterToolbar,
    searchFocusKey,
    suppressInitialFocus,
  } = useThreadTopBar({
    tabId,
    isActive,
    searchQuery,
    setSearchQuery,
    clearFilter,
    hasActiveFilter: filter !== "all",
    openByDefault: isFilterDefaultOpen,
  });
  useThreadFilterModeToggle({
    tabId,
    isActive,
    setFilter,
    openFilterToolbar,
  });

  useMouseGesture(rootRef, viewSurface);

  const {
    popups,
    anchorPreviews,
    treePopupItems,
    idPopupItems,
    contextMenuItems,
    hasAnchorPreviews,
    addTreePopup,
    addPopupContextMenu,
    addIdPopup,
    clearAnchorPreviewHideTimer,
    closeNonContextPopups,
    closePopupById,
    closePopupChildren,
    isPopupDescendantOf,
    toggleTreePopupPinned,
    toggleIdPopupPinned,
    toggleAnchorPopupPinned,
    hasPopupChild,
    hideAnchorPreview,
    hideAnchorPreviewImmediately,
    showAnchorPreview,
  } = useThreadPopupManager({
    scopeId: tabId,
    rootRef,
    resMap: indexes.resMap,
  });

  useThreadTopScrollOpenFilter({
    activeTopBar,
    closeTopBar: closeTopBarPreservingFilter,
    isActive,
    openFilterToolbar,
    rootRef,
  });

  // 変更理由: 自動更新とステータスバー強調の条件を同一ソースに統一し、
  // タブ切替後に非アクティブタブの状態がステータスバーへ残留するのを防ぐ。
  // 変更理由: Overlayへ流しているスレッドはタブを切り替えても取得を止めず、
  // 表示中の実況と自動次スレ探索をバックグラウンドで継続する。
  const isActiveAutoRefreshEnabled = (isActive || isCommentOverlayFlowing) && isAutoRefreshEnabled;
  // 変更理由: 画面上はいずれも dat 落ち案内を表示する状態であり、
  // 自動更新中にどちらかを取得したら、Issue #29 の完了条件に従って停止処理へ渡す。
  const autoRefreshPageKey = getAutoRefreshPageKey(page);
  const isAutoRefreshStopped = tab ? isAutoRefreshStoppedForPage(tab, page) : false;
  // dat落ちや探索終了の停止記録は、不確定subject応答や別窓再マウントでも保持する。
  // 本文タイマーと次スレ探索を同時に止めるため、ThreadDataの取得結果とは別に扱う。
  const {
    autoRefreshExpired,
    hasReachedThreadLimit,
    shouldStopFetching,
    shouldDeferNextThreadStop,
    stopMessage,
  } = resolveThreadAutoRefreshStop({
    autoNextThreadEnabled: isAutoNextThreadEnabled,
    responseCount: responses.length,
    expired,
    missingFromSubject,
    stopped: isAutoRefreshStopped,
  });
  const { enabled: pauseAutoScrollOnPopup } = usePopupAutoScrollPauseSetting();
  // ポップアップを読んでいる間は、追従スクロールと新着のキュー再生を同じ条件で止める。
  // コメント実況中は従来どおり止めず、Overlayへの配信と自動次スレ判定を維持する。
  const isThreadDisplayPaused =
    !isCommentOverlayFlowing && pauseAutoScrollOnPopup && popups.length > 0;
  const liveChat = useLiveChatResponses({
    responses: filteredResponses,
    scopeKey: `${tabId}\u0000${page.threadUrl}`,
    // 検索・絞り込み中は結果をすぐ見せ、保留中の新着が検索結果から欠落するのを防ぐ。
    enabled: isLiveChat && !isFilterEnabled,
    isActive,
    isAutoRefreshEnabled,
    isFetching: loading,
    intervalMs: readThreadAutoRefreshIntervalSec(page.threadUrl) * 1000,
    paused: isThreadDisplayPaused,
  });
  const displayedResponses = liveChat.responses;
  const liveChatReplies = useLiveChatReplyIndex({
    scopeKey: `${tabId}\u0000${page.threadUrl}`,
    isFlowing: liveChat.isFlowing,
    baseline: liveChat.baseline,
    responses,
    repIndex: indexes.repIndex,
  });

  // 変更理由: 停止理由が増えても、タブ状態の解除と利用者への通知を同じ経路で行い、
  // 一方だけ実行される不整合を防ぐ。
  const handleAutoRefreshStop = useCallback(
    (message: string) => {
      const pageKey = getAutoRefreshPageKey(page);
      if (pageKey == null) {
        return;
      }
      dispatch(tabActions.setAutoRefreshEnabled(false, pageKey));
      toast.info(message);
    },
    [dispatch, page, toast],
  );

  const handleEnableAutoRefresh = useCallback(() => {
    const pageKey = getAutoRefreshPageKey(page);
    if (pageKey == null) {
      return;
    }

    // 既存の自動更新トグルと同じ状態経路を使い、フローティングボタンだけが
    // 別の更新条件を持たないようにする。ON直後の再取得と最下部同期はhookへ委譲する。
    dispatch(tabActions.setAutoRefreshEnabled(true, pageKey));
  }, [dispatch, page]);

  const handleNextThreadSearchExhausted = useCallback(() => {
    if (autoRefreshPageKey == null) {
      return;
    }
    // 実況中も期限で終了し、開始連打や別窓への移動で同じ満了スレの探索を再開させない。
    dispatch(tabActions.setAutoRefreshStoppedPageKey(autoRefreshPageKey));
    toast.info("次スレが見つからなかったため自動更新を停止しました");
  }, [autoRefreshPageKey, dispatch, toast]);

  const handleNewResponses = useCallback(
    (count: number, previousLastResponseNum: number | null) => {
      const replyCount = countNewRepliesToWrittenResponses(
        responses,
        ownResNums,
        replyToOwnResNums,
        previousLastResponseNum,
        count,
      );

      // 自動更新の共通hookは新着数だけを扱い、通知対象である「自分への返信」は
      // スレッド固有の履歴・返信インデックスを持つ画面側で絞り込む。
      if (replyCount === 0) {
        return;
      }

      if (!container.notification.isSupported(viewWindow)) {
        return;
      }

      void container.notification
        .notify(`自分のレスへの返信: ${page.title}`, {
          message: `${replyCount}件の返信があります`,
          url: page.threadUrl,
          tag: `thread-reply-to-own:${page.threadUrl}`,
          targetWindow: viewWindow,
        })
        .catch((error: unknown) => {
          logger.error("新着レス通知の表示に失敗しました:", error);
        });
    },
    [ownResNums, page.threadUrl, page.title, replyToOwnResNums, responses, viewWindow],
  );

  const { autoScrollBoundaryRef, canAutoScroll, isAutoScrolling } = useThreadAutoRefresh({
    enabled: isActiveAutoRefreshEnabled,
    startAtBottom: startAutoRefreshAtBottom,
    threadUrl: page.threadUrl,
    refreshController,
    expired: shouldStopFetching,
    loading,
    pauseAutoScroll: isThreadDisplayPaused,
    responseCount: responses.length,
    lastResponseNum: responses.at(-1)?.num ?? null,
    rootRef,
    requestRefresh: () => runTabCommand(TAB_COMMAND_IDS.RELOAD),
    onNewResponses: handleNewResponses,
    // 新着が一定回数(=間隔×N)来なかったら、放置スレと判断して自動更新を止める。
    onAutoStop: isCommentOverlayFlowing
      ? undefined
      : () => handleAutoRefreshStop("新着が止まったため自動更新を停止しました"),
    // dat落ち・満了後は候補が板一覧へ現れるまで探索を続け、自動更新の停止を保留する。
    deferAutoStop: shouldDeferNextThreadStop,
    // interval の停止だけではタブに自動更新状態が残るため、dat落ち時も明示的に解除する。
    // 次スレ移動がONならレス数にかかわらず探索期限まで待ち、OFFなら即座に停止する。
    onThreadExpired: () => {
      // 別窓再マウント時の同じ失効通知は繰り返さない。
      if (tab?.autoRefreshStoppedPageKey === autoRefreshPageKey && !tab.autoRefreshEnabled) {
        return;
      }
      handleAutoRefreshStop(stopMessage);
    },
    onThreadExpiredDetected: () => {
      if (autoRefreshPageKey != null && tab?.autoRefreshStoppedPageKey !== autoRefreshPageKey) {
        // 停止記録は通知なしで付き、以後の開始操作を拒否するため、付けた根拠を残す。
        recordDebugEvent("auto-refresh", "スレッドの停止記録を付けます", {
          tabId,
          pageKey: autoRefreshPageKey,
          expired,
          missingFromSubject,
          responseCount: responses.length,
          isAutoRefreshEnabled,
          isCommentOverlayFlowing,
        });
        dispatch(tabActions.setAutoRefreshStoppedPageKey(autoRefreshPageKey));
      }
    },
    deferExpiredStop: shouldDeferExpiredAutoRefreshStop({
      shouldDeferNextThreadStop,
      expired: autoRefreshExpired,
      hasReachedThreadLimit,
      isActive,
      isDraining: liveChat.isDraining,
    }),
  });

  const handleFollowNextThread = useCallback(
    (nextThread: Pick<IThread, "title" | "url">) => {
      // 変更理由: 次スレへの切り替えは本文の再描画だけでは分かりにくく、
      // Overlay上へ通知を流すことで画面を見続けている利用者にも接続先を伝える。
      void commentOverlayController
        .publishSystemMessage(page.threadUrl, `スレ「${nextThread.title}」へ移動します。`)
        .catch((error: unknown) => {
          logger.error("次スレ移動の通知コメント送信に失敗しました:", error);
        });
      dispatch(
        tabActions.followNextThread(
          {
            type: "thread",
            title: nextThread.title,
            threadUrl: nextThread.url,
          },
          { keepAutoRefresh: isAutoRefreshEnabled },
        ),
      );
    },
    [commentOverlayController, dispatch, isAutoRefreshEnabled, page.threadUrl],
  );

  const {
    pendingMove: pendingAutoNextThreadMove,
    cancelPendingMove,
    selectPendingCandidate,
  } = useAutoNextThread({
    autoRefreshEnabled: isActiveAutoRefreshEnabled,
    featureEnabled: isAutoNextThreadEnabled,
    threadUrl: page.threadUrl,
    threadTitle: page.title,
    responseCount: responses.length,
    expired: autoRefreshExpired,
    mode: autoNextThreadMode,
    searchDurationSeconds: nextThreadSearchDurationSeconds,
    responseMessages: autoNextThreadResponseMessages,
    toast,
    // 変更理由: Overlay実況中は本文タブが非表示でも次スレ探索を継続し、
    // 次スレへ移った後に実況対象を途切れず引き継げるようにする。
    // 表示待ちの末尾レスを次スレ移動で捨てない。非表示時のOverlay実況は従来どおり続ける。
    canAutoScroll:
      (!isActive || !liveChat.isDraining) && (isCommentOverlayFlowing || canAutoScroll),
    // コメント流し中は画面を確認・操作できないため、次スレ候補の表示待ちを省略する。
    skipMoveDelay: isCommentOverlayFlowing,
    followThread: handleFollowNextThread,
    onSearchExhausted: handleNextThreadSearchExhausted,
  });

  // 外部CLIから停止判定の入力値をまとめて確認できるよう、描画ごとの最新値を公開する。
  const debugStateRef = useLatestRef({
    tabId,
    threadUrl: page.threadUrl,
    isActive,
    loading,
    responseCount: responses.length,
    expired,
    missingFromSubject,
    isAutoRefreshEnabled,
    isActiveAutoRefreshEnabled,
    isAutoRefreshStopped,
    autoRefreshExpired,
    hasReachedThreadLimit,
    shouldStopFetching,
    shouldDeferNextThreadStop,
    canAutoScroll,
    isAutoScrolling,
    isLiveChat,
    isThreadDisplayPaused,
    liveChatPendingCount: liveChat.pendingCount,
    liveChatIsDraining: liveChat.isDraining,
    isCommentOverlayTarget,
    isCommentOverlayFlowing,
    hasPendingAutoNextThreadMove: pendingAutoNextThreadMove != null,
  });
  useEffect(
    () => registerDebugStateProvider(`thread:${tabId}`, () => debugStateRef.current),
    [debugStateRef, tabId],
  );

  const imageBlurConfig = useImageBlurConfig();

  const { scrollToResponse, isInitialReadStateResolved } = useThreadReadState({
    tabId,
    threadUrl: page.threadUrl,
    isActive,
    responses,
    loading,
    rootRef,
  });

  const handleMinimapMarkerClick = useCallback(
    (resNum: number) => {
      // ミニマップはポップアップを閉じる状態更新を挟むとCSS animationが打ち消されうるため、
      // 対象レスへ直接ジャンプしてハイライトを確実に開始する。
      scrollToResponse(resNum, { highlight: true });
    },
    [scrollToResponse],
  );

  const { handleUrlClick, handleUrlContextMenu, openPopupUrlContextMenu } = useUrlHandlers({
    threadUrl: page.threadUrl,
    dispatch,
    openMediaFromUrl,
    addPopupContextMenu,
  });

  const {
    openAnchorPreviewFromPopup,
    handleIdClick,
    handlePopupIdClick,
    handleRepClick,
    closePopup,
    handleRepClickInPopup,
    handleOpenRootReplyTreeInPopup,
    handleAnchorClick,
  } = useResInteractionHandlers({
    indexes,
    addTreePopup,
    addIdPopup,
    showAnchorPreview,
    hideAnchorPreview,
    hideAnchorPreviewImmediately,
    clearAnchorPreviewHideTimer,
    closeNonContextPopups,
    scrollToResponse,
  });

  const { ngResNums } = useThreadStatusSync({
    tabId,
    threadUrl: page.threadUrl,
    loading,
    responses,
    filteredCount: isFilterEnabled ? filteredResponses.length : null,
    ownResNums,
    replyToOwnResNums,
  });

  const blurredResNums = useMemo(() => {
    if (!imageBlurConfig.enabled) return new Set<number>();
    return buildBlurredResSet(responses, indexes.repIndex, imageBlurConfig.harmfulWordPattern);
  }, [imageBlurConfig, indexes.repIndex, responses]);

  const { openPopupResContextMenu, openThreadResContextMenu } = useThreadResContextMenu({
    addPopupContextMenu,
    closePopup,
    fetchThread,
    filter,
    filteredResponses,
    handleAnchorClick,
    hideAnchorPreviewImmediately,
    miniAaResNums,
    ownResNums,
    page,
    tab: navigationTab,
    tabId,
    onWriteHistoryAdded: handleWriteHistoryAdded,
    onWriteHistoryRemoved: handleWriteHistoryRemoved,
    searchQuery,
    setFilter,
    setSearchQuery,
    setMiniAaResNums,
    setResponses,
  });

  const contextMenuHeader = useCallback(
    (menu: ContextMenuPopupItem) => (
      // 変更理由: ポップアップのレスメニューはそれぞれ独立したpopupとして管理されるため、
      // 操作後に対象メニューだけを閉じて、他の固定ポップアップを維持する。
      <ContextMenuNavigationActions
        canGoBack={canGoBack(navigationTab)}
        canGoForward={canGoForward(navigationTab)}
        canRefresh={isPageRefreshable(page)}
        onBack={() => {
          runTabCommand(TAB_COMMAND_IDS.BACK);
          closePopupById(menu.id);
        }}
        onForward={() => {
          runTabCommand(TAB_COMMAND_IDS.FORWARD);
          closePopupById(menu.id);
        }}
        onRefresh={() => {
          requestManualRefresh();
          closePopupById(menu.id);
        }}
      />
    ),
    [closePopupById, navigationTab, page, requestManualRefresh, runTabCommand],
  );

  // 空白部分のダブルクリックによる更新。
  // 設定項目は持たず常に有効にする。誤操作防止のためリンクや画像、テキスト選択中などは除外する。
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;

      // リンク、画像、入力系要素、ボタンなどは除外
      if (
        target.closest("a, button, input, textarea, .res__thumb, .res__media-embed, .res__link")
      ) {
        return;
      }

      // テキスト選択中はリロードしない
      if (viewWindow.getSelection()?.toString()) return;

      requestManualRefresh();
    },
    [requestManualRefresh, viewWindow],
  );

  const replayPosition = useArchiveReplayPositionStore((state) => state.position);
  const replayBoundary =
    replayPosition?.tabId === tabId &&
    normalizeArchiveReplayThreadUrl(replayPosition.threadUrl) ===
      normalizeArchiveReplayThreadUrl(page.threadUrl)
      ? getReplayBoundaryIndex(
          displayedResponses,
          replayPosition.playbackAt,
          replayPosition.responseNumber,
        )
      : -1;
  const replayLine =
    replayBoundary >= 0 ? (
      <ArchiveReplayPositionLine
        key="archive-replay-position"
        playbackAt={replayPosition?.playbackAt}
        boundary={replayBoundary}
        active={isActive && !loading && isInitialReadStateResolved}
      />
    ) : null;

  // ジェスチャーuseEffectでrootRefが確実にマウント済みになるよう、loading中の早期returnを廃止し常にrootRef付きdivを描画する
  return (
    <div ref={setThreadRoot} className="thread-page" onDoubleClick={handleDoubleClick}>
      {/* 本文を残す再取得でも進捗を示し、非表示タブの通信状況は表示中のステータスへ混ぜない。 */}
      <OperationStatusItem
        id={`thread-fetch-status-${tabId}`}

        message={loading ? "スレッドを読み込み中..." : null}
        busy={loading}
        visible={isActive}
      />
      {pendingAutoNextThreadMove ? (
        <NextThreadSearchDialog
          state={{
            status: "ready",
            searchType: "next",
            sourceThread: pendingAutoNextThreadMove.sourceThread,
            candidates: pendingAutoNextThreadMove.candidates,
            boardMessage: null,
            error: null,
          }}
          autoMoveCountdown={pendingAutoNextThreadMove.remainingSeconds}
          onClose={cancelPendingMove}
          onSelect={selectPendingCandidate}
        />
      ) : null}
      <WheelScrollIndicator
        {...wheelPagination}
        threshold={WHEEL_THRESHOLD}
        portalContainerRef={effectiveScrollContainerRef}
      />
      {isInitialLoading ? (
        <div className="page-status">
          <Spinner size="sm" aria-label="スレッドを読み込み中" />
          <span>スレッドを読み込み中...</span>
        </div>
      ) : isCacheResolved && error && responses.length === 0 ? (
        <div className="page-status page-status--error">
          <p>{error}</p>
          <button
            className="page-status__retry"
            onClick={() => runManualRefresh(manualRefreshScopeKey, () => void fetchThread(true))}
          >
            再試行
          </button>
        </div>
      ) : (
        <>
          <div className="thread-page__sticky-header">
            <ThreadPageTopBar
              activeTopBar={activeTopBar}
              filter={filter}
              filterCounts={filterCounts}
              onClose={closeTopBar}
              onFilterChange={setFilter}
              onSearchTargetChange={setSearchTarget}
              onSearchQueryChange={setSearchQuery}
              searchFocusKey={searchFocusKey}
              suppressInitialFocus={suppressInitialFocus}
              searchQuery={searchQuery}
              searchTarget={searchTarget}
            />

            {(expired || missingFromSubject) && (
              <div className="thread-page__notice">このスレッドはdat落ちしています</div>
            )}
            {error && <div className="thread-page__notice">{error}</div>}
          </div>

          <div className="thread-page__responses">
            {displayedResponses.map((res, index) => {
              const idCount = res.id ? (indexes.idIndex.get(res.id)?.size ?? 0) : 0;
              const idPos = res.id ? (idPositions.get(res.num) ?? 0) : 0;
              const repCount = liveChatReplies.repIndex.get(res.num)?.size ?? 0;
              return (
                <React.Fragment key={res.num}>
                  {index === replayBoundary ? replayLine : null}
                  <ResItem
                    key={res.num}
                    // 新着だけに入場動作を付け、切り替え時の既存レスを一斉に動かさない。
                    animateEntry={liveChat.isFlowing && res.num > liveChat.baseline}
                    onEntryDisplayed={liveChatReplies.onEntryDisplayed}
                    res={res}
                    idPos={idPos}
                    idCount={idCount}
                    repCount={repCount}
                    miniAa={miniAaResNums.has(res.num)}
                    messageProtocol={messageProtocol}
                    searchQuery={searchQuery}
                    searchTarget={searchTarget}
                    onIdClick={handleIdClick}
                    onRepClick={handleRepClick}
                    onUrlClick={handleUrlClick}
                    onUrlContextMenu={handleUrlContextMenu}
                    onAnchorClick={handleAnchorClick}
                    onAnchorHover={showAnchorPreview}
                    onAnchorLeave={hideAnchorPreview}
                    onContextMenu={openThreadResContextMenu}
                    isOwn={ownResNums.has(res.num)}
                    isReplyToOwn={replyToOwnResNums.has(res.num)}
                    isImageBlurred={blurredResNums.has(res.num)}
                    imageBlurRadius={imageBlurConfig.radius}
                    ngResNums={ngResNums}
                    resMap={indexes.resMap}
                    threadUrl={page.threadUrl}
                  />
                </React.Fragment>
              );
            })}
            {replayBoundary === displayedResponses.length ? replayLine : null}
          </div>

          {isActiveAutoRefreshEnabled &&
            /* 自動更新はフィルターが有効な場合は無効化 */
            !isFilterEnabled && (
              <div
                className={`thread-page__auto-scroll-threshold${
                  canAutoScroll ? " thread-page__auto-scroll-threshold--armed" : ""
                }${isAutoScrolling ? " thread-page__auto-scroll-threshold--scrolling" : ""}`}
              >
                {/* 変更理由: 親要素の末尾は破線より16px下にあるため、親へrefを置くと
                    見た目では線を越えていても追従判定がfalseになる。判定点を実際の破線へ揃える。 */}
                <div
                  ref={autoScrollBoundaryRef}
                  className="thread-page__auto-scroll-threshold-line"
                  aria-hidden="true"
                />
                <span className="thread-page__auto-scroll-threshold-label">
                  {canAutoScroll
                    ? "この線より下なので新着に追従します"
                    : "この線より下にいる時だけ新着に追従します"}
                </span>
              </div>
            )}

          <PopupRenderer
            host={popupHost}
            anchorPreviews={anchorPreviews}
            idPopupItems={idPopupItems}
            treePopupItems={treePopupItems}
            contextMenuItems={contextMenuItems}
            contextMenuHeader={contextMenuHeader}
            messageProtocol={messageProtocol}
            repIndex={liveChatReplies.repIndex}
            replySourceNums={liveChatReplies.replySourceNums}
            idIndex={indexes.idIndex}
            resMap={indexes.resMap}
            hasAnchorPreviews={hasAnchorPreviews}
            hasPopupChild={hasPopupChild}
            isPopupDescendantOf={isPopupDescendantOf}
            onAnchorClick={handleAnchorClick}
            onAnchorHover={showAnchorPreview}
            onPopupAnchorHover={openAnchorPreviewFromPopup}
            onAnchorLeave={hideAnchorPreview}
            onClearAnchorPreviewHideTimer={clearAnchorPreviewHideTimer}
            onClosePopupById={closePopupById}
            onClosePopupChildren={closePopupChildren}
            onToggleTreePopupPinned={toggleTreePopupPinned}
            onToggleIdPopupPinned={toggleIdPopupPinned}
            onToggleAnchorPopupPinned={toggleAnchorPopupPinned}
            onIdLinkClick={handleIdClick}
            onPopupIdLinkClick={handlePopupIdClick}
            onRepClickInPopup={handleRepClickInPopup}
            onOpenRootReplyTreeInPopup={handleOpenRootReplyTreeInPopup}
            onResContextMenuOpen={openPopupResContextMenu}
            onUrlClick={handleUrlClick}
            onUrlContextMenuOpen={openPopupUrlContextMenu}
            threadTitle={page.title}
            threadUrl={page.threadUrl}
            blurredResNums={blurredResNums}
            ngResNums={ngResNums}
            ownResNums={ownResNums}
            replyToOwnResNums={replyToOwnResNums}
          />
          <ThreadMinimap
            rootRef={rootRef}
            repIndex={liveChatReplies.repIndex}
            responseCount={displayedResponses.length}
            activeTopBar={activeTopBar}
            onMarkerClick={handleMinimapMarkerClick}
          />
          <ThreadScrollFloatingActions
            rootRef={rootRef}
            isActive={isActive}
            isAutoRefreshEnabled={isAutoRefreshEnabled}
            isFilterEnabled={isFilterEnabled}
            loading={loading}
            expired={autoRefreshExpired}
            responseCount={responses.length}
            onEnableAutoRefresh={handleEnableAutoRefresh}
          />
          <MediaViewerContainer scopeId={mediaViewerScopeId} />
        </>
      )}
    </div>
  );
};
