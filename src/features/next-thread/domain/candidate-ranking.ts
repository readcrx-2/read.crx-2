import type {
  AutoNextThreadMode,
  CandidateScore,
  NextThreadCandidateSort,
  NextThreadEvidence,
  NextThreadSearchOptions,
  RankedNextThreadCandidate,
} from "src/features/next-thread/domain/next-thread-types";
import {
  NEAR_TITLE_SIMILARITY,
  NEXT_THREAD_MIN_SIMILARITY,
} from "src/features/next-thread/domain/next-thread-types";
import {
  extractThreadSequenceNumber,
  extractThreadTimestamp,
  getThreadSortKey,
  hasAdjacentNonExplicitNumber,
} from "src/features/next-thread/domain/thread-sequence";
import {
  calculateBaseTitleSimilarity,
  hasProgramTitleContinuation,
  hasShortTitleContinuation,
  normalizeThreadTitle,
} from "src/features/next-thread/domain/title-similarity";
import type { IThread } from "src/service-container/interfaces";
import { resolveBoardUrlForBrowser } from "src/view/browser/utils/link-routing";

export function buildCandidateScores(
  threads: readonly IThread[],
  currentThreadTitle: string,
): CandidateScore[] {
  return threads
    .map((thread) => {
      const similarity = calculateBaseTitleSimilarity(currentThreadTitle, thread.title);
      const number = extractThreadSequenceNumber(thread.title);

      return {
        thread,
        similarity,
        number: number.value,
        hasNumber: number.hasNumber,
        isStar: number.isStar,
      };
    })
    .filter((candidate) => candidate.similarity >= NEXT_THREAD_MIN_SIMILARITY);
}

export function isMarkedThread(title: string): boolean {
  return title.trimStart().startsWith("●");
}

export function isSameBoard(leftUrl: string, rightUrl: string): boolean {
  // 変更理由: 板名とホスト名の組み合わせはURL形式ごとに異なるため、同一板判定はchlibのキーを使う。
  const left = resolveBoardUrlForBrowser(leftUrl);
  const right = resolveBoardUrlForBrowser(rightUrl);
  if (left?.type !== "thread" || right?.type !== "thread") return false;
  return left.boardKey === right.boardKey;
}

function countLinkEvidence(
  responseMessages: readonly string[],
  threadUrl: string,
): { count: number; labeled: boolean } {
  const normalizedUrl = threadUrl.replace(/\/+$/, "");
  let count = 0;
  let labeled = false;

  // 変更理由: レス本文はHTML文字列のため、候補URLとの照合だけならDOM化せずに済む。
  // URLを板一覧の候補に限定した上で照合し、本文中の任意リンクを直接遷移先にはしない。
  for (const message of responseMessages.slice(-100)) {
    if (!message.includes(threadUrl) && !message.includes(normalizedUrl)) {
      continue;
    }
    count += 1;
    if (/次(?:スレ|ｽﾚ)|次スレッド/.test(message)) {
      labeled = true;
    }
  }

  return { count, labeled };
}

export const NEXT_THREAD_MODE_POLICY: Record<
  AutoNextThreadMode,
  { minimumScore: number; minimumMargin: number }
> = {
  balanced: { minimumScore: 60, minimumMargin: 12 },
  aggressive: { minimumScore: 35, minimumMargin: 0 },
};

