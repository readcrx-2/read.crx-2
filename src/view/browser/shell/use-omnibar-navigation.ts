import { useCallback } from "react";
import type { RefObject } from "react";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import type { useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import {
  parseInternalBrowserPage,
  parseOmnibarBrowserPage,
} from "src/view/browser/utils/link-routing";
import type { OmnibarSuggestion } from "src/view/browser/utils/omnibar";

type TabDispatch = ReturnType<typeof useTabStore>["dispatch"];

// URLバーからの入力でページ種別を推定してナビゲートする
function navigateByUrl(url: string, dispatch: TabDispatch) {
  const trimmed = url.trim();
  if (!trimmed) return;

  const parsed = parseOmnibarBrowserPage(trimmed);
  if (!parsed) return;

  // 変更理由: ブラウザ標準と同じく、URL直入力は実際に訪れたページだけを履歴へ積む。
  // 対象スレの板を自動補完すると、戻る操作が前居た場所ではなく対象板へ飛び、
  // 直感的でないため補完しない。新規タブ側の正規履歴は buildHierarchyForNewTab が担う。
  dispatch(tabActions.navigate(parsed));
}

/** URL直入力に対する「開く」「新しいタブで開く」の候補を作る。入力が現在のURLと同じなら null。 */
function buildDirectInputSuggestions(
  inputValue: string,
  currentDisplayUrl: string,
): OmnibarSuggestion[] | null {
  const trimmed = inputValue.trim();
  if (!trimmed || trimmed === currentDisplayUrl.trim()) {
    return null;
  }

  const parsed = parseOmnibarBrowserPage(trimmed);
  if (!parsed) {
    return null;
  }

  const boardTitle = parsed.type === "threadList" ? parsed.boardTitle : "";

  // 変更理由: URL直入力は同一タブで開くだけでなく、新しいタブで開く選択肢も並べる。
  // 先頭が通常の「開く」、次が「新しいタブで開く」で、矢印キーとEnterでも選べる。
  return [
    {
      url: trimmed,
      title: trimmed,
      boardTitle,
      score: Number.POSITIVE_INFINITY,
      isBookmark: false,
      sources: ["direct"],
      actionLabel: "URLを開く",
    },
    {
      url: trimmed,
      title: trimmed,
      boardTitle,
      score: Number.POSITIVE_INFINITY,
      isBookmark: false,
      sources: ["direct"],
      actionLabel: "URLを新しいタブで開く",
      openInNewTab: true,
    },
  ];
}

interface UseOmnibarNavigationParams {
  dispatch: TabDispatch;
  urlInputRef: RefObject<HTMLInputElement | null>;
}

/** オムニバーの入力確定・候補選択をタブ操作へ変換する。 */
export function useOmnibarNavigation({ dispatch, urlInputRef }: UseOmnibarNavigationParams) {
  const submitUrl = useCallback((url: string) => navigateByUrl(url, dispatch), [dispatch]);

  const openSuggestion = useCallback(
    (suggestion: OmnibarSuggestion) => {
      if (suggestion.sources.includes("direct")) {
        if (suggestion.openInNewTab) {
          // 変更理由: URL直入力から明示的に別タブで開くときは、新規タブの正規履歴に乗せて
          // フォーカスを移す。同一タブの履歴へ対象板を補完しない方針と両立させるため。
          const parsed = parseOmnibarBrowserPage(suggestion.url);
          if (!parsed) {
            return;
          }

          const page =
            parsed.type === "threadList"
              ? {
                  ...parsed,
                  title: suggestion.title,
                  boardTitle: suggestion.boardTitle || suggestion.title,
                }
              : { ...parsed, title: suggestion.title };
          dispatch(tabActions.openInNewTabForce(page, { focus: true }));
          urlInputRef.current?.blur();
          return;
        }

        navigateByUrl(suggestion.url, dispatch);
        urlInputRef.current?.blur();
        return;
      }

      const parsed = parseInternalBrowserPage(suggestion.url);
      if (!parsed) {
        return;
      }

      dispatch(
        tabActions.navigate({
          ...parsed,
          title: suggestion.title,
          ...(parsed.type === "threadList"
            ? { boardTitle: suggestion.boardTitle || suggestion.title }
            : {}),
        }),
      );

      urlInputRef.current?.blur();
    },
    [dispatch, urlInputRef],
  );

  return { submitUrl, openSuggestion, getDirectInputSuggestion: buildDirectInputSuggestions };
}
