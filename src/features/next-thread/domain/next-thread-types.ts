import type { IThread } from "src/service-container/interfaces";

export const NEXT_THREAD_MIN_SIMILARITY = 0.3;
export const NEAR_TITLE_SIMILARITY = 0.85;

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

export interface ThreadNumberResult {
  value: number;
  hasNumber: boolean;
  isStar: boolean;
  isExplicitSequence: boolean;
}

export interface CandidateScore {
  thread: IThread;
  similarity: number;
  number: number;
  hasNumber: boolean;
  isStar: boolean;
}

export interface RankedNextThreadCandidate extends CandidateScore {
  score: number;
  reasons: NextThreadEvidence[];
  isReflection: boolean;
  sortDistance: number;
}

export type NextThreadCandidateSort = "score" | "res-count";

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
