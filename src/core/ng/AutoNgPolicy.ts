import { corePorts } from "src/core/ports/registry";

export const AUTO_NG_CONFIG_KEYS = {
  chain: "chain_ng",
  chainId: "chain_ng_id",
  chainSlip: "chain_ng_slip",
  missingId: "nothing_id_ng",
  missingSlip: "nothing_slip_ng",
  identityJudgment: "how_to_judgment_id",
  repeatMessageCount: "repeat_message_ng_count",
} as const;

export type AutoNgToggle = "chain" | "chainId" | "chainSlip" | "missingId" | "missingSlip";
export type IdentityJudgment = "first_res" | "exists_once" | "disabled";
export type AutoNgType = "NothingID" | "NothingSLIP" | "ChainID" | "ChainSLIP" | "RepeatMessage";

export interface AutoNgResponse {
  readonly num: number;
  readonly id?: string | null;
  readonly slip?: string | null;
  readonly message: string;
}

export interface AutoNgEvaluationContext {
  readonly response: AutoNgResponse;
  readonly bbsType: string;
  readonly existsIdAtFirstResponse: boolean;
  readonly existsSlipAtFirstResponse: boolean;
  readonly hasAnyId: boolean;
  readonly hasAnySlip: boolean;
  readonly chainedIds: ReadonlySet<string>;
  readonly chainedSlips: ReadonlySet<string>;
  readonly repeatedMessages: Map<string, Set<number>>;
  readonly canApply: (type: AutoNgType) => boolean;
}

/** 自動NGの設定キーを判定処理から隠し、設定名の追加・変更を一箇所へ閉じ込める。 */
export function isAutoNgEnabled(policy: AutoNgToggle): boolean {
  // 変更理由: 真偽設定は "on"/"off" の文字列で保存される。Boolean()で変換すると
  // 既定値の "off" まで有効扱いになり、自動NGを全スレへ誤って適用してしまう。
  return corePorts.config.get(AUTO_NG_CONFIG_KEYS[policy]) === "on";
}

export function getIdentityJudgment(): IdentityJudgment {
  const value = corePorts.config.get(AUTO_NG_CONFIG_KEYS.identityJudgment);
  return value === "first_res" || value === "exists_once" ? value : "disabled";
}

export function getRepeatMessageThreshold(): number {
  const value = Number.parseInt(
    corePorts.config.get(AUTO_NG_CONFIG_KEYS.repeatMessageCount) ?? "",
    10,
  );
  return Number.isFinite(value) && value > 1 ? value : 0;
}

/** ThreadModelが保持する索引を入力として受け取り、自動NGの種類だけを決定する。 */
export function evaluateAutoNg(context: AutoNgEvaluationContext): AutoNgType | null {
  const { response } = context;
  if (context.bbsType === "2ch") {
    const judgment = getIdentityJudgment();
    const idExpected =
      (judgment === "first_res" && context.existsIdAtFirstResponse) ||
      (judgment === "exists_once" && context.hasAnyId);
    if (
      isAutoNgEnabled("missingId") &&
      !response.id &&
      idExpected &&
      context.canApply("NothingID")
    ) {
      return "NothingID";
    }
    const slipExpected =
      (judgment === "first_res" && context.existsSlipAtFirstResponse) ||
      (judgment === "exists_once" && context.hasAnySlip);
    if (
      isAutoNgEnabled("missingSlip") &&
      !response.slip &&
      slipExpected &&
      context.canApply("NothingSLIP")
    ) {
      return "NothingSLIP";
    }
  }

  if (
    isAutoNgEnabled("chainId") &&
    response.id &&
    context.chainedIds.has(response.id) &&
    context.canApply("ChainID")
  ) {
    return "ChainID";
  }
  if (
    isAutoNgEnabled("chainSlip") &&
    response.slip &&
    context.chainedSlips.has(response.slip) &&
    context.canApply("ChainSLIP")
  ) {
    return "ChainSLIP";
  }

  const repeatThreshold = getRepeatMessageThreshold();
  if (repeatThreshold <= 1) return null;
  const cleanMessage = response.message.replace(/<[^>]+>/gu, "").trim();
  const responseNumbers = context.repeatedMessages.get(cleanMessage) ?? new Set<number>();
  context.repeatedMessages.set(cleanMessage, responseNumbers);
  responseNumbers.add(response.num);
  return responseNumbers.size >= repeatThreshold && context.canApply("RepeatMessage")
    ? "RepeatMessage"
    : null;
}
