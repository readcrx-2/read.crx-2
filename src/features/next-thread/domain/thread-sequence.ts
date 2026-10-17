import type { ThreadNumberResult } from "src/features/next-thread/domain/next-thread-types";
import { NEAR_TITLE_SIMILARITY } from "src/features/next-thread/domain/next-thread-types";
import {
  EXPLICIT_SEQUENCE_PATTERN,
  stripTitleDecoration,
} from "src/features/next-thread/domain/title-similarity";
import type { IThread } from "src/service-container/interfaces";
import { resolveBoardUrlForBrowser } from "src/view/browser/utils/link-routing";

const THREAD_NUMBER_PATTERN = /(\d*\.\d+|\d+)/g;

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

export function hasAdjacentNonExplicitNumber(
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

export function extractThreadTimestamp(url: string): number {
  const resolved = resolveBoardUrlForBrowser(url);
  if (resolved?.type !== "thread" || !/^\d+$/.test(resolved.threadId)) return 0;
  return Number.parseInt(resolved.threadId, 10);
}

export function getThreadSortKey(thread: IThread): number {
  return extractThreadTimestamp(thread.url) || thread.createdAt || 0;
}
