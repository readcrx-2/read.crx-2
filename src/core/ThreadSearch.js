import { ask as askBoardTitleSolver } from "./BoardTitleSolver.js";
import { Request } from "./HTTP.ts";
import { stampToDate, decodeCharReference } from "./jsutil.js";
import { getProtocol, setProtocol } from "./URL.ts";

export default (function () {
  let _parse = undefined;
  let _getDiff = undefined;
  const Cls = class {
    static initClass() {
      this.prototype.loaded = "None";
      this.prototype.loaded20 = null;

      _parse = (protocol) =>
        async function (item) {
          let boardTitle;
          const url = item.T("guid")[0].textContent;
          let title = decodeCharReference(item.T("title")[0].textContent);
          const m = title.match(/\((\d+)\)$/);
          title = title.replace(/\(\d+\)$/, "");
          const boardUrl = new app.URL.URL(url).toBoard();
          try {
            boardTitle = await askBoardTitleSolver(boardUrl);
          } catch (error) {
            boardTitle = "";
          }
          return {
            url: setProtocol(url, protocol),
            createdAt: Date.parse(item.T("pubDate")[0].textContent),
            title,
            resCount: m != null ? m[1] : 0,
            boardUrl: boardUrl.href,
            boardTitle,
            isHttps: protocol === "https:",
          };
        };

      _getDiff = function (a, b) {
        const diffed = [];
        const aUrls = [];
        for (let aVal of a) {
          aUrls.push(aVal.url);
        }
        for (let bVal of b) {
          if (!aUrls.includes(bVal.url)) {
            diffed.push(bVal);
          }
        }
        return diffed;
      };
    }

    constructor(query, protocol) {
      this.query = query;
      this.protocol = protocol;
    }
    /*
      return ({url, key, subject, resno, server, ita}) ->
        urlProtocol = getProtocol(url)
        boardUrl = new URL("#{urlProtocol}//#{server}/#{ita}/")
        try
          boardTitle = await askBoardTitleSolver(boardUrl)
        catch
          boardTitle = ""
        return {
          url: setProtocol(url, protocol)
          createdAt: stampToDate(key)
          title: decodeCharReference(subject)
          resCount: +resno
          boardUrl: boardUrl.href
          boardTitle
          isHttps: (protocol is "https:")
        }
      */

    async _read(count) {
      //{status, body} = await new Request("GET", "https://dig.5ch.net/?keywords=#{encodeURIComponent(@query)}&maxResult=#{count}&json=1",
      let result;
      const { status, body } = await new Request(
        "GET",
        `https://ff5ch.syoboi.jp/?q=${encodeURIComponent(this.query)}&alt=rss`,
        { cache: false }
      ).send();
      if (status !== 200) {
        throw new Error("検索の通信に失敗しました");
      }
      try {
        const parser = new DOMParser();
        const rss = parser.parseFromString(body, "application/xml");
        result = Array.from(rss.T("item"));
        //{result} = JSON.parse(body)
      } catch (error) {
        throw new Error("検索のJSONのパースに失敗しました");
      }
      return Promise.all(result.map(_parse(this.protocol)));
    }

    read() {
      if (this.loaded === "None") {
        this.loaded = "Big";
        return this._read();
      }
      return [];
    }
  };
  Cls.initClass();
  return Cls;
})();
/*
    if @loaded is "None"
      @loaded = "Small"
      @loaded20 = @_read(20)
      return @loaded20
    if @loaded is "Small"
      @loaded = "Big"
      return _getDiff(await @loaded20, await @_read(500))
    return []
    */
