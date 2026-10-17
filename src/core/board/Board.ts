import {
  BoardParser,
  type BoardThread as CanonicalBoardThread,
  buildConditionalRequestHeaders,
  ChURL,
  getBoardFetchInfo,
  getBoardNetwork,
  resolveBoardRedirectUrl,
} from "packages/chlib/src/index";
import { createLogger } from "src/app/logger";
import { platform } from "src/app/platform";
import { runBoardRequest } from "src/core/board/board-request";
import { chServerMoveDetect } from "src/core/board/ch-server-move-detect";
import { Response } from "src/core/network/HTTP";
import type { CorePorts } from "src/core/ports/registry";

const logger = createLogger("core/board");

// 変更理由: 5ch/2ch.scのホスト名判定をcoreへ複製せず、通信条件だけを意味分類で選ぶ。

// JSDocの型情報をTypeScriptに変換。subject parserの基本形はchlibを正とし、
// NG／表示状態だけをChlens側のBoard projectionとして追加する。
type BoardThread = CanonicalBoardThread & {
  ng?: unknown;
  demoted?: unknown;
  highlight?: unknown;
  isNet?: boolean | null;
};

interface BoardResponse {
  status: "success" | "error";
  message?: string | null;
  data: BoardThread[] | null;
}

/**
 * 板（スレ一覧）を取得・解析するクラス
 */
/** 板の取得・解析に必要なサービス。省略時は登録済みのサービスを使う（window.app.Board の互換）。 */
export type BoardDeps = Pick<
  CorePorts,
  "bbsMenu" | "bookmark" | "cache" | "message" | "ng" | "util"
>;

export default class Board {
  url: ChURL;
  thread: BoardThread[] | null = null;
  message: string | null = null;
  // subject不在をdat落ちと扱う前に、一覧が正常な取得結果か確認する。
  subjectListVerified = false;

  constructor(
    url: string | ChURL,
    private readonly deps: BoardDeps,
  ) {
    this.url = url instanceof ChURL ? url : new ChURL(url);
  }

