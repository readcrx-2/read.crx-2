///<reference path="HTTP.ts" />
///<reference path="../app.ts" />

namespace app {
  export namespace URL {
    export const CH_BOARD_REG = /^(https?:\/\/[\w\.]+\/test\/read\.cgi\/\w+\/\d+).*?$/;
    export const MACHI_BOARD_REG = /^(https?:\/\/\w+\.machi\.to\/bbs\/read\.cgi\/\w+\/\d+).*?$/;
    export const SHITARABA_BOARD_REG = /^(https?):\/\/jbbs\.(?:livedoor\.jp|shitaraba\.net)\/(bbs\/read\.cgi\/\w+\/\d+\/\d+).*?$/;
    export const CH_THREAD_REG = /^(https?:\/\/[\w\.]+\/\w+\/)(?:#.*)?$/;
    export const SHITARABA_THREAD_REG = /^(https?):\/\/jbbs\.(?:livedoor\.jp|shitaraba\.net)\/(\w+\/\d+\/)(?:#.*)?$/;
    export function fix (url:string):string {
      return (
        url
          // スレ系 誤爆する事は考えられないので、パラメータ部分をバッサリ切ってしまう
          .replace(CH_BOARD_REG, "$1/")
          .replace(MACHI_BOARD_REG, "$1/")
          .replace(SHITARABA_BOARD_REG, "$1://jbbs.shitaraba.net/$2/")
          // 板系 完全に誤爆を少しでも減らすために、パラメータ形式も限定する
          .replace(CH_THREAD_REG, "$1")
          .replace(SHITARABA_THREAD_REG, "$1://jbbs.shitaraba.net/$2")
      );
    }

    export interface GuessResult {
      type: string;
      bbsType: string;
    }
    export function guessType (url:string):GuessResult {
      url = fix(url);

      if (/^https?:\/\/jbbs\.shitaraba\.net\/bbs\/read\.cgi\/\w+\/\d+\/\d+\/$/.test(url)) {
        return {type: "thread", bbsType: "jbbs"};
      }
      else if (/^https?:\/\/jbbs\.shitaraba\.net\/\w+\/\d+\/$/.test(url)) {
        return {type: "board", bbsType: "jbbs"};
      }
      else if (/^https?:\/\/\w+\.machi\.to\/bbs\/read\.cgi\/\w+\/\d+\/$/.test(url)) {
        return {type: "thread", bbsType: "machi"};
      }
      else if (/^https?:\/\/\w+\.machi\.to\/\w+\/$/.test(url)) {
        return {type: "board", bbsType: "machi"};
      }
      else if (/^https?:\/\/[\w\.]+\/test\/read\.cgi\/\w+\/\d+\/$/.test(url)) {
        return {type: "thread", bbsType: "2ch"};
      }
      else if (/^https?:\/\/(?:find|info|p2|ninja)\.2ch\.net\/\w+\/$/.test(url)) {
        return {type: "unknown", bbsType: "unknown"};
      }
      else if (/^https?:\/\/[\w\.]+\/\w+\/$/.test(url)) {
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

    export function getDomain (urlstr: string):string {
      return (new window.URL(urlstr)).hostname;
    }

    export function getScheme (urlstr: string): string {
      return (new window.URL(urlstr)).protocol.slice(0, -1);
    }

    export function changeScheme (urlstr: string): string {
      var url = new window.URL(urlstr);
      url.protocol = (url.protocol == "http:") ? "https:" : "http";

      return url.toString();
    }

    export function threadToBoard (url:string):string {
      return (
        fix(url)
          .replace(/^(https?):\/\/([\w\.]+)\/(?:test|bbs)\/read\.cgi\/(\w+)\/\d+\/$/, "$1://$2/$3/")
          .replace(/^(https?):\/\/jbbs\.shitaraba\.net\/bbs\/read\.cgi\/(\w+)\/(\d+)\/\d+\/$/, "$1://jbbs.shitaraba.net/$2/$3/")
      );
    }

    export function parseQuery (urlstr:string, fromSearch:boolean = true):{[index:string]:any;} {
      var searchStr:string;

      searchStr = fromSearch ? urlstr : (new window.URL(urlstr)).search;

      return new URLSearchParams(searchStr.slice(1))
    }

    export function parseHashQuery (url:string):{[index:string]:any;} {
      var tmp;

      tmp = /#(.+)$/.exec(url);

      return tmp ? new URLSearchParams(tmp[1]) : new URLSearchParams();
    }

    export function buildQueryString (data:{[index:string]:any;}) {
      var param, key:string, val:any;

      param = new URLSearchParams();

      for (key in data) {
        val = data[key];
        param.append(key, val);
      }

      return param.toString();
    }

    export const SHORT_URL_REG = /^h?ttps?:\/\/(?:amba\.to|amzn\.to|bit\.ly|buff\.ly|cas\.st|dlvr\.it|fb\.me|g\.co|goo\.gl|htn\.to|ift\.tt|is\.gd|itun\.es|j\.mp|jump\.cx|ow\.ly|p\.tl|prt\.nu|redd\.it|snipurl\.com|spoti\.fi|t\.co|tiny\.cc|tinyurl\.com|tl\.gd|tr\.im|trib\.al|url\.ie|urx\.nu|urx2\.nu|urx3\.nu|ur0\.pw|wk\.tk|xrl\.us)\/.+/;

    export function expandShortURL (shortUrl: string): any {
      return new Promise( (resolve, reject) => {
        var finalUrl: string = "";

        var req = new app.HTTP.Request("HEAD", shortUrl);
        req.timeout = parseInt(app.config.get("expand_short_url_timeout"));

        req.send( (res) => {
          if (res.status === 0 || res.status >= 400) {
            resolve(null);
            return
          }
          finalUrl = res.responseURL;
          // 無限ループの防止
          if (finalUrl === shortUrl) {
            resolve(null);
            return
          }
          // 取得したURLが短縮URLだった場合は再帰呼出しする
          if (SHORT_URL_REG.test(finalUrl)) {
            expandShortURL(finalUrl).then( (finalUrl) => {
              resolve(finalUrl);
              return
            });
          // 短縮URL以外なら終了
          } else {
            resolve(finalUrl);
            return
          }
        });
      });
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
    export var getScheme = app.URL.getScheme;
    export var changeScheme = app.URL.changeScheme;
    export var threadToBoard = app.URL.threadToBoard;
    export var parseQuery = app.URL.parseQuery;
    export var parseHashQuery = app.URL.parseHashQuery;
    export var buildQuery = app.URL.buildQueryString;
    export const SHORT_URL_REG = app.URL.SHORT_URL_REG;
    export var expandShortURL = app.URL.expandShortURL;
  }
}
