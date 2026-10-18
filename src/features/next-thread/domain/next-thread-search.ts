import { DEFAULT_CONFIG } from "src/app/config-defaults";
import {
  isMarkedThread,
  isSameBoard,
  NEXT_THREAD_MODE_POLICY,
  rankNextThreadCandidates,
} from "src/features/next-thread/domain/candidate-ranking";
import type {
  AutoNextThreadMode,
  NextThreadMatch,
  NextThreadSearchOptions,
  RankedNextThreadCandidate,
  ThreadSearchCandidate,
} from "src/features/next-thread/domain/next-thread-types";
import {
  NEAR_TITLE_SIMILARITY,
  NEXT_THREAD_MIN_SIMILARITY,
} from "src/features/next-thread/domain/next-thread-types";
import {
  calculateBaseTitleSimilarity,
  normalizeThreadTitle,
} from "src/features/next-thread/domain/title-similarity";
import type { IThread } from "src/service-container/interfaces";
import { getBoardUrlFromThreadUrl } from "src/view/browser/utils/link-routing";

// 変更理由: 板URLの判定を共有処理に集約し、次スレ探索側には互換再エクスポートだけを残す。
export { getBoardUrlFromThreadUrl };
// 他の機能やテストはこのファイルだけを import する。内部は責務ごとに分けた下位ファイルへ置く。
export { calculateThreadMomentum } from "src/features/next-thread/domain/candidate-ranking";
export { findMainstreamThreadMatch } from "src/features/next-thread/domain/mainstream-search";
export type {
  AutoNextThreadMode,
  MainstreamSearchOptions,
  NextThreadEvidence,
  NextThreadMatch,
  NextThreadSearchOptions,
  ThreadSearchCandidate,
} from "src/features/next-thread/domain/next-thread-types";
export { extractThreadSequenceNumber } from "src/features/next-thread/domain/thread-sequence";
export {
  calculateTitleSimilarity,
  normalizeThreadTitle,
} from "src/features/next-thread/domain/title-similarity";

function toNextThreadMatch(
  currentThread: Pick<IThread, "title">,
  candidate: RankedNextThreadCandidate,
): NextThreadMatch {
  const currentMarked = isMarkedThread(currentThread.title);
  const reason = candidate.reasons.includes("exact-next-number")
    ? "number"
    : candidate.isReflection
      ? "reflection"
      : currentMarked && isMarkedThread(candidate.thread.title)
        ? "mark"
        : "number";

  return {
    thread: candidate.thread,
    reason,
    similarity: candidate.similarity,
    score: candidate.score,
    reasons: candidate.reasons,
  };
}

export function findNextThreadCandidates(
  threads: readonly IThread[],
  currentThread: Pick<IThread, "title" | "url">,
  options: NextThreadSearchOptions = {},
): NextThreadMatch[] {
  const resolvedOptions: Required<NextThreadSearchOptions> = {
    mode: options.mode ?? (DEFAULT_CONFIG.auto_next_thread_mode as AutoNextThreadMode),
    responseMessages: options.responseMessages ?? [],
  };
  const policy = NEXT_THREAD_MODE_POLICY[resolvedOptions.mode];

  // 手動検索では自動移動のように1件へ決め打ちせず、選択可能な候補をすべて見せる。
  // minimumMarginは自動移動の誤移動防止用なので、候補の列挙条件には使わない。
  return rankNextThreadCandidates(threads, currentThread, resolvedOptions, "res-count")
    .filter((candidate) => candidate.score >= policy.minimumScore)
    .map((candidate) => toNextThreadMatch(currentThread, candidate));
}

export function findSimilarThreadCandidates(
  threads: readonly IThread[],
  currentThread: Pick<IThread, "title" | "url">,
): ThreadSearchCandidate[] {
  // 続きのスレかどうかではなく話題の近さで探すため、連番・新しさ・勢いの条件は加えない。
  return threads
    .filter(
      (thread) => thread.url !== currentThread.url && isSameBoard(thread.url, currentThread.url),
    )
    .map((thread) => ({
      thread,
      similarity: calculateBaseTitleSimilarity(currentThread.title, thread.title),
    }))
    .filter((candidate) => candidate.similarity >= NEXT_THREAD_MIN_SIMILARITY)
    .sort(
      (left, right) =>
        right.similarity - left.similarity || right.thread.resCount - left.thread.resCount,
    );
}

export function findNextThreadMatch(
  threads: readonly IThread[],
  currentThread: Pick<IThread, "title" | "url">,
  options: NextThreadSearchOptions = {},
): NextThreadMatch | null {
  const resolvedOptions: Required<NextThreadSearchOptions> = {
    mode: options.mode ?? (DEFAULT_CONFIG.auto_next_thread_mode as AutoNextThreadMode),
    responseMessages: options.responseMessages ?? [],
  };
  const candidates = rankNextThreadCandidates(threads, currentThread, resolvedOptions, "score");
  const best = candidates[0];
  if (!best) {
    return null;
  }

  const policy = NEXT_THREAD_MODE_POLICY[resolvedOptions.mode];
  if (best.score < policy.minimumScore) {
    return null;
  }

  const second = candidates[1];
  const equivalentNearTitleCandidates =
    second != null &&
    best.similarity >= NEAR_TITLE_SIMILARITY &&
    best.similarity < 1 &&
    second.similarity >= NEAR_TITLE_SIMILARITY &&
    normalizeThreadTitle(best.thread.title) === normalizeThreadTitle(second.thread.title);
  const clearNearTitleContinuation =
    second != null &&
    best.similarity >= NEAR_TITLE_SIMILARITY &&
    best.similarity < 1 &&
    best.similarity > second.similarity &&
    best.sortDistance < second.sortDistance;
  if (
    second &&
    best.score - second.score < policy.minimumMargin &&
    !equivalentNearTitleCandidates &&
    !clearNearTitleContinuation
  ) {
    return null;
  }

  return toNextThreadMatch(currentThread, best);
}
