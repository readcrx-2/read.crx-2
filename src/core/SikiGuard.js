import Cache from "./Cache.js";
import { Request } from "./HTTP.ts";
import { URL } from "./URL.ts";

/**
@class SikiGuard
@constructor
@param {String} url
*/
export default class SikiGuard {
  constructor(url) {
    /**
    @property url
    @type String
    */
    this.url = new URL(url);

    /**
    @property thread
    @type Object
    */
    this.idSet = new Set();

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
    return new Promise(async (resolve, reject) => {
      let response, idSet;
      let hasCache = false;

      const xhrInfo = SikiGuard._getXhrInfo(this.url);
      if (xhrInfo == null) {
        this.idSet = new Set();
        resolve();
        return;
      }

      // キャッシュ取得
      const url = `https://sikiguard.net/${xhrInfo.tsld}/${xhrInfo.board}/id.json`;
      const cache = new Cache(url);

      let needFetch = false;
      try {
        await cache.get();
        hasCache = true;
        // NOTE: キャッシュを暫定30分にしてるけど、CDNにCloudflare使ってるっぽいので都度取得にして、取得できない時だけキャッシュ使うでもいいかも。
        if (!(Date.now() - cache.lastUpdated < 1000 * 60 * 30)) {
          throw new Error("キャッシュの期限が切れているため通信します");
        }
      } catch (error) {
        needFetch = true;
      }

      try {
        if (needFetch) {
          // 通信
          const request = new Request("GET", url, {
            preventCache: true,
          });
          if (hasCache) {
            if (cache.lastModified != null) {
              request.headers["If-Modified-Since"] = new Date(
                cache.lastModified
              ).toUTCString();
            }
            if (cache.etag != null) {
              request.headers["If-None-Match"] = cache.etag;
            }
          }

          response = await request.send();
        }

        // パース
        let idSet = null;
        if ((response != null ? response.status : undefined) === 200) {
          idSet = SikiGuard.parse(response.body);
        } else if (hasCache) {
          idSet = SikiGuard.parse(cache.data);
        }

        if (idSet == null) {
          throw { response };
        }
        if (
          (response != null ? response.status : undefined) !== 200 &&
          (!(response == null) || !hasCache)
        ) {
          throw { response, idSet };
        }

        // コールバック
        this.idSet = idSet;
        resolve();

        // キャッシュ更新部
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

          if ((etag = response.headers["ETag"])) {
            cache.etag = etag;
          }

          cache.put();
        }
      } catch (error) {
        // コールバック
        ({ response, idSet } = error);
        this.message = "Siki Guardの読み込みに失敗しました。";

        if (hasCache && idSet != null) {
          this.message += "キャッシュに残っていたデータを使用します。";
        }

        if (idSet != null) {
          this.idSet = idSet;
        }

        reject();
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
    const board = new SikiGuard(url);
    try {
      await board.get();
      return { status: "success", data: board.idSet };
    } catch (error) {
      return {
        status: "error",
        message: board.message != null ? board.message : null,
        data: board.idSet !== null ? board.idSet : new Set(),
      };
    }
  }

  /**
  @method _getXhrInfo
  @private
  @static
  @param {app.URL.URL} threaddUrl
  @return {Object | null} xhrInfo
  */
  static _getXhrInfo(threadUrl) {
    const tsld = threadUrl.getTsld();
    const splits = threadUrl.pathname.split("/");

    if (["5ch.net", "bbspink.com"].includes(tsld)) {
      return {
        tsld,
        board: splits[3],
      };
    }

    return null;
  }

  /**
  @method parse
  @static
  @param {String} text
  @return {Object} NG id set
  */
  static parse(text) {
    try {
      const { result } = JSON.parse(text);
      return Object.keys(result).reduce((acc, key) => {
        return new Set([...acc, ...result[key].map((id) => `ID:${id}`)]);
      }, new Set());
    } catch (error) {
      // TODO:
      return new Set();
    }
  }
}

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
