import { container } from "src/service-container/index";
import { readConfigValue } from "src/view/browser/state/tabs/tab-store-config";
import { resolveBoardUrlForBrowser } from "src/view/browser/utils/link-routing";

// スレッド閲覧履歴の書き込み状態の管理。タブごとの訪問記録をまとめて扱う。
export interface ThreadHistoryVisit {
  tabId: string;
  threadUrl: string;
  title: string;
  boardTitle: string;
  date: number;
  pending: Promise<void>;
}

export function isHistoryDisabled(): boolean {
  return readConfigValue("no_history") === "on";
}

export function deriveHistoryBoardTitle(threadUrl: string): string {
  try {
    const resolved = resolveBoardUrlForBrowser(threadUrl);
    if (resolved?.type !== "thread") return "";
    return resolved.boardName;
  } catch {
    return "";
  }
}

export function getThreadVisitKey(tabId: string, threadUrl: string): string {
  return `${tabId}:${threadUrl}`;
}

export function reportHistoryPersistenceError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${context}: ${message}`, error);

  // 変更理由: 以前は window.app.message へ送っていた。view から window.app を参照しないよう lint で
  // 塞いだため（legacy-window-app-plan の Phase 3）、同じ Message の実体を持つ container.message へ送る。
  // 知らせる処理の失敗で保存エラーの報告そのものを止めないよう、失敗はログに残して続ける。
  try {
    container.message.send("notify", {
      message: `${context}: ${message}`,
      background_color: "red",
    });
  } catch (notifyError) {
    console.error("閲覧履歴の保存エラーを画面に知らせられませんでした", notifyError);
  }
}

export function clearThreadVisitsForTab(
  visitStore: Map<string, ThreadHistoryVisit>,
  tabId: string,
): void {
  for (const key of visitStore.keys()) {
    if (key.startsWith(`${tabId}:`)) {
      visitStore.delete(key);
    }
  }
}
