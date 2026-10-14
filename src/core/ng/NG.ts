import {
  clearRuleRegexCache,
  evaluateBoardRules,
  evaluateResponseRules,
  formatRuleDsl,
  type Rule,
  type RuleMatchResult,
  type RuleRepository,
  validateRuleDsl,
} from "@chlen/chlib";
import { createLogger } from "src/app/logger";
import type { INGResult } from "src/core/ports/ng";
import type { CorePorts } from "src/core/ports/registry";
import { corePorts } from "src/core/ports/registry";
import { countReplyAnchorTargets } from "src/core/thread/reply-index";

const CONFIG_STRING_NAME = "ngwords";
const GENERAL_DEBUG_CONFIG_KEY = "debug_log";
const logger = createLogger("NG");

/** NG 判定と設定の読み書きに必要なサービス。呼び出し側が渡す（C-2）。 */
export type NGDeps = Pick<CorePorts, "config" | "message" | "notice">;

/** NG の状態（判定用の規則キャッシュ）を持つインスタンスを作る。状態はインスタンスごとに分かれる。 */
export function createNG(deps: NGDeps) {
  let rulesCache: readonly Rule[] | null = null;

  // Chlensの既存設定を壊さないため、保存キーだけはconfigの`ngwords`を維持し、
  // DSLの読み書き処理からconfig singletonへの依存をadapter内へ閉じ込める。
  const chlensRuleRepository: RuleRepository = {
    load: () => deps.config.get(CONFIG_STRING_NAME),
    save: (source) => deps.config.set(CONFIG_STRING_NAME, source),
  };

  function isCommentOrWhitespace(line: string): boolean {
    const trimmed = line.replace(/^[\uFEFF\u200B\u200C\u200D]+/u, "").trim();
    return (
      trimmed === "" ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("*/")
    );
  }

  function parseConfiguredRules(source: string): readonly Rule[] {
    const parsed = validateRuleDsl(source);
    const hasContent = source.split(/\r?\n/u).some((line) => !isCommentOrWhitespace(line));
    if (!parsed.recognized && hasContent) {
      const error = new Error("NG設定は新しいブロックDSLで記述してください。");
      logger.error("NG設定の形式が旧式または不正です", { error });
      throw error;
    }
    if (parsed.diagnostics.length > 0) {
      const details = parsed.diagnostics
        .map(({ line, column, message }) => `${line}:${column} ${message}`)
        .join("\n");
      logger.error("DSLの構文エラーにより設定を適用できません", {
        diagnostics: parsed.diagnostics,
      });
      throw new Error(`NG設定に構文エラーがあります\n${details}`);
    }
    return parsed.rules;
  }

  function readSource(): string {
    return chlensRuleRepository.load() ?? "";
  }

  function toText(value: unknown): string {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
      return String(value);
    }
    return "";
  }

  function updateRulesCache(rules: readonly Rule[]): void {
    rulesCache = [...rules];
    clearRuleRegexCache();
  }

  function isSimpleIdContainsRule(rule: Rule): boolean {
    return (
      rule.action === "hide" &&
      rule.target === "id" &&
      rule.enabled &&
      !rule.negate &&
      rule.matchers.length > 0 &&
      rule.matchers.every((matcher) => matcher.kind === "contains") &&
      rule.conditions == null &&
      rule.scope == null &&
      rule.presentation == null &&
      rule.expiresAt == null &&
      rule.name == null
    );
  }

  function mergeSimpleIdContainsRules(
    currentRules: readonly Rule[],
    addedRules: readonly Rule[],
  ): readonly Rule[] | null {
    if (addedRules.length === 0 || !addedRules.every(isSimpleIdContainsRule)) return null;

    const existingRules = currentRules.filter(isSimpleIdContainsRule);
    if (existingRules.length === 0) return null;

    // 右クリックから追加したIDは単独ルールを増やさず、同じ条件ブロックにまとめて管理する。
    // nameやscopeなどを持つ手動ルールは意図が異なる可能性があるため対象にしない。
    const matchers = [...existingRules, ...addedRules].flatMap((rule) => rule.matchers);
    const uniqueMatchers = matchers.filter(
      (matcher, index) =>
        matchers.findIndex(
          (candidate) =>
            candidate.kind === "contains" &&
            matcher.kind === "contains" &&
            candidate.value === matcher.value,
        ) === index,
    );
    const firstExistingIndex = currentRules.findIndex(isSimpleIdContainsRule);
    const mergedRule: Rule = { ...existingRules[0], matchers: uniqueMatchers };

    return currentRules.reduce<Rule[]>((result, rule, index) => {
      if (index === firstExistingIndex) result.push(mergedRule);
      if (!isSimpleIdContainsRule(rule)) result.push(rule);
      return result;
    }, []);
  }

  /** 同一targetのOR候補は一致したmatcherに絞り、複数targetのAND条件は全体を理由として表示する。 */
  function formatMatchedRule(matched: RuleMatchResult): string {
    // 否定の一覧は全候補が不一致という理由なので、1語に絞ると意味が変わる。
    return formatRuleDsl([
      matched.rule.negate ? matched.rule : { ...matched.rule, matchers: [matched.matcher] },
    ]);
  }

  /** 設定保存済みのDSLを判定へ反映する。保存処理は呼び出し側が担当する。 */
  function apply(source: string): void {
    updateRulesCache(parseConfiguredRules(source));
  }

  /** 設定を書き換えずにDSLだけを検証する。保存前の入力チェックで使用する。 */
  function validate(source: string): void {
    parseConfiguredRules(source);
  }

  async function commitRules(rules: readonly Rule[]): Promise<void> {
    const nextSource = formatRuleDsl(rules);
    await chlensRuleRepository.save(nextSource);
    updateRulesCache(rules);
    deps.message.send("ng_changed");
  }

  function onRegexError(source: string, error: unknown): void {
    logger.error("NG機能の正規表現を読み込めません", { source, error });
    // 利用者への見せ方は service-container の setup が決める（core はトーストに依存しない）。
    deps.notice.ngRuleRegexInvalid(source);
  }

  function getNgDebugTargetResNum(): number | null {
    const value = Number(deps.config.get(GENERAL_DEBUG_CONFIG_KEY) ?? 0);
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  function get(): readonly Rule[] {
    if (rulesCache != null) return rulesCache;
    const source = readSource();
    try {
      rulesCache = [...parseConfiguredRules(source)];
    } catch (error) {
      logger.error("NG設定の読込に失敗しました", { error });
      rulesCache = [];
    }
    return rulesCache;
  }

  function set(source: string): Promise<void> {
    logger.debug("set", { dslLength: source.length });
    try {
      const rules = parseConfiguredRules(source);
      return commitRules(rules);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function invalidateCache(): void {
    rulesCache = null;
    clearRuleRegexCache();
  }

  async function add(source: string): Promise<void> {
    const addedRules = parseConfiguredRules(source);
    const currentRules = get();
    const mergedIdRules = mergeSimpleIdContainsRules(currentRules, addedRules);
    if (mergedIdRules) {
      await commitRules(mergedIdRules);
      return;
    }
    // メニューや選択範囲からの半自動登録は、既存の設定順を維持して末尾へ追加する。
    // 先頭へ挿入すると、設定画面で手動管理しているルールの並びが毎回ずれてしまう。
    await commitRules([...currentRules, ...addedRules]);
  }

  function isNGBoard(threadTitle: string, url: string, resCount: number): INGResult | null {
    const rules = get();
    const matched = evaluateBoardRules(rules, { title: threadTitle, url, resCount }, onRegexError);
    return matched
      ? {
          type: matched.type,
          action: matched.rule.action,
          ruleDescription: formatMatchedRule(matched),
          ruleIndex: rules.indexOf(matched.rule),
          name: matched.rule.name,
          params: matched.params,
          disabled: false,
        }
      : null;
  }

  function isNGThread(res: unknown, title: string, url: string): INGResult | null {
    const raw = res as Record<string, unknown>;
    // 外部レスデータを表示用の文字列へ変換し、Rule Engineへ渡す境界をここに集約する。
    const name = toText(raw.name);
    const mail = toText(raw.mail);
    const other = toText(raw.other);
    const body = toText(raw.message);
    const resNum = typeof raw.num === "number" ? raw.num : undefined;
    const debugTargetResNum = getNgDebugTargetResNum();
    const anchorCount =
      typeof raw.anchorCount === "number" && Number.isFinite(raw.anchorCount)
        ? raw.anchorCount
        : countReplyAnchorTargets(body);
    const rules = get();
    const matched = evaluateResponseRules(
      rules,
      {
        all: `${name} ${mail} ${other} ${body}`,
        title,
        body,
        name,
        mail,
        id: typeof raw.id === "string" ? raw.id : null,
        slip: typeof raw.slip === "string" ? raw.slip : null,
        url,
        replyCount: typeof raw.replyCount === "number" ? raw.replyCount : undefined,
        anchorCount,
      },
      onRegexError,
    );
    if (matched) {
      logger.debug("thread.hit", { matchedType: matched.type, title, url, resNum });
      return {
        type: matched.type,
        action: matched.rule.action,
        ruleDescription: formatMatchedRule(matched),
        name: matched.rule.name,
        params: matched.params,
        disabled: false,
      };
    }
    if (debugTargetResNum != null ? resNum === debugTargetResNum : resNum != null && resNum <= 3) {
      logger.debug("thread.no_hit", { title, url, resNum, totalRuleCount: rules.length });
    }
    return null;
  }

  function execExpire(): void {
    const activeRules = get();
    const now = Date.now();
    const remaining = activeRules.filter((rule) => rule.expiresAt == null || now <= rule.expiresAt);
    if (remaining.length !== activeRules.length) {
      // 期限切れの自動掃除は呼び出し元の判定を止めないが、保存失敗はログに残す。
      void commitRules(remaining).catch((error: unknown) => {
        logger.error("期限切れNGルールの保存に失敗しました", { error });
      });
    }
  }

  return { apply, validate, get, set, invalidateCache, add, isNGBoard, isNGThread, execExpire };
}

// 既存の import 先（app.ts の公開 API と setup.ts）を維持するため、登録済みのサービスで組み立てた既定のインスタンスを公開する。
// 依存は関数が呼ばれた時点で参照されるため、ここでの組み立てで未登録の例外は出ない。
const defaultNG = createNG(corePorts);

export const {
  apply,
  validate,
  get,
  set,
  invalidateCache,
  add,
  isNGBoard,
  isNGThread,
  execExpire,
} = defaultNG;
