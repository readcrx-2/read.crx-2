export const QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE = {
  boardList: "board-list-filter-toolbar-toggle",
  bookmarkList: "bookmark-filter-toolbar-toggle",
  historyList: "history-filter-toolbar-toggle",
  writeHistoryList: "write-history-filter-toolbar-toggle",
  logList: "log-filter-toolbar-toggle",
  threadList: "thread-list-filter-toolbar-toggle",
} as const;

// ステータスバーからスレッドのフィルタバーを開閉するイベント。
// 変更理由: ステータスバーはThreadPageの外にあるため、対象タブを明示しつつ、
// 既存のフィルタ操作と同じトグル動作を再利用する。
export const THREAD_FILTER_TOOLBAR_TOGGLE_EVENT = "thread-filter-toolbar-toggle";

export interface ThreadFilterToolbarToggleDetail {
  tabId: string;
}

// コマンドパレットからスレッドのフィルタモードを切り替えるイベント。
// 変更理由: フィルタボタンと同じく、選択中のモードを再度選ぶと解除する挙動を
// パレットからも使えるよう、対象タブと選んだモードを明示して渡す。
export const THREAD_FILTER_MODE_TOGGLE_EVENT = "thread-filter-mode-toggle";

export interface ThreadFilterModeToggleDetail {
  tabId: string;
  filter: "popular" | "image" | "video" | "link";
}

export type QuickAccessFilterPageType = keyof typeof QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE;

export interface QuickAccessFilterToggleDetail {
  tabId: string;
}
