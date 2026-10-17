import { decode, encode } from "@toon-format/toon";

import type { BridgeThreadResult, ThreadReadParams } from "../protocol.ts";
import { DEBATE_RESULT_SCHEMA } from "./schema.ts";
import type { DebateContext, DebateContextResponse, DebatePrepareParams } from "./types.ts";

const MAX_CONTEXT_RESPONSES = 240;
const MAX_CONTEXT_DEPTH = 8;

interface DecodedThreadResponse {
  num: number;
  id?: string;
  date?: string;
  message?: string;
  replyTo?: string;
  repliedBy?: string;
}

interface DecodedThreadPayload {
  thread?: {
    title?: string;
    url?: string;
    totalResponses?: number;
  };
  responses?: DecodedThreadResponse[];
}

interface NormalizedResponse extends DecodedThreadResponse {
  num: number;
  id: string;
  date: string;
  message: string;
  replyToNumbers: number[];
  repliedByNumbers: number[];
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function normalizeParticipantId(value: string): string {
  return value.trim().replace(/^ID:/i, "");
}

function parseRelationNumbers(value: string | undefined): number[] {
  if (!value) return [];
  return [...value.matchAll(/\d+/g)]
    .map((match) => Number(match[0]))
    .filter((num) => Number.isInteger(num) && num > 0);
}

function normalizeResponse(value: unknown): NormalizedResponse | null {
  if (!isObject(value)) return null;
  const num = asPositiveInteger(value.num);
  if (num == null) return null;
  const raw = value as unknown as DecodedThreadResponse;
  return {
    ...raw,
    num,
    id: normalizeParticipantId(asString(raw.id)),
    date: asString(raw.date),
    message: asString(raw.message),
    replyToNumbers: parseRelationNumbers(asString(raw.replyTo)),
    repliedByNumbers: parseRelationNumbers(asString(raw.repliedBy)),
  };
}

function normalizeThreadPayload(value: unknown): {
  title: string;
  url: string;
  totalResponses: number;
  responses: NormalizedResponse[];
} {
  if (!isObject(value)) throw new Error("ChLensのスレッド応答を解釈できません");
  const raw = value as DecodedThreadPayload;
  if (!isObject(raw.thread) || !Array.isArray(raw.responses)) {
    throw new Error("ChLensのスレッド応答にthreadまたはresponsesがありません");
  }
  const responses = raw.responses
    .map(normalizeResponse)
    .filter((response): response is NormalizedResponse => response != null)
    .sort((left, right) => left.num - right.num);
  return {
    title: asString(raw.thread.title),
    url: asString(raw.thread.url),
    totalResponses: asPositiveInteger(raw.thread.totalResponses) ?? responses.length,
    responses,
  };
}

export function uniquePositiveIntegers(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(values.map(asPositiveInteger).filter((value): value is number => value != null)),
  ];
}

export function uniqueParticipantIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map(normalizeParticipantId)
        .filter(Boolean),
    ),
  ];
}

function resolveScope(
  responses: readonly NormalizedResponse[],
  params: DebatePrepareParams,
): { responseNumbers: number[]; participantIds: string[] } {
  const available = new Set(responses.map((response) => response.num));
  const responseNumbers = uniquePositiveIntegers(params.responseNumbers).filter((num) =>
    available.has(num),
  );
  const requestedIds = uniqueParticipantIds(params.participantIds);
  const participantIds = requestedIds.filter((id) =>
    responses.some((response) => response.id === id),
  );
  const idResponseNumbers = responses
    .filter((response) => participantIds.includes(response.id))
    .map((response) => response.num);
  const targets = [...new Set([...responseNumbers, ...idResponseNumbers])].sort(
    (left, right) => left - right,
  );
  if (targets.length === 0) {
    throw new Error("存在するレス番号またはIDを少なくとも1つ指定してください");
  }
  return { responseNumbers: targets, participantIds };
}

function buildContextNumbers(
  responses: readonly NormalizedResponse[],
  targets: readonly number[],
  contextDepth: number,
): Map<number, number> {
  // 変更理由: 返信関係の正本は既存のthread-outputがreply-indexからTOON化しているため、
  // MCP側では同じメタデータを使ってDOMや別のツリー実装に依存せず周辺レスを辿る。
  const responseMap = new Map(responses.map((response) => [response.num, response]));
  const distances = new Map<number, number>();
  const queue = targets.map((num) => ({ num, distance: 0 }));
  for (const target of targets) distances.set(target, 0);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.distance >= contextDepth) continue;
    const response = responseMap.get(current.num);
    if (!response) continue;
    const neighbors = [...response.replyToNumbers, ...response.repliedByNumbers];
    for (const neighbor of neighbors) {
      if (!responseMap.has(neighbor) || distances.has(neighbor)) continue;
      distances.set(neighbor, current.distance + 1);
      queue.push({ num: neighbor, distance: current.distance + 1 });
    }
  }
  return distances;
}

