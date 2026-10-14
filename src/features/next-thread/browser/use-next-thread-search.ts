import { type Dispatch, useCallback, useEffect, useRef, useState } from "react";
import { log } from "src/app/Log";
import {
  findNextThreadCandidates,
  findSimilarThreadCandidates,
  type ThreadSearchCandidate,
} from "src/features/next-thread/browser/next-thread-search";
import { container } from "src/service-container/index";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import type { ScopedTabAction } from "src/view/browser/state/tabs/use-tab-store";
import type { Page } from "src/view/browser/types";
import { getBoardUrlFromThreadUrl } from "src/view/browser/utils/link-routing";

export type NextThreadSearchStatus = "idle" | "searching" | "ready" | "error";
export type ThreadSearchType = "next" | "similar";

export interface NextThreadSearchState {
  status: NextThreadSearchStatus;
  searchType?: ThreadSearchType;
  sourceThread: Pick<ThreadSearchCandidate["thread"], "title" | "url"> | null;
  candidates: readonly ThreadSearchCandidate[];
  boardMessage: string | null;
  error: string | null;
}

interface UseNextThreadSearchOptions {
  viewPage: Page;
  isActive: boolean;
  keepAutoRefresh: boolean;
  dispatch: Dispatch<ScopedTabAction>;
}

const IDLE_STATE: NextThreadSearchState = {
  status: "idle",
  searchType: "next",
  sourceThread: null,
  candidates: [],
  boardMessage: null,
  error: null,
};

function getErrorMessage(error: unknown, searchType: ThreadSearchType): string {
  return error instanceof Error
    ? error.message
    : searchType === "similar"
      ? "類似スレの検索に失敗しました"
      : "次スレ候補の検索に失敗しました";
}

export function useNextThreadSearch({
  viewPage,
  isActive,
  keepAutoRefresh,
  dispatch,
}: UseNextThreadSearchOptions): {
  state: NextThreadSearchState;
  searchNextThread: () => Promise<void>;
  searchSimilarThreads: () => Promise<void>;
  close: () => void;
  selectCandidate: (candidate: ThreadSearchCandidate) => void;
} {
  const [state, setState] = useState<NextThreadSearchState>(IDLE_STATE);
  const requestIdRef = useRef(0);

  const close = useCallback(() => {
    // 変更理由: ダイアログを閉じた後に遅れて返ったsubject.txtの結果で、
    // 新しい検索状態を上書きしないようリクエスト世代を進める。
    requestIdRef.current += 1;
    setState(IDLE_STATE);
  }, []);

  const searchThreads = useCallback(
    async (searchType: ThreadSearchType) => {
      if (viewPage.type !== "thread") {
        return;
      }

      const sourceThread = {
        title: viewPage.title,
        url: viewPage.threadUrl,
      };
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setState({
        status: "searching",
        searchType,
        sourceThread,
        candidates: [],
        boardMessage: null,
        error: null,
      });

      try {
        const boardUrl = getBoardUrlFromThreadUrl(sourceThread.url);
        const result = await container.board.getThreads(boardUrl);
        if (requestIdRef.current !== requestId) {
          return;
        }

        // 次スレ検索は積極判定を一覧表示し、類似スレ検索は後続条件なしでタイトルの近さを並べる。
        const candidates =
          searchType === "next"
            ? findNextThreadCandidates(result.threads, sourceThread, { mode: "aggressive" })
            : findSimilarThreadCandidates(result.threads, sourceThread);
        setState({
          status: "ready",
          searchType,
          sourceThread,
          candidates,
          boardMessage: result.threads.length === 0 ? result.message : null,
          error: null,
        });
      } catch (error) {
        if (requestIdRef.current !== requestId) {
          return;
        }

        const message = getErrorMessage(error, searchType);
        // 手動検索はコマンド以外からも呼べるため、失敗理由をここで記録して追跡可能にする。
        log(
          "error",
          searchType === "similar"
            ? "手動類似スレ検索に失敗しました"
            : "手動次スレ検索に失敗しました",
          {
            error,
            searchType,
            threadUrl: sourceThread.url,
          },
        );
        setState({
          status: "error",
          searchType,
          sourceThread,
          candidates: [],
          boardMessage: null,
          error: message,
        });
        throw error;
      }
    },
    [viewPage],
  );

  const searchNextThread = useCallback(() => searchThreads("next"), [searchThreads]);
  const searchSimilarThreads = useCallback(() => searchThreads("similar"), [searchThreads]);

  useEffect(() => {
    if (state.sourceThread == null) {
      return;
    }
    if (isActive && viewPage.type === "thread" && viewPage.threadUrl === state.sourceThread.url) {
      return;
    }

    // ペイン切替やページ遷移後に古い候補を再表示・適用しないよう、表示も検索も破棄する。
    requestIdRef.current += 1;
    setState(IDLE_STATE);
  }, [isActive, state.sourceThread, viewPage]);

  const selectCandidate = useCallback(
    (candidate: ThreadSearchCandidate) => {
      const sourceThread = state.sourceThread;
      if (
        sourceThread == null ||
        viewPage.type !== "thread" ||
        viewPage.threadUrl !== sourceThread.url
      ) {
        close();
        return;
      }

      dispatch(
        tabActions.followNextThread(
          {
            type: "thread",
            title: candidate.thread.title,
            threadUrl: candidate.thread.url,
          },
          { keepAutoRefresh },
        ),
      );
      setState(IDLE_STATE);
    },
    [close, dispatch, keepAutoRefresh, state.sourceThread, viewPage],
  );

  return { state, searchNextThread, searchSimilarThreads, close, selectCandidate };
}
