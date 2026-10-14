import { DEFAULT_CONFIG } from "src/app/config-defaults";
import type { IThread } from "src/service-container/interfaces";
import {
  getBoardUrlFromThreadUrl,
  resolveBoardUrlForBrowser,
} from "src/view/browser/utils/link-routing";

// 変更理由: 板URLの判定を共有処理に集約し、次スレ探索側には互換再エクスポートだけを残す。
export { getBoardUrlFromThreadUrl };

const TITLE_DECORATION_PATTERN =
  / ?(?:\[(?:無断)?転載禁止\]|(?:\(c\)|©|�|&copy;|&#169;)(?:2ch\.net|@?bbspink\.com)) ?/g;
const KATAKANA_PATTERN = /[\u30a1-\u30f6]/g;
const THREAD_NUMBER_PATTERN = /(\d*\.\d+|\d+)/g;
// 番号後の放送情報などは連番の一部ではないため、括弧書きを残して番号だけを取り出す。
const EXPLICIT_SEQUENCE_PATTERN =
  /(★|Part\.?)\s*(\d+)((?:\s*(?:【[^】]*】|\[[^\]]*\]|\([^)]*\)))*\s*)$/i;

const NEXT_THREAD_MIN_SIMILARITY = 0.3;
const NEAR_TITLE_SIMILARITY = 0.85;

export type AutoNextThreadMode = "balanced" | "aggressive";
export type NextThreadEvidence =
  | "explicit-link"
  | "exact-adjacent-number"
  | "exact-next-number"
  | "program-title-continuation"
  | "short-title-continuation"
  | "nearby-next-number"
  | "same-base-title"
  | "near-title"
  | "same-title"
  | "similar-title"
  | "newer-thread"
  | "active-thread";

export interface ThreadSearchCandidate {
  thread: IThread;
  reason?: "mark" | "number" | "reflection" | "mainstream";
  similarity: number;
  score?: number;
  reasons?: readonly NextThreadEvidence[];
}

export interface NextThreadMatch extends ThreadSearchCandidate {
  reason: "mark" | "number" | "reflection" | "mainstream";
}

export interface NextThreadSearchOptions {
  mode?: AutoNextThreadMode;
  responseMessages?: readonly string[];
}

interface ThreadNumberResult {
  value: number;
  hasNumber: boolean;
  isStar: boolean;
  isExplicitSequence: boolean;
}

interface CandidateScore {
  thread: IThread;
  similarity: number;
  number: number;
  hasNumber: boolean;
  isStar: boolean;
}

interface RankedNextThreadCandidate extends CandidateScore {
  score: number;
  reasons: NextThreadEvidence[];
  isReflection: boolean;
  sortDistance: number;
}

type NextThreadCandidateSort = "score" | "res-count";

export interface MainstreamSearchOptions {
  originalThreadUrl: string;
  originalThreadTitle: string;
  currentThreadUrl: string;
  mode?: AutoNextThreadMode;
  minimumResCount?: number;
  momentumRatio?: number;
  previousThreads?: readonly IThread[];
  previousObservedAt?: number;
  now?: number;
}

function stripTitleDecoration(title: string): string {
  const withoutDecoration = title.replace(TITLE_DECORATION_PATTERN, "");
  const normalizedTitle = withoutDecoration === "" ? title : withoutDecoration;
  return normalizedTitle.replaceAll("<mark>", "").replaceAll("</mark>", "");
}

function stripSequenceDecoration(title: string): string {
  // 全角番号や番号前の空白でも同じ系列として比較し、連番解析とタイトル類似度の解釈を揃える。
  return title
    .normalize("NFKC")
    .replace(/^\s*●\s*/, "")
    .replace(EXPLICIT_SEQUENCE_PATTERN, "$3")
    .trim();
}

function calculateBaseTitleSimilarity(leftTitle: string, rightTitle: string): number {
  return calculateTitleSimilarity(
    stripSequenceDecoration(leftTitle),
    stripSequenceDecoration(rightTitle),
  );
}

