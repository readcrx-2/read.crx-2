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

  const appMessage = (
    window as Window &
      typeof globalThis & {
        app?: {
          message?: {
            send?: (type: string, payload?: unknown) => void;
          };
        };
      }
  ).app?.message;

  appMessage?.send?.("notify", {
    message: `${context}: ${message}`,
    background_color: "red",
  });
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
