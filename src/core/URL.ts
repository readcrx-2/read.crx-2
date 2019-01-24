import {Request} from "./HTTP"
// @ts-ignore
import {fetch as fetchBBSMenu} from "./BBSMenu.coffee"
// @ts-ignore
import Cache from "./Cache.coffee"

export interface GuessResult {
  type: "thread"|"board"|"unknown";
  bbsType: "jbbs"|"machi"|"2ch"|"unknown";
}

export class URL extends window.URL {
  private guessedType: GuessResult = {type: "unknown", bbsType: "unknown"};
  private tsld: string|null = null;
  private readonly rawUrl: string;
  private readonly rawHash: string;
  private archive = false;

  constructor(url: string) {
    super(url);
    this.rawUrl = url;
    this.rawHash = this.hash;
    this.hash = "";

    this.fix();
  }

  private static readonly CH_THREAD_REG = /^\/((?:\w+\/)?test\/(?:read\.cgi|-)\/\w+\/\d+).*$/;
  //private static readonly CH_THREAD_REG2 = /^\/(\w+)\/?(?!test)$/;
  private static readonly CH_THREAD_ULA_REG = /^\/2ch\/(\w+)\/([\w\.]+)\/(\d+).*$/;
  private static readonly CH_BOARD_REG = /^\/((?:subback\/|test\/-\/)?\w+\/)(?:#.*)?$/;
  private static readonly MACHI_THREAD_REG = /^\/bbs\/read\.cgi\/(\w+\/\d+).*$/;
  private static readonly MACHI_BOARD_REG = /^\/(\w+\/)(?:#.*)?$/;
  private static readonly SHITARABA_THREAD_REG = /^\/bbs\/(read(?:_archive)?\.cgi\/\w+\/\d+\/\d+).*$/;
  private static readonly SHITARABA_ARCHIVE_REG = /^\/(\w+\/\d+)\/storage\/(\d+)\.html$/;
  private static readonly SHITARABA_BOARD_REG = /^\/(\w+\/\d+\/)(?:#.*)?$/;

  private fixPathAndSetType(reg: RegExp, replace: (res: string[]) => string, type: GuessResult): boolean {
    const res = reg.exec(this.pathname);
    if (res) {
      this.pathname = replace(res);
      this.guessedType = type;
    }
    return !!res;
  }

  private fix() {
    // 2ch.net -> 5ch.net & jbbs.livedoor.jp -> jbbs.shitaraba.net
    if (this.hostname === "2ch.net" || this.hostname.endsWith(".2ch.net")) {
      this.hostname = this.hostname.replace("2ch.net", "5ch.net");
    } else if (this.hostname === "jbbs.livedoor.jp") {
      this.hostname = "jbbs.shitaraba.net";
    }

    // スレ系: 誤爆する事は考えられないので、パラメータ部分をバッサリ切ってしまう
    // 板系: 完全に誤爆を少しでも減らすために、パラメータ形式も限定する
    if (this.hostname === "ula.5ch.net") {
      const res = URL.CH_THREAD_ULA_REG.exec(this.pathname);
      if (res) {
        this.hostname = res[2];
        this.pathname = `/test/read.cgi/${res[1]}/${res[3]}/`;
        this.guessedType = {type: "thread", bbsType: "2ch"};
      }
      return;
    }

    if (this.hostname.includes("machi.to")) {
      const isThread = this.fixPathAndSetType(
        URL.MACHI_THREAD_REG,
        (res) => `/bbs/read.cgi/${res[1]}`,
        {type: "thread", bbsType: "machi"}
      );
      if (isThread) return;

      this.fixPathAndSetType(
        URL.MACHI_BOARD_REG,
        (res) => `/${res[1]}`,
        {type: "board", bbsType: "machi"}
      );
      return;
    }

    if (this.hostname === "jbbs.shitaraba.net") {
      const isThread = this.fixPathAndSetType(
        URL.SHITARABA_THREAD_REG,
        (res) => `/bbs/${res[1]}/`,
        {type: "thread", bbsType: "jbbs"}
      );
      if (isThread) return;

      const isArchive = this.fixPathAndSetType(
        URL.SHITARABA_ARCHIVE_REG,
        (res) => `/bbs/read_archive.cgi/${res[1]}/${res[2]}`,
        {type: "thread", bbsType: "jbbs"}
      );
      if (isArchive) {
        this.archive = true;
        return;
      }

      this.fixPathAndSetType(
        URL.SHITARABA_BOARD_REG,
        (res) => `/${res[1]}`,
        {type: "board", bbsType: "jbbs"}
      );
      return;
    }

    // 2ch系
    {
      const isThread = this.fixPathAndSetType(
        URL.CH_THREAD_REG,
        (res) => `/${res[1]}/`,
        {type: "thread", bbsType: "2ch"}
      );
      if (isThread) return;

      /*
      const isThread2 = this.fixPathAndSetType(
        URL.CH_THREAD_REG2,
        (res) => `/${res[1]}/`,
        {type: "thread", bbsType: "2ch"}
      );
      if (isThread2) return;
      */

      this.fixPathAndSetType(
        URL.CH_BOARD_REG,
        (res) => `/${res[1]}`,
        {type: "board", bbsType: "2ch"}
      );
    }
  }

  guessType(): GuessResult {
    return this.guessedType;
  }

  isArchive(): boolean {
    return this.archive;
  }

  getTsld(): string {
    if (this.tsld === null) {
      const dotList = this.hostname.split(".");
      const len = dotList.length;
      if (len >= 2) {
        this.tsld = `${dotList[len-2]}.${dotList[len-1]}`;
      } else {
        this.tsld = "";
      }
    }
    return this.tsld;
  }

  toggleProtocol() {
    this.protocol = (this.protocol === "http:") ? "https:" : "http:";
  }

  createProtocolToggled(): URL {
    const toggled = new URL(this.href);
    toggled.toggleProtocol();
    return toggled;
  }

  private static readonly CH_RESNUM_REG = /^https?:\/\/[\w\.]+\/(?:\w+\/)?test\/(?:read\.cgi|-)\/\w+\/\d+\/(?:i|g\?g=)?(\d+).*$/;
  private static readonly CH_RESNUM_REG2 = /^\/2ch\/\w+\/[\w\.]+\/\d+\/(\d+).*$/;
  private static readonly MACHI_RESNUM_REG = /^\/bbs\/read\.cgi\/\w+\/\d+\/(\d+).*$/;
  private static readonly SHITARABA_RESNUM_REG = /^\/bbs\/read(?:_archive)?\.cgi\/\w+\/\d+\/\d+\/(\d+).*$/;

  getResNumber(): string|null {
    const {type, bbsType} = this.guessedType;

    if (type !== "thread" || bbsType === "unknown") {
      return null;
    }

    const raw = new window.URL(this.rawUrl);

    if (bbsType === "jbbs") {
      const res = URL.SHITARABA_RESNUM_REG.exec(raw.pathname);
      return res ? res[1] : null;
    }

    if (bbsType === "machi") {
      const res = URL.MACHI_RESNUM_REG.exec(raw.pathname);
      return res ? res[1] : null;
    }

    if (raw.hostname === "ula.5ch.net") {
      const res = URL.CH_RESNUM_REG2.exec(raw.pathname);
      return res ? res[1] : null;
    }

    // 2ch系
    {
      const res = URL.CH_RESNUM_REG.exec(raw.href);
      if (res) {
        return res[1];
      }
    }
    return null;
  }

  private static readonly CH_TO_BOARD_REG = /^\/(?:test|bbs)\/read\.cgi\/(\w+)\/\d+\/$/;
  private static readonly SHITARABA_TO_BOARD_REG = /^\/bbs\/read(?:_archive)?\.cgi\/(\w+\/\d+)\/\d+\/$/;

  toBoard(): URL {
    const {type, bbsType} = this.guessedType;
    if (type !== "thread") {
      throw new Error("app.URL.URL.toBoard: toBoard()はThreadでのみ呼び出せます")
    }

    if (bbsType === "jbbs") {
      const pathname = this.pathname.replace(URL.SHITARABA_TO_BOARD_REG, "/$1/");
      return new URL(`${this.origin}${pathname}`);
    }

    {
      const pathname = this.pathname.replace(URL.CH_TO_BOARD_REG, "/$1/");
      return new URL(`${this.origin}${pathname}`);
    }
  }

  getHashParams(): URLSearchParams {
    return this.rawHash ? new URLSearchParams(this.rawHash.slice(1)) : new URLSearchParams();
  }

  setHashParams(data: Record<string, string>) {
    this.hash = (new URLSearchParams(data)).toString();
  }
}

export function fix(urlStr: string): string {
  return (new URL(urlStr)).href;
}

const TSLD_REG = /^https?:\/\/(?:\w+\.)*(\w+\.\w+)\//;
export function tsld(url: string): string {
  const res = TSLD_REG.exec(url);
  return res ? res[1] : "";
}

export function getDomain(urlStr: string): string {
  return (new URL(urlStr)).hostname;
}

export function getProtocol(urlStr: string): string {
  return (new URL(urlStr)).protocol;
}

export function setProtocol(urlStr: string, protocol: string): string {
  const url = new URL(urlStr);
  url.protocol = protocol;
  return url.href;
}

export function getResNumber(urlstr: string): string|null {
  let tmp = /^https?:\/\/[\w\.]+\/(?:\w+\/)?test\/(?:read\.cgi|-)\/\w+\/\d+\/(?:i|g\?g=)?(\d+).*$/.exec(urlstr);
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

export function threadToBoard(url: string): string {
  return (new URL(url)).toBoard().href;
}

export function parseQuery(urlStr: string, fromSearch: boolean = true): URLSearchParams {
  if (fromSearch) {
    return new URLSearchParams(urlStr.slice(1));
  }
  return (new window.URL(urlStr)).searchParams;
}

export function buildQuery(data: Record<string, string>): string {
  return (new URLSearchParams(data)).toString();
}

export const SHORT_URL_LIST: ReadonlySet<string> = new Set([
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
  "xrl.us",
  "y2u.be"
]);

export async function expandShortURL(shortUrl: string): Promise<string> {
  let finalUrl = "";
  const cache = new Cache(shortUrl);

  const res = await ( async () => {
    try {
      await cache.get();
      return {data: cache.data, url: null};
    } catch {
      const req = new Request("HEAD", shortUrl, {
        timeout: parseInt(app.config.get("expand_short_url_timeout")!)
      });

      let {status, responseURL: resUrl} = await req.send();

      if (shortUrl === resUrl && status >= 400) {
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
      }
      return {data: null, url: resUrl};
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
export function getExtType(filename: string, {
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
): "audio"|"video"|null {
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

export function convertUrlFromPhone(url: string): string {
  let regs: RegExp[];
  let tmp: string[]|null = [];
  let scheme = "";
  let server: string|null = null;
  let board: string|null = null;
  let thread: string|null = null;

  const checkReg = (value: any): boolean => {
    return (tmp = value.exec(url));
  }

  let mode = tsld(url);
  switch (mode) {
    case "2ch.net":
    case "5ch.net":
      regs = [
        /(https?):\/\/itest\.5ch\.net\/(?:\w+\/)?test\/read\.cgi\/(\w+)\/(\d+)\//,
        /(https?):\/\/itest\.5ch\.net\/(?:subback\/)?(\w+)(?:\/)?/,
        /(https?):\/\/c\.2ch\.net\/test\/-\/(\w+)\/(\d+)\//,
        /(https?):\/\/c\.2ch\.net\/test\/-\/(\w+)\//
      ];
      if (regs.some(checkReg)) {
        scheme = tmp[1];
        board = tmp[2];
        thread = tmp[3] ? tmp[3] : null;
        if (board !== null) {
          if (serverNet.has(board)) {
            server = serverNet.get(board);
          // 携帯用bbspinkの可能性をチェック
          } else if (serverPink.has(board)) {
            server = serverPink.get(board);
            mode = "bbspink.com";
          }
        }
      }
      break;

    case "2ch.sc":
      regs = [
        /(https?):\/\/sp\.2ch\.sc\/(?:\w+\/)?test\/read\.cgi\/(\w+)\/(\d+)\//,
        /(https?):\/\/sp\.2ch\.sc\/(?:subback\/)?(\w+)\//
      ];
      if (regs.some(checkReg)) {
        scheme = tmp[1];
        board = tmp[2];
        thread = tmp[3] ? tmp[3] : null;
        if (board !== null && serverSc.has(board)) {
          server = serverSc.get(board);
        }
      }
      break;

    case "bbspink.com":
      regs = [
        /(https?):\/\/itest\.bbspink\.com\/(?:\w+\/)?test\/read\.cgi\/(\w+)\/(\d+)\//,
        /(https?):\/\/itest\.bbspink\.com\/(?:subback\/)?(\w+)(?:\/)?/
      ];
      if (regs.some(checkReg)) {
        scheme = tmp[1];
        board = tmp[2];
        thread = tmp[3] ? tmp[3] : null;
        if (board !== null && serverPink.has(board)) {
          server = serverPink.get(board);
        }
      }
      break;
  }

  if (server === null) {
    return url;
  }
  if (thread === null) {
    return `${scheme}://${server}.${mode}/${board}/`;
  }
  return `${scheme}://${server}.${mode}/test/read.cgi/${board}/${thread}/`;
}

let serverNet = new Map<string, string>();
let serverSc = new Map<string, string>();
let serverPink = new Map<string, string>();

interface ResInfo {
  net: boolean;
  sc: boolean;
  bbspink: boolean;
}

function applyServerInfo(menu: any[]): ResInfo {
  const boardNet = new Map<string, string>();
  const boardSc = new Map<string, string>();
  const boardPink = new Map<string, string>();
  const res: ResInfo = {
    net: (serverNet.size > 0),
    sc: (serverSc.size > 0),
    bbspink: (serverPink.size > 0)
  };

  if (res.net && res.sc && res.bbspink) return res;

  for (const category of menu) {
    for (const board of category.board) {
      let tmp: string[]|null;

      if (!res.net && (tmp = /https?:\/\/(\w+)\.[25]ch\.net\/(\w+)\/.*?/.exec(board.url)) !== null) {
        boardNet.set(tmp[2], tmp[1]);
      } else if (!res.sc && (tmp = /https?:\/\/(\w+)\.2ch\.sc\/(\w+)\/.*?/.exec(board.url)) !== null) {
        boardSc.set(tmp[2], tmp[1]);
      } else if (!res.bbspink && (tmp = /https?:\/\/(\w+)\.bbspink\.com\/(\w+)\/.*?/.exec(board.url)) !== null) {
        boardPink.set(tmp[2], tmp[1]);
      }
    }
  }

  if (boardNet.size > 0) serverNet = boardNet;
  if (boardSc.size > 0) serverSc = boardSc;
  if (boardPink.size > 0) serverPink = boardPink;

  return {
    net: (serverNet.size > 0),
    sc: (serverSc.size > 0),
    bbspink: (serverPink.size > 0)
  };
}

export async function pushServerInfo(menu: any[][]) {
  const res = applyServerInfo(menu);

  if (res.net && res.sc && res.bbspink) {
    return;
  }

  if (!res.net || !res.bbspink) {
    const tmpUrl = `https://menu.5ch.net/bbsmenu.html`;
    const tmpMenu = <any[][]>(await fetchBBSMenu(tmpUrl, false)).menu
    applyServerInfo(tmpMenu);
  }
  if (!res.sc) {
    const tmpUrl = `https://menu.2ch.sc/bbsmenu.html`;
    const tmpMenu = <any[][]>(await fetchBBSMenu(tmpUrl, false)).menu
    applyServerInfo(tmpMenu);
  }
}

function exchangeNetSc(url: string): string|null {
  let server: string|null = null;
  let target: string|null = null;

  const mode = /(https?):\/\/(\w+)\.(5ch\.net|2ch\.sc)\/test\/read\.cgi\/(\w+)\/(\d+)\//.exec(url);
  if (mode === null) {
    return null;
  }

  if (mode[3] === "5ch.net") {
    if (serverSc.has(mode[4])) {
      server = serverSc.get(mode[4]);
      target = "2ch.sc";
    }
  } else {
    if (serverNet.has(mode[4])) {
      server = serverNet.get(mode[4]);
      target = "5ch.net";
    }
  }

  if (server === null) {
    return null;
  }
  return `${mode[1]}://${server}.${target}/test/read.cgi/${mode[4]}/${mode[5]}/`;
}

export async function convertNetSc(url: string): Promise<string> {
  const newUrl = exchangeNetSc(url);

  if (newUrl) {
    return newUrl;
  }

  const tmp = /(https?):\/\/(\w+)\.5ch\.net\/test\/read\.cgi\/(\w+\/\d+\/)/.exec(url);
  if (tmp === null) {
    throw new Error("不明なURL形式です");
  }
  const tmpUrl = `http://${tmp[2]}.2ch.sc/test/read.cgi/${tmp[3]}`;
  const scheme = tmp[1];

  const req = new Request("HEAD", tmpUrl);
  const {status, responseURL: resUrl} = await req.send();
  if (status >= 400) {
    throw new Error("移動先情報の取得の通信に失敗しました");
  }
  const tmp2 = /https?:\/\/(\w+)\.2ch\.sc\/test\/read\.cgi\/(\w+)\/(\d+)\//.exec(resUrl);
  if (tmp2 === null) {
    return resUrl;
  }

  if (!serverSc.has(tmp2[2])) {
    serverSc.set(tmp2[2], tmp2[1]);
  }
  return `${scheme}://${tmp2[1]}.2ch.sc/test/read.cgi/${tmp2[2]}/${tmp2[3]}/`;
}
