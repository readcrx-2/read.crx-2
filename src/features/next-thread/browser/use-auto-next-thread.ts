import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_CONFIG } from "src/app/config-defaults";
import { log } from "src/app/Log";
import { isNextThreadSearchTriggered } from "src/features/next-thread/browser/auto-next-thread-trigger";
import {
  type AutoNextThreadMode,
  findMainstreamThreadMatch,
  findNextThreadCandidates,
  findNextThreadMatch,
  type NextThreadMatch,
  type ThreadSearchCandidate,
} from "src/features/next-thread/browser/next-thread-search";
import { container } from "src/service-container/index";
import type { IThread, IToastService } from "src/service-container/interfaces";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { getBoardUrlFromThreadUrl } from "src/view/browser/utils/link-routing";

const NEXT_THREAD_SEARCH_FAST_RETRY_MS = 3_000;
const NEXT_THREAD_SEARCH_FAST_DURATION_MS = 30_000;
const NEXT_THREAD_SEARCH_RETRY_MS = 10_000;
const AUTO_NEXT_THREAD_CONFIRMATION_MS = 5_000;
const MAINSTREAM_WATCH_GRACE_PERIOD_MS = 15_000;
const MAINSTREAM_WATCH_DURATION_MS = 60_000;
const MAINSTREAM_WATCH_RETRY_MS = 5_000;
const REQUIRED_CANDIDATE_CONFIRMATIONS: Record<AutoNextThreadMode, number> = {
  balanced: 2,
  aggressive: 1,
};

type AutoNextThreadStatus = "idle" | "searching" | "confirming" | "watching";

export interface PendingAutoNextThreadMove {
  sourceThread: Pick<IThread, "title" | "url">;
  candidates: readonly NextThreadMatch[];
  boardUrl: string;
  mode: AutoNextThreadMode;
  deadline: number;
  remainingMilliseconds: number;
  remainingSeconds: number;
  isPaused: boolean;
}

interface UseAutoNextThreadOptions {
  autoRefreshEnabled: boolean;
  featureEnabled: boolean;
  threadUrl: string;
  threadTitle: string;
  responseCount: number;
  expired: boolean;
  mode: AutoNextThreadMode;
  responseMessages: readonly string[];
  /** 探索開始時からの上限秒数。停止や非表示を挟んでも期限を延ばさない。 */
  searchDurationSeconds?: number;
  /**
   * 自動スクロール閾値より下に居るかどうか。
   * 上の方を読んでいる最中に勝手に次スレへ飛ばすとユーザーの文脈を壊すので、
   * 閾値より下(=追従可能位置)に居るときだけ次スレ移動を行う。
   */
  canAutoScroll: boolean;
  /** コメント流し中は画面操作を待たせないため、候補確定後すぐ移動する。 */
  skipMoveDelay?: boolean;
  followThread: (thread: Pick<IThread, "title" | "url">) => void;
  /** 探索を継続できず終了したとき、自動更新の停止を通知する。 */
  onSearchExhausted?: () => void;
  toast?: Pick<IToastService, "info">;
}

interface MainstreamWatchState {
  boardUrl: string;
  originalThreadUrl: string;
  originalThreadTitle: string;
  currentThreadUrl: string;
  startedAt: number;
}

interface MainstreamSnapshot {
  threads: readonly IThread[];
  observedAt: number;
}

interface NextThreadSearchSession {
  threadUrl: string;
  startedAt: number;
  deadline: number;
  nextRequestAt: number;
  phase: "searching" | "found" | "exhausted";
  request: ReturnType<typeof container.board.getThreads> | null;
}

function getNextThreadSearchRetryMs(session: NextThreadSearchSession): number {
  // 次スレが立つ直後は見つけやすくするため細かく確認し、その後は板一覧への負荷を抑える。
  return Date.now() - session.startedAt < NEXT_THREAD_SEARCH_FAST_DURATION_MS
    ? NEXT_THREAD_SEARCH_FAST_RETRY_MS
    : NEXT_THREAD_SEARCH_RETRY_MS;
}

