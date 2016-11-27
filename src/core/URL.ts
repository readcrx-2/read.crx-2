///<reference path="HTTP.ts" />
///<reference path="../app.ts" />

namespace app {
  export namespace URL {
    export const CH_BOARD_REG = /^(http:\/\/[\w\.]+\/test\/read\.cgi\/\w+\/\d+).*?$/;
    export const MACHI_BOARD_REG = /^(http:\/\/\w+\.machi\.to\/bbs\/read\.cgi\/\w+\/\d+).*?$/;
    export const SHITARABA_BOARD_REG = /^http:\/\/jbbs\.(?:livedoor\.jp|shitaraba\.net)\/(bbs\/read\.cgi\/\w+\/\d+\/\d+).*?$/;
    export const CH_THREAD_REG = /^(http:\/\/[\w\.]+\/\w+\/)(?:#.*)?$/;
    export const SHITARABA_THREAD_REG = /^http:\/\/jbbs\.(?:livedoor\.jp|shitaraba\.net)\/(\w+\/\d+\/)(?:#.*)?$/;
    export function fix (url:string):string {
      return (
        url
          // スレ系 誤爆する事は考えられないので、パラメータ部分をバッサリ切ってしまう
          .replace(CH_BOARD_REG, "$1/")
          .replace(MACHI_BOARD_REG, "$1/")
          .replace(SHITARABA_BOARD_REG, "http://jbbs.shitaraba.net/$1/")
          // 板系 完全に誤爆を少しでも減らすために、パラメータ形式も限定する
          .replace(CH_THREAD_REG, "$1")
          .replace(SHITARABA_THREAD_REG, "http://jbbs.shitaraba.net/$1")
      );
    }

    export interface GuessResult {
      type: string;
      bbsType: string;
    }
    export function guessType (url:string):GuessResult {
      url = fix(url);

      if (/^http:\/\/jbbs\.shitaraba\.net\/bbs\/read\.cgi\/\w+\/\d+\/\d+\/$/.test(url)) {
        return {type: "thread", bbsType: "jbbs"};
      }
      else if (/^http:\/\/jbbs\.shitaraba\.net\/\w+\/\d+\/$/.test(url)) {
        return {type: "board", bbsType: "jbbs"};
      }
      else if (/^http:\/\/\w+\.machi\.to\/bbs\/read\.cgi\/\w+\/\d+\/$/.test(url)) {
        return {type: "thread", bbsType: "machi"};
      }
      else if (/^http:\/\/\w+\.machi\.to\/\w+\/$/.test(url)) {
        return {type: "board", bbsType: "machi"};
      }
      else if (/^http:\/\/[\w\.]+\/test\/read\.cgi\/\w+\/\d+\/$/.test(url)) {
        return {type: "thread", bbsType: "2ch"};
      }
      else if (/^http:\/\/(?:find|info|p2|ninja)\.2ch\.net\/\w+\/$/.test(url)) {
        return {type: "unknown", bbsType: "unknown"};
      }
      else if (/^http:\/\/[\w\.]+\/\w+\/$/.test(url)) {
        return {type: "board", bbsType: "2ch"};
      }
      else {
        return {type: "unknown", bbsType: "unknown"};
      }
    }

    export const TSLD_REG = /^https?:\/\/(?:\w+\.)*(\w+\.\w+)\//;
    export function tsld (url:string):string {
      var res:any;

      res = TSLD_REG.exec(url);
      return res ? res[1] : "";
    }

    export function getDomain (url:string):string {
      var splited:string[];

      splited = url.split("/");
      return splited.length > 1 ? splited[2] : "";
    }

    export function threadToBoard (url:string):string {
      return (
        fix(url)
          .replace(/^http:\/\/([\w\.]+)\/(?:test|bbs)\/read\.cgi\/(\w+)\/\d+\/$/, "http://$1/$2/")
          .replace(/^http:\/\/jbbs\.shitaraba\.net\/bbs\/read\.cgi\/(\w+)\/(\d+)\/\d+\/$/, "http://jbbs.shitaraba.net/$1/$2/")
      );
    }

    function _parseQuery (query:string):{[index:string]:any;} {
      var data:{[index:string]:any;};

      data = {};

      for(var segment of query.split("&")) {
        var tmp:any;

        tmp = segment.split("=");

        if (typeof tmp[1] === "string") {
          data[decodeURIComponent(tmp[0])] = decodeURIComponent(tmp[1]);
        }
        else {
          data[decodeURIComponent(tmp[0])] = true;
        }
      }

      return data;
    }

    export function parseQuery (url:string):{[index:string]:any;} {
      var tmp;

      tmp = /\?([^#]+)(:?\#.*)?$/.exec(url);
      return tmp ? _parseQuery(tmp[1]) : {};
    }

    export function parseHashQuery (url:string):{[index:string]:any;} {
      var tmp;

      tmp = /#(.+)$/.exec(url);
      return tmp ? _parseQuery(tmp[1]) : {};
    }

    export function buildQueryString (data:{[index:string]:any;}) {
      var str:string, key:string, val:any;

      str = "";

      for (key in data) {
        val = data[key];

        if (val === true) {
          str += `&${encodeURIComponent(key)}`;
        }
        else {
          str += `&${encodeURIComponent(key)}=${encodeURIComponent(val)}`;
        }
      }

      return str.slice(1);
    }

    export const SHORT_URL_REG = /^h?ttps?:\/\/(?:amba\.to|amzn\.to|bit\.ly|buff\.ly|cas\.st|dlvr\.it|fb\.me|g\.co|goo\.gl|htn\.to|ift\.tt|is\.gd|itun\.es|j\.mp|jump\.cx|ow\.ly|p\.tl|prt\.nu|snipurl\.com|spoti\.fi|t\.co|tiny\.cc|tinyurl\.com|tl\.gd|tr\.im|trib\.al|url\.ie|urx\.nu|urx2\.nu|urx3\.nu|ur0\.pw|wk\.tk|xrl\.us)\/.+/;

    export function expandShortURL (a: HTMLElement, shortUrl: string): any {
      var dfd = $.Deferred();
      var finalUrl: string = "";

      var req = new app.HTTP.Request("HEAD", shortUrl);
      req.timeout = parseInt(app.config.get("expand_short_url_timeout"));

      req.send((res) => {
        if (res.status === 0 || res.status >= 400) {
          return dfd.resolve(a, null);
        }
        finalUrl = res.responseURL;
        // 無限ループの防止
        if (finalUrl === shortUrl) {
          return dfd.resolve(a, null);
        }
        // 取得したURLが短縮URLだった場合は再帰呼出しする
        if (SHORT_URL_REG.test(finalUrl)) {
          expandShortURL(a, finalUrl).done( (a, finalUrl) => {
            return dfd.resolve(a, finalUrl);
          });
        // 短縮URL以外なら終了
        } else {
          return dfd.resolve(a, finalUrl);
        }
      });

      return dfd.promise();
    }
  }
}

// 互換性確保部分
namespace app {
  export namespace url {
    export var fix = app.URL.fix;

    export function guess_type (url):{type: string; bbs_type: string;} {
      var tmp:app.URL.GuessResult;

      tmp = app.URL.guessType(url);

      return {
        type: tmp.type,
        bbs_type: tmp.bbsType
      };
    }

    export var tsld = app.URL.tsld;
    export var getDomain = app.URL.getDomain;
    export var thread_to_board = app.URL.threadToBoard;
    export var parse_query = app.URL.parseQuery;
    export var parse_hashquery = app.URL.parseHashQuery;
    export var build_param = app.URL.buildQueryString;
    export const SHORT_URL_REG = app.URL.SHORT_URL_REG;
    export var expandShortURL = app.URL.expandShortURL;
  }
}
