import { getAutoRefreshPageKey } from "src/view/browser/state/tabs/auto-refresh-pages";
import type { Page } from "src/view/browser/types";

// ページの同一性の判定は、新しいタブの生成（tab-store-new-tab）と状態の補助
// （tab-store-state-helpers）の両方から使う。片方に置くと互いに import する循環になるため、
// どちらにも依存しない葉のモジュールとして分ける（Phase E）。

export function getPageIdentity(page: Page): string {
  switch (page.type) {
    case "home":
    case "newTab":
      return page.type;
    case "boardList":
      return "boardList";
    case "settings":
      return "settings";
    // クイックアクセス3種を別IDとして扱い、
    // 「既に開いている判定」で相互に潰し合って遷移不能になる回帰を防ぐ。
    case "bookmarkList":
      return "bookmarkList";
    case "historyList":
      return "historyList";
    case "writeHistoryList":
      return "writeHistoryList";
    case "logList":
      return "logList";
    case "threadList":
      return getAutoRefreshPageKey(page) ?? "threadList";
    case "thread":
      return getAutoRefreshPageKey(page) ?? "thread";
  }

  throw new Error("Unsupported page type");
}
