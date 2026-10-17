import { createLogger } from "src/app/logger";
import { container } from "src/service-container/index";

const logger = createLogger("view/browser");

export interface ConfigUpdatedMessage {
  key?: string;
}

export interface SubscribeConfigKeysOptions {
  /** keyを持たない通知も全キー変更として扱う既存互換用の設定。 */
  syncOnUnknownKey?: boolean;
  /** ログへ出す責務名。未指定時は共通の「設定」とする。 */
  label?: string;
}

/**
 * 設定サービスへの読み書きと変更通知購読を一つの境界へ集約する。
 *
 * 変更理由: hostごとに config.ready/config_updated の扱いが微妙に異なり、各フックが
 * 個別に実装すると購読漏れ・保存失敗の握りつぶし・既定値の不一致が再発するため。
 */
export function readConfigValue(key: string): string | null {
  try {
    return container.config.get(key);
  } catch (error) {
    logger.error("設定の読み込みに失敗しました: " + key, error);
    return null;
  }
}

export function persistConfigValue(key: string, value: unknown, label = "設定"): void {
  try {
    void Promise.resolve(container.config.set(key, value)).catch((error: unknown) => {
      logger.error("[" + label + "] 設定の保存に失敗しました: " + key, error);
    });
  } catch (error) {
    // config.setが同期例外を投げる実装でも、利用者の操作を中断させず原因を記録する。
    logger.error("[" + label + "] 設定の保存に失敗しました: " + key, error);
  }
}

export function subscribeConfigKeys(
  keys: readonly string[],
  sync: () => void,
  options: SubscribeConfigKeysOptions = {},
): () => void {
  const { label = "設定", syncOnUnknownKey = false } = options;
  const keySet = new Set(keys);
  const handleConfigUpdated = ({ key }: ConfigUpdatedMessage = {}) => {
    if ((key == null && syncOnUnknownKey) || (key != null && keySet.has(key))) {
      sync();
    }
  };

  let subscribed = false;
  try {
    // 変更理由: 初回レンダー時の既定値だけで描画すると、非同期で復元された設定を
    // 取りこぼすため、通知購読前に確定値を一度反映する。
    container.config.ready(sync);
    container.message.on("config_updated", handleConfigUpdated);
    subscribed = true;
  } catch (error) {
    // 設定サービスが未登録のhostでも画面を壊さず、初期値で表示を継続する。
    logger.error("[" + label + "] 設定変更通知の購読に失敗しました", error);
  }

  return () => {
    if (!subscribed) {
      return;
    }
    try {
      container.message.off("config_updated", handleConfigUpdated);
    } catch (error) {
      logger.error("[" + label + "] 設定変更通知の購読解除に失敗しました", error);
    }
  };
}
