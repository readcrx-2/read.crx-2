import {
  type BoardThread as CanonicalBoardThread,
  getReadStateBoardUrl,
  getReadStateThreadUrl,
} from "packages/chlib/src/index";
import Board from "src/core/board/Board.js";
import type { IBoardResult } from "src/core/ports/board";
import type { IReadState } from "src/core/ports/read-state";
import type { CorePorts } from "src/core/ports/registry";
import type { IThread } from "src/core/ports/thread";

interface BoardGetResult {
  status: "success" | "error";
  message?: string | null;
  data: Array<CanonicalBoardThread & Partial<IThread>> | null;
}

interface BoardLikeUrl {
  href: string;
}

/** 板一覧の組み立てに必要なサービス。呼び出し側が渡す（C-2）。 */
export type BoardServiceDeps = Pick<
  CorePorts,
  "bbsMenu" | "bookmark" | "cache" | "message" | "ng" | "readState" | "util"
>;

export function createBoardService(deps: BoardServiceDeps) {
  return {
    async getThreads(url: string | BoardLikeUrl): Promise<IBoardResult> {
      const urlStr = typeof url === "string" ? url : url.href;
      const result = (await Board.get(urlStr, deps)) as BoardGetResult;
      const { status, message, data } = result;

      if (status === "error" && !data) {
        throw new Error(message || "板の取得に失敗しました");
      }

      const threads = data || [];

      const readStates = await deps.readState.getByBoard(getReadStateBoardUrl(urlStr));
      const readStateMap = new Map<string, IReadState>();
      for (const rs of readStates) {
        readStateMap.set(getReadStateThreadUrl(rs.url), rs);
      }

      const processedThreads = threads.map((thread, index) => {
        const threadUrl = getReadStateThreadUrl(thread.url);
        let readState = readStateMap.get(threadUrl);
        const bookmark = deps.bookmark.get(threadUrl);

        if (bookmark && bookmark.readState) {
          // 意図: readState は bookmark 側の方が新しい場合があるため、比較して新しい方を採用する。
          if (!readState || deps.util.isNewerReadState(readState, bookmark.readState)) {
            readState = bookmark.readState;
          }
        }

        return {
          // BoardParser's canonical subject fields are projected into the legacy service item
          // explicitly; this keeps service-only state from leaking back into chlib.
          // 既読照合キーは表示URLへ流用せず、一覧取得元のHTTP/HTTPSを投稿まで引き継ぐ。
          url: thread.url,
          title: thread.title,
          resCount: thread.resCount,
          createdAt: thread.createdAt,
          ng: thread.ng,
          demoted: thread.demoted,
          highlight: thread.highlight,
          isNet: thread.isNet,
          readState,
          threadNumber: index,
        } as IThread;
      });

      return {
        threads: processedThreads,
        message: status === "error" ? (message ?? null) : null,
      };
    },

    async getCachedResCount(url: string, options?: { forceUpdate?: boolean }): Promise<unknown> {
      return Board.getCachedResCount(url, deps, options);
    },
  };
}
