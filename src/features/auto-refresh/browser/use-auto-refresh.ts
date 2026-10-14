import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { readIdleStopTimeoutValue } from "src/features/auto-refresh/browser/auto-refresh-config";
import {
  evaluateIdleStop,
  type IdleStopState,
  INITIAL_IDLE_STOP_STATE,
  resolveIdleStopMode,
} from "src/features/auto-refresh/browser/auto-refresh-idle-stop";
import {
  compareRefreshSnapshot,
  mergePendingRefresh,
  type PendingRefreshSnapshot,
} from "src/features/auto-refresh/browser/auto-refresh-snapshot";
import { useAutoFollowScroll } from "src/features/auto-refresh/browser/use-auto-follow-scroll";
import { useAutoRefreshTimer } from "src/features/auto-refresh/browser/use-auto-refresh-timer";
import { useThreadExpiryStop } from "src/features/auto-refresh/browser/use-thread-expiry-stop";
import type { ThreadRefreshController } from "src/features/thread/browser/use-thread-refresh-controller";
import { useLatestRef } from "src/view/browser/hooks/use-latest-ref";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";

type AutoRefreshPhase = "idle" | "scrolling";

export interface UseAutoRefreshOptions {
  enabled: boolean;
  /** 自動更新間隔のサイト・板スコープを決めるURL。 */
  scopeUrl?: string;
  /** 自動更新が有効なまま新しいスレッドを表示するとき、最初に最下部へ同期する。 */
  startAtBottom?: boolean;
  expired: boolean;
  loading: boolean;
  refreshController: ThreadRefreshController;
  pauseAutoScroll: boolean;
  responseCount: number;
  lastResponseNum: number | null;
  rootRef: RefObject<HTMLDivElement | null>;
  requestRefresh: () => void;
  /** 自動更新で新着レスを検知したときに、更新前の末尾レス番号とともに呼ぶ。 */
  onNewResponses?: (count: number, previousLastResponseNum: number | null) => void;
  /** 新着が一定回数(=間隔×N)来ず放置と判断したとき、自動更新を止めるために呼ぶ。 */
  onAutoStop?: () => void;
  /** 次スレ探索中は、候補が見つかるまでタブ側の自動更新解除を保留する。 */
  deferAutoStop?: boolean;
  /** dat落ちを検知して自動更新を止めるとき、一度だけ呼ぶ。 */
  onThreadExpired?: () => void;
  /** dat落ち確定をページの再マウント後も保つ停止キーを記録するときに呼ぶ。 */
  onThreadExpiredDetected?: () => void;
  /** 次スレ探索中は、候補が見つかるまで dat 落ちによる解除通知を保留する。 */
  deferExpiredStop?: boolean;
}

export interface UseAutoRefreshResult {
  autoScrollBoundaryRef: RefObject<HTMLDivElement | null>;
  canAutoScroll: boolean;
  isAutoScrolling: boolean;
  intervalMs: number;
  phase: AutoRefreshPhase;
}

/**
 * スレッドの自動更新を組み立てる。
 *
 * - 追従スクロール: useAutoFollowScroll
 * - 間隔設定とタイマー: useAutoRefreshTimer
 * - dat落ちの記録と停止通知: useThreadExpiryStop
 * - 放置による自動停止: evaluateIdleStop
 *
 * ここに残すのは「更新の開始を記録し、完了時に新着を判定する」流れだけ。
 * React は同じコンポーネント内の effect を宣言順に実行し、各処理はその順序に依存している。
 * layout effect は「dat落ち → 描画ごとの追従補正 → startAtBottom → refreshKey の記録 →
 * 完了判定」の順で走る必要があるため、サブフックの呼び出し順を入れ替えないこと。
 */
