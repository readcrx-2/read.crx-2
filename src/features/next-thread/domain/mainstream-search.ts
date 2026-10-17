import { DEFAULT_CONFIG } from "src/app/config-defaults";
import {
  buildCandidateScores,
  calculateThreadMomentum,
  isMarkedThread,
  isSameBoard,
} from "src/features/next-thread/domain/candidate-ranking";
import type {
  AutoNextThreadMode,
  CandidateScore,
  MainstreamSearchOptions,
  NextThreadMatch,
} from "src/features/next-thread/domain/next-thread-types";
import { NEXT_THREAD_MIN_SIMILARITY } from "src/features/next-thread/domain/next-thread-types";
import {
  extractThreadSequenceNumber,
  extractThreadTimestamp,
  getThreadSortKey,
  hasAdjacentNonExplicitNumber,
} from "src/features/next-thread/domain/thread-sequence";
import { calculateBaseTitleSimilarity } from "src/features/next-thread/domain/title-similarity";
import type { IThread } from "src/service-container/interfaces";

function filterMainstreamCandidates(
  threads: readonly IThread[],
  options: Required<
    Pick<MainstreamSearchOptions, "originalThreadTitle" | "originalThreadUrl" | "currentThreadUrl">
  > & {
    currentThreadTitle: string;
    minimumResCount: number;
  },
): CandidateScore[] {
  const {
    originalThreadTitle,
    originalThreadUrl,
    currentThreadUrl,
    currentThreadTitle,
    minimumResCount,
  } = options;
  const originalSortKey = extractThreadTimestamp(originalThreadUrl);
  const candidates = threads.filter((thread) => {
    if (thread.url === currentThreadUrl || thread.url === originalThreadUrl) {
      return false;
    }
    if (thread.resCount >= 1000 || thread.resCount < minimumResCount) {
      return false;
    }
    // 移動後の勢い比較でも探索元の板と時系列を守り、同名の別板や過去スレへ戻らない。
    // 移動先より前に立った本流候補は許容し、探索を開始した元スレより後に立ったものへ限定する。
    if (!isSameBoard(thread.url, originalThreadUrl)) {
      return false;
    }
    const candidateSortKey = extractThreadTimestamp(thread.url);
    return originalSortKey === 0 || candidateSortKey === 0 || candidateSortKey > originalSortKey;
  });

  if (isMarkedThread(originalThreadTitle)) {
    return buildCandidateScores(
      candidates.filter(
        (thread) =>
          isMarkedThread(thread.title) &&
          calculateBaseTitleSimilarity(currentThreadTitle, thread.title) >=
            NEXT_THREAD_MIN_SIMILARITY,
      ),
      originalThreadTitle,
    );
  }

  return buildCandidateScores(candidates, originalThreadTitle).filter((candidate) => {
    const currentSimilarity = calculateBaseTitleSimilarity(
      currentThreadTitle,
      candidate.thread.title,
    );
    if (currentSimilarity < NEXT_THREAD_MIN_SIMILARITY) {
      return false;
    }

    const current = extractThreadSequenceNumber(currentThreadTitle);
    const candidateNumber = extractThreadSequenceNumber(candidate.thread.title);
    const isExactExplicitNext =
      current.isExplicitSequence &&
      candidateNumber.isExplicitSequence &&
      candidateNumber.value - current.value === 1;
    if (
      currentSimilarity === 1 ||
      isExactExplicitNext ||
      hasAdjacentNonExplicitNumber(currentThreadTitle, candidate.thread.title, currentSimilarity)
    ) {
      return true;
    }
    if (candidate.isStar && (candidate.number === 1 || candidate.number === 2)) {
      return true;
    }
    return !current.hasNumber && candidateNumber.value === 2 && candidateNumber.isExplicitSequence;
  });
}

export function findMainstreamThreadMatch(
  threads: readonly IThread[],
  options: MainstreamSearchOptions,
): NextThreadMatch | null {
  const {
    originalThreadUrl,
    originalThreadTitle,
    currentThreadUrl,
    mode = DEFAULT_CONFIG.auto_next_thread_mode as AutoNextThreadMode,
    minimumResCount = 10,
    momentumRatio = 1.5,
    previousThreads,
    previousObservedAt,
    now = Date.now(),
  } = options;
  const currentThread = threads.find((thread) => thread.url === currentThreadUrl);

  if (!currentThread) {
    return null;
  }

  const hasPreviousSnapshot = previousThreads != null && previousObservedAt != null;
  const currentActivity = hasPreviousSnapshot
    ? calculateThreadGrowthRate(currentThread, previousThreads, previousObservedAt, now)
    : calculateThreadMomentum(currentThread, now);
  if (currentActivity <= 0 && !hasPreviousSnapshot) {
    return null;
  }

  const candidates = filterMainstreamCandidates(threads, {
    originalThreadTitle,
    originalThreadUrl,
    currentThreadUrl,
    currentThreadTitle: currentThread.title,
    minimumResCount,
  });
  const minimumSimilarity = mode === "balanced" ? 0.5 : 0.3;

  const viableCandidates = candidates
    .map((candidate) => ({
      ...candidate,
      activity: hasPreviousSnapshot
        ? calculateThreadGrowthRate(candidate.thread, previousThreads, previousObservedAt, now)
        : calculateThreadMomentum(candidate.thread, now),
    }))
    .filter(
      (candidate) =>
        candidate.similarity >= minimumSimilarity &&
        candidate.activity >
          Math.max(currentActivity, hasPreviousSnapshot ? 0.2 : 0) * momentumRatio,
    )
    .sort((left, right) => {
      if (right.activity !== left.activity) {
        return right.activity - left.activity;
      }
      if (right.similarity !== left.similarity) {
        return right.similarity - left.similarity;
      }
      return getThreadSortKey(right.thread) - getThreadSortKey(left.thread);
    });

  if (viableCandidates.length === 0) {
    return null;
  }

  return {
    thread: viableCandidates[0].thread,
    reason: "mainstream",
    similarity: viableCandidates[0].similarity,
  };
}

function calculateThreadGrowthRate(
  thread: IThread,
  previousThreads: readonly IThread[] | undefined,
  previousObservedAt: number | undefined,
  now: number,
): number {
  if (previousThreads == null || previousObservedAt == null || previousObservedAt >= now) {
    return 0;
  }

  const previousThread = previousThreads.find((candidate) => candidate.url === thread.url);
  const previousResCount = previousThread?.resCount ?? 0;
  const elapsedSeconds = Math.max((now - previousObservedAt) / 1000, 1);
  return Math.max(thread.resCount - previousResCount, 0) / elapsedSeconds;
}
