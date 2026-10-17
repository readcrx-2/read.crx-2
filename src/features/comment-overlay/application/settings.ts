import { createLogger } from "src/app/logger";
import { isTauriRuntime } from "src/app/platform/runtime";
import { container } from "src/service-container/index";

import {
  type CommentOverlaySettings,
  DEFAULT_COMMENT_OVERLAY_SETTINGS,
  MAX_COMMENT_OVERLAY_DURATION_SECONDS,
  normalizeCommentOverlaySettings,
} from "../domain";

const logger = createLogger("comment-overlay");

export const COMMENT_OVERLAY_CONFIG_KEYS = {
  // 既存キーを維持し、旧いpx/秒の保存値はreadCommentOverlaySettingsで秒へ変換する。
  // 文字サイズは保存設定から外し、過去に保存された値も読み込まない。
  durationSeconds: "comment_overlay_speed",
  opacity: "comment_overlay_opacity",
  maxQueueSize: "comment_overlay_max_queue",
  fetchAllCandidateThreads: "comment_overlay_fetch_all_threads",
} as const;

const COMMENT_OVERLAY_CONFIG_KEY_SET = new Set<string>(Object.values(COMMENT_OVERLAY_CONFIG_KEYS));

export function isCommentOverlayConfigKey(key: string | undefined): boolean {
  return key != null && COMMENT_OVERLAY_CONFIG_KEY_SET.has(key);
}

function readNumber(key: string, fallback: number): number {
  const raw = container.config.get(key);
  // 変更理由: 未設定値をNumber(null)=0として扱うと、既定値ではなく最小値へ
  // 丸められるため、空の保存値は未設定として扱う。
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

const LEGACY_OVERLAY_STAGE_WIDTH = 900;

function readDurationSeconds(): number {
  const raw = container.config.get(COMMENT_OVERLAY_CONFIG_KEYS.durationSeconds);
  if (raw == null || raw.trim() === "") return DEFAULT_COMMENT_OVERLAY_SETTINGS.durationSeconds;
  const value = Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_COMMENT_OVERLAY_SETTINGS.durationSeconds;

  if (value > MAX_COMMENT_OVERLAY_DURATION_SECONDS) {
    // 変更理由: 旧設定はpx/秒、新設定は通過秒数なので、保存キーを変えずに
    // 既存ユーザーの速度を900px基準の通過時間へ変換して挙動を引き継ぐ。
    return LEGACY_OVERLAY_STAGE_WIDTH / value;
  }
  return value;
}

/** 既存Configの文字列設定をOverlay domainの値へ変換し、開始時と更新event時に読み込む。 */
export function readCommentOverlaySettings(): CommentOverlaySettings {
  try {
    return normalizeCommentOverlaySettings({
      durationSeconds: readDurationSeconds(),
      opacity: readNumber(
        COMMENT_OVERLAY_CONFIG_KEYS.opacity,
        DEFAULT_COMMENT_OVERLAY_SETTINGS.opacity,
      ),
      maxQueueSize: readNumber(
        COMMENT_OVERLAY_CONFIG_KEYS.maxQueueSize,
        DEFAULT_COMMENT_OVERLAY_SETTINGS.maxQueueSize,
      ),
      fetchAllCandidateThreads:
        container.config.get(COMMENT_OVERLAY_CONFIG_KEYS.fetchAllCandidateThreads) === "on",
    });
  } catch (error: unknown) {
    logger.error("コメントOverlay設定の読み込みに失敗しました:", error);
    return { ...DEFAULT_COMMENT_OVERLAY_SETTINGS };
  }
}

export function subscribeToCommentOverlaySettings(listener: () => void): () => void {
  if (!isTauriRuntime()) return () => {};

  const handleConfigUpdated = ({ key }: { key?: string }): void => {
    if (isCommentOverlayConfigKey(key)) listener();
  };

  try {
    container.message.on("config_updated", handleConfigUpdated);
    return () => container.message.off("config_updated", handleConfigUpdated);
  } catch (error: unknown) {
    logger.error("コメントOverlay設定の変更監視に失敗しました:", error);
    return () => {};
  }
}