// 変更理由: 判定処理へNodeのファイル読み込みを持ち込まず、MCP側で読んだスキルの指示を受け取る。
export function buildDebateContext(
  value: unknown,
  params: DebatePrepareParams,
  instructions: string,
): DebateContext {
  const thread = normalizeThreadPayload(value);
  const scope = resolveScope(thread.responses, params);
  // 変更理由: 返信の枝を利用者の指定深度で途中打ち切りすると議論の応酬を見落とすため、
  // 判定用コンテキストは常に許容される最大深度まで辿る。
  const contextDepth = MAX_CONTEXT_DEPTH;
  const distances = buildContextNumbers(thread.responses, scope.responseNumbers, contextDepth);
  const ordered = [...distances.entries()]
    .sort((left, right) => left[1] - right[1] || left[0] - right[0])
    .slice(
      0,
      Math.min(
        asPositiveInteger(params.maxResponses) ?? MAX_CONTEXT_RESPONSES,
        MAX_CONTEXT_RESPONSES,
      ),
    );
  const responseMap = new Map(thread.responses.map((response) => [response.num, response]));
  const targetSet = new Set(scope.responseNumbers);
  const responses = ordered
    .map(([num, distance]) => {
      const response = responseMap.get(num);
      if (!response) return null;
      return {
        num: response.num,
        id: response.id,
        date: response.date,
        message: response.message,
        role: targetSet.has(response.num) ? ("target" as const) : ("context" as const),
        distance,
        replyTo: response.replyToNumbers.filter((target) => responseMap.has(target)),
        repliedBy: response.repliedByNumbers.filter((target) => responseMap.has(target)),
      };
    })
    .filter((response): response is DebateContextResponse => response != null)
    .sort((left, right) => left.num - right.num);
  const omittedResponses = Math.max(thread.responses.length - responses.length, 0);
  const contextData = {
    debate: {
      kind: "debate-context",
      thread: {
        title: thread.title,
        url: thread.url,
        totalResponses: thread.totalResponses,
      },
      scope,
      responseCount: responses.length,
      omittedResponses,
      contextDepth,
      instructions,
      resultSchema: DEBATE_RESULT_SCHEMA,
    },
    responses,
  };
  return {
    kind: "debate-context",
    thread: {
      title: thread.title,
      url: thread.url,
      totalResponses: thread.totalResponses,
    },
    scope,
    responses,
    omittedResponses,
    instructions,
    resultSchema: DEBATE_RESULT_SCHEMA,
    toon: encode(contextData),
  };
}

export async function prepareDebateContext(
  params: DebatePrepareParams,
  readThread: (params: ThreadReadParams) => Promise<BridgeThreadResult>,
  instructions: string,
): Promise<DebateContext> {
  const firstPage = await readThread({ url: params.url, mode: params.mode ?? "auto" });
  const thread = normalizeThreadPayload(decode(firstPage.toon));
  const responses = new Map(thread.responses.map((response) => [response.num, response]));
  let lastResponseNumber = thread.responses.reduce(
    (last, response) => Math.max(last, response.num),
    0,
  );

  // 変更理由: 通常閲覧の500件制限を判定にも適用すると後半の中心レスや反論を落とすため、
  // 全ページを揃えてから返信ツリーを抽出する。追加ページはURLとキャッシュを固定する。
  while (responses.size < thread.totalResponses) {
    const start = lastResponseNumber + 1;
    const page = await readThread({ url: thread.url, mode: "cache", start });
    const next = normalizeThreadPayload(decode(page.toon));
    if (next.url !== thread.url || next.totalResponses !== thread.totalResponses) {
      throw new Error("議論用ログの取得中にスレッドまたはレス数が変わりました。再実行してください");
    }
    const additional = next.responses.filter((response) => response.num >= start);
    // 変更理由: 続きを取得できないまま部分ログで判定したり、同じページを無限取得したりしない。
    if (additional.length === 0) {
      throw new Error(`議論用ログの続き（レス${start}以降）を取得できませんでした`);
    }
    for (const response of additional) {
      responses.set(response.num, response);
      lastResponseNumber = Math.max(lastResponseNumber, response.num);
    }
  }
  return buildDebateContext(
    {
      thread: { title: thread.title, url: thread.url, totalResponses: thread.totalResponses },
      responses: [...responses.values()],
    },
    params,
    instructions,
  );
}
