import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { getEventTargetElement } from "src/view/browser/utils/dom";
import {
  isManualRefreshCoolingDown,
  useManualRefreshCooldown,
} from "src/view/browser/utils/manual-refresh";

export const WHEEL_THRESHOLD = 7;
const COUNTER_RESET_DELAY_MS = 800;
type WheelDirection = "up" | "down";

interface UseWheelPaginationOptions {
  isEnabled: boolean;
  isLoading: boolean;
  cooldownScopeKey: string;
  containerRef: RefObject<HTMLElement | null>;
  edge: "top" | "bottom";
  onRefresh: () => boolean | void;
}

interface WheelPaginationState {
  count: number;
  direction: WheelDirection | null;
}

/**
 * スクロール端での連続ホイールを更新操作へ変換する。
 * スクロール対象の探索やページ固有の遷移は呼び出し側に持たせ、一覧・スレッドで共有する。
 */
export function useWheelPagination({
  isEnabled,
  isLoading,
  cooldownScopeKey,
  containerRef,
  edge,
  onRefresh,
}: UseWheelPaginationOptions): WheelPaginationState & {
  isCoolingDown: boolean;
  isLoading: boolean;
} {
  const { window: viewWindow } = useViewSurface();
  const [state, setState] = useState<WheelPaginationState>({ count: 0, direction: null });
  const [refreshDirection, setRefreshDirection] = useState<WheelDirection | null>(null);
  const stateRef = useRef<WheelPaginationState>({ count: 0, direction: null });
  const resetTimerRef = useRef<number | null>(null);
  const previousLoadingRef = useRef(isLoading);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const manualRefreshCoolingDown = useManualRefreshCooldown(cooldownScopeKey);

  const reset = useCallback(() => {
    stateRef.current = { count: 0, direction: null };
    setState(stateRef.current);
  }, []);

  useEffect(() => {
    if (isEnabled) return;
    if (resetTimerRef.current !== null) viewWindow.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = null;
    reset();
    setRefreshDirection(null);
  }, [isEnabled, reset, viewWindow]);

  useEffect(() => {
    const wasLoading = previousLoadingRef.current;
    previousLoadingRef.current = isLoading;

    if (wasLoading && !isLoading) {
      // 変更理由: ロード完了でホイール由来の表示状態も終わらせ、待ち時間内に
      // 自動更新が始まっても前回のホイール操作のスピナーを再表示しない。
      setRefreshDirection(null);
      return;
    }

    if (wasLoading || !isLoading || refreshDirection !== null) {
      return;
    }

    // 変更理由: 自動更新や手動更新の開始時に未完了のホイール進捗を残すと、
    // 読み込み中だけ隠したIndicatorが通信完了後に古い状態で再表示される。
    // ホイール更新自身はrefreshDirectionが設定済みなので、この分岐では進捗を維持する。
    reset();
    if (resetTimerRef.current !== null) {
      viewWindow.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, [isLoading, refreshDirection, reset, viewWindow]);

  useEffect(() => {
    if (manualRefreshCoolingDown && refreshDirection === null && stateRef.current.count > 0) {
      // ボタン更新が始まった時に残っていたwheel進捗をspinner表示へ誤転用しない。
      reset();
    }
  }, [manualRefreshCoolingDown, refreshDirection, reset]);

  useEffect(() => {
    const container = containerRef.current;
    if (!isEnabled || !container) return;

    const handleWheel = (event: WheelEvent) => {
      // ポップアップ自身のスクロールを、背後のスレッド更新ジェスチャーとして
      // 吸収しない。ポータル経由でもイベントが親パネルへ届くため、ここで除外する。
      const eventTarget = getEventTargetElement(event.target, viewWindow);
      if (eventTarget?.closest('[data-popup="true"], .context-menu, .mini-window')) {
        return;
      }

      if (isManualRefreshCoolingDown(cooldownScopeKey)) {
        event.preventDefault();
        return;
      }

      if (isLoading) return;

      const isAtTop = container.scrollTop <= 1;
      const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 1;
      const direction = event.deltaY < 0 ? "up" : "down";
      const isAtEdge =
        edge === "top" ? direction === "up" && isAtTop : direction === "down" && isAtBottom;

      if (!isAtEdge) {
        if (stateRef.current.count > 0) reset();
        return;
      }

      event.preventDefault();
      if (resetTimerRef.current !== null) viewWindow.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = viewWindow.setTimeout(reset, COUNTER_RESET_DELAY_MS);

      const nextState: WheelPaginationState = {
        direction,
        count: stateRef.current.direction === direction ? stateRef.current.count + 1 : 1,
      };
      stateRef.current = nextState;
      setState(nextState);

      if (nextState.count < WHEEL_THRESHOLD) return;

      setRefreshDirection(direction);
      const accepted = onRefreshRef.current();
      if (accepted === false) {
        setRefreshDirection(null);
        reset();
        return;
      }
      reset();
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
      if (resetTimerRef.current !== null) viewWindow.clearTimeout(resetTimerRef.current);
    };
  }, [containerRef, cooldownScopeKey, edge, isEnabled, isLoading, reset, viewWindow]);

  const isCoolingDown = isEnabled && manualRefreshCoolingDown;
  // 変更理由: 自動更新などのホイール操作以外が起点の読み込み中は、残っていたホイール方向や
  // 進捗でインジケーターを出さない。読み込みと重なっただけで一瞬表示されるのを防ぐ。
  // ホイール更新自体の読み込み中は refreshDirection が残るため、スピナー表示は維持される。
  const isWheelDriven = refreshDirection != null;
  const direction = refreshDirection ?? (isLoading ? null : state.direction);

  useEffect(() => {
    if (!isLoading && !manualRefreshCoolingDown && refreshDirection !== null) {
      setRefreshDirection(null);
    }
  }, [isLoading, manualRefreshCoolingDown, refreshDirection]);

  // 変更理由: ホイール更新の受付後や外部の読み込み中には古い進捗を表示しない。
  // スピナーは実際のロード状態から描画し、連続更新の待ち時間とは切り離す。
  const count = isWheelDriven || isLoading ? 0 : state.count;

  return {
    count,
    direction,
    isCoolingDown,
    isLoading: isEnabled && isLoading,
  };
}
