import React from "react";
import {
  BookmarkContextMenu,
  type BookmarkContextMenuState,
} from "src/features/bookmark/ui/BookmarkContextMenu";
import { container } from "src/service-container/index";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import { Alert } from "src/view/browser/ui/Alert";
import { Button } from "src/view/browser/ui/Button";
import { Spinner } from "src/view/browser/ui/Spinner";

interface FavoriteBoard {
  url: string;
  title: string;
}

interface RawBoardBookmark {
  url?: unknown;
  title?: unknown;
  boardTitle?: unknown;
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

async function readFavoriteBoards(): Promise<FavoriteBoard[]> {
  // window.app ではなくサービスコンテナから読む（legacy-window-app-plan の Phase 2）。
  await container.bookmark.ready();
  // 保存されている値の形は信用せず、下で1件ずつ確かめるため unknown として扱う。
  const rawBoards: unknown[] = container.bookmark.getAllBoards();

  const seenUrls = new Set<string>();
  const favorites: FavoriteBoard[] = [];

  for (const rawEntry of rawBoards) {
    const entry = rawEntry as RawBoardBookmark;
    const url = normalizeString(entry.url);
    if (!url || seenUrls.has(url)) {
      continue;
    }

    seenUrls.add(url);
    favorites.push({
      url,
      title: normalizeString(entry.boardTitle, normalizeString(entry.title, url)),
    });
  }

  return favorites;
}

// 板ツリーの独立画面をなくしてもお気に入りへの入口を失わないよう、ホーム内で表示する。
export const FavoriteBoardsSection: React.FC = () => {
  const { dispatch, viewPage } = useTabStore();
  const [favoriteBoards, setFavoriteBoards] = React.useState<FavoriteBoard[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [contextMenuState, setContextMenuState] =
    React.useState<BookmarkContextMenuState<FavoriteBoard> | null>(null);
  const isActive = viewPage.type === "home";

  React.useEffect(() => {
    // ホームは常時マウントされるため、他のタブへ移った時点で対象板のメニューを閉じる。
    if (!isActive) setContextMenuState(null);
  }, [isActive]);

  const loadFavoriteBoards = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setFavoriteBoards(await readFavoriteBoards());
    } catch (e) {
      console.error("お気に入り板の読み込みに失敗しました", e);
      setError(e instanceof Error ? e.message : "お気に入り板の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadFavoriteBoards();

    const handleBookmarkUpdated = () => {
      // 別の画面で対象が削除・変更された場合、古い板に対するメニュー操作を残さない。
      setContextMenuState(null);
      void loadFavoriteBoards();
    };

    container.message.on("bookmark_updated", handleBookmarkUpdated);
    return () => {
      container.message.off("bookmark_updated", handleBookmarkUpdated);
    };
  }, [loadFavoriteBoards]);

  const openBoard = React.useCallback(
    (board: FavoriteBoard, background = false, forceNewTab = false) => {
      const page = {
        type: "threadList" as const,
        title: board.title,
        boardUrl: board.url,
        boardTitle: board.title,
      };
      // 通常クリックは現在タブ、中クリックと明示的な新規タブ操作だけは別タブで開く。
      if (!background && !forceNewTab) {
        dispatch(tabActions.navigate(page));
        return;
      }
      dispatch(tabActions.openInNewTab(page, { background }));
    },
    [dispatch],
  );

  return (
    <section className="home-tab-page__section">
      {/* 区画名と板項目の所属を見分けられるよう、日付見出しとは別の階層にする。 */}
      <h2 className="home-tab-page__section-heading">お気に入り板</h2>
      <div className="home-tab-page__section-content">
        {loading ? (
          <div className="home-tab-page__status">
            <Spinner size="xs" />
            <span>お気に入り板を読み込み中...</span>
          </div>
        ) : error ? (
          <Alert className="home-tab-page__alert" color="red" title="読み込みエラー">
            {error}
          </Alert>
        ) : (
          <div className="home-tab-page__list">
            {favoriteBoards.length === 0 ? (
              <div className="home-tab-page__empty">お気に入り板はまだありません。</div>
            ) : (
              // 新しいタブは選択の入口に絞り、長い一覧でホームと同じ密度にならないようにする。
              favoriteBoards.map((board) => (
                <Button
                  key={board.url}
                  className="home-tab-page__link"
                  variant="subtle"
                  onClick={() => openBoard(board)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setContextMenuState({ entry: board, x: event.clientX, y: event.clientY });
                  }}
                  onMouseDown={(event) => {
                    if (event.button === 1) {
                      // 変更理由: 中ボタンのmousedownがブラウザーのオートスクロールを起動する前に止め、
                      // auxclickで背景タブを開く操作へつなげる。
                      event.preventDefault();
                    }
                  }}
                  onAuxClick={(event) => {
                    if (event.button !== 1) return;
                    // 変更理由: ミドルクリックは現在のホームを保ったまま板を背景タブで開く。
                    event.preventDefault();
                    event.stopPropagation();
                    openBoard(board, true);
                  }}
                >
                  {board.title}
                </Button>
              ))
            )}
          </div>
        )}
      </div>
      {contextMenuState && isActive ? (
        <BookmarkContextMenu
          x={contextMenuState.x}
          y={contextMenuState.y}
          target={{
            kind: "board",
            url: contextMenuState.entry.url,
            title: contextMenuState.entry.title,
          }}
          // 開く先を利用者が選べるよう、現在タブと新規タブの両方を用意する。
          onOpenCurrentTab={() => openBoard(contextMenuState.entry)}
          onOpenInNewTab={(background) => openBoard(contextMenuState.entry, background, true)}
          onRemoved={(url) =>
            setFavoriteBoards((current) => current.filter((board) => board.url !== url))
          }
          onClose={() => setContextMenuState(null)}
        />
      ) : null}
    </section>
  );
};