function hasProgramTitleContinuation(currentTitle: string, candidateTitle: string): boolean {
  const currentBase = normalizeThreadTitle(stripSequenceDecoration(currentTitle));
  const candidateBase = normalizeThreadTitle(stripSequenceDecoration(candidateTitle));
  const currentPrefix = currentBase.match(/^【[^】]+】/)?.[0] ?? "";
  const candidatePrefix = candidateBase.match(/^【[^】]+】/)?.[0] ?? "";
  if (currentPrefix !== candidatePrefix) {
    return false;
  }

  // 番組一覧から単独番組の★2へ変わると全文の類似度が下がるため、最後の番組の継続を別に判定する。
  // 局名だけの一致や終了済みの前番組への誤移動を避け、局の接頭辞と最後の番組名の一致を要求する。
  const programs = currentBase.slice(currentPrefix.length).split(/[→⇒]/);
  const lastProgram = programs.at(-1) ?? "";
  return (
    programs.length > 1 &&
    /[\p{L}\p{N}]/u.test(lastProgram) &&
    lastProgram === candidateBase.slice(candidatePrefix.length)
  );
}

function hasShortTitleContinuation(currentTitle: string, candidateTitle: string): boolean {
  const currentBase = normalizeThreadTitle(stripSequenceDecoration(currentTitle));
  const candidateBase = normalizeThreadTitle(stripSequenceDecoration(candidateTitle));
  const currentPrefix = currentBase.match(/^【[^】]+】/)?.[0];
  const candidatePrefix = candidateBase.match(/^【[^】]+】/)?.[0];
  if (!currentPrefix || currentPrefix !== candidatePrefix) {
    return false;
  }

  // 長い連番タイトルから番号なしの短い題名へ変わる場合、局名・末尾の告知だけでは継続と判定しない。
  // 接頭辞と告知を除いた本文で、短縮後の全文が順序を保って含まれることを継続の根拠にする。
  const stripNotes = (value: string) => value.replace(/(?:【[^】]*】|\[[^\]]*\]|\([^)]*\))+$/, "");
  const currentTopic = stripNotes(currentBase.slice(currentPrefix.length));
  const candidateTopic = stripNotes(candidateBase.slice(candidatePrefix.length));
  // ごく短い単語・単一文字の反復・長文中のわずかな断片だけでは継続の根拠として弱いため除外する。
  return (
    candidateTopic.length >= 6 &&
    new Set(candidateTopic).size >= 3 &&
    candidateTopic.length < currentTopic.length &&
    candidateTopic.length / currentTopic.length >= 0.2 &&
    countSequenceMatches(currentTopic, candidateTopic) === candidateTopic.length
  );
}

function katakanaToHiragana(character: string): string {
  return String.fromCodePoint((character.codePointAt(0) ?? 0) - 0x60);
}

export function normalizeThreadTitle(title: string): string {
  // 変更理由: 笑いや強調の反復を文字数ぶん加点すると、話題が無関係でも
  // 長い末尾装飾だけで自動移動条件を超える。全角・大文字を揃えた後で除外する。
  return stripTitleDecoration(title)
    .normalize("NFKC")
    .replace(KATAKANA_PATTERN, katakanaToHiragana)
    .replaceAll(" ", "")
    .replaceAll("\u3000", "")
    .toLowerCase()
    .replace(/w{2,}|[!?]{2,}/g, "");
}

interface LongestCommonSubstringResult {
  aIndex: number;
  bIndex: number;
  size: number;
}

function findLongestCommonSubstring(
  left: string,
  right: string,
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): LongestCommonSubstringResult {
  const previous = new Uint16Array(rightEnd - rightStart + 1);
  let best = { aIndex: leftStart, bIndex: rightStart, size: 0 };

  for (let leftIndex = leftStart; leftIndex < leftEnd; leftIndex += 1) {
    const current = new Uint16Array(rightEnd - rightStart + 1);
    for (let rightIndex = rightStart; rightIndex < rightEnd; rightIndex += 1) {
      if (left[leftIndex] !== right[rightIndex]) {
        continue;
      }

      const offset = rightIndex - rightStart + 1;
      const size = previous[offset - 1] + 1;
      current[offset] = size;
      if (size > best.size) {
        best = {
          aIndex: leftIndex - size + 1,
          bIndex: rightIndex - size + 1,
          size,
        };
      }
    }
    previous.set(current);
  }

  return best;
}

function countSequenceMatches(
  left: string,
  right: string,
  leftStart = 0,
  leftEnd = left.length,
  rightStart = 0,
  rightEnd = right.length,
): number {
  if (leftStart >= leftEnd || rightStart >= rightEnd) {
    return 0;
  }

  const match = findLongestCommonSubstring(left, right, leftStart, leftEnd, rightStart, rightEnd);

  if (match.size === 0) {
    return 0;
  }

  return (
    match.size +
    countSequenceMatches(left, right, leftStart, match.aIndex, rightStart, match.bIndex) +
    countSequenceMatches(
      left,
      right,
      match.aIndex + match.size,
      leftEnd,
      match.bIndex + match.size,
      rightEnd,
    )
  );
}

