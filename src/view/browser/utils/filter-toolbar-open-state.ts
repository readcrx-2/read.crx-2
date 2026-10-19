import { useSyncExternalStore } from "react";

// 変更理由: フィルタバーの開閉状態は各ページのフックが持つが、開閉ボタンはタイトルバー側の
// NavigationBar にあるため、ボタンの表示を切り替えられるよう開いているタブIDだけを共有する。
const openTabIds = new Set<string>();
const listeners = new Set<() => void>();

export function setFilterToolbarOpen(tabId: string, open: boolean): void {
  if (openTabIds.has(tabId) === open) {
    return;
  }
  if (open) {
    openTabIds.add(tabId);
  } else {
    openTabIds.delete(tabId);
  }
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useFilterToolbarOpen(tabId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => openTabIds.has(tabId),
    () => false,
  );
}
