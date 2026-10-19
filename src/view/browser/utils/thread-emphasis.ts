import type { IRes } from "src/service-container/interfaces";
import { stripHtml } from "src/view/browser/utils/response-format";

interface WriteHistoryLike {
  res?: unknown;
  writtenRes?: unknown;
}

function toFiniteInteger(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function isNgRes(res: IRes): boolean {
  return res.ng != null || res.class?.includes("ng") === true;
}

export function buildWrittenResSet(records: readonly WriteHistoryLike[]): Set<number> {
  const writtenResNums = new Set<number>();

  for (const record of records) {
    // 変更理由: 旧データと new-ui 整形後データで `res` / `writtenRes` が混在するため、
    // どちらのキーでも自分のレス番号を復元して強調表示の欠落を防ぐ。
    const resNum = toFiniteInteger(record.writtenRes ?? record.res);
    if (resNum > 0) {
      writtenResNums.add(resNum);
    }
  }

  return writtenResNums;
}

export function buildReplyToWrittenResSet(
  writtenResNums: ReadonlySet<number>,
  repIndex: ReadonlyMap<number, ReadonlySet<number>>,
): Set<number> {
  const replyToWrittenResNums = new Set<number>();

  for (const writtenResNum of writtenResNums) {
    const replyResNums = repIndex.get(writtenResNum);
    if (!replyResNums) {
      continue;
    }

    for (const replyResNum of replyResNums) {
      replyToWrittenResNums.add(replyResNum);
    }
  }

  return replyToWrittenResNums;
}

export function countNewRepliesToWrittenResponses(
  responses: readonly Pick<IRes, "num">[],
  writtenResNums: ReadonlySet<number>,
  replyToWrittenResNums: ReadonlySet<number>,
  previousLastResponseNum: number | null,
  newResponseCount: number,
): number {
  if (newResponseCount <= 0) {
    return 0;
  }

  const newResponses =
    previousLastResponseNum == null
      ? responses.slice(-newResponseCount)
      : responses.filter((response) => response.num > previousLastResponseNum);

  // 自分自身の投稿は返信先が自分のレスでも通知せず、他の利用者からの返信だけを数える。
  return newResponses.filter(
    (response) => !writtenResNums.has(response.num) && replyToWrittenResNums.has(response.num),
  ).length;
}

export function compileImageBlurPattern(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

export function buildBlurredResSet(
  responses: readonly IRes[],
  repIndex: ReadonlyMap<number, ReadonlySet<number>>,
  harmfulWordPattern: RegExp | null,
): Set<number> {
  const blurredResNums = new Set<number>();
  if (!harmfulWordPattern) {
    return blurredResNums;
  }

  const resMap = new Map<number, IRes>();
  for (const res of responses) {
    resMap.set(res.num, res);
  }

  for (const [targetResNum, replyResNums] of repIndex.entries()) {
    for (const replyResNum of replyResNums) {
      const replyRes = resMap.get(replyResNum);
      if (!replyRes || isNgRes(replyRes)) {
        continue;
      }

      // 変更理由: 旧UIと同様に「グロ」判定は返信側の本文で行い、
      // その返信先レスのサムネイルだけをぼかして誤爆を減らす。
      harmfulWordPattern.lastIndex = 0;
      if (harmfulWordPattern.test(stripHtml(replyRes.message))) {
        blurredResNums.add(targetResNum);
        break;
      }
    }
  }

  return blurredResNums;
}
