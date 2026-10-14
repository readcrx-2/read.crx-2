import {
  ChURL,
  createBoardTitleRequest,
  formatBoardTitleForUrl,
  resolveBoardTitle,
} from "packages/chlib/src/index";
import { defer } from "src/app/Defer";
import { getBoardUrlKey } from "src/core/board/BoardUrlNormalizer";
import { Request } from "src/core/network/HTTP";
import type { IBBSMenuResult } from "src/core/ports/bbs-menu";
import { corePorts } from "src/core/ports/registry";

const isSavedTitleResolved = (title: string | null, boardUrl: string): title is string => {
  if (!title?.trim()) return false;
  // 「その他」のURLや旧履歴の板キーは仮の名前。選択した板の名前取得を妨げない。
  return (
    getBoardUrlKey(title) !== getBoardUrlKey(boardUrl) &&
    title !== createBoardTitleRequest(boardUrl)?.fallbackTitle
  );
};

export const getCachedTitles = async (): Promise<Map<string, string>> => {
  // 一覧の表示だけで全板のSETTING.TXTを取得しないよう、通信可能なaskとは入口を分ける。
  const titles = new Map<string, string>();
  const addTitle = (url: string, title: string) => {
    const key = getBoardUrlKey(url);
    if (key && isSavedTitleResolved(title, url)) titles.set(key, title);
  };
  const cached = await corePorts.bbsMenu.getCached();
  for (const menu of cached.menu ?? []) {
    for (const category of menu.categories) {
      for (const board of category.boards) addTitle(board.url, board.name);
    }
  }
  const rawTitles = corePorts.config.get("other_board_titles");
  if (rawTitles) {
    try {
      const parsed: unknown = JSON.parse(rawTitles);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [url, title] of Object.entries(parsed)) {
          if (typeof title === "string") addTitle(url, title);
        }
      }
    } catch (error) {
      console.error("保存済みの板名を読み込めませんでした", error);
    }
  }
  // 変更理由: corePorts.bookmark は未登録時に値を返さず例外を投げるため、存在確認の if は
  // 常に真か例外のどちらかにしかならない。呼び出し元は app.boot 後の画面だけなので、
  // 登録済みを前提に直接参照し、誤解を招く判定を置かない。
  const bookmark = corePorts.bookmark;
  // 初回のローカル読み取りを待ち、起動直後も保存済みのお気に入り名を使う。
  try {
    await bookmark.promiseFirstScan;
  } catch (error) {
    console.error("お気に入りの初回読み込みに失敗しました", error);
  }
  for (const board of bookmark.getAllBoards()) {
    addTitle(board.url, _formatBoardTitle(board.title, new ChURL(board.url)));
  }
  return titles;
};

// 旧形式 (menu?: {board: []}[]) を表すローカル interface 群は実際のデータ構造
// (menu?: ParsedBBSMenu[] = categories/boards 形式) と食い違っていたため削除し、
// サービスコンテナの板一覧サービスの型をそのまま使う。
let _bbsmenu: Map<string, string> | null = null;
let _bbsmenuPromise: Promise<void> | null = null;

const _generateBBSMenu = ({ status, menu, message }: IBBSMenuResult): void => {
  if (status === "error") {
    void (async () => {
      await defer();
      corePorts.message.send("notify", {
        message,
        background_color: "red",
      });
    })();
  }

  if (menu == null) {
    throw new Error("板一覧が取得できませんでした");
  }

  const bbsmenu = new Map<string, string>();
  for (const item of menu) {
    for (const category of item.categories) {
      for (const board of category.boards) {
        bbsmenu.set(board.url, board.name);
      }
    }
  }
  _bbsmenu = bbsmenu;
};

const _setBBSMenu = async (): Promise<void> => {
  const obj = await corePorts.bbsMenu.get();
  _generateBBSMenu(obj);
  // 意図: 板一覧の更新通知を購読してキャッシュMapを常に最新に保つ。
  corePorts.bbsMenu.onChange.add((updatedObj) => {
    _generateBBSMenu(updatedObj);
  });
};

const _getBBSMenu = async (): Promise<Map<string, string>> => {
  if (_bbsmenu != null) {
    return _bbsmenu;
  }

  if (_bbsmenuPromise != null) {
    await _bbsmenuPromise;
  } else {
    _bbsmenuPromise = _setBBSMenu();
    await _bbsmenuPromise;
    _bbsmenuPromise = null;
  }

  if (_bbsmenu == null) {
    throw new Error("板一覧が初期化されていません");
  }

  return _bbsmenu;
};

const searchFromBBSMenu = async (url: ChURL): Promise<string | null> => {
  const bbsmenu = await _getBBSMenu();
  // スキーム違いでも同じ板を引けるようにトグルURLを併用する。
  const url2 = url.createProtocolToggled();
  const title = bbsmenu.get(url.href) ?? bbsmenu.get(url2.href) ?? null;
  return isSavedTitleResolved(title, url.href) ? title : null;
};

const _formatBoardTitle = (title: string, url: ChURL): string => {
  // 変更理由: 掲示板ごとの表示名規則をタイトル管理側へ重複させない。
  return formatBoardTitleForUrl(title, url.href);
};

const searchFromBookmark = (url: ChURL): string | null => {
  const url2 = url.createProtocolToggled();
  const bookmark = corePorts.bookmark.get(url.href) ?? corePorts.bookmark.get(url2.href);
  if (bookmark == null) {
    return null;
  }

  const title = _formatBoardTitle(bookmark.title, new ChURL(bookmark.url));
  return isSavedTitleResolved(title, url.href) ? title : null;
};

const searchFromBoardTitleRequest = async (url: ChURL): Promise<string | null> => {
  const request = createBoardTitleRequest(url.href);
  if (!request) return null;

  const charset = request.charset === "shift_jis" ? "Shift_JIS" : "EUC-JP";
  const { status, body } = await new Request("GET", request.url, {
    mimeType: `text/plain; charset=${charset}`,
    timeout: 1000 * 10,
  }).send();

  if (status !== 200) {
    throw new Error("板名を取得する通信に失敗しました");
  }

  return resolveBoardTitle(request, body);
};

export const ask = async (url: ChURL): Promise<string | null> => {
  let name = await searchFromBBSMenu(url);
  if (name != null) {
    return name;
  }

  name = searchFromBookmark(url);
  if (name != null) {
    return name;
  }

  try {
    return await searchFromBoardTitleRequest(url);
  } catch (e) {
    throw new Error(`板名の取得に失敗しました: ${String(e)}`, { cause: e });
  }
};

// コマンドなどURL文字列しか持たない呼び出し元が、旧URLクラスの生成責務を
// 重複して持たずに板名解決を再実行できる入口。
export const askByUrl = async (boardUrl: string): Promise<string | null> =>
  ask(new ChURL(boardUrl));