  /**
   * 板のスレ一覧を取得して解析します
   */
  get(forceUpdate = false): Promise<void> {
    this.subjectListVerified = false;
    const tmp = getBoardFetchInfo(this.url);
    if (!tmp) {
      return Promise.reject(new Error("取得方法が不明な板です"));
    }
    const { path: xhrPath, charset: xhrCharset } = tmp;

    return new Promise((resolve, reject) => {
      void (async () => {
        let bookmark;
        let newBoardUrl: string | undefined;
        let response: Response | undefined;
        let thread;
        let threadList: BoardThread[] | null | undefined;
        let hasCache = false;

        // キャッシュ取得
        const cache = this.deps.cache.getCache(xhrPath);

        let needFetch = false;
        try {
          await cache.get();
          hasCache = true;
          // 通常の一覧表示では短時間キャッシュを使うが、スレッド更新からの確認では
          // subject.txtの変更を取りこぼさないよう、条件付きGETを必ず実行する。
          if (forceUpdate || !(Date.now() - cache.lastUpdated < 1000 * 3)) {
            throw new Error("キャッシュの期限が切れているため通信します");
          }
        } catch {
          needFetch = true;
        }

        try {
          if (needFetch) {
            // 条件付きGETリクエストの設定
            const headers = buildConditionalRequestHeaders({
              hasCache,
              lastModified: cache.lastModified,
              etag: cache.etag,
            });

            const httpResponse = await runBoardRequest(xhrPath, () =>
              platform.http.fetch(xhrPath, {
                method: "GET",
                mimeType: `text/plain; charset=${xhrCharset}`,
                headers,
              }),
            );
            // HttpResponseをResponseに変換
            response = new Response(
              httpResponse.status,
              httpResponse.headers,
              httpResponse.body,
              httpResponse.url,
            );
          }

          // サーバー移転判定
          // 2chで自動移動しているときはサーバー移転
          // 変更理由: responseURLから板URLを作る形式解析はchlibへ移し、移転検知は取得結果だけで判断する。
          if (
            response != null &&
            getBoardNetwork(this.url) === "5ch" &&
            response.responseURL != null
          ) {
            newBoardUrl = resolveBoardRedirectUrl(this.url, response.responseURL) ?? undefined;
          }
          if (newBoardUrl != null) {
            throw { response, newBoardUrl };
          }

          // レスポンスボディの処理とパース
          if (response?.status === 200) {
            if (response.body == null) {
              // レスポンスボディが空の場合はキャッシュを使用
              if (hasCache && cache.data) {
                threadList = Board.parse(this.url, cache.data, this.deps);
              } else {
                throw new Error("レスポンスボディが空です");
              }
            } else {
              threadList = Board.parse(this.url, response.body, this.deps);
            }
          } else if (hasCache && cache.data) {
            threadList = Board.parse(this.url, cache.data, this.deps);
          }

          if (threadList == null) {
            throw { response };
          }

          // ステータスコードの検証
          if (
            response?.status !== 200 &&
            response?.status !== 304 &&
            // ネットワーク応答が無くても、キャッシュから一覧を復元できた場合は成功扱いにする。
            // （戻る遷移などで3秒以内キャッシュを読むケースで誤ってエラー化しないため）
            !hasCache
          ) {
            throw { response, threadList };
          }

          // 成功時の処理
          this.thread = threadList;
          // 変更理由: HTTP失敗時に残った一覧キャッシュを「現在も不在」と誤判定しない。
          this.subjectListVerified =
            !needFetch ||
            response?.status === 304 ||
            (response?.status === 200 && response.body != null);
          resolve();

          // キャッシュ更新処理
          if (response?.status === 200) {
            cache.data = response.body;
            cache.lastUpdated = Date.now();

            const lastModified = new Date(response.headers["Last-Modified"] || "dummy").getTime();

            if (Number.isFinite(lastModified)) {
              cache.lastModified = lastModified;
            }

            const etag = response.headers["ETag"];
            if (etag) {
              cache.etag = etag;
            }

            await cache.put();

            // ブックマークのレス数を更新
            for (thread of threadList) {
              this.deps.bookmark.updateResCount(thread.url, thread.resCount);
            }
          } else if (hasCache && response?.status === 304) {
            // 304 Not Modifiedの場合、最終更新時刻のみ更新
            cache.lastUpdated = Date.now();
            await cache.put();
          }
        } catch (error: unknown) {
          logger.error("Board GET error:", error);

          // エラーの詳細を取得
          const errorObj = error as Record<string, unknown>;
          response = (errorObj.response as Response) || response;
          threadList = (errorObj.threadList as BoardThread[]) || threadList;
          newBoardUrl = (errorObj.newBoardUrl as string) || newBoardUrl;

          this.message = "板の読み込みに失敗しました。";

          // サーバー移転の検出試行
          if (newBoardUrl != null && getBoardNetwork(this.url.url) === "5ch") {
            try {
              newBoardUrl = (await chServerMoveDetect(this.url, this.deps)).href;
              this.message += `\
サーバーが移転しています
(<a href="${this.deps.util.escapeHtml(this.deps.util.safeHref(newBoardUrl))}"
class="open_in_rcrx">${this.deps.util.escapeHtml(newBoardUrl)}
</a>)\
`;
            } catch {
              // サーバー移転検出失敗
            }
          } else if (getBoardNetwork(this.url.url) === "5ch" && response != null) {
            try {
              newBoardUrl = (await chServerMoveDetect(this.url, this.deps)).href;
              this.message += `\
サーバーが移転している可能性が有ります
(<a href="${this.deps.util.escapeHtml(this.deps.util.safeHref(newBoardUrl))}"
class="open_in_rcrx">${this.deps.util.escapeHtml(newBoardUrl)}
</a>)\
`;
            } catch {
              // サーバー移転検出失敗
            }

            if (hasCache && threadList != null) {
              this.message += "キャッシュに残っていたデータを表示します。";
            }

            if (threadList) {
              this.thread = threadList;
            }
          } else {
            if (hasCache && threadList != null) {
              this.message += "キャッシュに残っていたデータを表示します。";
            }

            if (threadList != null) {
              this.thread = threadList;
            }
          }
          reject();
        }

        // dat落ちスキャン
        // 変更理由: 通信失敗時に表示用で残した古い一覧から、ブックマークやThreadのexpiredを誤更新しない。
        if (!this.subjectListVerified) {
          return;
        }
        if (!threadList || threadList.length === 0) {
          return;
        }

        const dict: Record<string, boolean> = {};
        const bookmarks = this.deps.bookmark.getByBoard(this.url.url.href) ?? [];
        for (bookmark of bookmarks) {
          if (bookmark.type === "thread") {
            dict[bookmark.url] = true;
          }
        }

        // 存在するスレッドをマーク
        for (thread of threadList) {
          if (thread.url in dict) {
            dict[thread.url] = false;
            this.deps.bookmark.updateExpired(thread.url, false);
          }
        }

        // dat落ちしたスレッドをマーク
        for (const threadUrl in dict) {
          const val = dict[threadUrl];
          if (val) {
            this.deps.bookmark.updateExpired(threadUrl, true);
          }
        }
      })();
    });
  }