export function calculateTitleSimilarity(leftTitle: string, rightTitle: string): number {
  const left = normalizeThreadTitle(leftTitle);
  const right = normalizeThreadTitle(rightTitle);

  if (left === "" || right === "") {
    // 装飾を除いて空になったタイトル同士には、同じ話題だという根拠がない。
    return 0;
  }

  const matches = countSequenceMatches(left, right);
  const sequenceSimilarity = (2 * matches) / (left.length + right.length);
  const editSimilarity = calculateEditSimilarity(left, right);

  // 変更理由: LCSだけでは一文字の違いが一致区間を分断し、subject.txtの軽微な
  // 表記揺れを過小評価する。文字の種類を列挙せず、編集距離との高い方を採用する。
  return Math.max(sequenceSimilarity, editSimilarity);
}

function calculateEditSimilarity(left: string, right: string): number {
  const leftCharacters = Array.from(left);
  const rightCharacters = Array.from(right);
  const previous = new Uint16Array(rightCharacters.length + 1);

  for (let rightIndex = 0; rightIndex <= rightCharacters.length; rightIndex += 1) {
    previous[rightIndex] = rightIndex;
  }

  for (let leftIndex = 1; leftIndex <= leftCharacters.length; leftIndex += 1) {
    const current = new Uint16Array(rightCharacters.length + 1);
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= rightCharacters.length; rightIndex += 1) {
      const substitutionCost =
        leftCharacters[leftIndex - 1] === rightCharacters[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }

    previous.set(current);
  }

  const maxLength = Math.max(leftCharacters.length, rightCharacters.length);
  return 1 - previous[rightCharacters.length] / maxLength;
}

export function extractThreadSequenceNumber(title: string): ThreadNumberResult {
  // 類似度だけが全角表記を正規化すると、同じ連番を検出できず番号の逆行も見逃す。
  const trimmedTitle = stripTitleDecoration(title).normalize("NFKC").trim();
  const sequenceMatch = trimmedTitle.match(EXPLICIT_SEQUENCE_PATTERN);
  if (sequenceMatch) {
    return {
      value: Number.parseFloat(sequenceMatch[2]),
      hasNumber: true,
      isStar: sequenceMatch[1] === "★",
      isExplicitSequence: true,
    };
  }

  const matches = trimmedTitle.match(THREAD_NUMBER_PATTERN);
  if (!matches || matches.length === 0) {
    return {
      value: 0,
      hasNumber: false,
      isStar: false,
      isExplicitSequence: false,
    };
  }

  return {
    value: Number.parseFloat(matches[matches.length - 1]),
    hasNumber: true,
    isStar: false,
    isExplicitSequence: false,
  };
}

function hasAdjacentNonExplicitNumber(
  currentTitle: string,
  candidateTitle: string,
  similarity: number,
): boolean {
  if (similarity < NEAR_TITLE_SIMILARITY) {
    return false;
  }

  const currentNumber = extractThreadSequenceNumber(currentTitle);
  const candidateNumber = extractThreadSequenceNumber(candidateTitle);
  return (
    currentNumber.hasNumber &&
    candidateNumber.hasNumber &&
    !currentNumber.isExplicitSequence &&
    !candidateNumber.isExplicitSequence &&
    Math.abs(candidateNumber.value - currentNumber.value) === 1
  );
}

function extractThreadTimestamp(url: string): number {
  const resolved = resolveBoardUrlForBrowser(url);
  if (resolved?.type !== "thread" || !/^\d+$/.test(resolved.threadId)) return 0;
  return Number.parseInt(resolved.threadId, 10);
}

function getThreadSortKey(thread: IThread): number {
  return extractThreadTimestamp(thread.url) || thread.createdAt || 0;
}

function buildCandidateScores(
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

function isMarkedThread(title: string): boolean {
  return title.trimStart().startsWith("●");
}

function isSameBoard(leftUrl: string, rightUrl: string): boolean {
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

const NEXT_THREAD_MODE_POLICY: Record<
  AutoNextThreadMode,
  { minimumScore: number; minimumMargin: number }
> = {
  balanced: { minimumScore: 60, minimumMargin: 12 },
  aggressive: { minimumScore: 35, minimumMargin: 0 },
};

function rankNextThreadCandidates(
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