export function useAutoNextThread({
  autoRefreshEnabled,
  featureEnabled,
  threadUrl,
  threadTitle,
  responseCount,
  expired,
  mode,
  responseMessages,
  searchDurationSeconds = Number(DEFAULT_CONFIG.next_thread_search_duration),
  canAutoScroll,
  skipMoveDelay = false,
  followThread,
  onSearchExhausted,
  toast = container.toast,
}: UseAutoNextThreadOptions): {
  status: AutoNextThreadStatus;
  pendingMove: PendingAutoNextThreadMove | null;
  cancelPendingMove: () => void;
  selectPendingCandidate: (candidate: ThreadSearchCandidate) => void;
} {
  const { window: viewWindow, document: viewDocument } = useViewSurface();
  const [status, setStatus] = useState<AutoNextThreadStatus>("idle");
  const [pendingMove, setPendingMove] = useState<PendingAutoNextThreadMove | null>(null);
  const [watchState, setWatchState] = useState<MainstreamWatchState | null>(null);
  const lastSearchKeyRef = useRef<string | null>(null);
  const searchSessionRef = useRef<NextThreadSearchSession | null>(null);
  const searchDeadlineTimerRef = useRef<number | null>(null);
  const onSearchExhaustedRef = useRef(onSearchExhausted);
  if (searchSessionRef.current?.threadUrl !== threadUrl) {
    searchSessionRef.current = null;
  }
  const pendingCandidateRef = useRef<{ url: string; count: number } | null>(null);
  const mainstreamPendingCandidateRef = useRef<{ url: string; count: number } | null>(null);
  const mainstreamSnapshotRef = useRef<MainstreamSnapshot | null>(null);
  const responseMessagesRef = useRef(responseMessages);
  const followThreadRef = useRef(followThread);
  // ブラウザのタブ/ウィンドウを裏に回している間は、ユーザーが見ていないところで
  // 勝手にタブを次スレへ差し替えてしまわないよう、可視状態でのみ動かす。
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    () => viewDocument.visibilityState === "visible",
  );

  useEffect(() => {
    followThreadRef.current = followThread;
  }, [followThread]);

  useEffect(() => {
    onSearchExhaustedRef.current = onSearchExhausted;
  }, [onSearchExhausted]);

  useEffect(() => {
    // 読書位置やON/OFFで通信を止めても期限は進め、別スレへの遷移・画面破棄時だけタイマーを解除する。
    return () => {
      if (searchDeadlineTimerRef.current != null) {
        viewWindow.clearTimeout(searchDeadlineTimerRef.current);
        searchDeadlineTimerRef.current = null;
      }
    };
  }, [threadUrl, viewWindow]);

  useEffect(() => {
    responseMessagesRef.current = responseMessages;
  }, [responseMessages]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = viewDocument.visibilityState === "visible";
      setIsDocumentVisible(isVisible);
      setPendingMove((current) => {
        if (current == null || current.isPaused === !isVisible) {
          return current;
        }
        if (!isVisible) {
          const remainingMilliseconds = Math.max(0, current.deadline - Date.now());
          return {
            ...current,
            remainingMilliseconds,
            remainingSeconds: Math.ceil(remainingMilliseconds / 1000),
            isPaused: true,
          };
        }
        return {
          ...current,
          deadline: Date.now() + current.remainingMilliseconds,
          isPaused: false,
        };
      });
    };

    viewDocument.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      viewDocument.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [viewDocument]);

  useEffect(() => {
    // 判定モードの変更で候補を破棄しても、再探索では最初に決めた期限を引き継ぐ。
    if (searchSessionRef.current?.phase === "found") {
      searchSessionRef.current.phase = "searching";
    }
    lastSearchKeyRef.current = null;
    pendingCandidateRef.current = null;
    mainstreamPendingCandidateRef.current = null;
    mainstreamSnapshotRef.current = null;
    setPendingMove(null);
    setStatus((prev) => (prev === "searching" || prev === "confirming" ? "idle" : prev));
  }, [mode, threadUrl]);

  useEffect(() => {
    if (autoRefreshEnabled && featureEnabled) {
      return;
    }

    if (searchSessionRef.current?.phase === "found") {
      searchSessionRef.current.phase = "searching";
    }
    lastSearchKeyRef.current = null;
    pendingCandidateRef.current = null;
    mainstreamPendingCandidateRef.current = null;
    mainstreamSnapshotRef.current = null;
    setWatchState(null);
    setPendingMove(null);
    setStatus("idle");
  }, [autoRefreshEnabled, featureEnabled]);

  useEffect(() => {
    if (watchState == null) {
      return;
    }
    if (threadUrl === watchState.originalThreadUrl || threadUrl === watchState.currentThreadUrl) {
      return;
    }

    mainstreamPendingCandidateRef.current = null;
    mainstreamSnapshotRef.current = null;
    setWatchState(null);
    setStatus("idle");
  }, [threadUrl, watchState]);

  const moveToCandidate = useCallback(
    (candidate: NextThreadMatch, pending: PendingAutoNextThreadMove) => {
      followThreadRef.current(candidate.thread);
      toast.info(`次スレへ移動しました: ${candidate.thread.title}`);
      setPendingMove(null);
      // 慎重モードの廃止後は標準・積極のどちらも、自動移動先へ監視を引き継いで本流候補を確認する。
      mainstreamPendingCandidateRef.current = null;
      mainstreamSnapshotRef.current = null;
      setWatchState({
        boardUrl: pending.boardUrl,
        originalThreadUrl: pending.sourceThread.url,
        originalThreadTitle: pending.sourceThread.title,
        currentThreadUrl: candidate.thread.url,
        startedAt: Date.now(),
      });
      setStatus("watching");
    },
    [toast],
  );

  const cancelPendingMove = useCallback(() => {
    // キャンセルした満了スレを再検索で即表示しないよう、今回の候補状態だけを破棄する。
    setPendingMove(null);
    setStatus("idle");
  }, []);

  const selectPendingCandidate = useCallback(
    (candidate: ThreadSearchCandidate) => {
      if (pendingMove) {
        const confirmedCandidate = pendingMove.candidates.find(
          (pendingCandidate) => pendingCandidate.thread.url === candidate.thread.url,
        );
        if (confirmedCandidate) {
          moveToCandidate(confirmedCandidate, pendingMove);
        }
      }
    },
    [moveToCandidate, pendingMove],
  );

  useEffect(() => {
    // 候補の確認待ち中でも読書位置を優先し、上のレスへ戻った利用者を自動移動させない。
    if (!pendingMove || !autoRefreshEnabled || !featureEnabled || !canAutoScroll) {
      return;
    }

    if (skipMoveDelay) {
      const firstCandidate = pendingMove.candidates[0];
      if (firstCandidate) {
        moveToCandidate(firstCandidate, pendingMove);
      }
      return;
    }

    if (pendingMove.isPaused || !isDocumentVisible) {
      return;
    }

    const updateCountdown = () => {
      const remainingSeconds = Math.max(0, Math.ceil((pendingMove.deadline - Date.now()) / 1000));
      if (remainingSeconds === 0) {
        // Reactが移動状態を反映する前に次のintervalが発火しても、同じ候補へ繰り返し移動しない。
        viewWindow.clearInterval(timerId);
        const firstCandidate = pendingMove.candidates[0];
        if (firstCandidate) {
          moveToCandidate(firstCandidate, pendingMove);
        }
        return;
      }

      setPendingMove((current) => {
        if (current == null || current.remainingSeconds === remainingSeconds) {
          return current;
        }
        return { ...current, remainingSeconds };
      });
    };

    const timerId = viewWindow.setInterval(updateCountdown, 200);
    return () => viewWindow.clearInterval(timerId);
  }, [
    autoRefreshEnabled,
    canAutoScroll,
    featureEnabled,
    isDocumentVisible,
    moveToCandidate,
    pendingMove,
    skipMoveDelay,
    viewWindow,
  ]);

  useEffect(() => {
    if (!autoRefreshEnabled || !featureEnabled || !isDocumentVisible || !canAutoScroll) {
      return;
    }
    if (!isNextThreadSearchTriggered(responseCount, expired)) {
      return;
    }

    const searchKey = threadUrl;
    if (lastSearchKeyRef.current === searchKey) {
      return;
    }
    lastSearchKeyRef.current = searchKey;

    // ON/OFFや表示切替でeffectが作り直されても、期限と通信の待ち時間を同じスレに保持する。
    const duration =
      Number.isFinite(searchDurationSeconds) &&
      searchDurationSeconds >= 60 &&
      searchDurationSeconds <= 600
        ? searchDurationSeconds
        : Number(DEFAULT_CONFIG.next_thread_search_duration);
    const session = searchSessionRef.current ?? {
      threadUrl,
      startedAt: Date.now(),
      deadline: Date.now() + duration * 1000,
      nextRequestAt: 0,
      phase: "searching" as const,
      request: null,
    };
    searchSessionRef.current = session;
    if (session.phase !== "searching") {
      return;
    }

    let cancelled = false;
    let timerId: number | null = null;
    let resolveDelay: (() => void) | null = null;

    setWatchState(null);
    mainstreamPendingCandidateRef.current = null;
    mainstreamSnapshotRef.current = null;
    setStatus("searching");

    const delay = (ms: number) =>
      new Promise<void>((resolve) => {
        resolveDelay = resolve;
        timerId = viewWindow.setTimeout(() => {
          timerId = null;
          resolveDelay = null;
          resolve();
        }, ms);
      });

    const finishSearch = () => {
      if (searchSessionRef.current !== session || session.phase !== "searching") {
        return;
      }
      session.phase = "exhausted";
      cancelled = true;
      if (timerId != null) viewWindow.clearTimeout(timerId);
      if (searchDeadlineTimerRef.current != null) {
        viewWindow.clearTimeout(searchDeadlineTimerRef.current);
        searchDeadlineTimerRef.current = null;
      }
      resolveDelay?.();
      pendingCandidateRef.current = null;
      setStatus("idle");
      onSearchExhaustedRef.current?.();
    };

    // subjectの応答が遅くても期限でON表示を解除し、期限後に返る候補では移動しない。
    if (Date.now() >= session.deadline) {
      finishSearch();
      return;
    }
    if (searchDeadlineTimerRef.current == null) {
      searchDeadlineTimerRef.current = viewWindow.setTimeout(
        finishSearch,
        session.deadline - Date.now(),
      );
    }

    const searchNextThread = async () => {
      // oxlint-disable-next-line no-useless-assignment
      let boardUrl = "";
      try {
        boardUrl = getBoardUrlFromThreadUrl(threadUrl);
      } catch (error) {
        log("error", "自動次スレ検索で板URLを解決できませんでした", {
          error,
          threadUrl,
        });
        finishSearch();
        return;
      }

      // 1000到達直後は3秒間隔で見つけやすくし、30秒後は10秒間隔にして期限までの取得負荷を抑える。
      while (!cancelled && session.phase === "searching") {
        if (Date.now() >= session.deadline) {
          finishSearch();
          return;
        }
        if (session.request == null && Date.now() < session.nextRequestAt) {
          await delay(Math.min(session.nextRequestAt, session.deadline) - Date.now());
          continue;
        }
        try {
          // 開始連打で待機中のリクエストを重ねず、初期・通常それぞれの間隔を守る。
          session.nextRequestAt = Date.now() + getNextThreadSearchRetryMs(session);
          const request = session.request ?? container.board.getThreads(boardUrl);
          session.request = request;
          const result = await request.finally(() => {
            if (session.request === request) {
              session.request = null;
              session.nextRequestAt = Date.now() + getNextThreadSearchRetryMs(session);
            }
          });
          // 取得中にタブが切り替わったり探索条件が無効になった場合は、
          // 古い subject.txt の結果で別スレへ遷移させない。
          if (cancelled || session.phase !== "searching") {
            return;
          }
          if (Date.now() >= session.deadline) {
            finishSearch();
            return;
          }
          const match = findNextThreadMatch(
            result.threads,
            {
              title: threadTitle,
              url: threadUrl,
            },
            {
              mode,
              responseMessages: responseMessagesRef.current,
            },
          );

          if (match) {
            const previousPending = pendingCandidateRef.current;
            const confirmationCount =
              previousPending?.url === match.thread.url ? previousPending.count + 1 : 1;
            pendingCandidateRef.current = {
              url: match.thread.url,
              count: confirmationCount,
            };
            const requiredConfirmations = match.reasons?.includes("explicit-link")
              ? 1
              : REQUIRED_CANDIDATE_CONFIRMATIONS[mode];

            if (confirmationCount >= requiredConfirmations) {
              session.phase = "found";
              if (searchDeadlineTimerRef.current != null) {
                viewWindow.clearTimeout(searchDeadlineTimerRef.current);
                searchDeadlineTimerRef.current = null;
              }
              const alternatives = findNextThreadCandidates(
                result.threads,
                { title: threadTitle, url: threadUrl },
                { mode, responseMessages: responseMessagesRef.current },
              ).filter((candidate) => candidate.thread.url !== match.thread.url);
              // 判定を通過した候補を先頭に固定し、手動検索と同じレス数・一致度を複数表示する。
              const candidates = [match, ...alternatives];
              const pending: PendingAutoNextThreadMove = {
                sourceThread: { title: threadTitle, url: threadUrl },
                candidates,
                boardUrl,
                mode,
                deadline: Date.now() + AUTO_NEXT_THREAD_CONFIRMATION_MS,
                remainingMilliseconds: AUTO_NEXT_THREAD_CONFIRMATION_MS,
                remainingSeconds: AUTO_NEXT_THREAD_CONFIRMATION_MS / 1000,
                isPaused: false,
              };

              if (skipMoveDelay) {
                moveToCandidate(match, pending);
              } else {
                setPendingMove(pending);
                setStatus("confirming");
              }
              return;
            }
          } else {
            pendingCandidateRef.current = null;
          }
        } catch (error) {
          // subject.txtが揺れても探索自体は継続するが、原因を追えるよう詳細を残す。
          log("error", "自動次スレ検索の板一覧取得に失敗しました", {
            boardUrl,
            error,
            threadUrl,
          });
        }

        if (cancelled || session.phase !== "searching") {
          return;
        }
        await delay(Math.min(session.nextRequestAt - Date.now(), session.deadline - Date.now()));
      }
    };

    void searchNextThread();

    return () => {
      cancelled = true;
      // 変更理由: 検索中にタブが非表示になったり読書位置がしきい線より上へ
      // 移動した場合、再開後に同じ満了スレをもう一度探索できるようにする。
      if (lastSearchKeyRef.current === searchKey) {
        lastSearchKeyRef.current = null;
      }
      if (timerId != null) {
        viewWindow.clearTimeout(timerId);
      }
      resolveDelay?.();
    };
  }, [
    autoRefreshEnabled,
    canAutoScroll,
    featureEnabled,
    expired,
    isDocumentVisible,
    mode,
    moveToCandidate,
    searchDurationSeconds,
    responseCount,
    threadTitle,
    threadUrl,
    skipMoveDelay,
    viewWindow,
  ]);

  useEffect(() => {
    if (
      watchState == null ||
      !autoRefreshEnabled ||
      !featureEnabled ||
      !isDocumentVisible ||
      !canAutoScroll ||
      threadUrl !== watchState.currentThreadUrl
    ) {
      return;
    }

    let cancelled = false;
    let timerId: number | null = null;

    const delay = (ms: number) =>
      new Promise<void>((resolve) => {
        timerId = viewWindow.setTimeout(() => {
          timerId = null;
          resolve();
        }, ms);
      });

    const watchMainstreamThread = async () => {
      const deadline =
        watchState.startedAt + MAINSTREAM_WATCH_GRACE_PERIOD_MS + MAINSTREAM_WATCH_DURATION_MS;

      while (!cancelled && Date.now() < deadline) {
        const now = Date.now();
        if (now < watchState.startedAt + MAINSTREAM_WATCH_GRACE_PERIOD_MS) {
          await delay(MAINSTREAM_WATCH_RETRY_MS);
          continue;
        }

        try {
          const result = await container.board.getThreads(watchState.boardUrl);
          // 取得中に次スレ監視が解除された場合は、古い板一覧を使わず終了する。
          if (cancelled) {
            return;
          }
          const previousSnapshot = mainstreamSnapshotRef.current;
          mainstreamSnapshotRef.current = {
            threads: result.threads,
            observedAt: now,
          };

          // 初回取得は基準値として保存し、レス増加量を比較できる次回から判定する。
          if (previousSnapshot == null) {
            await delay(MAINSTREAM_WATCH_RETRY_MS);
            continue;
          }

          const match = findMainstreamThreadMatch(result.threads, {
            originalThreadUrl: watchState.originalThreadUrl,
            originalThreadTitle: watchState.originalThreadTitle,
            currentThreadUrl: threadUrl,
            mode,
            previousThreads: previousSnapshot.threads,
            previousObservedAt: previousSnapshot.observedAt,
            now,
          });

          if (match) {
            const previousPending = mainstreamPendingCandidateRef.current;
            const confirmationCount =
              previousPending?.url === match.thread.url ? previousPending.count + 1 : 1;
            mainstreamPendingCandidateRef.current = {
              url: match.thread.url,
              count: confirmationCount,
            };

            if (confirmationCount >= REQUIRED_CANDIDATE_CONFIRMATIONS[mode]) {
              followThreadRef.current(match.thread);
              toast.info(`本流スレへ移動しました: ${match.thread.title}`);
              mainstreamPendingCandidateRef.current = null;
              mainstreamSnapshotRef.current = null;
              setWatchState(null);
              setStatus("idle");
              return;
            }
          } else {
            mainstreamPendingCandidateRef.current = null;
          }
        } catch (error) {
          // 本流監視は補助機能なので再試行しつつ、原因を追えるよう詳細を残す。
          log("error", "自動次スレ検索の本流監視に失敗しました", {
            boardUrl: watchState.boardUrl,
            error,
            threadUrl,
          });
        }

        if (cancelled) {
          return;
        }
        await delay(MAINSTREAM_WATCH_RETRY_MS);
      }

      if (!cancelled) {
        mainstreamPendingCandidateRef.current = null;
        mainstreamSnapshotRef.current = null;
        setWatchState(null);
        setStatus("idle");
      }
    };

    void watchMainstreamThread();

    return () => {
      cancelled = true;
      if (timerId != null) {
        viewWindow.clearTimeout(timerId);
      }
    };
  }, [
    autoRefreshEnabled,
    canAutoScroll,
    featureEnabled,
    isDocumentVisible,
    mode,
    threadUrl,
    toast,
    viewWindow,
    watchState,
  ]);

  return { status, pendingMove, cancelPendingMove, selectPendingCandidate };
}
