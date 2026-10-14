import { getPageViewStateKey, type Page, type Tab } from "src/view/browser/types";

// 変更理由: スレ一覧が既読通知の発生元を判定するときも、画面側と同じURL正規化を使う。
export function getAutoRefreshThreadPageKey(threadUrl: string): string {
  return getPageViewStateKey({ type: "thread", title: "", threadUrl });
}

export function getAutoRefreshPageKey(page: Page): string | null {
  // 変更理由: 自動更新・表示状態・手動更新が同じページを別々のキー書式で識別していたため、
  // ページキーの組み立てはgetPageViewStateKeyへ一本化し、ここでは対象ページの判定だけを行う。
  switch (page.type) {
    case "thread":
    case "threadList":
      return getPageViewStateKey(page);
    default:
      return null;
  }
}

export function isAutoRefreshEnabledForPage(tab: Tab, page: Page): boolean {
  const pageKey = getAutoRefreshPageKey(page);
  return pageKey != null && tab.autoRefreshEnabled && tab.autoRefreshPageKey === pageKey;
}

export function isAutoRefreshStoppedForPage(tab: Tab, page: Page): boolean {
  const pageKey = getAutoRefreshPageKey(page);
  return pageKey != null && tab.autoRefreshStoppedPageKey === pageKey;
}

export function resetAutoRefreshState<
  T extends {
    autoRefreshEnabled: boolean;
    autoRefreshPageKey: string | null;
    autoRefreshStoppedPageKey?: string | null;
  },
>(tab: T): T {
  return {
    ...tab,
    // 変更理由: 自動更新は現在表示しているページだけの一時状態とし、
    // 別ページへ移動した後に意図せず再開しないよう共通ヘルパで必ず解除する。
    autoRefreshEnabled: false,
    autoRefreshPageKey: null,
    // 変更理由: 停止キーは今のページだけに属する一時状態なので、通常遷移へ持ち越さない。
    autoRefreshStoppedPageKey: null,
  };
}
