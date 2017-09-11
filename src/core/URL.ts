///<reference path="HTTP.ts" />
///<reference path="../app.ts" />
///<reference path="../global.d.ts" />

namespace app {
  export namespace URL {
    export const CH_BOARD_REG = /^(https?:\/\/[\w\.]+\/(?:\w+\/)?test\/(?:read\.cgi|-)\/\w+\/\d+).*$/;
    export const CH_BOARD_REG2 = /^(https?:\/\/[\w\.]+\/\w+)\/?(?!test)$/;
    export const CH_BOARD_ULA_REG = /^(https?):\/\/ula\.2ch\.net\/2ch\/(\w+)\/([\w\.]+)\/(\d+).*$/;
    export const MACHI_BOARD_REG = /^(https?:\/\/\w+\.machi\.to\/bbs\/read\.cgi\/\w+\/\d+).*$/;
    export const SHITARABA_BOARD_REG = /^(https?):\/\/jbbs\.(?:livedoor\.jp|shitaraba\.net)\/(bbs\/read(?:_archive)?\.cgi\/\w+\/\d+\/\d+).*$/;
    export const SHITARABA_ARCHIVE_REG = /^(https?):\/\/jbbs\.(?:livedoor\.jp|shitaraba\.net)\/(\w+\/\d+)\/storage\/(\d+)\.html$/;
    export const CH_THREAD_REG = /^(https?:\/\/[\w\.]+\/(?:subback\/|test\/-\/)?\w+\/)(?:#.*)?$/;
    export const SHITARABA_THREAD_REG = /^(https?):\/\/jbbs\.(?:livedoor\.jp|shitaraba\.net)\/(\w+\/\d+\/)(?:#.*)?$/;
    export function fix (url:string):string {
      return (
        url
          // スレ系 誤爆する事は考えられないので、パラメータ部分をバッサリ切ってしまう
          .replace(CH_BOARD_REG, "$1/")
          .replace(CH_BOARD_REG2, "$1/")
          .replace(CH_BOARD_ULA_REG, "$1://$3/test/read.cgi/$2/$4/")
          .replace(MACHI_BOARD_REG, "$1/")
          .replace(SHITARABA_BOARD_REG, "$1://jbbs.shitaraba.net/$2/")
          .replace(SHITARABA_ARCHIVE_REG, "$1://jbbs.shitaraba.net/bbs/read_archive.cgi/$2/$3/")
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

      if (/^https?:\/\/jbbs\.shitaraba\.net\/bbs\/read(?:_archive)?\.cgi\/\w+\/\d+\/\d+\/$/.test(url)) {
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
      else if (/^https?:\/\/[\w\.]+\/(?:\w+\/)?test\/(?:read\.cgi|-)\/\w+\/\d+\/$/.test(url)) {
        return {type: "thread", bbsType: "2ch"};
      }
      else if (/^https?:\/\/(?:find|info|p2|ninja)\.2ch\.net\/\w+\/$/.test(url)) {
        return {type: "unknown", bbsType: "unknown"};
      }
      else if (/^https?:\/\/\w+\.(?:2ch|open2ch|bbspink)\.\w+\/(?:subback\/|test\/-\/)?\w+\/?$/.test(url)) {
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
      var start = urlstr.indexOf("://")+3;
      return urlstr.slice(start, urlstr.indexOf("/", start));
    }

    export function getScheme (urlstr: string): string {
      return urlstr.slice(0, urlstr.indexOf("://"));
    }

    export function setScheme (urlstr: string, protocol: string): string {
      var split;

      split = urlstr.indexOf("://");
      return protocol + "://" + urlstr.slice(split+3);
    }

    export function changeScheme (urlstr: string): string {
      var split, protocol;

      split = urlstr.indexOf("://")
      protocol = (urlstr.slice(0, split) == "http") ? "https" : "http";

      return protocol + "://" + urlstr.slice(split+3);
    }

    export function getResNumber (urlstr: string): string|null {
      var tmp: string[]|null;

      tmp = /^https?:\/\/[\w\.]+\/(?:\w+\/)?test\/(?:read\.cgi|-)\/\w+\/\d+\/(?:i|g\?g=)?(\d+).*$/.exec(urlstr);
      if (tmp !== null) {
        return tmp[1];
      }
      tmp = /^https?:\/\/ula\.2ch\.net\/2ch\/\w+\/[\w\.]+\/\d+\/(\d+).*$/.exec(urlstr);
      if (tmp !== null) {
        return tmp[1];
      }
      tmp = /^https?:\/\/\w+\.machi\.to\/bbs\/read\.cgi\/\w+\/\d+\/(\d+).*$/.exec(urlstr);
      if (tmp !== null) {
        return tmp[1];
      }
      tmp = /^https?:\/\/jbbs\.(?:livedoor\.jp|shitaraba\.net)\/bbs\/read(?:_archive)?\.cgi\/\w+\/\d+\/\d+\/(\d+).*$/.exec(urlstr);
      if (tmp !== null) {
        return tmp[1];
      }

      return null;
    }

    export function threadToBoard (url:string):string {
      return (
        fix(url)
          .replace(/^(https?):\/\/([\w\.]+)\/(?:test|bbs)\/read\.cgi\/(\w+)\/\d+\/$/, "$1://$2/$3/")
          .replace(/^(https?):\/\/jbbs\.shitaraba\.net\/bbs\/read(?:_archive)?\.cgi\/(\w+)\/(\d+)\/\d+\/$/, "$1://jbbs.shitaraba.net/$2/$3/")
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

    export function buildQuery (data:{[index:string]:any;}) {
      var param, key:string, val:any;

      param = new URLSearchParams();

      for (key in data) {
        val = data[key];
        param.append(key, val);
      }

      return param.toString();
    }

    export const SHORT_URL_LIST = new Set([
      "amba.to",
      "amzn.to",
      "bit.ly",
      "buff.ly",
      "cas.st",
      "cos.lv",
      "dlvr.it",
      "fb.me",
      "g.co",
      "goo.gl",
      "htn.to",
      "ift.tt",
      "is.gd",
      "itun.es",
      "j.mp",
      "jump.cx",
      "kkbox.fm",
      "ow.ly",
      "p.tl",
      "prt.nu",
      "redd.it",
      "snipurl.com",
      "spoti.fi",
      "t.co",
      "tiny.cc",
      "tinyurl.com",
      "tl.gd",
      "tr.im",
      "trib.al",
      "ur0.biz",
      "ur0.work",
      "url.ie",
      "urx.nu",
      "urx.red",
      "urx2.nu",
      "urx3.nu",
      "ur0.pw",
      "ur2.link",
      "ustre.am",
      "wk.tk",
      "xrl.us"
    ]);

    export function expandShortURL (shortUrl: string): any {
      return new Promise( (resolve, reject) => {
        var cache = new app.Cache(shortUrl);

        cache.get()
          .then( () => {
            return Promise.resolve({data: cache.data, url: null});
          })
          .catch( () => {
            var req = new app.HTTP.Request("HEAD", shortUrl);
            req.timeout = parseInt(app.config.get("expand_short_url_timeout")!);

            return req.send().then( ({status, responseURL: resUrl}) => {
              if (status >= 400) {
                return {data: null, url: null};
              }
              // 無限ループの防止
              if (resUrl === shortUrl) {
                return {data: null, url: null};
              }
              // 取得したURLが短縮URLだった場合は再帰呼出しする
              if (SHORT_URL_LIST.has(getDomain(resUrl))) {
                return expandShortURL(resUrl).then( (resUrl) => {
                  return {data: null, url: resUrl};
                });
              // 短縮URL以外なら終了
              } else {
                return {data: null, url: resUrl};
              }
            });
          })
          .then( (res) => {
            var finalUrl: string = "";
            if (res.data === null && res.url !== null) {
              cache.last_updated = Date.now();
              cache.data = res.url;
              cache.put();
              finalUrl = res.url;
            } else if (res.data !== null && res.url === null) {
              finalUrl = res.data;
            }
            return resolve(finalUrl);
          });
      });
    }

    const AUDIO_REG = /\.(?:mp3|m4a|wav|oga|spx)(?:[\?#:&].*)?$/;
    const VIDEO_REG = /\.(?:mp4|m4v|webm|ogv)(?:[\?#:&].*)?$/;
    const OGG_REG = /\.(?:ogg|ogx)(?:[\?#:&].*)?$/;
    export function getExtType (filename: string, {
        audio = true,
        video = true,
        oggIsAudio = false,
        oggIsVideo = true
      }: {
        audio?: boolean,
        video?: boolean,
        oggIsAudio?: boolean,
        oggIsVideo?: boolean
      } = {}
    ): string|null {
      if (audio && AUDIO_REG.test(filename)) {
        return "audio";
      }
      if (video && VIDEO_REG.test(filename)) {
        return "video";
      }
      if (video && oggIsVideo && OGG_REG.test(filename)) {
        return "video";
      }
      if (audio && oggIsAudio && OGG_REG.test(filename)) {
        return "audio";
      }
      return null;
    }

    export function convertUrlFromPhone (url: string): string {
      var regs: any[];
      var tmp: string[]|null = [];
      var mode: string;
      var scheme: string = "";
      var server: string|null = null;
      var board: string|null = null;
      var thread: string|null = null;
      var resUrl: string = url;

      function checkReg (value: any, index: number, array: any[]): boolean {
        return (tmp = value.exec(url));
      }

      mode = tsld(url);
      switch (mode) {
        case "2ch.net":
          regs = [
            /(https?):\/\/itest\.2ch\.net\/(?:\w+\/)?test\/read\.cgi\/(\w+)\/(\d+)\//,
            /(https?):\/\/itest\.2ch\.net\/(?:subback\/)?(\w+)(?:\/)?/,
            /(https?):\/\/c\.2ch\.net\/test\/-\/(\w+)\/(\d+)\//,
            /(https?):\/\/c\.2ch\.net\/test\/-\/(\w+)\//
          ]
          if (regs.some(checkReg)) {
            scheme = tmp[1];
            board = tmp[2];
            thread = tmp[3] ? tmp[3] : null;
            if (board !== null) {
              if (serverNet.has(board) === true) {
                server = serverNet.get(board)!;
              // 携帯用bbspinkの可能性をチェック
              } else if (serverBbspink.has(board) === true) {
                server = serverBbspink.get(board)!;
                mode = "bbspink.com";
              }
            }
          }
          break;

        case "2ch.sc":
          regs = [
            /(https?):\/\/sp\.2ch\.sc\/(?:\w+\/)?test\/read\.cgi\/(\w+)\/(\d+)\//,
            /(https?):\/\/sp\.2ch\.sc\/(?:subback\/)?(\w+)\//
          ]
          if (regs.some(checkReg)) {
            scheme = tmp[1];
            board = tmp[2];
            thread = tmp[3] ? tmp[3] : null;
            if (board !== null && serverSc.has(board) === true) {
              server = serverSc.get(board)!;
            }
          }
          break;

        case "bbspink.com":
          regs = [
            /(https?):\/\/itest\.bbspink\.com\/(?:\w+\/)?test\/read\.cgi\/(\w+)\/(\d+)\//,
            /(https?):\/\/itest\.bbspink\.com\/(?:subback\/)?(\w+)(?:\/)?/
          ]
          if (regs.some(checkReg)) {
            scheme = tmp[1];
            board = tmp[2];
            thread = tmp[3] ? tmp[3] : null;
            if (board !== null && serverBbspink.has(board) === true) {
              server = serverBbspink.get(board)!;
            }
          }
          break;
      }

      if (server !== null) {
        if (thread !== null) {
          resUrl = `${scheme}://${server}.${mode}/test/read.cgi/${board}/${thread}/`;
        } else {
          resUrl = `${scheme}://${server}.${mode}/${board}/`;
        }
      }

      return resUrl;
    }

    var serverNet = new Map<string, string>();
    var serverSc = new Map<string, string>();
    var serverBbspink = new Map<string, string>();

    export function pushBoardToServerInfo (boardInfoNet: any, boardInfoSc: any, boardInfoBbspink: any): void {
      var item: any;
      var tmp: string[]|null;

      if (boardInfoNet.length > 0) {
        serverNet.clear();
      }
      for (item of boardInfoNet) {
        tmp = /https?:\/\/(\w+)\.2ch\.net\/(\w+)\//.exec(item.url);
        if (tmp === null) {
          continue;
        }
        if (serverNet.has(tmp[2]) === false) {
          serverNet.set(tmp[2], tmp[1]);
        }
      }

      if (boardInfoSc.length > 0) {
        serverSc.clear();
      }
      for (item of boardInfoSc) {
        tmp = /https?:\/\/(\w+)\.2ch\.sc\/(\w+)\//.exec(item.url);
        if (tmp === null) {
          continue;
        }
        if (serverSc.has(tmp[2]) === false) {
          serverSc.set(tmp[2], tmp[1]);
        }
      }

      if (boardInfoBbspink.length > 0) {
        serverBbspink.clear();
      }
      for (item of boardInfoBbspink) {
        tmp = /https?:\/\/(\w+)\.bbspink\.com\/(\w+)\//.exec(item.url);
        if (tmp === null) {
          continue;
        }
        if (serverBbspink.has(tmp[2]) === false) {
          serverBbspink.set(tmp[2], tmp[1]);
        }
      }

      return;
    }

    export function exchangeNetSc (url: string): string|null {
      var mode: string[]|null;
      var server: string|null = null;
      var target: string|null = null;
      var resUrl: string|null = null;

      mode = /(https?):\/\/(\w+)\.2ch\.(net|sc)\/test\/read\.cgi\/(\w+)\/(\d+)\//.exec(url);
      if (mode === null) {
        return null;
      }

      if (mode[3] === "net") {
        if (serverSc.has(mode[4]) === true) {
          server = serverSc.get(mode[4])!;
          target = "sc";
        }
      } else {
        if (serverNet.has(mode[4]) === true) {
          server = serverNet.get(mode[4])!;
          target = "net";
        }
      }

      if (server !== null) {
        resUrl = `${mode[1]}://${server}.2ch.${target}/test/read.cgi/${mode[4]}/${mode[5]}/`;
      }
      return resUrl;
    }

    export function convertNetSc (url: string): Promise<string> {
      var scheme: string;
      var tmpUrl: string;
      var tmp: string[]|null;

      tmp = /(https?):\/\/(\w+)\.2ch\.net\/test\/read\.cgi\/(\w+\/\d+\/)/.exec(url);
      if (tmp === null) {
        return Promise.reject(null);
      }
      tmpUrl = `http://${tmp[2]}.2ch.sc/test/read.cgi/${tmp[3]}`;
      scheme = tmp[1];

      var req = new app.HTTP.Request("HEAD", tmpUrl);
      return req.send().then( ({status, responseURL: resUrl}) => {
        if (status >= 400) {
          return Promise.reject(null);
        }
        tmp = /https?:\/\/(\w+)\.2ch\.sc\/test\/read\.cgi\/(\w+)\/(\d+)\//.exec(resUrl);
        if (tmp !== null) {
          if (serverSc.has(tmp[2]) === false) {
            serverSc.set(tmp[2], tmp[1]);
          }
          resUrl = `${scheme}://${tmp[1]}.2ch.sc/test/read.cgi/${tmp[2]}/${tmp[3]}/`;
        }
        return Promise.resolve(resUrl);
      });
    }
  }
}
