///<reference path="../global.d.ts" />
import {Request} from "./HTTP"
// @ts-ignore
import {fetch as fetchBBSMenu} from "./BBSMenu.coffee"
// @ts-ignore
import Cache from "./Cache.coffee"

export const CH_THREAD_REG = /^(https?:\/\/[\w\.]+\/(?:\w+\/)?test\/(?:read\.cgi|-)\/\w+\/\d+).*$/;
export const CH_THREAD_REG2 = /^(https?:\/\/[\w\.]+\/\w+)\/?(?!test)$/;
export const CH_THREAD_ULA_REG = /^(https?):\/\/ula\.5ch\.net\/2ch\/(\w+)\/([\w\.]+)\/(\d+).*$/;
export const MACHI_THREAD_REG = /^(https?):\/\/(?:\w+\.)?machi\.to\/bbs\/read\.cgi\/(\w+\/\d+).*$/;
export const SHITARABA_THREAD_REG = /^(https?):\/\/jbbs\.(?:livedoor\.jp|shitaraba\.net)\/(bbs\/read(?:_archive)?\.cgi\/\w+\/\d+\/\d+).*$/;
export const SHITARABA_ARCHIVE_REG = /^(https?):\/\/jbbs\.(?:livedoor\.jp|shitaraba\.net)\/(\w+\/\d+)\/storage\/(\d+)\.html$/;
export const MACHI_BOARD_REG = /^(https?):\/\/(?:\w+\.)?machi\.to\/(\w+\/)(?:#.*)?$/;
export const SHITARABA_BOARD_REG = /^(https?):\/\/jbbs\.(?:livedoor\.jp|shitaraba\.net)\/(\w+\/\d+\/)(?:#.*)?$/;
export const CH_BOARD_REG = /^(https?:\/\/[\w\.]+\/(?:subback\/|test\/-\/)?\w+\/)(?:#.*)?$/;
export function fix (url:string):string {
  return (
    url
      //2ch.net->5ch.net
      .replace(/^(https?):\/\/(\w+)\.2ch\.net\//, "$1://$2.5ch.net/")
      // スレ系 誤爆する事は考えられないので、パラメータ部分をバッサリ切ってしまう
      .replace(CH_THREAD_REG, "$1/")
      .replace(CH_THREAD_REG2, "$1/")
      .replace(CH_THREAD_ULA_REG, "$1://$3/test/read.cgi/$2/$4/")
      .replace(MACHI_THREAD_REG, "$1://machi.to/bbs/read.cgi/$2/")
      .replace(SHITARABA_THREAD_REG, "$1://jbbs.shitaraba.net/$2/")
      .replace(SHITARABA_ARCHIVE_REG, "$1://jbbs.shitaraba.net/bbs/read_archive.cgi/$2/$3/")
      // 板系 完全に誤爆を少しでも減らすために、パラメータ形式も限定する
      .replace(MACHI_BOARD_REG, "$1://machi.to/$2")
      .replace(SHITARABA_BOARD_REG, "$1://jbbs.shitaraba.net/$2")
      .replace(CH_BOARD_REG, "$1")
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
  else if (/^https?:\/\/(?:\w+\.)?machi\.to\/bbs\/read\.cgi\/\w+\/\d+\/$/.test(url)) {
    return {type: "thread", bbsType: "machi"};
  }
  else if (/^https?:\/\/(?:\w+\.)?machi\.to\/\w+\/$/.test(url)) {
    return {type: "board", bbsType: "machi"};
  }
  else if (/^https?:\/\/[\w\.]+\/(?:\w+\/)?test\/(?:read\.cgi|-)\/\w+\/\d+\/$/.test(url)) {
    return {type: "thread", bbsType: "2ch"};
  }
  else if (/^https?:\/\/(?:find|info|p2|ninja)\.5ch\.net\/\w+\/$/.test(url)) {
    return {type: "unknown", bbsType: "unknown"};
  }
  else if (/^https?:\/\/\w+\.(?:[25]ch|open2ch|bbspink)\.\w+\/(?:subback\/|test\/-\/)?\w+\/?$/.test(url)) {
    return {type: "board", bbsType: "2ch"};
  }
  else if (/^https?:\/\/(?:\w+\.){2,}\w+\/(?:subback\/|test\/-\/)?\w+\/?$/.test(url)) {
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
  tmp = /^https?:\/\/ula\.5ch\.net\/2ch\/\w+\/[\w\.]+\/\d+\/(\d+).*$/.exec(urlstr);
  if (tmp !== null) {
    return tmp[1];
  }
  tmp = /^https?:\/\/(?:\w+\.)?machi\.to\/bbs\/read\.cgi\/\w+\/\d+\/(\d+).*$/.exec(urlstr);
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

export function parseQuery (urlStr:string, fromSearch:boolean = true):{[index:string]:any;} {
  if (fromSearch) {
    return new URLSearchParams(urlStr.slice(1));
  }
  return (new window.URL(urlStr)).searchParams;
}

export function parseHashQuery (url:string):{[index:string]:any;} {
  var tmp;

  tmp = /#(.+)$/.exec(url);

  return tmp ? new URLSearchParams(tmp[1]) : new URLSearchParams();
}

export function buildQuery (data:{[index:string]:any;}) {
  return (new URLSearchParams(<any>data)).toString();
}

export const SHORT_URL_LIST = new Set([
  "amba.to",
  "amzn.to",
  "bit.ly",
  "buff.ly",
  "cas.st",
  "cos.lv",
  "dlvr.it",
  "ekaz10.xyz",
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
  "morimo2.info",
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
  "qq4q.biz",
  "u0u1.net",
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
  "ux.nu",
  "wb2.biz",
  "wk.tk",
  "xrl.us"
]);

export async function expandShortURL (shortUrl: string): Promise<string> {
  var res, finalUrl = "";
  var cache = new Cache(shortUrl);

  res = await ( async () => {
    try {
      await cache.get();
      return {data: cache.data, url: null};
    } catch {
      var req = new Request("HEAD", shortUrl);
      req.timeout = parseInt(app.config.get("expand_short_url_timeout")!);

      var {status, responseURL: resUrl} = await req.send();

      if (status >= 400) {
        return {data: null, url: null};
      }
      // 無限ループの防止
      if (resUrl === shortUrl) {
        return {data: null, url: null};
      }

      // 取得したURLが短縮URLだった場合は再帰呼出しする
      if (SHORT_URL_LIST.has(getDomain(resUrl))) {
        resUrl = await expandShortURL(resUrl)
        return {data: null, url: resUrl};
      // 短縮URL以外なら終了
      } else {
        return {data: null, url: resUrl};
      }
    }
  })();

  if (res.data === null && res.url !== null) {
    cache.lastUpdated = Date.now();
    cache.data = res.url;
    cache.put();
    finalUrl = res.url;
  } else if (res.data !== null && res.url === null) {
    finalUrl = res.data;
  }
  return finalUrl;
}

const AUDIO_REG = /\.(?:mp3|m4a|wav|oga|spx)(?:[\?#:&].*)?$/;
const VIDEO_REG = /\.(?:mp4|m4v|webm|ogv)(?:[\?#:&].*)?$/;
const OGG_REG = /\.(?:ogg|ogx)(?:[\?#:&].*)?$/;
export function getExtType (filename: string, {
    audio = true,
    video = true,
    oggIsAudio = false,
    oggIsVideo = true
  }: Partial<{
    audio: boolean,
    video: boolean,
    oggIsAudio: boolean,
    oggIsVideo: boolean
  }> = {}
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
    case "5ch.net":
      regs = [
        /(https?):\/\/itest\.5ch\.net\/(?:\w+\/)?test\/read\.cgi\/(\w+)\/(\d+)\//,
        /(https?):\/\/itest\.5ch\.net\/(?:subback\/)?(\w+)(?:\/)?/,
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
          } else if (serverPink.has(board) === true) {
            server = serverPink.get(board)!;
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
        if (board !== null && serverPink.has(board) === true) {
          server = serverPink.get(board)!;
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
var serverPink = new Map<string, string>();

interface ResInfo {
  net: boolean;
  sc: boolean;
  bbspink: boolean;
}

function applyServerInfo (menu: any[]):ResInfo {
  var boardNet = new Map<string, string>(),
    boardSc = new Map<string, string>(),
    boardPink = new Map<string, string>(),
    tmp: string[]|null;
  var res: ResInfo = {
    net: (serverNet.size > 0),
    sc: (serverSc.size > 0),
    bbspink: (serverPink.size > 0)
  };

  if (res.net && res.sc && res.bbspink) return res;

  for (let category of menu) {
    for (let board of category.board) {
      if (!res.net && (tmp = /https?:\/\/(\w+)\.[25]ch\.net\/(\w+)\/.*?/.exec(board.url)) !== null) {
        boardNet.set(tmp[2], tmp[1]);
      }else if (!res.sc && (tmp = /https?:\/\/(\w+)\.2ch\.sc\/(\w+)\/.*?/.exec(board.url)) !== null) {
        boardSc.set(tmp[2], tmp[1]);
      }else if (!res.bbspink && (tmp = /https?:\/\/(\w+)\.bbspink\.com\/(\w+)\/.*?/.exec(board.url)) !== null) {
        boardPink.set(tmp[2], tmp[1]);
      }
    }
  }

  if (boardNet.size > 0) serverNet = boardNet;
  if (boardSc.size > 0) serverSc = boardSc;
  if (boardPink.size > 0) serverPink = boardPink;

  res = {
    net: (serverNet.size > 0),
    sc: (serverSc.size > 0),
    bbspink: (serverPink.size > 0)
  };

  return res;
}

export async function pushServerInfo (menu: any[][]): Promise<void> {
  var res: ResInfo;

  res = applyServerInfo(menu);

  if (res.net && res.sc && res.bbspink) {
    return;
  }

  var tmpUrl: string, tmpMenu: any[][];
  if (!res.net || !res.bbspink) {
    tmpUrl = `https://menu.5ch.net/bbsmenu.html`;
    tmpMenu = <any[][]>(await fetchBBSMenu(tmpUrl, false)).menu
    res = applyServerInfo(tmpMenu);
  }
  if (!res.sc) {
    tmpUrl = `https://menu.2ch.sc/bbsmenu.html`;
    tmpMenu = <any[][]>(await fetchBBSMenu(tmpUrl, false)).menu
    res = applyServerInfo(tmpMenu);
  }
}

function exchangeNetSc (url: string): string|null {
  var mode: string[]|null;
  var server: string|null = null;
  var target: string|null = null;
  var resUrl: string|null = null;

  mode = /(https?):\/\/(\w+)\.(5ch\.net|2ch\.sc)\/test\/read\.cgi\/(\w+)\/(\d+)\//.exec(url);
  if (mode === null) {
    return null;
  }

  if (mode[3] === "5ch.net") {
    if (serverSc.has(mode[4]) === true) {
      server = serverSc.get(mode[4])!;
      target = "2ch.sc";
    }
  } else {
    if (serverNet.has(mode[4]) === true) {
      server = serverNet.get(mode[4])!;
      target = "5ch.net";
    }
  }

  if (server !== null) {
    resUrl = `${mode[1]}://${server}.${target}/test/read.cgi/${mode[4]}/${mode[5]}/`;
  }
  return resUrl;
}

export async function convertNetSc (url: string): Promise<string> {
  var newUrl = exchangeNetSc(url);

  if (newUrl) {
    return newUrl;
  }
  var scheme: string;
  var tmpUrl: string;
  var tmp: string[]|null;

  tmp = /(https?):\/\/(\w+)\.5ch\.net\/test\/read\.cgi\/(\w+\/\d+\/)/.exec(url);
  if (tmp === null) {
    throw new Error("不明なURL形式です");
  }
  tmpUrl = `http://${tmp[2]}.2ch.sc/test/read.cgi/${tmp[3]}`;
  scheme = tmp[1];

  var req = new Request("HEAD", tmpUrl);
  var {status, responseURL: resUrl} = await req.send();
  if (status >= 400) {
    throw new Error("移動先情報の取得の通信に失敗しました");
  }
  tmp = /https?:\/\/(\w+)\.2ch\.sc\/test\/read\.cgi\/(\w+)\/(\d+)\//.exec(resUrl);
  if (tmp !== null) {
    if (serverSc.has(tmp[2]) === false) {
      serverSc.set(tmp[2], tmp[1]);
    }
    resUrl = `${scheme}://${tmp[1]}.2ch.sc/test/read.cgi/${tmp[2]}/${tmp[3]}/`;
  }
  return resUrl;
}