export function useAutoRefresh({
  enabled,
  scopeUrl,
  startAtBottom = false,
  expired,
  loading,
  refreshController,
  pauseAutoScroll,
  responseCount,
  lastResponseNum,
  rootRef,
  requestRefresh,
  onNewResponses,
  onAutoStop,
  deferAutoStop = false,
  onThreadExpired,
  onThreadExpiredDetected,
  deferExpiredStop = false,
}: UseAutoRefreshOptions): UseAutoRefreshResult {
  const { window: viewWindow } = useViewSurface();
  const { markInternalRefreshRequest, consumeRefreshKeyChange, consumeRefreshCompletionGate } =
    refreshController;
  // 完了待ちの更新。OFF・dat落ち・タイマー・wheel など複数の経路が読み書きするため、
  // サブフックに分けず、ここで一つだけ持つ。
  const pendingRefreshRef = useRef<PendingRefreshSnapshot | null>(null);
  // ユーザーが手動スクロールで追従を取り消したか。更新開始・OFF・dat落ちで戻す。
  const userInterruptedRef = useRef(false);
  // 放置による自動停止の判定状態。遷移は evaluateIdleStop に集約している。
  const idleStopStateRef = useRef<IdleStopState>(INITIAL_IDLE_STOP_STATE);
  // 完了判定は layout effect で行うため、同じ render の最新レス一覧を参照する通知処理を
  // 完了処理より先に差し替える。passive effect では旧 render のレス一覧を捕まえてしまう。
  const requestRefreshRef = useLatestRef(requestRefresh);
  const onNewResponsesRef = useLatestRef(onNewResponses);
  const onAutoStopRef = useLatestRef(onAutoStop);
  // 変更理由: intervalのcleanup前に予約済みcallbackが届いても、最新の停止条件で拒否する。
  const enabledRef = useRef(enabled);
  const expiredRef = useRef(expired);
  enabledRef.current = enabled;
  expiredRef.current = expired;
  const loadingRef = useRef(loading);
  const prevLoadingRef = useRef(loading);
  const prevEnabledRef = useRef(enabled);
  const latestSnapshotRef = useRef({ responseCount, lastResponseNum });

  const discardPendingRefresh = useCallback(() => {
    pendingRefreshRef.current = null;
    userInterruptedRef.current = false;
  }, []);

  const requestRefreshFromHook = useCallback(() => {
    if (!enabledRef.current || expiredRef.current) {
      return;
    }
    // タイマー・ON直後の更新はここで先にレス件数を保存しているため、
    // 後続の refreshKey 変化では同じ更新を二重に記録しない。
    markInternalRefreshRequest();
    requestRefreshRef.current();
  }, [markInternalRefreshRequest, requestRefreshRef]);

  useThreadExpiryStop({
    enabled,
    expired,
    scopeUrl,
    deferExpiredStop,
    onThreadExpired,
    onThreadExpiredDetected,
    onDiscardPendingRefresh: discardPendingRefresh,
  });

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    latestSnapshotRef.current = { responseCount, lastResponseNum };
  }, [lastResponseNum, responseCount]);

  const hasPendingRefresh = useCallback(() => pendingRefreshRef.current != null, []);
  const {
    autoScrollBoundaryRef,
    canAutoScroll,
    isAutoScrolling,
    getScrollContainer,
    moveToThreadBottom,
    syncCanAutoScroll,
    clearScrollingIndicator,
  } = useAutoFollowScroll({
    enabled,
    loading,
    startAtBottom,
    pauseAutoScroll,
    rootRef,
    hasPendingRefresh,
    userInterruptedRef,
  });

  const capturePendingRefresh = useCallback(
    (isIdleStopCandidate: boolean, shouldNotify = false): boolean => {
      if (!getScrollContainer()) {
        return false;
      }

      pendingRefreshRef.current = mergePendingRefresh(
        pendingRefreshRef.current,
        latestSnapshotRef.current,
        { isIdleStopCandidate, shouldNotify },
      );
      userInterruptedRef.current = false;
      return true;
    },
    [getScrollContainer],
  );

  const handleTimerTick = useCallback(() => {
    // clearInterval後に実行待ちのcallbackが残る環境でも、失効後の再取得を始めない。
    if (
      !enabledRef.current ||
      expiredRef.current ||
      loadingRef.current ||
      pendingRefreshRef.current
    ) {
      return;
    }

    if (!capturePendingRefresh(true, true)) {
      return;
    }

    // 手動更新と同じ RELOAD 経路を使って forceUpdate を一箇所に寄せる。
    // 取得条件が分岐すると「右クリック更新だけ別挙動」が起きやすいため。
    requestRefreshFromHook();
  }, [capturePendingRefresh, requestRefreshFromHook]);

  const intervalMs = useAutoRefreshTimer({
    scopeUrl,
    active: enabled && !expired,
    onTick: handleTimerTick,
  });

  useEffect(() => {
    const wasEnabled = prevEnabledRef.current;
    prevEnabledRef.current = enabled;

    if (!enabled) {
      // OFF にした瞬間に保留中スクロールまで実行すると「止めたのに動く」感触になるので破棄する。
      discardPendingRefresh();
      // 次に ON にしたとき前回のアイドル累積を引き継がないようリセットする。
      // 変更理由: 以前は回数だけを戻して新着時刻を残していたため、OFF の間の経過時間まで
      // 「新着なし」と数え、再 ON 直後の最初の空振りで時間ベース停止が発火していた。
      idleStopStateRef.current = INITIAL_IDLE_STOP_STATE;
      clearScrollingIndicator();
      return;
    }

    if (wasEnabled) {
      return;
    }

    const scrollContainer = moveToThreadBottom();
    viewWindow.requestAnimationFrame(() => {
      syncCanAutoScroll();
    });

    if (!scrollContainer || expired || loadingRef.current || pendingRefreshRef.current) {
      return;
    }

    // ON 直後の初回更新。アイドル累積は ON のタイミングでリセットし、
    // この回は「新着ゼロ」でも放置とは数えない。
    idleStopStateRef.current = INITIAL_IDLE_STOP_STATE;
    capturePendingRefresh(false);
    requestRefreshFromHook();
  }, [
    capturePendingRefresh,
    clearScrollingIndicator,
    discardPendingRefresh,
    enabled,
    expired,
    moveToThreadBottom,
    requestRefreshFromHook,
    syncCanAutoScroll,
    viewWindow,
  ]);

  useLayoutEffect(() => {
    const refreshKeyChangeSource = consumeRefreshKeyChange();
    if (refreshKeyChangeSource == null || !enabled) {
      return;
    }

    if (refreshKeyChangeSource === "internal") {
      return;
    }

    // RELOAD は loading が true になる前に DOM 更新を予約するため、
    // loading の立ち上がりを待つとキャッシュ通知や別リクエストの完了で
    // 更新前のレス件数を失うことがある。layout effect で確実に保存する。
    syncCanAutoScroll();
    capturePendingRefresh(false);
  }, [capturePendingRefresh, consumeRefreshKeyChange, enabled, syncCanAutoScroll]);

  useEffect(() => {
    // fetchThread() の再試行など refreshKey を経由しない取得のためのフォールバック。
    // 通常の RELOAD は直前の layout effect で先に保存されるので、同じ更新を二重に扱わない。
    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = loading;

    if (!enabled || wasLoading || !loading || pendingRefreshRef.current) {
      return;
    }

    // 手動・書き込み起因の更新は放置判定の対象にしない。
    capturePendingRefresh(false);
  }, [capturePendingRefresh, enabled, loading]);

  useLayoutEffect(() => {
    if (consumeRefreshCompletionGate()) {
      return;
    }

    if (!enabled || loading || expired) {
      if (!enabled || expired) {
        pendingRefreshRef.current = null;
      }
      return;
    }

    const pendingRefresh = pendingRefreshRef.current;
    if (!pendingRefresh) {
      return;
    }

    pendingRefreshRef.current = null;

    const { hasNewResponses, newResponseCount } = compareRefreshSnapshot(pendingRefresh, {
      responseCount,
      lastResponseNum,
    });

    if (hasNewResponses && pendingRefresh.shouldNotify) {
      // 通知は追従スクロールの可否に依存させず、ユーザーが途中位置でも知らせる。
      onNewResponsesRef.current?.(newResponseCount, pendingRefresh.lastResponseNum);
    }

    const { state, shouldStop } = evaluateIdleStop(idleStopStateRef.current, {
      hasNewResponses,
      isIdleStopCandidate: pendingRefresh.isIdleStopCandidate,
      deferStop: deferAutoStop,
      mode: resolveIdleStopMode(readIdleStopTimeoutValue()),
      now: Date.now(),
    });
    idleStopStateRef.current = state;
    if (shouldStop) {
      onAutoStopRef.current?.();
    }
  }, [
    enabled,
    expired,
    lastResponseNum,
    loading,
    responseCount,
    consumeRefreshCompletionGate,
    deferAutoStop,
    onAutoStopRef,
    onNewResponsesRef,
  ]);

  return {
    autoScrollBoundaryRef,
    canAutoScroll,
    isAutoScrolling,
    intervalMs,
    phase: isAutoScrolling ? "scrolling" : "idle",
  };
}
