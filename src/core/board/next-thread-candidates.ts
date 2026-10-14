import { ChURL, getThreadReferenceKeys } from "packages/chlib/src/index";
import Board, { type BoardDeps } from "src/core/board/Board";
import { normalize } from "src/core/util/string-normalize";
import { levenshteinDistance } from "src/core/util/Util";

export interface NextThreadCandidate {
  score: number;
  title: string;
  url: string;
}

/**
 * 旧来の次スレ候補の検索（板のスレ一覧からタイトルの近さで上位 5 件を返す）。
 * window.app.util.searchNextThread の実装で、板の取得に使う依存は呼び出し側が渡す（Phase C-2 の残り）。
 * 新しい画面の次スレ検索は features/next-thread を使う。
 */
export async function searchNextThreadCandidates(
  threadUrlStr: string,
  threadTitle: string,
  resString: string,
  deps: BoardDeps,
): Promise<NextThreadCandidate[]> {
  const threadUrl = new ChURL(threadUrlStr);
  const boardUrl = threadUrl.toBoard();
  threadTitle = normalize(threadTitle);

  // Board.get は文字列URLを受け取る契約なので href で渡す。
  const { data: threads } = await Board.get(boardUrl.href, deps);
  if (threads == null) {
    throw new Error("板の取得に失敗しました");
  }
  const candidates = threads
    .filter(({ url, resCount }) => url !== threadUrl.href && resCount < 1001)
    .map(function ({ title, url }) {
      let score = levenshteinDistance(threadTitle, normalize(title), false);
      // 投稿本文内のURL照合でホスト別の省略規則を重複させない。
      const referenceKeys = getThreadReferenceKeys(url);
      if (referenceKeys.some((key) => resString.includes(key))) {
        score -= 3;
      }
      return { score, title, url };
    })
    .sort((a, b) => a.score - b.score);
  return candidates.slice(0, 5);
}
