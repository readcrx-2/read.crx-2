import { Request } from "./HTTP";
// @ts-ignore
import { fetch as fetchBBSMenu } from "./BBSMenu.js";
// @ts-ignore
import Cache from "./Cache.js";

export interface GuessResult {
  type: "thread" | "board" | "unknown";
  bbsType: "jbbs" | "machi" | "2ch" | "unknown";
}

let serverNet = new Map<string, string>();
let serverSc = new Map<string, string>();
let serverPink = new Map<string, string>();

export class URL extends window.URL {
  private guessedType: GuessResult = { type: "unknown", bbsType: "unknown" };
  private tsld: string | null = null;
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

  private static readonly CH_THREAD_REG =
    /^\/((?:\w+\/)?test\/(?:read\.cgi|-)\/\w+\/\d+).*$/;
  //private static readonly CH_THREAD_REG2 = /^\/(\w+)\/?(?!test)$/;
  private static readonly CH_THREAD_ULA_REG =
    /^\/2ch\/(\w+)\/([\w\.]+)\/(\d+).*$/;
  private static readonly CH_BOARD_REG =
    /^\/((?:subback\/|test\/-\/)?\w+\/)(?:#.*)?$/;
  private static readonly MACHI_THREAD_REG = /^\/bbs\/read\.cgi\/(\w+\/\d+).*$/;
  private static readonly MACHI_BOARD_REG = /^\/(\w+\/)(?:#.*)?$/;
  private static readonly SHITARABA_THREAD_REG =
    /^\/bbs\/(read(?:_archive)?\.cgi\/\w+\/\d+\/\d+).*$/;
  private static readonly SHITARABA_ARCHIVE_REG =
    /^\/(\w+\/\d+)\/storage\/(\d+)\.html$/;
  private static readonly SHITARABA_BOARD_REG = /^\/(\w+\/\d+\/)(?:#.*)?$/;

  private fixPathAndSetType(
    reg: RegExp,
    replace: (res: string[]) => string,
    type: GuessResult
  ): boolean {
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
        this.guessedType = { type: "thread", bbsType: "2ch" };
      }
      return;
    }

    if (this.hostname.includes("machi.to")) {
      const isThread = this.fixPathAndSetType(
        URL.MACHI_THREAD_REG,
        (res) => `/bbs/read.cgi/${res[1]}/`,
        { type: "thread", bbsType: "machi" }
      );
      if (isThread) return;

      this.fixPathAndSetType(URL.MACHI_BOARD_REG, (res) => `/${res[1]}`, {
        type: "board",
        bbsType: "machi",
      });
      return;
    }

    if (this.hostname === "jbbs.shitaraba.net") {
      const isThread = this.fixPathAndSetType(
        URL.SHITARABA_THREAD_REG,
        (res) => `/bbs/${res[1]}/`,
        { type: "thread", bbsType: "jbbs" }
      );
      if (isThread) {
        if (this.pathname.includes("read_archive")) {
          this.archive = true;
        }
        return;
      }

      const isArchive = this.fixPathAndSetType(
        URL.SHITARABA_ARCHIVE_REG,
        (res) => `/bbs/read_archive.cgi/${res[1]}/${res[2]}/`,
        { type: "thread", bbsType: "jbbs" }
      );
      if (isArchive) {
        this.archive = true;
        return;
      }

      this.fixPathAndSetType(URL.SHITARABA_BOARD_REG, (res) => `/${res[1]}`, {
        type: "board",
        bbsType: "jbbs",
      });
      return;
    }

    // 2ch系
    {
      const isThread = this.fixPathAndSetType(
        URL.CH_THREAD_REG,
        (res) => `/${res[1]}/`,
        { type: "thread", bbsType: "2ch" }
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

      this.fixPathAndSetType(URL.CH_BOARD_REG, (res) => `/${res[1]}`, {
        type: "board",
        bbsType: "2ch",
      });
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
        this.tsld = `${dotList[len - 2]}.${dotList[len - 1]}`;
      } else {
        this.tsld = "";
      }
    }
    return this.tsld;
  }

  isHttps() {
    return this.protocol === "https:";
  }

  toggleProtocol() {
    this.protocol = this.isHttps() ? "http:" : "https:";
  }

  createProtocolToggled(): URL {
    const toggled = new URL(this.href);
    toggled.toggleProtocol();
    return toggled;
  }

  private static readonly CH_RESNUM_REG =
    /^https?:\/\/[\w\.]+\/(?:\w+\/)?test\/(?:read\.cgi|-)\/\w+\/\d+\/(?:i|g\?g=)?(\d+).*$/;
  private static readonly CH_RESNUM_REG2 =
    /^\/2ch\/\w+\/[\w\.]+\/\d+\/(\d+).*$/;
  private static readonly MACHI_RESNUM_REG =
    /^\/bbs\/read\.cgi\/\w+\/\d+\/(\d+).*$/;
  private static readonly SHITARABA_RESNUM_REG =
    /^\/bbs\/read(?:_archive)?\.cgi\/\w+\/\d+\/\d+\/(\d+).*$/;

  getResNumber(): string | null {
    const { type, bbsType } = this.guessedType;

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

  private static readonly CH_TO_BOARD_REG =
    /^\/(?:test|bbs)\/read\.cgi\/(\w+)\/\d+\/$/;
  private static readonly SHITARABA_TO_BOARD_REG =
    /^\/bbs\/read(?:_archive)?\.cgi\/(\w+\/\d+)\/\d+\/$/;

  toBoard(): URL {
    const { type, bbsType } = this.guessedType;
    if (type !== "thread") {
      throw new Error(
        "app.URL.URL.toBoard: toBoard()はThreadでのみ呼び出せます"
      );
    }

    if (bbsType === "jbbs") {
      const pathname = this.pathname.replace(
        URL.SHITARABA_TO_BOARD_REG,
        "/$1/"
      );
      return new URL(`${this.origin}${pathname}`);
    }

    {
      const pathname = this.pathname.replace(URL.CH_TO_BOARD_REG, "/$1/");
      return new URL(`${this.origin}${pathname}`);
    }
  }

  getHashParams(): URLSearchParams {
    return this.rawHash
      ? new URLSearchParams(this.rawHash.slice(1))
      : new URLSearchParams();
  }

  setHashParams(data: Record<string, string>) {
    this.hash = new URLSearchParams(data).toString();
  }

  private static readonly ITEST_5CH_REG =
    /\/(?:(?:\w+\/)?test\/read\.cgi\/(\w+)\/(\d+)\/|(?:subback\/)?(\w+)(?:\/)?)/;
  private static readonly C_5CH_NET_REG = /\/test\/-\/(\w+)\/(?:(\d+)\/)?/;
  private static readonly SP_2CH_SC_REG =
    /\/(?:(?:\w+\/)?test\/read\.cgi\/(\w+)\/(\d+)\/|(?:subback\/)?(\w+)\/)/;
  private static readonly ITEST_BBSPINK_REG =
    /\/(?:(?:\w+\/)?test\/read\.cgi\/(\w+)\/(\d+)\/|(?:subback\/)?(\w+)(?:\/)?)/;

  convertFromPhone() {
    let mode = this.getTsld();
    let reg: RegExp;

    switch (this.hostname) {
      case "itest.5ch.net":
        reg = URL.ITEST_5CH_REG;
        break;

      case "c.5ch.net":
        reg = URL.C_5CH_NET_REG;
        break;

      case "sp.2ch.sc":
        reg = URL.SP_2CH_SC_REG;
        break;

      case "itest.bbspink.com":
        reg = URL.ITEST_BBSPINK_REG;
        break;

      default:
        return;
    }

    const res = reg.exec(this.pathname);
    if (!res) return;

    const board = res[1];
    const thread = res[2] ? res[2] : null;

    if (!board) return;

    let server: string | null = null;

    if (mode === "5ch.net") {
      if (serverNet.has(board)) {
        server = serverNet.get(board);
        // 携帯用bbspinkの可能性をチェック
      } else if (serverPink.has(board)) {
        server = serverPink.get(board);
        mode = "bbspink.com";
      }
    } else if (mode === "2ch.sc" && serverSc.has(board)) {
      server = serverSc.get(board);
    } else if (mode === "bbspink.com" && serverPink.has(board)) {
      server = serverPink.get(board);
    }

    if (server === null) return;

    this.hostname = `${server}.${mode}`;
    this.pathname = `/${board}/` + (thread ? `/${thread}/` : "");
  }

  private async exchangeNetSc() {
    const { type } = this.guessedType;
    const splits = this.pathname.split("/");
    const tsld = this.getTsld();

    let boardKey;
    if (type === "thread" && splits.length > 3) {
      boardKey = splits[3];
    } else if (type === "board" && splits.length > 1) {
      boardKey = splits[1];
    } else {
      return;
    }

    if (tsld === "5ch.net" && serverSc.has(boardKey)) {
      const server = serverSc.get(boardKey);
      this.hostname = `${server}.2ch.sc`;
      return;
    } else if (serverNet.has(boardKey)) {
      const server = serverNet.get(boardKey);
      this.hostname = `${server}.5ch.net`;
      return;
    }

    if (tsld !== "5ch.net") return;

    {
      const hostname = this.hostname.replace(".5ch.net", ".2ch.sc");
      const req = new Request("HEAD", `http://${hostname}${this.pathname}`);
      const { status, responseURL: resUrlStr } = await req.send();
      if (status >= 400) {
        throw new Error("移動先情報の取得の通信に失敗しました");
      }

      const resUrl = new URL(resUrlStr);
      const server = resUrl.hostname.split(".")[0];
      const splits = resUrl.pathname.split("/");

      let boardKey;
      if (type === "thread" && splits.length > 3) {
        boardKey = splits[3];
      } else if (type === "board" && splits.length > 1) {
        boardKey = splits[1];
      } else {
        this.href = resUrlStr;
        return;
      }

      if (!serverSc.has(boardKey)) {
        serverSc.set(boardKey, server);
      }
      this.hostname = resUrl.hostname;
    }
  }

  async createNetScConverted(): Promise<URL> {
    const newUrl = new URL(this.href);
    await newUrl.exchangeNetSc();
    return newUrl;
  }
}

export function fix(urlStr: string): string {
  return new URL(urlStr).href;
}

export function tsld(urlStr: string): string {
  return new URL(urlStr).getTsld();
}

export function getDomain(urlStr: string): string {
  return new URL(urlStr).hostname;
}

export function getProtocol(urlStr: string): string {
  return new URL(urlStr).protocol;
}

export function isHttps(urlStr: string): boolean {
  return getProtocol(urlStr) === "https:";
}

export function setProtocol(urlStr: string, protocol: string): string {
  const url = new URL(urlStr);
  url.protocol = protocol;
  return url.href;
}

export function getResNumber(urlStr: string): string | null {
  return new URL(urlStr).getResNumber();
}

export function threadToBoard(urlStr: string): string {
  return new URL(urlStr).toBoard().href;
}

export function parseQuery(urlStr: string, fromSearch = true): URLSearchParams {
  if (fromSearch) {
    return new URLSearchParams(urlStr.slice(1));
  }
  return new window.URL(urlStr).searchParams;
}

export function buildQuery(data: Record<string, string>): string {
  return new URLSearchParams(data).toString();
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
  "y2u.be",
]);

export async function expandShortURL(shortUrl: string): Promise<string> {
  let finalUrl = "";
  const cache = new Cache(shortUrl);

  const res = await (async () => {
    try {
      await cache.get();
      return { data: cache.data, url: null };
    } catch {
      const req = new Request("HEAD", shortUrl, {
        timeout: parseInt(app.config.get("expand_short_url_timeout")!),
      });

      let { status, responseURL: resUrl } = await req.send();

      if (shortUrl === resUrl && status >= 400) {
        return { data: null, url: null };
      }
      // 無限ループの防止
      if (resUrl === shortUrl) {
        return { data: null, url: null };
      }

      // 取得したURLが短縮URLだった場合は再帰呼出しする
      if (SHORT_URL_LIST.has(getDomain(resUrl))) {
        resUrl = await expandShortURL(resUrl);
        return { data: null, url: resUrl };
      }
      return { data: null, url: resUrl };
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
export function getExtType(
  filename: string,
  {
    audio = true,
    video = true,
    oggIsAudio = false,
    oggIsVideo = true,
  }: Partial<{
    audio: boolean;
    video: boolean;
    oggIsAudio: boolean;
    oggIsVideo: boolean;
  }> = {}
): "audio" | "video" | null {
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
    net: serverNet.size > 0,
    sc: serverSc.size > 0,
    bbspink: serverPink.size > 0,
  };

  if (res.net && res.sc && res.bbspink) return res;

  for (const category of menu) {
    for (const board of category.board) {
      let tmp: string[] | null;

      if (
        !res.net &&
        (tmp = /https?:\/\/(\w+)\.5ch\.net\/(\w+)\/.*?/.exec(board.url)) !==
          null
      ) {
        boardNet.set(tmp[2], tmp[1]);
      } else if (
        !res.sc &&
        (tmp = /https?:\/\/(\w+)\.2ch\.sc\/(\w+)\/.*?/.exec(board.url)) !== null
      ) {
        boardSc.set(tmp[2], tmp[1]);
      } else if (
        !res.bbspink &&
        (tmp = /https?:\/\/(\w+)\.bbspink\.com\/(\w+)\/.*?/.exec(board.url)) !==
          null
      ) {
        boardPink.set(tmp[2], tmp[1]);
      }
    }
  }

  if (boardNet.size > 0) serverNet = boardNet;
  if (boardSc.size > 0) serverSc = boardSc;
  if (boardPink.size > 0) serverPink = boardPink;

  return {
    net: serverNet.size > 0,
    sc: serverSc.size > 0,
    bbspink: serverPink.size > 0,
  };
}

export async function pushServerInfo(menu: any[][]) {
  const res = applyServerInfo(menu);

  if (res.net && res.sc && res.bbspink) {
    return;
  }

  if (!res.net || !res.bbspink) {
    const tmpUrl = `https://menu.5ch.net/bbsmenu.html`;
    const tmpMenu = <any[][]>(await fetchBBSMenu(tmpUrl, false)).menu;
    applyServerInfo(tmpMenu);
  }
  if (!res.sc) {
    const tmpUrl = `https://menu.2ch.sc/bbsmenu.html`;
    const tmpMenu = <any[][]>(await fetchBBSMenu(tmpUrl, false)).menu;
    applyServerInfo(tmpMenu);
  }
}
