import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { getResizeObserverForWindow, isHTMLElementInWindow } from "src/view/browser/utils/dom";

interface UseAutoFollowScrollOptions {
  enabled: boolean;
  loading: boolean;
  /** 自動更新が有効なまま新しいスレッドを表示するとき、最初に最下部へ同期する。 */
  startAtBottom: boolean;
  /** ポップアップ表示中など、底面への追従だけを一時停止する。 */
  pauseAutoScroll: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
  /** 自動更新の完了待ちがあるか。完了待ち中のホイール操作は追従の取り消しとして扱う。 */
  hasPendingRefresh: () => boolean;
  /**
   * ユーザーが手動スクロールで追従を取り消したか。
   * 更新開始・OFF・dat落ちで呼び出し側が戻すため、所有者は呼び出し側に置く。
   */
  userInterruptedRef: RefObject<boolean>;
}

export interface UseAutoFollowScrollResult {
  autoScrollBoundaryRef: RefObject<HTMLDivElement | null>;
  canAutoScroll: boolean;
  isAutoScrolling: boolean;
  getScrollContainer: () => HTMLElement | null;
  moveToThreadBottom: () => HTMLElement | null;
  syncCanAutoScroll: () => void;
  clearScrollingIndicator: () => void;
}

/**
 * スレッド末尾への追従スクロールを扱う。
 *
 * 新着描画・ライブチャットの行追加・画像読み込み・容器のリサイズをすべて
 * syncCanAutoScroll へ流し、「境界が見えていれば底面へ寄せる」判定を一か所にまとめる。
 * 更新の開始・完了の判定は useAutoRefresh 側が持ち、ここではスクロールだけを扱う。
 */
