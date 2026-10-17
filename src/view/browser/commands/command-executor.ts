import { createLogger } from "src/app/logger";
import { container } from "src/service-container";
import {
  type BrowserCommandContext,
  executeBrowserCommand,
  getBrowserCommandLabel,
} from "src/view/browser/commands/browser-commands";

const logger = createLogger("view/browser");

export interface BrowserCommandExecutionOptions {
  commandId: string;
  context: BrowserCommandContext;
  onBeforeExecute?: () => void;
  onCommandRecorded?: (commandId: string) => void;
  onRunningChange?: (commandId: string, running: boolean) => void;
}

/**
 * コマンド実行の共通ライフサイクルを提供する。
 *
 * 変更理由: これまで実行履歴・実行中表示・例外通知がNavigationBarへ埋め込まれており、
 * メニューや別窓から同じコマンドを呼ぶと入口ごとに処理が分かれるため、実行境界を
 * 独立させてすべての入口から再利用できるようにする。
 */
export async function runBrowserCommand({
  commandId,
  context,
  onBeforeExecute,
  onCommandRecorded,
  onRunningChange,
}: BrowserCommandExecutionOptions): Promise<boolean> {
  onBeforeExecute?.();
  onCommandRecorded?.(commandId);
  onRunningChange?.(commandId, true);

  try {
    return await executeBrowserCommand(commandId, context);
  } catch (error: unknown) {
    const label = getBrowserCommandLabel(commandId, context);
    // コマンドIDとページ種別を残し、複数の入口に集約した操作の失敗元を追跡できるようにする。
    logger.error("ブラウザコマンドの実行に失敗しました", {
      commandId,
      pageType: context.viewPage.type,
      error,
    });
    (context.toast ?? container.toast).error(`${label}に失敗しました`);
    return false;
  } finally {
    onRunningChange?.(commandId, false);
  }
}
