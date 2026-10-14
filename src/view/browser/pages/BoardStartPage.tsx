import React from "react";
import { getBoardUrlKey, normalizeBoardUrl } from "src/core/board/BoardUrlNormalizer";
import { OPENED_BOARDS_CONFIG_KEY, parseOpenedBoardEntries } from "src/core/board/OpenedBoards";
import { container } from "src/service-container/index";
import { PageTypeIcon } from "src/view/browser/components/PageTypeIcon";
import { isResolvedBoardTitle } from "src/view/browser/pages/board-list/board-list-utils";
import { FavoriteBoardsSection } from "src/view/browser/pages/FavoriteBoardsSection";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import { Alert } from "src/view/browser/ui/Alert";
import { Button } from "src/view/browser/ui/Button";
import { Spinner } from "src/view/browser/ui/Spinner";
import { getBoardUrlFromThreadUrl } from "src/view/browser/utils/link-routing";

interface RecentBoard {
  boardUrl: string;
  boardTitle: string;
  lastVisited: number;
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function domainOf(boardUrl: string): string {
  try {
    return new URL(boardUrl).hostname;
  } catch {
    return "";
  }
}
function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

type BoardGroupKey = "today" | "yesterday" | "older";

function groupKeyOf(lastVisited: number, todayStart: number): BoardGroupKey {
  if (lastVisited >= todayStart) {
    return "today";
  }
  if (lastVisited >= todayStart - 24 * 60 * 60 * 1000) {
    return "yesterday";
  }
  return "older";
}

const GROUP_LABELS: Record<BoardGroupKey, string> = {
  today: "今日",
  yesterday: "昨日",
  older: "それ以前",
};

// すべてのタブで同じホームを使い、お気に入り板と最近開いた板の入口をまとめる。
export const BoardStartPage: React.FC<{ intro: React.ReactNode }> = ({ intro }) => {
  const { dispatch, viewPage } = useTabStore();
  const [boards, setBoards] = React.useState<RecentBoard[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let revision = 0;
    // 変更理由: この非同期処理は内部で失敗を表示用状態へ変換して処理するため、呼び出し側で待たないことを明示する。
    const loadBoards = async () => {
      const requestRevision = ++revision;
      setError(null);
      try {
        const records = await container.history.getAll();
        // 旧スレ履歴も残しつつ、板だけを開いた日時と解決済みの表示名を板単位で統合する。
        const grouped = new Map<string, RecentBoard>();
        const addBoard = (rawUrl: string, boardTitle: string, date: number) => {
          const boardUrl = normalizeBoardUrl(rawUrl);
          const key = getBoardUrlKey(rawUrl);
          if (!boardUrl || !key) return;
          const existing = grouped.get(key);
          if (existing) {
            if (date > existing.lastVisited) {
              existing.boardUrl = boardUrl;
              existing.lastVisited = date;
            }
            if (isResolvedBoardTitle(boardUrl, boardTitle)) existing.boardTitle = boardTitle;
          } else {
            grouped.set(key, { boardUrl, boardTitle: boardTitle || boardUrl, lastVisited: date });
          }
        };
        for (const record of Array.isArray(records) ? records : []) {
          const threadUrl = normalizeString(record.url);
          if (!threadUrl) {
            continue;
          }
          const boardUrl = getBoardUrlFromThreadUrl(threadUrl);
          if (!boardUrl || boardUrl === threadUrl) {
            continue;
          }
          const date = typeof record.date === "number" ? record.date : 0;
          addBoard(boardUrl, normalizeString(record.boardTitle), date);
        }
        for (const entry of parseOpenedBoardEntries(
          container.config.get(OPENED_BOARDS_CONFIG_KEY),
        )) {
          addBoard(entry.url, entry.title ?? "", entry.lastVisited ?? 0);
        }
        const recentBoards = [...grouped.values()]
          .sort((a, b) => b.lastVisited - a.lastVisited)
          .slice(0, 100);
        // 保存済み板一覧の読み込みが遅くても、開いた日時の反映や他の板への移動は待たせない。
        if (!cancelled && revision === requestRevision) {
          setBoards(recentBoards);
          setLoading(false);
        }
        // 板キーしかない旧履歴も手元の情報で補完し、表示・再読込・F5では通信しない。
        const cachedTitles = recentBoards.some(
          (board) => !isResolvedBoardTitle(board.boardUrl, board.boardTitle),
        )
          ? await container.boardTitle.getCachedTitles()
          : new Map<string, string>();
        const titledBoards = recentBoards.map((board) => {
          if (isResolvedBoardTitle(board.boardUrl, board.boardTitle)) return board;
          const title = cachedTitles.get(getBoardUrlKey(board.boardUrl)!);
          return title && isResolvedBoardTitle(board.boardUrl, title)
            ? { ...board, boardTitle: title }
            : board;
        });
        // 連続通知で古い読み込みが後から完了しても、最新の閲覧日時を巻き戻さない。
        if (!cancelled && revision === requestRevision) {
          setBoards(titledBoards);
        }
      } catch (e) {
        console.error("最近開いた板の読み込みに失敗しました", e);
        if (!cancelled && revision === requestRevision) {
          setError(e instanceof Error ? e.message : "最近開いた板の読み込みに失敗しました");
        }
      } finally {
        if (!cancelled && revision === requestRevision) {
          setLoading(false);
        }
      }
    };
    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (key === OPENED_BOARDS_CONFIG_KEY || key === "other_board_titles" || key === "bbsmenu")
        void loadBoards();
    };
    const handleHistoryUpdated = () => {
      void loadBoards();
    };
    // ホームは非表示でもマウントされるため、保存通知と前面復帰の両方で一覧を再同期する。
    container.message.on("config_updated", handleConfigUpdated);
    container.message.on("history_updated", handleHistoryUpdated);
    // 他の画面で取得・保存された板名だけを取り込み、ホームからの追加取得は行わない。
    container.message.on("bbs_menu_updated", handleHistoryUpdated);
    container.message.on("bookmark_updated", handleHistoryUpdated);
    void loadBoards();
    return () => {
      cancelled = true;
      container.message.off("config_updated", handleConfigUpdated);
      container.message.off("history_updated", handleHistoryUpdated);
      container.message.off("bbs_menu_updated", handleHistoryUpdated);
      container.message.off("bookmark_updated", handleHistoryUpdated);
    };
  }, [viewPage.type]);

  // 変更理由: 日付は項目ごとではなく、画像のセッション一覧のように日別セクションで分ける。
  const grouped = React.useMemo(() => {
    const todayStart = startOfDay(Date.now());
    const groups: Record<BoardGroupKey, RecentBoard[]> = {
      today: [],
      yesterday: [],
      older: [],
    };
    for (const board of boards) {
      groups[groupKeyOf(board.lastVisited, todayStart)].push(board);
    }
    return (Object.keys(groups) as BoardGroupKey[])
      .filter((key) => groups[key].length > 0)
      .map((key) => ({ key, label: GROUP_LABELS[key], items: groups[key] }));
  }, [boards]);

  const openBoard = React.useCallback(
    (board: RecentBoard, background = false) => {
      const page = {
        type: "threadList" as const,
        title: board.boardTitle,
        boardUrl: board.boardUrl,
        boardTitle: board.boardTitle,
      };
      // ホームで選んだ板は同じタブで開き、中クリックだけは背景タブへ送る。
      if (!background) {
        dispatch(tabActions.navigate(page));
        return;
      }
      dispatch(tabActions.openInNewTab(page, { background }));
    },
    [dispatch],
  );

  const boardListLink = (
    <Button
      className="home-tab-page__link"
      variant="subtle"
      onClick={() => {
        // ホームも板一覧も通常タブの中で扱い、別のホームタブへ操作を転送しない。
        dispatch(tabActions.navigate({ type: "boardList", title: "板一覧" }));
      }}
    >
      <PageTypeIcon type="boardList" />
      板一覧を開く
    </Button>
  );

  return (
    <div className="home-tab-page">
      {intro}
      {boardListLink}
      <FavoriteBoardsSection />
      <section className="home-tab-page__section">
        {/* 区画名・日付・板の順に階層を分け、日付が最近開いた板に属することを示す。 */}
        <h2 className="home-tab-page__section-heading">最近開いた板</h2>
        <div className="home-tab-page__section-content">
          {/* 履歴の取得に失敗しても、お気に入り板と板一覧の入口は使えるようにする。 */}
          {loading ? (
            <div className="home-tab-page__status">
              <Spinner size="xs" />
              <span>最近開いた板を読み込み中...</span>
            </div>
          ) : error ? (
            <Alert className="home-tab-page__alert" color="red" title="読み込みエラー">
              {error}
            </Alert>
          ) : boards.length === 0 ? (
            <div className="home-tab-page__empty">最近開いた板はまだありません。</div>
          ) : (
            grouped.map((group) => (
              <div key={group.key} className="home-tab-page__date-group">
                {group.label ? (
                  <h3 className="home-tab-page__date-heading">{group.label}</h3>
                ) : null}
                <div className="home-tab-page__list">
                  {group.items.map((board) => (
                    <Button
                      key={board.boardUrl}
                      className="home-tab-page__link home-tab-page__link--board"
                      variant="subtle"
                      onClick={() => openBoard(board)}
                      onMouseDown={(event) => {
                        if (event.button === 1) {
                          // 変更理由: ブラウザーは中ボタンのmousedownでオートスクロールを始めるため、
                          // 後続のauxclickで背景タブを開く前に既定動作を止める。
                          event.preventDefault();
                        }
                      }}
                      onAuxClick={(event) => {
                        if (event.button !== 1) return;
                        // 中クリックは背景タブで開き、既定動作による二重処理を防ぐ。
                        event.preventDefault();
                        event.stopPropagation();
                        openBoard(board, true);
                      }}
                      title={`${board.boardTitle}\n${board.boardUrl}`}
                    >
                      <span className="home-tab-page__link-title">{board.boardTitle}</span>
                      {domainOf(board.boardUrl) ? (
                        <span className="home-tab-page__link-domain">
                          {domainOf(board.boardUrl)}
                        </span>
                      ) : null}
                    </Button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
