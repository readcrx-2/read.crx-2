import { ChURL } from "packages/chlib/src/index";
import { Request } from "src/core/network/HTTP";
import { corePorts } from "src/core/ports/registry";
import Cache from "src/core/storage/Cache.js";

// 旧来のapp.URL.URL公開APIだけは同じ実装を指す別名として保ち、新しい呼び出しはChURLを直接使う。
export { ChURL as URL };

export function fix(urlStr: string): string {
  const url = new ChURL(urlStr);
  url.hash = "";
  return url.href;
}

export function tsld(urlStr: string): string {
  return new ChURL(urlStr).getTsld();
}

export function getDomain(urlStr: string): string {
  return new ChURL(urlStr).hostname;
}

export function getProtocol(urlStr: string): string {
  return new ChURL(urlStr).protocol;
}

export function isHttps(urlStr: string): boolean {
  return getProtocol(urlStr) === "https:";
}

export function setProtocol(urlStr: string, protocol: string): string {
  const url = new ChURL(urlStr);
  url.protocol = protocol;
  url.hash = "";
  return url.href;
}

export function getResNumber(urlStr: string): string | null {
  return new ChURL(urlStr).getResNumber();
}

export function threadToBoard(urlStr: string): string {
  return new ChURL(urlStr).toBoard().href;
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
        timeout: parseInt(corePorts.config.get("expand_short_url_timeout")!),
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
    void cache.put();
    finalUrl = res.url;
  } else if (res.data !== null && res.url === null) {
    finalUrl = res.data;
  }
  return finalUrl;
}

const AUDIO_REG = /\.(?:mp3|m4a|wav|oga|spx)(?:[?#:&].*)?$/;
const VIDEO_REG = /\.(?:mp4|m4v|webm|ogv)(?:[?#:&].*)?$/;
const OGG_REG = /\.(?:ogg|ogx)(?:[?#:&].*)?$/;
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
  }> = {},
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
