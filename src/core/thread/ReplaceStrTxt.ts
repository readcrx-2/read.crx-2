import {
  createReplacementEngine,
  parseReplacementDsl,
  type ReplacementDslParseResult,
  type ReplacementRule,
  type ReplacementTarget,
} from "@chlen/chlib";
import type { CorePorts } from "src/core/ports/registry";
import { corePorts } from "src/core/ports/registry";

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
        console.error(
          "[ReplaceStrTxt] 置換設定が不正です。直前の有効な設定を維持します",
          parsed.diagnostics,
        );
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
      console.error("[ReplaceStrTxt] 置換設定の保存に失敗しました", error);
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
      console.error("[ReplaceStrTxt] レスへの置換適用に失敗しました", { url, title, error });
      throw error;
    }
  }

  return { get, set, replace };
}

// 既存の import 先（app.ts の公開 API と ThreadService）を維持するため、登録済みのサービスで組み立てた既定のインスタンスを公開する。
// 依存は関数が呼ばれた時点で参照されるため、ここでの組み立てで未登録の例外は出ない。
const defaultReplaceStrTxt = createReplaceStrTxt(corePorts);

export const { get, set, replace } = defaultReplaceStrTxt;
