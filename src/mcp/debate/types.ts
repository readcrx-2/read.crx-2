import type { ThreadReadMode } from "../protocol.ts";
import type { DEBATE_RESULT_SCHEMA } from "./schema.ts";

export type DebateIssueStatus = "resolved" | "mixed" | "unresolved" | "insufficient-evidence";

export type DebateEvidenceRole = "support" | "challenge" | "context";

export interface DebatePrepareParams {
  url?: string;
  mode?: ThreadReadMode;
  responseNumbers?: number[];
  participantIds?: string[];
  maxResponses?: number;
}

export interface DebateContextResponse {
  num: number;
  id: string;
  date: string;
  message: string;
  role: "target" | "context";
  distance: number;
  replyTo: number[];
  repliedBy: number[];
}

export interface DebateContext {
  kind: "debate-context";
  thread: {
    title: string;
    url: string;
    totalResponses: number;
  };
  scope: {
    responseNumbers: number[];
    participantIds: string[];
  };
  responses: DebateContextResponse[];
  omittedResponses: number;
  instructions: string;
  resultSchema: typeof DEBATE_RESULT_SCHEMA;
  toon: string;
}

export interface DebateEvidence {
  responseNumbers: number[];
  role: DebateEvidenceRole;
  note: string;
}

export interface DebatePosition {
  participantIds: string[];
  claim: string;
  evidence: DebateEvidence[];
}

export interface DebateIssue {
  id: string;
  topic: string;
  status: DebateIssueStatus;
  conclusion: string;
  positions: DebatePosition[];
  evidence: DebateEvidence[];
}

export interface DebateParticipantScore {
  logic: number;
  reading: number;
  evidence: number;
}

export interface DebateParticipant {
  id: string;
  responseNumbers: number[];
  position: string;
  strengths: string[];
  weaknesses: string[];
  score?: DebateParticipantScore;
}

export interface DebateResearchSource {
  title: string;
  url: string;
}

export interface DebateResearch {
  claim: string;
  status: "supported" | "contradicted" | "inconclusive";
  finding: string;
  sources: DebateResearchSource[];
}

export interface DebateSimpleMetric {
  // 変更理由: 評価材料不足を平均点と混同しないよう、評価不能は数値ではなくnullで表す。
  score: number | null;
  reason: string;
}

export interface DebateSimpleSide {
  label: string;
  participants: string[];
  claims: string[];
  metrics: {
    logic: DebateSimpleMetric;
    reading: DebateSimpleMetric;
    evidence: DebateSimpleMetric;
  };
}

export interface DebateSimpleView {
  topic: string;
  blue: DebateSimpleSide;
  red: DebateSimpleSide;
  // 変更理由: 判定保留を互角の0.5と区別し、画像でも優勢度を表示しない状態を持たせる。
  blueAdvantage: number | null;
  verdictReason: string;
}

export interface DebateResult {
  schemaVersion: 1;
  thread: {
    title: string;
    url: string;
    analyzedAt?: string;
  };
  scope: {
    responseNumbers: number[];
    participantIds: string[];
  };
  summary: string;
  conclusion: string;
  issues: DebateIssue[];
  participants: DebateParticipant[];
  research: DebateResearch[];
  simpleView: DebateSimpleView;
  caveats?: string[];
}
