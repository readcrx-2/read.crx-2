import { platform } from "src/app";
import { createLogger } from "src/app/logger";
import { normalizeRecentCommandIds } from "src/view/browser/commands/command-history";

const logger = createLogger("view/browser");

const RECENT_COMMANDS_STORAGE_KEY = "command_palette_recent_command_ids";

export async function loadRecentCommandIds(): Promise<string[]> {
  try {
    const stored = await platform.storage.kv.get(RECENT_COMMANDS_STORAGE_KEY);
    return stored ? normalizeRecentCommandIds(JSON.parse(stored) as unknown) : [];
  } catch (error: unknown) {
    // 変更理由: 履歴の破損や保存APIの失敗でパレット自体を開けなくせず、
    // 原因を追跡できるよう詳細をログへ残して履歴なしとして続行する。
    logger.error("Failed to load command palette history", { error });
    return [];
  }
}

export async function saveRecentCommandIds(recentCommandIds: readonly string[]): Promise<void> {
  try {
    await platform.storage.kv.set(
      RECENT_COMMANDS_STORAGE_KEY,
      JSON.stringify(normalizeRecentCommandIds(recentCommandIds)),
    );
  } catch (error: unknown) {
    logger.error("Failed to save command palette history", {
      recentCommandIds,
      error,
    });
  }
}