  /**
   * 板のスレ一覧を取得する（静的メソッド）
   */
  static async get(url: string, deps: BoardDeps): Promise<BoardResponse> {
    const board = new Board(url, deps);
    try {
      await board.get();
      return { status: "success", data: board.thread };
    } catch {
      return {
        status: "error",
        message: board.message ?? null,
        data: board.thread ?? null,
      };
    }
  }

  /**
   * 板のテキストをパースして、スレ一覧を取得します
   */
  static parse(url: ChURL, text: string, deps: BoardDeps): BoardThread[] | null {
    const scFlg = getBoardNetwork(url.url) === "2ch-sc";
    const threads = BoardParser.parse(url, text);

    // nullチェック
    if (!threads || threads.length === 0) {
      return null;
    }

    return threads.map((thread: BoardThread) => {
      const ngResult = deps.ng.isNGBoard(thread.title, url.url.href, thread.resCount);
      // 変更理由: hide / collapse / highlight を型名の推測ではなくDSL actionで分離する。
      const highlight =
        ngResult?.action === "highlight" ||
        ngResult?.type === "HighlightTitle" ||
        ngResult?.type === "RegExpHighlightTitle";
      const demoted = ngResult?.action === "collapse";

      return {
        ...thread,
        ng: highlight || demoted ? null : ngResult,
        demoted: demoted ? ngResult : null,
        highlight: highlight ? ngResult : null,
        isNet: scFlg ? !thread.title.startsWith("★") : null,
      };
    });
  }

  /**
   * キャッシュからスレッドのレス数を取得します
   */
  static async getCachedResCount(
    threadUrl: string,
    deps: BoardDeps,
    { forceUpdate = false }: { forceUpdate?: boolean } = {},
  ): Promise<{ resCount: number; modified: number }> {
    // ChURLのメソッドを呼び出すために、threadUrlをChURLに変換
    const chUrl = new ChURL(threadUrl);
    const boardUrl = chUrl.toBoard?.();
    if (!boardUrl) {
      throw new Error("スレッドURLの形式が不正です");
    }

    const xhrInfo = getBoardFetchInfo(boardUrl);
    if (!xhrInfo) {
      throw new Error("その板の取得方法の情報が存在しません");
    }

    const cache = deps.cache.getCache(xhrInfo.path);
    let cachedThreads: BoardThread[] | null = null;
    try {
      await cache.get();
      cachedThreads = cache.data == null ? null : Board.parse(boardUrl, cache.data, deps);
    } catch (error) {
      // 変更理由: URLを直接開いた場合などは板キャッシュがない。ここで終了すると
      // subject.txtを一度も確認できず、dat落ちによる自動更新停止を取りこぼす。
      logger.error("スレッド存在確認用の板キャッシュを取得できませんでした:", error);
    }

    let threads: BoardThread[] = cachedThreads ?? [];

    const findThread = () => threads.find(({ url }) => new ChURL(url).url.href === chUrl.url.href);
    let thread = findThread();

    // 変更理由: 更新操作中はキャッシュに対象スレが残っていてもdat落ちしている
    // 可能性があるため、一覧の存在確認自体を最新subject.txtへ更新してから行う。
    // 通常表示では通信を増やさず、従来どおりキャッシュ上のレス数を利用する。
    if (forceUpdate || !thread) {
      const board = new Board(boardUrl, deps);
      // 変更理由: キャッシュが未取得・解析不能なら短時間キャッシュも使わず、
      // 最新一覧の取得に成功してから存在／不在を判断する。
      await board.get(forceUpdate || cachedThreads == null);
      if (!board.thread) {
        throw new Error("No refreshed board data");
      }
      if (!board.subjectListVerified) {
        // 変更理由: stale cache を使った通信失敗では、対象スレの不在を確認できたとは限らない。
        throw new Error("板のスレ一覧を確認できませんでした");
      }
      threads = board.thread;
      thread = findThread();
    }

    if (thread) {
      return {
        resCount: thread.resCount,
        modified: cache.lastModified ?? Date.now(),
      };
    }

    throw new Error("板のスレ一覧にそのスレが存在しません");
  }
}
