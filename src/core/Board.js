/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__, or convert again using --optional-chaining
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
import Cache from "./Cache.coffee";
import {isNGBoard} from "./NG.coffee";
import {Request} from "./HTTP.ts";
import {URL} from "./URL.ts";
import {chServerMoveDetect, decodeCharReference, removeNeedlessFromTitle} from "./util.coffee";

/**
@class Board
@constructor
@param {String} url
*/
export default class Board {
  constructor(url) {
    /**
    @property url
    @type String
    */
    this.url = new URL(url);

    /**
    @property thread
    @type Array | null
    */
    this.thread = null;

    /**
    @property message
    @type String | null
    */
    this.message = null;
  }

  /**
  @method get
  @return {Promise}
  */
  get() {
    const tmp = Board._getXhrInfo(this.url);
    if (!tmp) { return Promise.reject(); }
    const {path: xhrPath, charset: xhrCharset} = tmp;

    return new Promise( async (resolve, reject) => {
      let bookmark, newBoardUrl, response, thread, threadList;
      let hasCache = false;

      // キャッシュ取得
      const cache = new Cache(xhrPath);

      let needFetch = false;
      try {
        await cache.get();
        hasCache = true;
        if (!((Date.now() - cache.lastUpdated) < (1000 * 3))) {
          throw new Error("キャッシュの期限が切れているため通信します");
        }
      } catch (error1) {
        needFetch = true;
      }

      try {
        if (needFetch) {
          // 通信
          const request = new Request("GET", xhrPath, {
            mimeType: `text/plain; charset=${xhrCharset}`,
            preventCache: true
          }
          );
          if (hasCache) {
            if (cache.lastModified != null) {
              request.headers["If-Modified-Since"] =
                new Date(cache.lastModified).toUTCString();
            }
            if (cache.etag != null) {
              request.headers["If-None-Match"] = cache.etag;
            }
          }

          response = await request.send();
        }

        // パース
        // 2chで自動移動しているときはサーバー移転
        if (
          (response != null) &&
          (this.url.getTsld() === "5ch.net") &&
          (this.url.hostname !== response.responseURL.split("/")[2])
        ) {
          newBoardUrl = response.responseURL.slice(0, -"subject.txt".length);
          throw {response, newBoardUrl};
        }

        if ((response != null ? response.status : undefined) === 200) {
          threadList = Board.parse(this.url, response.body);
        } else if (hasCache) {
          threadList = Board.parse(this.url, cache.data);
        }

        if (threadList == null) {
          throw {response};
        }
        if (((response != null ? response.status : undefined) !== 200) && ((response != null ? response.status : undefined) !== 304) && (!(response == null) || !hasCache)) {
          throw {response, threadList};
        }

        //コールバック
        this.thread = threadList;
        resolve();

        //キャッシュ更新部
        if ((response != null ? response.status : undefined) === 200) {
          let etag;
          cache.data = response.body;
          cache.lastUpdated = Date.now();

          const lastModified = new Date(
            response.headers["Last-Modified"] || "dummy"
          ).getTime();

          if (Number.isFinite(lastModified)) {
            cache.lastModified = lastModified;
          }

          if (etag = response.headers["ETag"]) {
            cache.etag = etag;
          }

          cache.put();

          for (thread of threadList) {
            app.bookmark.updateResCount(thread.url, thread.resCount);
          }

        } else if (hasCache && ((response != null ? response.status : undefined) === 304)) {
          cache.lastUpdated = Date.now();
          cache.put();
        }

      } catch (error) {
        //コールバック
        ({response, threadList, newBoardUrl} = error);
        this.message = "板の読み込みに失敗しました。";

        if ((newBoardUrl != null) && (this.url.getTsld() === "5ch.net")) {
          try {
            newBoardUrl = (await chServerMoveDetect(this.url)).href;
            this.message += `\
サーバーが移転しています
(<a href="${app.escapeHtml(app.safeHref(newBoardUrl))}"
class="open_in_rcrx">${app.escapeHtml(newBoardUrl)}
</a>)\
`;
          } catch (error2) {}
        //2chでrejectされている場合は移転を疑う
        } else if ((this.url.getTsld() === "5ch.net") && (response != null)) {
          try {
            newBoardUrl = (await chServerMoveDetect(this.url)).href;
            //移転検出時
            this.message += `\
サーバーが移転している可能性が有ります
(<a href="${app.escapeHtml(app.safeHref(newBoardUrl))}"
class="open_in_rcrx">${app.escapeHtml(newBoardUrl)}
</a>)\
`;
          } catch (error3) {}
          if (hasCache && (threadList != null)) {
            this.message += "キャッシュに残っていたデータを表示します。";
          }

          if (threadList) {
            this.thread = threadList;
          }
        } else {
          if (hasCache && (threadList != null)) {
            this.message += "キャッシュに残っていたデータを表示します。";
          }

          if (threadList != null) {
            this.thread = threadList;
          }
        }
        reject();
      }

      // dat落ちスキャン
      if (!threadList) { return; }
      const dict = {};
      for (bookmark of app.bookmark.getByBoard(this.url.href)) {
        if (bookmark.type === "thread") {
          dict[bookmark.url] = true;
        }
      }

      for (thread of threadList) {
        if (dict[thread.url] != null) {
          dict[thread.url] = false;
          app.bookmark.updateExpired(thread.url, false);
        }
      }

      for (let threadUrl in dict) {
        const val = dict[threadUrl];
        if (val) {
          app.bookmark.updateExpired(threadUrl, true);
        }
      }
    });
  }