export function rankNextThreadCandidates(
  threads: readonly IThread[],
  currentThread: Pick<IThread, "title" | "url">,
  options: Required<NextThreadSearchOptions>,
  sortBy: NextThreadCandidateSort,
): RankedNextThreadCandidate[] {
  const currentNumber = extractThreadSequenceNumber(currentThread.title);
  const currentSortKey = extractThreadTimestamp(currentThread.url);
  // 次の連番が板一覧にあれば、その先の番号なし短縮スレへ飛ばさない。
  // 標準で番号飛びを保留する場合も、短縮候補を迂回路として採用しない。
  const hasNumberedContinuation =
    currentNumber.isExplicitSequence &&
    threads.some((thread) => {
      if (thread.resCount >= 1000 || !isSameBoard(thread.url, currentThread.url)) {
        return false;
      }
      const sortKey = extractThreadTimestamp(thread.url);
      if (currentSortKey > 0 && sortKey > 0 && sortKey <= currentSortKey) {
        return false;
      }
      const number = extractThreadSequenceNumber(thread.title);
      const difference = number.value - currentNumber.value;
      return (
        number.isExplicitSequence &&
        difference > 0 &&
        difference <= 3 &&
        calculateBaseTitleSimilarity(currentThread.title, thread.title) >=
          NEXT_THREAD_MIN_SIMILARITY
      );
    });

  return threads
    .filter((thread) => {
      if (
        thread.url === currentThread.url ||
        thread.resCount >= 1000 ||
        !isSameBoard(thread.url, currentThread.url)
      ) {
        return false;
      }
      const candidateSortKey = extractThreadTimestamp(thread.url);
      return currentSortKey === 0 || candidateSortKey === 0 || candidateSortKey > currentSortKey;
    })
    .map((thread): RankedNextThreadCandidate | null => {
      const similarity = calculateBaseTitleSimilarity(currentThread.title, thread.title);
      const candidateNumber = extractThreadSequenceNumber(thread.title);
      const candidateSortKey = extractThreadTimestamp(thread.url);
      const linkEvidence = countLinkEvidence(options.responseMessages, thread.url);
      const explicitlyLinked = linkEvidence.count > 0;
      const isReflection = thread.title.includes("反省会");
      const currentMarked = isMarkedThread(currentThread.title);
      const candidateMarked = isMarkedThread(thread.title);
      const exactTitleMatch =
        normalizeThreadTitle(currentThread.title) !== "" &&
        normalizeThreadTitle(currentThread.title) === normalizeThreadTitle(thread.title);
      const nearTitleMatch = similarity >= NEAR_TITLE_SIMILARITY;
      const adjacentNumberMatch = hasAdjacentNonExplicitNumber(
        currentThread.title,
        thread.title,
        similarity,
      );

      // 変更理由: 従来は「●付き」というだけで最新の別実況へ移動できた。
      // 明示案内がない場合は同じ●系統かつ十分似たタイトルだけに限定する。
      if (currentMarked && !explicitlyLinked && (!candidateMarked || similarity < 0.45)) {
        return null;
      }

      let numberScore = 0;
      let numberReason: NextThreadEvidence | null = null;
      if (currentNumber.isExplicitSequence) {
        if (!candidateNumber.isExplicitSequence) {
          const shortTitleContinuation =
            !hasNumberedContinuation &&
            !candidateNumber.hasNumber &&
            hasShortTitleContinuation(currentThread.title, thread.title);
          // 変更理由: 「★反省会」のような番号を持たない反省会スレは、
          // 連番条件を満たさなくても積極モードでは次スレ候補として評価する。
          if (
            !explicitlyLinked &&
            !shortTitleContinuation &&
            !(options.mode === "aggressive" && isReflection)
          ) {
            return null;
          }
          if (shortTitleContinuation) {
            numberScore = 40;
            numberReason = "short-title-continuation";
          }
        } else {
          const difference = candidateNumber.value - currentNumber.value;
          if (difference === 1) {
            numberScore = 40;
            numberReason = "exact-next-number";
          } else if (options.mode === "aggressive" && difference > 1 && difference <= 3) {
            numberScore = 12;
            numberReason = "nearby-next-number";
          } else if (!explicitlyLinked) {
            return null;
          }
        }
      } else if (
        candidateNumber.isExplicitSequence &&
        candidateNumber.value > 2 &&
        !explicitlyLinked
      ) {
        return null;
      } else if (
        options.mode === "aggressive" &&
        candidateNumber.isExplicitSequence &&
        candidateNumber.value === 2 &&
        hasProgramTitleContinuation(currentThread.title, thread.title)
      ) {
        // ★1を省略した番組一覧でも、最後の番組だけを残した★2なら積極モードで連番相当として評価する。
        numberScore = 40;
        numberReason = "program-title-continuation";
      }

      if (isReflection && options.mode !== "aggressive" && !explicitlyLinked) {
        return null;
      }

      const reasons: NextThreadEvidence[] = [];
      let score = similarity * 40 + numberScore;

      if (similarity === 1) {
        score += 30;
        reasons.push("same-base-title");
      } else if (similarity >= 0.3) {
        reasons.push("similar-title");
      }
      if (numberReason) {
        reasons.push(numberReason);
      }
      if (adjacentNumberMatch) {
        // 変更理由: 年・話数・日付など、タイトル末尾の数値が系列を表す場合がある。
        // 特定の表記形式に依存せず、隣接値と高いタイトル類似度を継続性として扱う。
        score += 40;
        reasons.push("exact-adjacent-number");
      }
      if (exactTitleMatch) {
        // 完全一致の候補は、後から立った微妙に異なる候補より優先する。
        score += 60;
        reasons.push("same-title");
      } else if (nearTitleMatch) {
        // 変更理由: 番組名・対象期間・告知文などの一部だけが変わるシリーズでは、
        // タイトル番号の規則に依存せず、高い類似度を次スレの継続性として評価する。
        score += 25;
        reasons.push("near-title");
      }
      if (explicitlyLinked) {
        score += 70;
        reasons.push("explicit-link");
        if (linkEvidence.labeled) {
          score += 30;
        }
        if (linkEvidence.count > 1) {
          score += Math.min(20, (linkEvidence.count - 1) * 10);
        }
      }
      score += 5;
      reasons.push("newer-thread");
      if (thread.resCount >= 5) {
        score += 5;
        reasons.push("active-thread");
      }
      if (currentMarked && candidateMarked) {
        score += 5;
      }
      if (isReflection) {
        score -= 5;
      }

      return {
        thread,
        similarity,
        number: candidateNumber.value,
        hasNumber: candidateNumber.hasNumber,
        isStar: candidateNumber.isStar,
        score,
        reasons,
        isReflection,
        sortDistance:
          currentSortKey > 0 && candidateSortKey > currentSortKey
            ? candidateSortKey - currentSortKey
            : Number.POSITIVE_INFINITY,
      };
    })
    .filter((candidate): candidate is RankedNextThreadCandidate => candidate != null)
    .sort((left, right) => {
      // 変更理由: 手動検索は候補を人が比較して選ぶため、板一覧で確認できる
      // レス数の多いスレを先に示す。一方、自動追従は既存のスコア順を保ち、
      // レス数の違いだけで自動選択先が変わらないようにする。
      if (sortBy === "res-count" && right.thread.resCount !== left.thread.resCount) {
        return right.thread.resCount - left.thread.resCount;
      }
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (right.similarity !== left.similarity) {
        return right.similarity - left.similarity;
      }
      if (left.similarity < 1 && right.similarity < 1 && left.sortDistance !== right.sortDistance) {
        return left.sortDistance - right.sortDistance;
      }
      return getThreadSortKey(right.thread) - getThreadSortKey(left.thread);
    });
}

export function calculateThreadMomentum(thread: IThread, now = Date.now()): number {
  if (!Number.isFinite(thread.createdAt) || thread.createdAt <= 0 || thread.createdAt > now) {
    return 0;
  }

  const elapsedDays = Math.max((now - thread.createdAt) / 1000, 1) / (24 * 60 * 60);
  return thread.resCount / elapsedDays;
}
