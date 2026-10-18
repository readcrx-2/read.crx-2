import {
  createReplacementEngine,
  parseReplacementDsl,
  type ReplacementDslParseResult,
  type ReplacementRule,
  type ReplacementTarget,
} from "@chlen/chlib";
import { createLogger } from "src/app/logger";
import type { CorePorts } from "src/core/ports/registry";

const logger = createLogger("core/thread");

/** 置換設定の読み書きに必要なサービス。呼び出し側が渡す（C-2）。 */
export type ReplaceStrTxtDeps = Pick<CorePorts, "config">;

/** 置換設定の状態を持つインスタンスを作る。状態は作成したインスタンスごとに分かれる。 */
export function createReplaceStrTxt(deps: ReplaceStrTxtDeps) {
  const CONFIG_NAME = "replace_str_txt";
  let cachedSource: string | null = null;
  let rules: readonly ReplacementRule[] = [];
  let engine = createReplacementEngine(rules);

  function get(): readonly ReplacementRule[] {
    const source = deps.config.get(CONFIG_NAME) ?? "";
    // 設定フォーム・インポート・別ウィンドウからの更新も、保存文字列の変化で検出する。
    if (source !== cachedSource) {
      const parsed = parseReplacementDsl(source);
      cachedSource = source;
      if (parsed.diagnostics.length > 0) {
        logger.error("置換設定が不正です。直前の有効な設定を維持します", parsed.diagnostics);
      } else {
        rules = parsed.rules;
        engine = createReplacementEngine(rules);
      }
    }
    return rules;
  }

  /** 不正な編集は保存しない。永続化に成功してから実行用キャッシュを更新する。 */
  async function set(value: string): Promise<ReplacementDslParseResult> {
    const parsed = parseReplacementDsl(value);
    if (parsed.diagnostics.length > 0) return parsed;
    try {
      await deps.config.set(CONFIG_NAME, value);
    } catch (error) {
      logger.error("置換設定の保存に失敗しました", error);
      throw error;
    }
    cachedSource = value;
    rules = parsed.rules;
    engine = createReplacementEngine(rules);
    return parsed;
  }

  function replace<T extends ReplacementTarget>(url: string, title: string, response: T): T {
    get();
    try {
      return engine.apply(url, title, response);
    } catch (error) {
      logger.error("レスへの置換適用に失敗しました", { url, title, error });
      throw error;
    }
  }

  return { get, set, replace };
}

export type ReplaceStrTxt = ReturnType<typeof createReplaceStrTxt>;
