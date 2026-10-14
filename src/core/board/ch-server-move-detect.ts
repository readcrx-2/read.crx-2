import {
  ChURL,
  extractBoardServerInfo,
  getBoardNetwork,
  resolveBoardMoveUrl,
} from "packages/chlib/src/index";
import { Request } from "src/core/network/HTTP";
import { corePorts } from "src/core/ports/registry";

/** 2ch系サーバーの移転を調べ、見つかった移転先の板URLを返す。 */
export async function chServerMoveDetect(
  oldBoardUrl: ChURL | URL | { url?: URL } | null | undefined,
  html?: string,
): Promise<ChURL> {
  // app URL APIから渡る値もChURLへ揃え、以降の板URL処理を一つの型に統一する。
  let normalizedOldBoardUrl: ChURL;
  if (oldBoardUrl instanceof ChURL) {
    normalizedOldBoardUrl = oldBoardUrl;
  } else if (oldBoardUrl instanceof window.URL) {
    normalizedOldBoardUrl = new ChURL(oldBoardUrl.href);
  } else if (oldBoardUrl != null && oldBoardUrl.url instanceof window.URL) {
    normalizedOldBoardUrl = new ChURL(oldBoardUrl.url.href);
  } else {
    throw new Error("板URLの型が不正です");
  }

  let newBoardUrl: ChURL | undefined;
  normalizedOldBoardUrl.protocol = "http:";
  if (typeof html !== "string") {
    let status: number;
    // キャッシュを使わず最新のHTMLで移転判定する意図を Request の正式な指定で表す。
    ({ status, body: html } = await new Request("GET", normalizedOldBoardUrl.href, {
      mimeType: "text/html; charset=Shift_JIS",
      preventCache: true,
    }).send());
    if (status !== 200) {
      throw new Error("サーバー移転判定のための通信に失敗しました");
    }
  }

  const res = /location\.href="(https?:\/\/[^"]+)"/.exec(html);
  if (res) {
    let redirectedBoardUrl = resolveBoardMoveUrl(normalizedOldBoardUrl, res[1]);
    if (redirectedBoardUrl == null && getBoardNetwork(res[1]) === "5ch") {
      const { responseURL } = await new Request("GET", res[1]).send();
      redirectedBoardUrl = resolveBoardMoveUrl(normalizedOldBoardUrl, res[1], responseURL);
    }
    if (redirectedBoardUrl != null) {
      const candidate = new ChURL(redirectedBoardUrl);
      candidate.protocol = "http:";
      if (candidate.hostname !== normalizedOldBoardUrl.hostname) {
        newBoardUrl = candidate;
      }
    }
  }

  if (newBoardUrl == null) {
    const { menu: data } = await corePorts.bbsMenu.get();
    if (data == null) {
      throw new Error("BBSMenuの取得に失敗しました");
    }
    const sourceInfo = extractBoardServerInfo(normalizedOldBoardUrl.href);
    if (!sourceInfo) throw new Error("板のURL形式が不明です");

    // BBSMenuParserの現在のmenu構造に合わせ、全メニュー・カテゴリ・板を走査する。
    for (const menuDoc of data) {
      for (const category of menuDoc.categories) {
        for (const board of category.boards) {
          const destinationInfo = extractBoardServerInfo(board.url);
          if (
            destinationInfo?.boardName === sourceInfo.boardName &&
            destinationInfo.network === sourceInfo.network
          ) {
            const candidate = new ChURL(board.url);
            candidate.protocol = "http:";
            if (normalizedOldBoardUrl.hostname !== candidate.hostname) {
              newBoardUrl = candidate;
              break;
            }
          }
        }
        if (newBoardUrl != null) break;
      }
      if (newBoardUrl != null) break;
    }
    if (newBoardUrl == null) {
      throw new Error("BBSMenuにその板のサーバー情報が存在しません");
    }
  }

  corePorts.message.send("detected_ch_server_move", {
    before: normalizedOldBoardUrl.href,
    after: newBoardUrl.href,
  });
  return newBoardUrl;
}
