import Board from "./Board.js";
import Cache from "./Cache.js";
import {Request} from "./HTTP.ts";
import {chServerMoveDetect, decodeCharReference, removeNeedlessFromTitle} from "./jsutil.js";
import {URL} from "./URL.ts";

/**
@class Thread
@constructor
@param {String} url
*/
export default class Thread {
  constructor(url) {
    this.url = new URL(url);
    this.title = null;
    this.res = null;
    this.message = null;
    this.tsld = this.url.getTsld();
    this.expired = false;
  }

  get(forceUpdate, progress) {
    const getCachedInfo = (async () => {
      if (["shitaraba.net", "machi.to"].includes(this.tsld)) {
        try {
          return {
            status: "success",
            cachedInfo: await Board.getCachedResCount(this.url)
          };
        } catch (error2) {
          return {status: "none"};
        }
      }
      return {status: "none"};
    })();

    return new Promise( async (resolve, reject) => {
      let response, status, thread;
      const xhrInfo = Thread._getXhrInfo(this.url);
      if (!xhrInfo) {
        this.message = "対応していないURLです";
        reject();
        return;
      }
      let {path: xhrPath, charset: xhrCharset} = xhrInfo;

      const cache = new Cache(xhrPath);
      let hasCache = false;
      let deltaFlg = false;
      let readcgiVer = 5;
      let noChangeFlg = false;
      const isHtml = (
        ((app.config.get("format_2chnet") !== "dat") && (this.tsld === "5ch.net")) ||
        (this.tsld === "bbspink.com")
      );

      // キャッシュ取得
      let needFetch = false;
      try {
        await cache.get();
        hasCache = true;
        if (forceUpdate || ((Date.now() - cache.lastUpdated) > (1000 * 3))) {
          // 通信が生じる場合のみ、progressでキャッシュを送出する
          await app.defer();
          const tmp = cache.parsed != null ? cache.parsed : Thread.parse(this.url, cache.data);
          if (tmp != null) {
            this.res = tmp.res;
            this.title = tmp.title;
            progress();
          }
          throw new Error("キャッシュの期限が切れているため通信します");
        }
      } catch (error3) {
        needFetch = true;
      }

      try {
        // 通信
        let cachedInfo;
        if (needFetch) {
          if (
            ((this.tsld === "shitaraba.net") && !this.url.isArchive()) ||
            (this.tsld === "machi.to")
          ) {
            if (hasCache) {
              deltaFlg = true;
              xhrPath += (+cache.resLength + 1) + "-";
            }
          // 2ch.netは差分を-nで取得
          } else if (isHtml) {
            if (hasCache) {
              deltaFlg = true;
              ({readcgiVer} = cache);
              if (readcgiVer >= 6) {
                xhrPath += (+cache.resLength + 1) + "-n";
              } else {
                xhrPath += (+cache.resLength) + "-n";
              }
            }
          }

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
        const {bbsType} = this.url.guessType();

        if (
          ((response != null ? response.status : undefined) === 200) ||
          ((readcgiVer >= 6) && ((response != null ? response.status : undefined) === 500))
        ) {
          if (deltaFlg) {
            // 2ch.netなら-nを使って前回取得したレスの後のレスからのものを取得する
            if (isHtml) {
              const threadCache = cache.parsed;
              // readcgi ver6,7だと変更がないと500が帰ってくる
              if ((readcgiVer >= 6) && (response.status === 500)) {
                noChangeFlg = true;
                thread = threadCache;
              } else {
                const threadResponse = Thread.parse(this.url, response.body, +cache.resLength);
                // 新しいレスがない場合は最後のレスのみ表示されるのでその場合はキャッシュを送る
                if ((readcgiVer < 6) && (threadResponse.res.length === 1)) {
                  noChangeFlg = true;
                  thread = threadCache;
                } else {
                  if (readcgiVer < 6) {
                    threadResponse.res.shift();
                  }
                  thread = threadResponse;
                  thread.res = threadCache.res.concat(threadResponse.res);
                }
              }
            } else {
              thread = Thread.parse(this.url, cache.data + response.body);
            }
          } else {
            thread = Thread.parse(this.url, response.body);
          }
        // 2ch系BBSのdat落ち
        } else if ((bbsType === "2ch") && ((response != null ? response.status : undefined) === 203)) {
          if (hasCache) {
            if (deltaFlg && isHtml) {
              thread = cache.parsed;
            } else {
              thread = Thread.parse(this.url, cache.data);
            }
          } else {
            thread = Thread.parse(this.url, response.body);
          }
        } else if (hasCache) {
          if (isHtml) {
            thread = cache.parsed;
          } else {
            thread = Thread.parse(this.url, cache.data);
          }
        }

        //パース成功
        if (thread) {
          //2ch系BBSのdat落ち
          if ((bbsType === "2ch") && ((response != null ? response.status : undefined) === 203)) {
            throw {response, thread};
          }
          //通信失敗
          if (
            ((response != null ? response.status : undefined) !== 200) &&
            //通信成功（更新なし）
            ((response != null ? response.status : undefined) !== 304) &&
            //通信成功（2ch read.cgi ver6,7の差分更新なし）
            (!(readcgiVer >= 6) || ((response != null ? response.status : undefined) !== 500)) &&
            //キャッシュが期限内だった場合
            (!!response || !hasCache)
          ) {
            throw {response, thread};
          }
        //パース失敗
        } else {
          throw {response};
        }

        //したらば/まちBBS最新レス削除対策
        ({status, cachedInfo} = await getCachedInfo);
        if (status === "sucess") {
          while (thread.res.length < cachedInfo.resCount) {
            thread.res.push({
              name: "あぼーん",
              mail: "あぼーん",
              message: "あぼーん",
              other: "あぼーん"
            });
          }
        }

        //コールバック
        if (thread) {
          this.title = thread.title;
          this.res = thread.res;
          this.expired = (thread.expired != null);
        }
        this.message = "";
        resolve();

        //キャッシュ更新部
        //通信に成功した場合
        if (
          (((response != null ? response.status : undefined) === 200) && thread) ||
          ((readcgiVer >= 6) && ((response != null ? response.status : undefined) === 500))
        ) {
          cache.lastUpdated = Date.now();

          if (isHtml) {
            const readcgiPlace = response.body.indexOf("<div class=\"footer push\">read.cgi ver ");
            if (readcgiPlace !== -1) {
              readcgiVer = parseInt(response.body.substr(readcgiPlace+38, 2));
            } else {
              readcgiVer = 5;
            }

            // 2ch(html)のみ
            if (thread.expired) {
              app.bookmark.updateExpired(this.url.href, true);
            }
          }

          if (deltaFlg) {
            if (isHtml && !noChangeFlg) {
              cache.parsed = thread;
              cache.readcgiVer = readcgiVer;
            } else if (noChangeFlg === false) {
              cache.data += response.body;
            }
            cache.resLength = thread.res.length;
          } else {
            if (isHtml) {
              cache.parsed = thread;
              cache.readcgiVer = readcgiVer;
            } else {
              cache.data = response.body;
            }
            cache.resLength = thread.res.length;
          }

          const lastModified = new Date(
            response.headers["Last-Modified"] || "dummy"
          ).getTime();

          if (Number.isFinite(lastModified)) {
            cache.lastModified = lastModified;
          }

          const etag = response.headers["ETag"];
          if (etag) {
            cache.etag = etag;
          }

          cache.put();

        //304だった場合はアップデート時刻のみ更新
        } else if (hasCache && ((response != null ? response.status : undefined) === 304)) {
          cache.lastUpdated = Date.now();
          cache.put();
        }

      } catch (error1) {
        ({response, thread} = error1);
        if (thread) {
          this.title = thread.title;
          this.res = thread.res;
        }
        this.message = "";

        //2chでrejectされてる場合は移転を疑う
        if ((this.tsld === "5ch.net") && response) {
          try {
            const newBoardURL = await chServerMoveDetect(this.url.toBoard());
            //移転検出時
            const newUrl = new URL(this.url);
            newUrl.hostname = newBoardURL.hostname;

            this.message += `\
スレッドの読み込みに失敗しました。
サーバーが移転している可能性が有ります
(<a href="${app.escapeHtml(app.safeHref(newURL.href))}"
  class="open_in_rcrx">${app.escapeHtml(newURL.href)}</a>)\
`;
          } catch (error4) {
            //移転検出出来なかった場合
            if ((response != null ? response.status : undefined) === 203) {
              this.message += "dat落ちしたスレッドです。";
              thread.expired = true;
            } else {
              this.message += "スレッドの読み込みに失敗しました。";
            }
          }
          if (hasCache && !thread) {
            this.message += "キャッシュに残っていたデータを表示します。";
          }
          reject();
        } else if ((this.tsld === "shitaraba.net") && !this.url.isArchive()) {
          this.message += "スレッドの読み込みに失敗しました。";
          const {error} = ((response != null ? response.headers : undefined) != null);
          if (error != null) {
            switch (error) {
              case "BBS NOT FOUND":
                this.message += "\nURLの掲示板番号が間違っています。";
                break;
              case "KEY NOT FOUND":
                this.message += "\nURLのスレッド番号が間違っています。";
                break;
              case "THREAD NOT FOUND":
                this.message += `\
該当するスレッドは存在しません。
URLが間違っているか過去ログに移動せずに削除されています。\
`;
                break;
              case "STORAGE IN":
                var newURL = this.url.href.replace("/read.cgi/", "/read_archive.cgi/");
                this.message += `\
過去ログが存在します
(<a href="${app.escapeHtml(app.safeHref(newURL))}"
  class="open_in_rcrx">${app.escapeHtml(newURL)}</a>)\
`;
                break;
            }
          }
          reject();
        } else {
          this.message += "スレッドの読み込みに失敗しました。";

          if (hasCache && !thread) {
            this.message += "キャッシュに残っていたデータを表示します。";
          }

          reject();
        }
      }

      //ブックマーク更新部
      if (thread != null) { app.bookmark.updateResCount(this.url.href, thread.res.length); }

      //dat落ち検出
      if ((response != null ? response.status : undefined) === 203) {
        app.bookmark.updateExpired(this.url.href, true);
      }
    });
  }

  /**
  @method _getXhrInfo
  @static
  @param {app.URL.URL} url
  @return {null|Object}
  */
  static _getXhrInfo(url) {
    const tmp = new RegExp(`^/(?:test|bbs)/read(?:_archive)?\\.cgi/(\\w+)/(\\d+)/(?:(\\d+)/)?$`).exec(url.pathname);
    if (!tmp) { return null; }
    switch (url.getTsld()) {
      case "machi.to":
        return {
          path: `${url.origin}/bbs/offlaw.cgi/${tmp[1]}/${tmp[2]}/`,
          charset: "Shift_JIS"
        };
      case "shitaraba.net":
        if (url.isArchive()) {
          return {
            path: url.href,
            charset: "EUC-JP"
          };
        } else {
          return {
            path: `${url.origin}/bbs/rawmode.cgi/${tmp[1]}/${tmp[2]}/${tmp[3]}/`,
            charset: "EUC-JP"
          };
        }
      case "5ch.net":
        if (app.config.get("format_2chnet") === "dat") {
          return {
            path: `${url.origin}/${tmp[1]}/dat/${tmp[2]}.dat`,
            charset: "Shift_JIS"
          };
        } else {
          return {
            path: url.href,
            charset: "Shift_JIS"
          };
        }
      case "bbspink.com":
        return {
          path: url.href,
          charset: "Shift_JIS"
        };
      default:
        return {
          path: `${url.origin}/${tmp[1]}/dat/${tmp[2]}.dat`,
          charset: "Shift_JIS"
        };
    }
  }

  /**
  @method parse
  @static
  @param {app.URL.URL} url
  @param {String} text
  @param {Number} resLength
  @return {null|Object}
  */
  static parse(url, text, resLength) {
    switch (url.getTsld()) {
      case "":
        return null;
      case "machi.to":
        return Thread._parseMachi(text);
      case "shitaraba.net":
        if (url.isArchive()) {
          return Thread._parseJbbsArchive(text);
        } else {
          return Thread._parseJbbs(text);
        }
      case "5ch.net":
        if (app.config.get("format_2chnet") === "dat") {
          return Thread._parseCh(text);
        } else {
          return Thread._parseNet(text);
        }
      case "bbspink.com":
        return Thread._parsePink(text, resLength);
      default:
        return Thread._parseCh(text);
    }
  }

  /**
  @method _parseNet
  @static
  @private
  @param {String} text
  @return {null|Object}
  */
  static _parseNet(text) {
    // name, mail, other, message, thread_title
    let reg, separator;
    if (
      text.includes("<div class=\"footer push\">read.cgi ver 06") &&
      !text.includes("</div></div><br>")
    ) {
      text = text.replace("</h1>", "</h1></div></div>");
      reg = /<div class="post"[^<>]*><div class="number">\d+[^<>]* : <\/div><div class="name"><b>(?:<a href="mailto:([^<>]*)">|<font [^<>]*>)?(.*?)(?:<\/(?:a|font)>)?<\/b><\/div><div class="date">(.*)<\/div><div class="message"> ?(.*)/;
      separator = "</div></div>";
    } else if (
      text.includes("<div class=\"footer push\">read.cgi ver 07") ||
      text.includes("<div class=\"footer push\">read.cgi ver 06")
    ) {
      text = text.replace("</h1>", "</h1></div></div><br>");
      reg = /<div class="post"[^<>]*><div class="meta"><span class="number">\d+<\/span><span class="name"><b>(?:<a href="mailto:([^<>]*)">|<font [^<>]*>)?(.*?)(?:<\/(?:a|font)>)?<\/b><\/span><span class="date">(.*)<\/span><\/div><div class="message">(?:<span class="escaped">)? ?(.*)(?:<\/span>)/;
      separator = "</div></div><br>";
    } else {
      reg = /^(?:<\/?div.*?(?:<br><br>)?)?<dt>\d+.*：(?:<a href="mailto:([^<>]*)">|<font [^>]*>)?<b>(.*)<\/b>.*：(.*)<dd> ?(.*)<br><br>$/;
      separator = "\n";
    }
    const titleReg = /<h1 [^<>]*>(.*)\n?<\/h1>/;
    const numberOfBroken = 0;
    const thread = {res: []};
    let gotTitle = false;

    for (let line of text.split(separator)) {
      const title = gotTitle ? false : titleReg.exec(line);
      const regRes = reg.exec(line);

      if (title) {
        thread.title = decodeCharReference(title[1]);
        thread.title = removeNeedlessFromTitle(thread.title);
        gotTitle = true;
      } else if (regRes) {
        thread.res.push({
          name: regRes[2],
          mail: regRes[1] || "",
          message: regRes[4],
          other: regRes[3]
        });
      }
    }

    if (text.includes("<div class=\"stoplight stopred stopdone\">")) {
      thread.expired = true;
    }

    if ((thread.res.length > 0) && (thread.res.length > numberOfBroken)) {
      return thread;
    }
    return null;
  }

  /**
  @method _parseCh
  @static
  @private
  @param {String} text
  @return {null|Object}
  */
  static _parseCh(text) {
    let numberOfBroken = 0;
    const thread = {res: []};

    const iterable = text.split("\n");
    for (let key = 0; key < iterable.length; key++) {
      const line = iterable[key];
      if (line === "") { continue; }
      // name, mail, other, message, thread_title
      const sp = line.split("<>");
      if (sp.length >= 4) {
        if (key === 0) {
          thread.title = decodeCharReference(sp[4]);
        }

        thread.res.push({
          name: sp[0],
          mail: sp[1],
          message: sp[3],
          other: sp[2]
        });
      } else {
        if (line === "") { continue; }
        numberOfBroken++;
        thread.res.push({
          name: "</b>データ破損<b>",
          mail: "",
          message: "データが破損しています",
          other: ""
        });
      }
    }

    if ((thread.res.length > 0) && (thread.res.length > numberOfBroken)) {
      return thread;
    }
    return null;
  }

  /**
  @method _parseMachi
  @static
  @private
  @param {String} text
  @return {null|Object}
  */
  static _parseMachi(text) {
    const thread = {res: []};
    let resCount = 0;
    let numberOfBroken = 0;

    for (let line of text.split("\n")) {
      if (line === "") { continue; }
      // res_num, name, mail, other, message, thread_title
      const sp = line.split("<>");
      if (sp.length >= 5) {
        while (++resCount !== +sp[0]) {
          thread.res.push({
            name: "あぼーん",
            mail: "あぼーん",
            message: "あぼーん",
            other: "あぼーん"
          });
        }

        if (resCount === 1) {
          thread.title = decodeCharReference(sp[5]);
        }

        thread.res.push({
          name: sp[1],
          mail: sp[2],
          message: sp[4],
          other: sp[3]
        });
      } else {
        if (line === "") { continue; }
        numberOfBroken++;
        thread.res.push({
          name: "</b>データ破損<b>",
          mail: "",
          message: "データが破損しています",
          other: ""
        });
      }
    }

    if ((thread.res.length > 0) && (thread.res.length > numberOfBroken)) {
      return thread;
    }
    return null;
  }

  /**
  @method _parseJbbs
  @static
  @private
  @param {String} text
  @return {null|Object}
  */
  static _parseJbbs(text) {
    const thread = {res: []};
    let resCount = 0;
    let numberOfBroken = 0;

    for (let line of text.split("\n")) {
      if (line === "") { continue; }
      // res_num, name, mail, date, message, thread_title, id
      const sp = line.split("<>");
      if (sp.length >= 6) {
        while (++resCount !== +sp[0]) {
          thread.res.push({
            name: "あぼーん",
            mail: "あぼーん",
            message: "あぼーん",
            other: "あぼーん"
          });
        }

        if (resCount === 1) {
          thread.title = decodeCharReference(sp[5]);
        }

        thread.res.push({
          name: sp[1],
          mail: sp[2],
          message: sp[4],
          other: sp[3] + (sp[6] ? ` ID:${sp[6]}` : "")
        });

      } else {
        if (line === "") { continue; }
        numberOfBroken++;
        thread.res.push({
          name: "</b>データ破損<b>",
          mail: "",
          message: "データが破損しています",
          other: ""
        });
      }
    }

    if ((thread.res.length > 0) && (thread.res.length > numberOfBroken)) {
      return thread;
    }
    return null;
  }

  /**
  @method _parseJbbsArchive
  @static
  @private
  @param {String} text
  @return {null|Object}
  */
  static _parseJbbsArchive(text) {
    // name, mail, other, message, thread_title
    text = app.replaceAll(text, "\n", "");
    text = text.replace(/<\/h1>\s*<dl>/, "</h1></dd><br><br>");
    const reg = /<dt[^>]*>\s*\d+ ：\s*(?:<a href="mailto:([^<>]*)">)?\s*(?:<font [^>]*>)?\s*<b>(.*)<\/b>.*：(.*)\s*<\/dt>\s*<dd>\s*(.*)\s*<br>/;
    const separator = /<\/dd>[\s\n]*<br><br>/;

    const titleReg = /<h1>(.*)<\/h1>/;
    const numberOfBroken = 0;
    const thread = {res: []};
    let gotTitle = false;

    for (let line of text.split(separator)) {
      const title = gotTitle ? false : titleReg.exec(line);
      const regRes = reg.exec(line);

      if (title) {
        thread.title = decodeCharReference(title[1]);
        gotTitle = true;
      } else if (regRes) {
        thread.res.push({
          name: regRes[2],
          mail: regRes[1] || "",
          message: regRes[4],
          other: regRes[3]
        });
      }
    }

    if ((thread.res.length > 0) && (thread.res.length > numberOfBroken)) {
      return thread;
    }
    return null;
  }

  /**
  @method _parsePink
  @static
  @private
  @param {String} text
  @param {Number} resLength
  @return {null|Object}
  */
  static _parsePink(text, resLength) {
    // name, mail, other, message, thread_title
    let reg, separator;
    if (text.includes("<div class=\"footer push\">read.cgi ver 06")) {
      text = text.replace(/<\/h1>/, "</h1></dd></dl>");
      reg = /^.*?<dl class="post".*><dt class=\"\"><span class="number">(\d+).* : <\/span><span class="name"><b>(?:<a href="mailto:([^<>]*)">|<font [^>]*>)?(.*?)(?:<\/a>|<\/font>)?<\/b><\/span><span class="date">(.*)<\/span><\/dt><dd class="thread_in"> ?(.*)$/;
      separator = "</dd></dl>";
    } else if (text.includes("<div class=\"footer push\">read.cgi ver 07")) {
      text = text.replace("</h1>", "</h1></div></div><br>");
      reg = /<div class="post"[^<>]*><div class="meta"><span class="number">(\d+).*<\/span><span class="name"><b>(?:<a href="mailto:([^<>]*)">|<font [^<>]*>)?(.*?)(?:<\/(?:a|font)>)?<\/b><\/span><span class="date">(.*)<\/span><\/div><div class="message">(?:<span class="escaped">)? ?(.*)(?:<\/span>)/;
      separator = "</div></div><br>";
    } else {
      reg = /^(?:<\/?div.*?(?:<br><br>)?)?<dt>(\d+).*：(?:<a href="mailto:([^<>]*)">|<font [^>]*>)?<b>(.*)<\/b>.*：(.*)<dd> ?(.*)<br><br>$/;
      separator = "\n";
    }

    const titleReg = /<h1 .*?>(.*)\n?<\/h1>/;
    const numberOfBroken = 0;
    const thread = {res: []};
    let gotTitle = false;
    let resCount = resLength != null ? resLength : 0;

    for (let line of text.split(separator)) {
      const title = gotTitle ? false : titleReg.exec(line);
      const regRes = reg.exec(line);

      if (title) {
        thread.title = decodeCharReference(title[1]);
        thread.title = removeNeedlessFromTitle(thread.title);
        gotTitle = true;
      } else if (regRes) {
        while (++resCount < +regRes[1]) {
          thread.res.push({
            name: "あぼーん",
            mail: "あぼーん",
            message: "あぼーん",
            other: "あぼーん"
          });
        }
        thread.res.push({
          name: regRes[3],
          mail: regRes[2] || "",
          message: regRes[5],
          other: regRes[4]
        });
      }
    }

    if ((thread.res.length > 0) && (thread.res.length > numberOfBroken)) {
      return thread;
    }
    return null;
  }
}
