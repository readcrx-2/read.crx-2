import { isObject, uniqueParticipantIds, uniquePositiveIntegers } from "./context.ts";
import type {
  DebateEvidence,
  DebateIssueStatus,
  DebateParticipantScore,
  DebatePosition,
  DebateResearch,
  DebateResult,
  DebateSimpleMetric,
  DebateSimpleSide,
  DebateSimpleView,
} from "./types.ts";

const MAX_RESULT_STRING_LENGTH = 200_000;

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path}は空でない文字列で指定してください`);
  }
  return value.trim();
}

function requireIntegerArray(value: unknown, path: string): number[] {
  if (!Array.isArray(value)) throw new Error(`${path}は配列で指定してください`);
  const result = uniquePositiveIntegers(value);
  if (result.length !== value.length) throw new Error(`${path}には正の整数だけを指定してください`);
  return result;
}

function requireStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${path}は配列で指定してください`);
  const result = uniqueParticipantIds(value);
  if (result.length !== value.length)
    throw new Error(`${path}には空でない文字列だけを指定してください`);
  return result;
}

function requireEvidence(value: unknown, path: string): DebateEvidence[] {
  if (!Array.isArray(value)) throw new Error(`${path}は配列で指定してください`);
  return value.map((item, index) => {
    if (!isObject(item)) throw new Error(`${path}[${index}]が不正です`);
    const role = item.role;
    if (role !== "support" && role !== "challenge" && role !== "context") {
      throw new Error(`${path}[${index}].roleが不正です`);
    }
    return {
      responseNumbers: requireIntegerArray(
        item.responseNumbers,
        `${path}[${index}].responseNumbers`,
      ),
      role,
      note: requireString(item.note, `${path}[${index}].note`),
    };
  });
}

function requirePositions(value: unknown, path: string): DebatePosition[] {
  if (!Array.isArray(value)) throw new Error(`${path}は配列で指定してください`);
  return value.map((item, index) => {
    if (!isObject(item)) throw new Error(`${path}[${index}]が不正です`);
    return {
      participantIds: requireStringArray(item.participantIds, `${path}[${index}].participantIds`),
      claim: requireString(item.claim, `${path}[${index}].claim`),
      evidence: requireEvidence(item.evidence, `${path}[${index}].evidence`),
    };
  });
}

function requireScore(value: unknown, path: string): DebateParticipantScore {
  if (!isObject(value)) throw new Error(`${path}が不正です`);
  const score = {
    logic: value.logic,
    reading: value.reading,
    evidence: value.evidence,
  };
  for (const [name, item] of Object.entries(score)) {
    if (typeof item !== "number" || !Number.isFinite(item) || item < 0 || item > 5) {
      throw new Error(`${path}.${name}は0から5の数値で指定してください`);
    }
  }
  return score as DebateParticipantScore;
}

function requireLimitedString(value: unknown, path: string, limit: number): string {
  const result = requireString(value, path);
  if (Array.from(result).length > limit)
    throw new Error(`${path}は${limit}文字以内で指定してください`);
  return result;
}

function requireTextArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${path}は配列で指定してください`);
  return value.map((item, index) => requireString(item, `${path}[${index}]`));
}

function requireResearch(value: unknown): DebateResearch[] {
  if (!Array.isArray(value) || value.length > 2) {
    throw new Error("researchは2件以内の配列で指定してください");
  }
  return value.map((item, index) => {
    const field = `research[${index}]`;
    if (!isObject(item)) throw new Error(`${field}が不正です`);
    const status = item.status;
    if (status !== "supported" && status !== "contradicted" && status !== "inconclusive") {
      throw new Error(`${field}.statusが不正です`);
    }
    if (!Array.isArray(item.sources) || item.sources.length > 2) {
      throw new Error(`${field}.sourcesは2件以内の配列で指定してください`);
    }
    const sources = item.sources.map((source, sourceIndex) => {
      const sourcePath = `${field}.sources[${sourceIndex}]`;
      if (!isObject(source)) throw new Error(`${sourcePath}が不正です`);
      const url = requireLimitedString(source.url, `${sourcePath}.url`, 2048);
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch (error: unknown) {
        throw new Error(`${sourcePath}.urlが不正です: ${String(error)}`);
      }
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new Error(`${sourcePath}.urlはhttpまたはhttpsで指定してください`);
      }
      return {
        title: requireLimitedString(source.title, `${sourcePath}.title`, 120),
        url: parsedUrl.href,
      };
    });
    return {
      claim: requireLimitedString(item.claim, `${field}.claim`, 160),
      status,
      finding: requireLimitedString(item.finding, `${field}.finding`, 240),
      sources,
    };
  });
}

function requireSimpleMetric(value: unknown, path: string): DebateSimpleMetric {
  if (!isObject(value)) throw new Error(`${path}が不正です`);
  const score = value.score;
  if (
    score !== null &&
    (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 5)
  ) {
    throw new Error(`${path}.scoreは0から5の数値、または評価不能を表すnullで指定してください`);
  }
  return { score, reason: requireLimitedString(value.reason, `${path}.reason`, 120) };
}

function requireSimpleSide(value: unknown, path: string): DebateSimpleSide {
  if (!isObject(value) || !isObject(value.metrics)) throw new Error(`${path}が不正です`);
  return {
    label: requireString(value.label, `${path}.label`),
    participants: requireTextArray(value.participants, `${path}.participants`),
    claims: requireTextArray(value.claims, `${path}.claims`),
    metrics: {
      logic: requireSimpleMetric(value.metrics.logic, `${path}.metrics.logic`),
      reading: requireSimpleMetric(value.metrics.reading, `${path}.metrics.reading`),
      evidence: requireSimpleMetric(value.metrics.evidence, `${path}.metrics.evidence`),
    },
  };
}

function requireSimpleView(value: unknown): DebateSimpleView {
  if (!isObject(value)) throw new Error("simpleViewが不正です");
  const blueAdvantage = value.blueAdvantage;
  if (
    blueAdvantage !== null &&
    (typeof blueAdvantage !== "number" ||
      !Number.isFinite(blueAdvantage) ||
      blueAdvantage < 0 ||
      blueAdvantage > 1)
  ) {
    throw new Error(
      "simpleView.blueAdvantageは0から1の数値、または判定保留を表すnullで指定してください",
    );
  }
  return {
    topic: requireString(value.topic, "simpleView.topic"),
    blue: requireSimpleSide(value.blue, "simpleView.blue"),
    red: requireSimpleSide(value.red, "simpleView.red"),
    blueAdvantage,
    verdictReason: requireString(value.verdictReason, "simpleView.verdictReason"),
  };
}

export function validateDebateResult(value: unknown): DebateResult {
  if (!isObject(value)) throw new Error("判定結果はJSONオブジェクトで指定してください");
  if (value.schemaVersion !== 1) throw new Error("schemaVersionは1を指定してください");
  if (!isObject(value.thread)) throw new Error("threadが不正です");
  if (!isObject(value.scope)) throw new Error("scopeが不正です");
  const thread = {
    title: requireString(value.thread.title, "thread.title"),
    url: requireString(value.thread.url, "thread.url"),
    ...(value.thread.analyzedAt == null
      ? {}
      : { analyzedAt: requireString(value.thread.analyzedAt, "thread.analyzedAt") }),
  };
  const issuesValue = value.issues;
  if (!Array.isArray(issuesValue)) throw new Error("issuesは配列で指定してください");
  const issues = issuesValue.map((item, index) => {
    if (!isObject(item)) throw new Error(`issues[${index}]が不正です`);
    const status: DebateIssueStatus = item.status as DebateIssueStatus;
    if (
      status !== "resolved" &&
      status !== "mixed" &&
      status !== "unresolved" &&
      status !== "insufficient-evidence"
    ) {
      throw new Error(`issues[${index}].statusが不正です`);
    }
    return {
      id: requireString(item.id, `issues[${index}].id`),
      topic: requireString(item.topic, `issues[${index}].topic`),
      status,
      conclusion: requireString(item.conclusion, `issues[${index}].conclusion`),
      positions: requirePositions(item.positions, `issues[${index}].positions`),
      evidence: requireEvidence(item.evidence, `issues[${index}].evidence`),
    };
  });
  if (!Array.isArray(value.participants)) throw new Error("participantsは配列で指定してください");
  const participants = value.participants.map((item, index) => {
    if (!isObject(item)) throw new Error(`participants[${index}]が不正です`);
    return {
      id: requireString(item.id, `participants[${index}].id`),
      responseNumbers: requireIntegerArray(
        item.responseNumbers,
        `participants[${index}].responseNumbers`,
      ),
      position: requireString(item.position, `participants[${index}].position`),
      strengths: requireStringArray(item.strengths, `participants[${index}].strengths`),
      weaknesses: requireStringArray(item.weaknesses, `participants[${index}].weaknesses`),
      ...(item.score == null
        ? {}
        : { score: requireScore(item.score, `participants[${index}].score`) }),
    };
  });
  const result: DebateResult = {
    schemaVersion: 1,
    thread,
    scope: {
      responseNumbers: requireIntegerArray(value.scope.responseNumbers, "scope.responseNumbers"),
      participantIds: requireStringArray(value.scope.participantIds, "scope.participantIds"),
    },
    summary: requireString(value.summary, "summary"),
    conclusion: requireString(value.conclusion, "conclusion"),
    issues,
    participants,
    research: requireResearch(value.research),
    simpleView: requireSimpleView(value.simpleView),
    ...(value.caveats == null ? {} : { caveats: requireStringArray(value.caveats, "caveats") }),
  };
  if (JSON.stringify(result).length > MAX_RESULT_STRING_LENGTH) {
    throw new Error("判定結果が大きすぎます");
  }
  return result;
}