  /**
  @method get
  @static
  @param {String} url
  @return {Promise}
  */
  static async get(url) {
    const board = new Board(url);
    try {
      await board.get();
      return {status: "success", data: board.thread};
    } catch (error) {
      return {
        status: "error",
        message: board.message != null ? board.message : null,
        data: board.thread != null ? board.thread : null
      };
    }
  }

  /**
  @method _getXhrInfo
  @private
  @static
  @param {app.URL.URL} boardUrl
  @return {Object | null} xhrInfo
  */
  static _getXhrInfo(boardUrl) {
    const tmp = new RegExp(`^/(\\w+)(?:/(\\d+)/|/?)$`).exec(boardUrl.pathname);
    if (!tmp) { return null; }
    switch (boardUrl.getTsld()) {
      case "machi.to":
        return {
          path: `${boardUrl.origin}/bbs/offlaw.cgi/${tmp[1]}/`,
          charset: "Shift_JIS"
        };
      case "shitaraba.net":
        return {
          path: `${boardUrl.protocol}//jbbs.shitaraba.net/${tmp[1]}/${tmp[2]}/subject.txt`,
          charset: "EUC-JP"
        };
      default:
        return {
          path: `${boardUrl.origin}/${tmp[1]}/subject.txt`,
          charset: "Shift_JIS"
        };
    }
  }

  /**
  @method parse
  @static
  @param {app.URL.URL} url
  @param {String} text
  @return {Array | null} board
  */
  static parse(url, text) {
    let baseUrl, bbsType, reg;
    let regRes;
    const tmp = /^\/(\w+)(?:\/(\w+)|\/?)/.exec(url.pathname);
    let scFlg = false;
    switch (url.getTsld()) {
      case "machi.to":
        bbsType = "machi";
        reg = /^\d+<>(\d+)<>(.+)\((\d+)\)$/gm;
        baseUrl = `${url.origin}/bbs/read.cgi/${tmp[1]}/`;
        break;
      case "shitaraba.net":
        bbsType = "jbbs";
        reg = /^(\d+)\.cgi,(.+)\((\d+)\)$/gm;
        baseUrl = `${url.protocol}//jbbs.shitaraba.net/bbs/read.cgi/${tmp[1]}/${tmp[2]}/`;
        break;
      default:
        scFlg = (url.getTsld() === "2ch.sc");
        bbsType = "2ch";
        reg = /^(\d+)\.dat<>(.+) \((\d+)\)$/gm;
        baseUrl = `${url.origin}/test/read.cgi/${tmp[1]}/`;
    }

    const board = [];
    while (regRes = reg.exec(text)) {
      let title = decodeCharReference(regRes[2]);
      title = removeNeedlessFromTitle(title);

      const resCount = +regRes[3];

      board.push({
        url: baseUrl + regRes[1] + "/",
        title,
        resCount,
        createdAt: +regRes[1] * 1000,
        ng: isNGBoard(title, url.href, resCount),
        isNet: scFlg ? !title.startsWith("★") : null
      });
    }

    if (bbsType === "jbbs") {
      board.pop();
    }

    if (board.length > 0) {
      return board;
    }
    return null;
  }

  /**
  @method getCachedResCount
  @static
  @param {String} threadUrl
  @return {Promise}
  */
  static async getCachedResCount(threadUrl) {
    const boardUrl = threadUrl.toBoard();
    const xhrPath = __guard__(Board._getXhrInfo(boardUrl), x => x.path);

    if (xhrPath == null) {
      throw new Error("その板の取得方法の情報が存在しません");
    }

    const cache = new Cache(xhrPath);
    try {
      await cache.get();
      const {lastModified, data} = cache;
      for (let {url, resCount} of Board.parse(boardUrl, data)) {
        if (url === threadUrl.href) {
          return {
            resCount,
            modified: lastModified
          };
        }
      }
    } catch (error) {}
    throw new Error("板のスレ一覧にそのスレが存在しません");
  }
}

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}