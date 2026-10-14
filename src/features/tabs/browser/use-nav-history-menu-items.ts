import type { Dispatch } from "react";
import { useMemo } from "react";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import type { ScopedTabAction } from "src/view/browser/state/tabs/tab-store-types";
import type { Tab } from "src/view/browser/types";

/**
 * 戻る/進むボタンの右クリックメニューに出す履歴項目を組み立てる。
 *
 * 変更理由: タブの履歴から項目を作る処理は描画に依存しないため、NavigationBar から分離する。
 */
export function useNavHistoryMenuItems(viewTab: Tab, dispatch: Dispatch<ScopedTabAction>) {
  // 履歴タイトルは板名とスレ名が連結されて長くなりやすいため、
  // 戻る/進むメニューでは省略せず全文を折り返して見せる。

  const backHistoryItems = useMemo(
    () =>
      viewTab.history
        .map((page, index) => ({ page, index }))
        .filter(({ index }) => index < viewTab.currentIndex)
        .sort((a, b) => b.index - a.index)
        .map(({ page, index }) => ({
          id: `back-${index}`,
          label: page.title,
          allowMultilineLabel: true,
          onSelect: () => dispatch(tabActions.goToHistoryIndex(index)),
          onAuxSelect: (button: number) => {
            if (button !== 1) return;
            dispatch(tabActions.openInNewTab(page, { background: true }));
          },
        })),
    [dispatch, viewTab.currentIndex, viewTab.history],
  );

  const forwardHistoryItems = useMemo(
    () =>
      viewTab.history
        .map((page, index) => ({ page, index }))
        .filter(({ index }) => index > viewTab.currentIndex)
        .sort((a, b) => a.index - b.index)
        .map(({ page, index }) => ({
          id: `forward-${index}`,
          label: page.title,
          allowMultilineLabel: true,
          onSelect: () => dispatch(tabActions.goToHistoryIndex(index)),
          onAuxSelect: (button: number) => {
            if (button !== 1) return;
            dispatch(tabActions.openInNewTab(page, { background: true }));
          },
        })),
    [dispatch, viewTab.currentIndex, viewTab.history],
  );

  return { backHistoryItems, forwardHistoryItems };
}
