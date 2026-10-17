import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createLogger } from "src/app/logger";
import { container } from "src/service-container/index";
import type { IReadState, IRes } from "src/service-container/interfaces";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import {
  consumePendingThreadResJump,
  findThreadScrollContainer,
  measureThreadReadState,
  peekPendingThreadResJump,
  type PendingThreadJump,
  scrollThreadToResponse,
  subscribeThreadResJump,
} from "src/view/browser/utils/thread-read-state";

const logger = createLogger("view/browser");

interface UseThreadReadStateParams {
  tabId: string;
  threadUrl: string;
  isActive: boolean;
  responses: IRes[];
  loading: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
}

interface UseThreadReadStateResult {
  isInitialReadStateResolved: boolean;
  scrollToResponse: (resNum: number, options?: { highlight?: boolean; offset?: number }) => boolean;
}

export function useThreadReadState({
  tabId,
  threadUrl,
  isActive,
  responses,
  loading,
  rootRef,
}: UseThreadReadStateParams): UseThreadReadStateResult {
  const { window: viewWindow } = useViewSurface();
  const [initialReadState, setInitialReadState] = useState<IReadState | null>(null);
  const [hasLoadedInitialReadState, setHasLoadedInitialReadState] = useState(false);
  const [isInitialReadStateResolved, setIsInitialReadStateResolved] = useState(false);
  const [pendingThreadJump, setPendingThreadJump] = useState<PendingThreadJump | null>(null);
  const latestReadStateRef = useRef<IReadState | null>(null);
  const saveReadStateTimerRef = useRef<number | null>(null);

  const scrollToResponse = useCallback(
    (resNum: number, options?: { highlight?: boolean; offset?: number }) =>
      scrollThreadToResponse(rootRef.current, resNum, options),
    // rootRef は安定した参照なので依存配列から除外する
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const saveCurrentReadState = useCallback(async () => {
    if (!isActive || !isInitialReadStateResolved) return;

    const measuredReadState = measureThreadReadState(rootRef.current, responses.length);
    if (!measuredReadState) return;

    const previousReadState = latestReadStateRef.current;
    const nextReadState: IReadState = {
      url: threadUrl,
      last: measuredReadState.last,
      read: Math.max(previousReadState?.read ?? 0, measuredReadState.read),
      received: Math.max(previousReadState?.received ?? 0, measuredReadState.received),
      offset: measuredReadState.offset,
      date: Date.now(),
    };

    if (
      previousReadState &&
      previousReadState.last === nextReadState.last &&
      previousReadState.read === nextReadState.read &&
      previousReadState.received === nextReadState.received &&
      (previousReadState.offset ?? null) === (nextReadState.offset ?? null)
    ) {
      return;
    }

    latestReadStateRef.current = nextReadState;
    try {
      await container.readState.set(nextReadState);
    } catch (error) {
      logger.error(error);
    }
    // rootRef は安定した参照のため依存配列から除外する
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isInitialReadStateResolved, threadUrl, responses.length]);

  const scheduleReadStateSave = useCallback(() => {
    if (saveReadStateTimerRef.current != null) {
      viewWindow.clearTimeout(saveReadStateTimerRef.current);
    }
    saveReadStateTimerRef.current = viewWindow.setTimeout(() => {
      saveReadStateTimerRef.current = null;
      void saveCurrentReadState();
    });
  }, [saveCurrentReadState, viewWindow]);

  useEffect(() => {
    let cancelled = false;

    setInitialReadState(null);
    setHasLoadedInitialReadState(false);
    setIsInitialReadStateResolved(false);
    setPendingThreadJump(peekPendingThreadResJump(threadUrl));
    latestReadStateRef.current = null;

    const loadInitialThreadReadState = async () => {
      let nextReadState = container.bookmark.get(threadUrl)?.readState ?? null;

      try {
        const storedReadState = await container.readState.get(threadUrl);
        if (
          storedReadState &&
          (!nextReadState || container.util.isNewerReadState(nextReadState, storedReadState))
        ) {
          nextReadState = storedReadState;
        }
      } catch (error) {
        logger.error(error);
      }

      if (cancelled) return;

      latestReadStateRef.current = nextReadState;
      setInitialReadState(nextReadState);
      setHasLoadedInitialReadState(true);
    };

    void loadInitialThreadReadState();

    return () => {
      cancelled = true;
    };
  }, [threadUrl]);

  useEffect(() => {
    return subscribeThreadResJump((jump) => {
      if (jump.threadUrl !== threadUrl) return;
      setPendingThreadJump(jump);
    });
  }, [threadUrl]);

  useEffect(() => {
    // 変更理由: 同じスレを複数ペインで開いた場合も、Overlayが選んだタブだけが
    // レスジャンプ要求を消費するようにする。
    if (
      !isActive ||
      !pendingThreadJump ||
      (pendingThreadJump.targetTabId && pendingThreadJump.targetTabId !== tabId) ||
      responses.length === 0 ||
      loading
    )
      return;

    const performJump = () => {
      if (!scrollToResponse(pendingThreadJump.resNum)) return false;
      consumePendingThreadResJump(threadUrl, pendingThreadJump.token);
      setPendingThreadJump((current) =>
        current?.token === pendingThreadJump.token ? null : current,
      );
      setIsInitialReadStateResolved(true);
      viewWindow.requestAnimationFrame(() => {
        void saveCurrentReadState();
      });
      return true;
    };
    if (performJump()) return;
    // 変更理由: 絞り込み解除やスレ再読込の直前に要求が来た場合、まだ存在しない
    // レスへスクロールできない。DOMへ現れた時に再試行して要求を消費する。
    const root = rootRef.current;
    if (!root || typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => {
      if (performJump()) observer.disconnect();
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [
    isActive,
    rootRef,
    tabId,
    loading,
    threadUrl,
    pendingThreadJump,
    responses.length,
    saveCurrentReadState,
    scrollToResponse,
    viewWindow,
  ]);

  useEffect(() => {
    if (
      !isActive ||
      isInitialReadStateResolved ||
      pendingThreadJump ||
      !hasLoadedInitialReadState ||
      responses.length === 0 ||
      loading
    ) {
      return;
    }

    if (initialReadState?.last) {
      scrollToResponse(initialReadState.last, {
        highlight: false,
        // 保存値のnullはoffset未設定を表すため、スクロールAPIにはundefinedで渡す。
        offset: initialReadState.offset ?? undefined,
      });
    }

    setIsInitialReadStateResolved(true);
    viewWindow.requestAnimationFrame(() => {
      void saveCurrentReadState();
    });
  }, [
    hasLoadedInitialReadState,
    initialReadState,
    isActive,
    isInitialReadStateResolved,
    loading,
    pendingThreadJump,
    responses.length,
    saveCurrentReadState,
    scrollToResponse,
    viewWindow,
  ]);

  useEffect(() => {
    if (!isActive || !isInitialReadStateResolved || responses.length === 0) return;

    const scrollContainer = findThreadScrollContainer(rootRef.current);
    if (!scrollContainer) return;

    const handleScroll = () => {
      scheduleReadStateSave();
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll);
      if (saveReadStateTimerRef.current != null) {
        viewWindow.clearTimeout(saveReadStateTimerRef.current);
        saveReadStateTimerRef.current = null;
      }
      void saveCurrentReadState();
    };
    // rootRef は安定した参照のため依存配列から除外する
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isActive,
    isInitialReadStateResolved,
    responses.length,
    saveCurrentReadState,
    scheduleReadStateSave,
    viewWindow,
  ]);

  useEffect(() => {
    if (!isActive || !isInitialReadStateResolved || loading || responses.length === 0) {
      return;
    }

    // 変更理由: 自動更新で received だけ増えたケースはスクロールイベントが発生しないため、
    // レス数変化時にも保存を予約して未読数の取りこぼしを防ぐ。
    scheduleReadStateSave();
  }, [isActive, isInitialReadStateResolved, loading, responses.length, scheduleReadStateSave]);

  useEffect(() => {
    const handlePageHide = () => {
      if (saveReadStateTimerRef.current != null) {
        viewWindow.clearTimeout(saveReadStateTimerRef.current);
        saveReadStateTimerRef.current = null;
      }
      void saveCurrentReadState();
    };
    viewWindow.addEventListener("pagehide", handlePageHide);
    return () => {
      viewWindow.removeEventListener("pagehide", handlePageHide);
    };
  }, [saveCurrentReadState, viewWindow]);

  return { isInitialReadStateResolved, scrollToResponse };
}