export function useAutoFollowScroll({
  enabled,
  loading,
  startAtBottom,
  pauseAutoScroll,
  rootRef,
  hasPendingRefresh,
  userInterruptedRef,
}: UseAutoFollowScrollOptions): UseAutoFollowScrollResult {
  const { window: viewWindow } = useViewSurface();
  const autoScrollBoundaryRef = useRef<HTMLDivElement>(null);
  const canAutoScrollRef = useRef(false);
  const startAtBottomAppliedRef = useRef(false);
  const scrollObserverFrameRef = useRef<number | null>(null);
  const contentResizeObserverFrameRef = useRef<number | null>(null);
  const lastObservedScrollHeightRef = useRef<number | null>(null);
  // 変更理由: サイドタブバー開閉やウィンドウリサイズでは scrollHeight が変わらず
  // clientHeight だけが変わることがある。底面維持の判定に両方を使うため、高さも保持する。
  const lastObservedClientHeightRef = useRef<number | null>(null);
  const scrollingIndicatorTimerRef = useRef<number | null>(null);
  // wheel リスナーから読むための写し。state を依存配列に入れると、インジケータが
  // 切り替わるたびに scroll/wheel リスナーを付け直すことになるため ref で読む。
  const isAutoScrollingRef = useRef(false);
  const [canAutoScroll, setCanAutoScroll] = useState(false);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);

  const clearScrollingIndicator = useCallback(() => {
    if (scrollingIndicatorTimerRef.current != null) {
      viewWindow.clearTimeout(scrollingIndicatorTimerRef.current);
      scrollingIndicatorTimerRef.current = null;
    }
    isAutoScrollingRef.current = false;
    setIsAutoScrolling(false);
  }, [viewWindow]);

  const showScrollingIndicator = useCallback(() => {
    if (scrollingIndicatorTimerRef.current != null) {
      viewWindow.clearTimeout(scrollingIndicatorTimerRef.current);
      scrollingIndicatorTimerRef.current = null;
    }

    // scrollBy 自体は即時でも、状態表示は少し残した方が
    // 「今まさに追従した」ことをユーザーが認識しやすい。
    isAutoScrollingRef.current = true;
    setIsAutoScrolling(true);
    scrollingIndicatorTimerRef.current = viewWindow.setTimeout(() => {
      scrollingIndicatorTimerRef.current = null;
      isAutoScrollingRef.current = false;
      setIsAutoScrolling(false);
    }, 900);
  }, [viewWindow]);

  const getScrollContainer = useCallback((): HTMLElement | null => {
    const host = rootRef.current;
    if (!host) {
      return null;
    }
    const nearestPanel = host.closest(".content-area__tab-panel");
    if (isHTMLElementInWindow(nearestPanel, viewWindow)) {
      return nearestPanel;
    }

    const contentArea = host.closest(".content-area");
    if (!isHTMLElementInWindow(contentArea, viewWindow)) {
      return null;
    }

    const activePanel = contentArea.querySelector(".content-area__tab-panel[data-active='true']");
    if (isHTMLElementInWindow(activePanel, viewWindow)) {
      return activePanel;
    }

    // 互換性のため、旧構成（content-area 自体がスクロール）の場合は fallback する。
    return contentArea;
  }, [rootRef, viewWindow]);

  const moveToThreadBottom = useCallback((): HTMLElement | null => {
    const scrollContainer = getScrollContainer();
    if (!scrollContainer) {
      return null;
    }

    // 自動更新ON直後に途中位置のままだと、初回更新だけは追従せず「開始した感」が薄い。
    // 先に最下部へ寄せてから refresh を投げることで、legacy と同じ感覚に揃える。
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
    canAutoScrollRef.current = true;
    setCanAutoScroll(true);
    return scrollContainer;
  }, [getScrollContainer]);

  const syncCanAutoScroll = useCallback(() => {
    const scrollContainer = getScrollContainer();
    const boundary = autoScrollBoundaryRef.current;

    // 非アクティブなパネルの寸法変化を同期すると、表示中の追従状態を
    // hidden なタブのレイアウトで上書きしてしまうため、現在のパネルだけを判定する。
    if (!enabled || !scrollContainer || scrollContainer.dataset.active === "false" || !boundary) {
      canAutoScrollRef.current = false;
      setCanAutoScroll(false);
      lastObservedScrollHeightRef.current = null;
      lastObservedClientHeightRef.current = null;
      return;
    }

    const currentScrollHeight = scrollContainer.scrollHeight;
    const currentClientHeight = scrollContainer.clientHeight;
    const sizeChanged =
      lastObservedScrollHeightRef.current !== currentScrollHeight ||
      lastObservedClientHeightRef.current !== currentClientHeight;
    lastObservedScrollHeightRef.current = currentScrollHeight;
    lastObservedClientHeightRef.current = currentClientHeight;

    // 新着描画やブラウザのスクロール補正が先に境界を動かしても、それを手動離脱と見なさない。
    // 通常更新・ライブチャット・画像読み込み・容器のリサイズを同じ順序で処理し、
    // 変更前の追従意図で底面を補正してから境界を判定する。現在の距離を使うことで、
    // ブラウザが既に補正した分や後続のResizeObserver通知を二重に加算しない。
    if (
      sizeChanged &&
      canAutoScrollRef.current &&
      !userInterruptedRef.current &&
      !pauseAutoScroll
    ) {
      const distanceToBottom =
        Math.max(0, currentScrollHeight - currentClientHeight) - scrollContainer.scrollTop;
      if (distanceToBottom !== 0) {
        scrollContainer.scrollBy({ top: distanceToBottom, behavior: "auto" });
        showScrollingIndicator();
      }
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const boundaryRect = boundary.getBoundingClientRect();
    const viewportBottom = scrollContainer.scrollTop + scrollContainer.clientHeight;
    const boundaryBottom = scrollContainer.scrollTop + boundaryRect.bottom - containerRect.top;
    // scrollHeight/clientHeightは整数だが境界の座標は小数になるため、丸め誤差で追従を外さない。
    const nextValue = viewportBottom + 1 >= boundaryBottom;

    canAutoScrollRef.current = nextValue;
    setCanAutoScroll((prev) => (prev === nextValue ? prev : nextValue));
  }, [enabled, getScrollContainer, pauseAutoScroll, showScrollingIndicator, userInterruptedRef]);

  useLayoutEffect(() => {
    // ライブチャットは通信完了後にも行を追加するため、取得状態によらず描画ごとに補正する。
    syncCanAutoScroll();
  });

  useLayoutEffect(() => {
    if (!startAtBottom) {
      startAtBottomAppliedRef.current = false;
      return;
    }
    if (!enabled || loading || startAtBottomAppliedRef.current) {
      return;
    }

    // 変更理由: 次スレ移動では hook 自体が enabled のまま再マウントされるため、
    // 通常の「OFFからON」検知が働かず canAutoScroll が false のまま残る。
    // 初回取得前では空のスレッドにしか移動できないため、取得完了後に一度だけ
    // 最下部へ寄せ、次の自動更新・次スレ判定を継続させる。
    const scrollContainer = moveToThreadBottom();
    if (!scrollContainer) {
      return;
    }
    startAtBottomAppliedRef.current = true;
    viewWindow.requestAnimationFrame(() => {
      syncCanAutoScroll();
    });
  }, [enabled, loading, moveToThreadBottom, startAtBottom, syncCanAutoScroll, viewWindow]);

  useEffect(() => {
    const scrollContainer = getScrollContainer();
    if (!scrollContainer) {
      return;
    }

    const scheduleSync = () => {
      if (scrollObserverFrameRef.current != null) {
        return;
      }

      scrollObserverFrameRef.current = viewWindow.requestAnimationFrame(() => {
        scrollObserverFrameRef.current = null;
        syncCanAutoScroll();
      });
    };

    const handleWheel = () => {
      if (hasPendingRefresh() || isAutoScrollingRef.current || canAutoScrollRef.current) {
        // smooth scroll を使わない代わりに、ユーザー操作が入ったフレームでは
        // 予定していた自動追従を明示的に取り消して手動スクロールを優先する。
        // 高さ変更の監視中も同じ意図を維持し、ユーザーのホイール操作直後に
        // 境界へ引き戻さないようにする。
        userInterruptedRef.current = true;
      }
    };

    scheduleSync();
    scrollContainer.addEventListener("scroll", scheduleSync, { passive: true });
    scrollContainer.addEventListener("wheel", handleWheel, { passive: true });

    return () => {
      if (scrollObserverFrameRef.current != null) {
        viewWindow.cancelAnimationFrame(scrollObserverFrameRef.current);
        scrollObserverFrameRef.current = null;
      }

      scrollContainer.removeEventListener("scroll", scheduleSync);
      scrollContainer.removeEventListener("wheel", handleWheel);
    };
  }, [getScrollContainer, hasPendingRefresh, syncCanAutoScroll, userInterruptedRef, viewWindow]);

  useEffect(() => {
    const root = rootRef.current;
    const scrollContainer = getScrollContainer();

    if (!enabled || !root || !scrollContainer || scrollContainer.dataset.active === "false") {
      lastObservedScrollHeightRef.current = null;
      lastObservedClientHeightRef.current = null;
      return;
    }

    // ResizeObserver は初回 observe 時にも通知するため、現在値を先に保存して
    // 初回通知を「高さ変更」と誤認しないようにする。
    lastObservedScrollHeightRef.current = scrollContainer.scrollHeight;
    lastObservedClientHeightRef.current = scrollContainer.clientHeight;

    const scheduleContentResize = () => {
      if (contentResizeObserverFrameRef.current != null) {
        return;
      }

      contentResizeObserverFrameRef.current = viewWindow.requestAnimationFrame(() => {
        contentResizeObserverFrameRef.current = null;

        syncCanAutoScroll();
      });
    };

    // 変更理由: サイドタブバー開閉は window リサイズを発火させず、root の幅変化だけが
    // 起きる。scroll 側の window resize だけでは追従維持と競合して判定が外れるため、
    // 同じ補正経路へ一本化し、rAF で合流させて二重判定を防ぐ。
    viewWindow.addEventListener("resize", scheduleContentResize);

    const ResizeObserverConstructor = getResizeObserverForWindow(viewWindow);
    if (ResizeObserverConstructor == null) {
      return () => {
        viewWindow.removeEventListener("resize", scheduleContentResize);
        if (contentResizeObserverFrameRef.current != null) {
          viewWindow.cancelAnimationFrame(contentResizeObserverFrameRef.current);
          contentResizeObserverFrameRef.current = null;
        }
        lastObservedScrollHeightRef.current = null;
        lastObservedClientHeightRef.current = null;
      };
    }

    const resizeObserver = new ResizeObserverConstructor(scheduleContentResize);
    resizeObserver.observe(root);
    // 変更理由: root だけではコンテナ自体の高さ変化（下部パネル開閉やウィンドウ高さ変更で
    // 中身の高さが変わらない場合）を検知できない。スクロールコンテナ自体も監視して
    // サイズ変更全般を同じ底面維持処理へ流す。
    resizeObserver.observe(scrollContainer);

    return () => {
      viewWindow.removeEventListener("resize", scheduleContentResize);
      resizeObserver.disconnect();
      if (contentResizeObserverFrameRef.current != null) {
        viewWindow.cancelAnimationFrame(contentResizeObserverFrameRef.current);
        contentResizeObserverFrameRef.current = null;
      }
      lastObservedScrollHeightRef.current = null;
      lastObservedClientHeightRef.current = null;
    };
  }, [enabled, getScrollContainer, rootRef, syncCanAutoScroll, viewWindow]);

  useEffect(() => {
    return () => {
      if (scrollingIndicatorTimerRef.current != null) {
        viewWindow.clearTimeout(scrollingIndicatorTimerRef.current);
      }
    };
  }, [viewWindow]);

  return {
    autoScrollBoundaryRef,
    canAutoScroll,
    isAutoScrolling,
    getScrollContainer,
    moveToThreadBottom,
    syncCanAutoScroll,
    clearScrollingIndicator,
  };
}
