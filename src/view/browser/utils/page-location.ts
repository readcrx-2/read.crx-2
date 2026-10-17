import { createLogger } from "src/app/logger";
import { resolveBoardUrlForBrowser } from "src/view/browser/utils/link-routing";

const logger = createLogger("view/browser");

/**
 * ページの同一性判定（タブ履歴・自動更新キー・ビュー状態キー）に使うURLの正規化。
 *
 * 変更理由: 同じ「chlibで板URLを正規化 → ハッシュ除去 → 末尾スラッシュ統一」の処理が
 * タブストア・スレ一覧パネル・自動更新・ビュー状態キーに別々に実装されており、
 * 自動更新とビュー状態キーだけchlibを通さないため旧ホストの板でキーがずれていた。
 * 判定規則をここへ1つに集約し、呼び出し側ごとの差異が生まれないようにする。
 *
 * @param urlConstructor ポップアップ等、別windowのURLを使う必要がある呼び出し元向け。
 *   省略時は現在のwindowのURLを使う。
 */
export function normalizePageLocation(
  rawLocation: string,
  urlConstructor: typeof URL = window.URL,
): string {
  try {
    // 旧ホストや別URL形式の同じ掲示板を同一視するため、板URLの解釈はchlibへ委譲する。
    const resolved = resolveBoardUrlForBrowser(rawLocation);
    const parsed = new urlConstructor(resolved?.url ?? rawLocation);
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "/");
  } catch (error) {
    // URLとして解釈できない入力は照合キーとしてそのまま使うが、原因調査のためログは残す。
    logger.warn("URLを正規化できないため文字列として扱います", {
      rawLocation,
      error,
    });
    return rawLocation.trim().replace(/\/+$/, "");
  }
}
