import { type AutoNgConfig, evaluateAutoNg, isAutoNgEnabled } from "src/core/ng/AutoNgPolicy";
import type { INGResult } from "src/core/ports/ng";
import type { INGService, IUtil } from "src/core/ports/services";
import type { IRes } from "src/core/ports/thread";
import { buildReplyIndexes } from "src/core/thread/reply-index";

export interface ThreadNgContext {
  title: string;
  url: string;
}

/** スレ判定に必要なサービス。呼び出し側が渡す（C-2）。 */
export interface ThreadNgDeps {
  config: AutoNgConfig;
  util: Pick<IUtil, "guessType">;
  ng: Pick<INGService, "isNGThread">;
}

const addToIndex = <K>(index: Map<K, Set<number>>, key: K, num: number): void => {
  const nums = index.get(key);
  if (nums) nums.add(num);
  else index.set(key, new Set([num]));
};

/**
 * スレ全体のレスからNG判定結果をレス番号ごとに求める。
 *
 * 変更理由: 以前はThreadModel（現在は未使用）がレスを逐次書き換えながら自動NGを判定していたが、
 * 現行の取得経路ではその判定が呼ばれず、設定画面の自動NGが効いていなかった。
 * 入力のレスは書き換えず、判定結果だけを返す純粋な関数にして、状態の所有者を明確にする。
 */
export function evaluateThreadNg(
  responses: readonly IRes[],
  { title, url }: ThreadNgContext,
  deps: ThreadNgDeps,
): Map<number, INGResult> {
  const bbsType = deps.util.guessType(url).bbsType;
  // 返信数NGは後続レスの安価も数えるため、判定前に全レスから索引化する。
  const { repIndex, ancIndex } = buildReplyIndexes(responses);

  const idIndex = new Map<string, Set<number>>();
  const slipIndex = new Map<string, Set<number>>();
  for (const res of responses) {
    if (res.id) addToIndex(idIndex, res.id, res.num);
    if (res.slip) addToIndex(slipIndex, res.slip, res.num);
  }

  // 1000超過後のレスは判定対象外。2ch系だけ「Over 1000」の表示が付く。
  const over1000ResNum =
    bbsType === "2ch"
      ? responses.find((res) => res.other?.startsWith("Over 1000"))?.num
      : undefined;
  const isOverThousand = (num: number): boolean => over1000ResNum != null && num >= over1000ResNum;

  const first = responses[0];
  const existsIdAtFirstResponse = Boolean(first?.id);
  const existsSlipAtFirstResponse = Boolean(first?.slip);

  const results = new Map<number, INGResult>();
  const chainedIds = new Set<string>();
  const chainedSlips = new Set<string>();
  const repeatedMessages = new Map<string, Set<number>>();
  const byNum = new Map(responses.map((res) => [res.num, res]));

  // NGになったレスのID/Slipは、同じ投稿者の他レスを連鎖NGにする材料として集める。
  const recordNg = (res: IRes, ng: INGResult): void => {
    results.set(res.num, ng);
    if (isAutoNgEnabled(deps.config, "chainId") && res.id && !["ID", "ChainID"].includes(ng.type)) {
      chainedIds.add(res.id);
    }
    if (
      isAutoNgEnabled(deps.config, "chainSlip") &&
      res.slip &&
      !["Slip", "ChainSLIP"].includes(ng.type)
    ) {
      chainedSlips.add(res.slip);
    }
  };

  // 「ID無し」「ID/Slipが一度でも出たか」は判定中のレスまでに出現した範囲で数える。
  // 以前のThreadModelと同じく逐次追加の見え方を保ち、後続レスのIDで前のレスが急にNGにならないようにする。
  const seenIds = new Set<string>();
  const seenSlips = new Set<string>();

  for (const res of responses) {
    if (res.id) seenIds.add(res.id);
    if (res.slip) seenSlips.add(res.slip);
    if (isOverThousand(res.num)) continue;

    const ruleNg = deps.ng.isNGThread(
      {
        ...res,
        replyCount: repIndex.get(res.num)?.size ?? 0,
        anchorCount: ancIndex.get(res.num)?.size ?? 0,
      },
      title,
      url,
    );
    if (ruleNg) {
      recordNg(res, ruleNg);
      continue;
    }

    const autoNgType = evaluateAutoNg({
      config: deps.config,
      response: res,
      bbsType,
      existsIdAtFirstResponse,
      existsSlipAtFirstResponse,
      hasAnyId: seenIds.size > 0,
      hasAnySlip: seenSlips.size > 0,
      chainedIds,
      chainedSlips,
      repeatedMessages,
      canApply: () => true,
    });
    if (autoNgType) recordNg(res, { type: autoNgType });
  }

  // 連鎖NGは新しくNGになったレスがさらに連鎖を生むため、増えなくなるまで繰り返す。
  const markChain = (num: number, ng: INGResult): boolean => {
    const res = byNum.get(num);
    if (!res || results.has(num) || isOverThousand(num)) return false;
    recordNg(res, ng);
    return true;
  };
  let changed = true;
  while (changed) {
    changed = false;
    if (isAutoNgEnabled(deps.config, "chainId")) {
      for (const id of [...chainedIds]) {
        for (const num of idIndex.get(id) ?? []) {
          changed = markChain(num, { type: "ChainID" }) || changed;
        }
      }
    }
    if (isAutoNgEnabled(deps.config, "chainSlip")) {
      for (const slip of [...chainedSlips]) {
        for (const num of slipIndex.get(slip) ?? []) {
          changed = markChain(num, { type: "ChainSLIP" }) || changed;
        }
      }
    }
    if (isAutoNgEnabled(deps.config, "chain")) {
      for (const ngNum of [...results.keys()]) {
        for (const replyNum of repIndex.get(ngNum) ?? []) {
          // 未来のレスへの安価は連鎖の対象にしない（過去レスを巻き込まない）。
          if (replyNum > ngNum) changed = markChain(replyNum, { type: "Chain" }) || changed;
        }
      }
    }
  }

  return results;
}
