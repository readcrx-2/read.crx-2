import type { ChURL } from "../url/ChURL";
import { decodeCharReference } from "../utils/entities";
import { toCanonicalThread } from "./ThreadModelAdapter";

export interface ThreadRes {
  name: string;
  mail: string;
  message: string;
  other: string;
  id?: string;
}

export interface ParsedThread {
  title?: string;
  res: ThreadRes[];
  expired?: boolean;
}

export interface XhrInfo {
  path: string;
  charset: string;
}

export interface ParseThreadOptions {
  format2chnet?: string | null;
  resLength?: number;
}

// サービスワーカーでも同じ解析器を使えるよう、DOMを含むapp/Utilへ依存しない。
// 変更理由: ここで必要なのは文字列置換だけであり、UI初期化を背景取得へ持ち込む理由がない。
const replaceAll = (str: string, before: string, after: string): string =>
  str.replaceAll(before, after);

const titleReg =
  / ?(?:\[(?:無断)?転載禁止\]|(?:\(c\)|©|�|&copy;|&#169;)(?:2ch\.net|@?bbspink\.com)) ?/g;

const removeNeedlessFromTitle = (title: string): string => {
  const trimmed = title.replace(titleReg, "");
  const normalized = trimmed === "" ? title : trimmed;
  return normalized.replaceAll("<mark>", "").replaceAll("</mark>", "");
};

const normalizeHtmlPostId = (rawId: string | undefined): string | undefined => {
  const match = /^(?:ID:)(?!\?\?\?)([^ <>"']+)/i.exec(rawId?.trim() ?? "");
  if (!match) return undefined;

  const id = match[1].replace(/●$/, "");
  return id || undefined;
};

const extractHtmlPostId = (postHtml: string): string | undefined => {
  const dataUserId = /\bdata-userid\s*=\s*["']([^"']*)["']/i.exec(postHtml)?.[1];
  const uid = /<span\b[^>]*\bclass=["'][^"']*\buid\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(
    postHtml,
  )?.[1];

  // 現行HTMLは属性と表示用spanの両方にIDを持つことがあるため、属性を優先しつつ、
  // 片方だけのレスにも対応する。HTML全体からID文字列を拾うと本文中の言及を
  // 誤認するため、レスのメタデータ位置に限定する。
  return normalizeHtmlPostId(dataUserId) ?? normalizeHtmlPostId(uid);
};

const normalizeHtmlPostMetadata = (postHtml: string, fallback: string): string => {
  const date = /<span\b[^>]*\bclass=["'][^"']*\bdate\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(
    postHtml,
  )?.[1];
  if (date == null) return fallback;

  const uid = /<span\b[^>]*\bclass=["'][^"']*\buid\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(
    postHtml,
  )?.[1];
  return [date.trim(), uid?.trim()].filter(Boolean).join(" ");
};

const normalizeResName = (name: string | undefined): string => {
  // 名前欄が空のレスは空文字のままUIへ渡すと投稿者名が表示されないため、
  // 各データ形式の解析結果を共通のデフォルト名へ揃える。
  return name?.trim() ? name : "名無し";
};

const createAbonedRes = (): ThreadRes => ({
  name: "あぼーん",
  mail: "あぼーん",
  message: "あぼーん",
  other: "あぼーん",
});

const createBrokenRes = (): ThreadRes => ({
  name: "</b>データ破損<b>",
  mail: "",
  message: "データが破損しています",
  other: "",
});

const shouldUseDatFor5ch = (url: ChURL, format2chnet: string | null | undefined): boolean => {
  // headline.5ch.io は read.cgi を返さないため dat を強制して取得失敗を防ぐ。
  return url.url.hostname === "headline.5ch.io" || format2chnet === "dat";
};

export const isHtmlThread = (url: ChURL, format2chnet: string | null | undefined): boolean => {
  return (
    (format2chnet !== "dat" &&
      url.getTsld() === "5ch.io" &&
      url.url.hostname !== "headline.5ch.io") ||
    url.getTsld() === "bbspink.com"
  );
};

export const getThreadXhrInfo = (
  url: ChURL,
  format2chnet: string | null | undefined,
): XhrInfo | null => {
  const tmp = new RegExp("^/(?:test|bbs)/read(?:_archive)?\\.cgi/(\\w+)/(\\d+)/(?:(\\d+)/)?$").exec(
    url.url.pathname,
  );
  if (!tmp) {
    return null;
  }

  switch (url.getTsld()) {
    case "machi.to":
      return {
        path: `${url.url.origin}/bbs/offlaw.cgi/${tmp[1]}/${tmp[2]}/`,
        charset: "Shift_JIS",
      };
    case "shitaraba.net":
      if (url.isArchive) {
        return {
          path: url.url.href,
          charset: "EUC-JP",
        };
      }
      return {
        path: `${url.url.origin}/bbs/rawmode.cgi/${tmp[1]}/${tmp[2]}/${tmp[3]}/`,
        charset: "EUC-JP",
      };
    case "5ch.io":
      if (shouldUseDatFor5ch(url, format2chnet)) {
        return {
          path: `${url.url.origin}/${tmp[1]}/dat/${tmp[2]}.dat`,
          charset: "Shift_JIS",
        };
      }
      return {
        path: url.url.href,
        charset: "Shift_JIS",
      };
    case "bbspink.com":
      return {
        path: url.url.href,
        charset: "Shift_JIS",
      };
    default:
      return {
        path: `${url.url.origin}/${tmp[1]}/dat/${tmp[2]}.dat`,
        charset: "Shift_JIS",
      };
  }
};

export const parseThread = (
  url: ChURL,
  text: string,
  options: ParseThreadOptions = {},
): ParsedThread | null => {
  const { format2chnet, resLength } = options;

  switch (url.getTsld()) {
    case "":
      return null;
    case "machi.to":
      return parseMachiThread(text);
    case "shitaraba.net":
      return url.isArchive ? parseJbbsArchiveThread(text) : parseJbbsThread(text);
    case "5ch.io":
      return shouldUseDatFor5ch(url, format2chnet) ? parseChThread(text) : parseNetThread(text);
    case "bbspink.com":
      return parsePinkThread(text, resLength);
    default:
      return parseChThread(text);
  }
};

/** 共有ライブラリが公開するレスの正規化済みモデル。 */
export interface IRes {
  number: number;
  name: string;
  mail: string;
  date: string;
  message: string;
  other?: string;
  id?: string;
  slip?: string;
  trip?: string;
  be?: string;
}

/** 共有ライブラリが公開するスレッドモデル。 */
export interface IThread {
  title?: string;
  posts: IRes[];
}

export type Post = IRes;
export type ThreadData = IThread;

/**
 * 既存の共有APIを保ちながら、解析自体は全形式を扱う共通パーサーへ委譲する。
 * 変更理由: coreとchlibで別実装を育てず、書き込み・表示経路が同じ解析規則を使う。
 */
export class ThreadParser {
  static parse(chUrl: ChURL, text: string): ThreadData {
    const parsed = parseThread(chUrl, text, { format2chnet: "dat" });
    return toCanonicalThread(parsed ?? { res: [] });
  }

  static parseCh(text: string): ThreadData {
    return toCanonicalThread(parseChThread(text) ?? { res: [] });
  }

  static parseJbbs(text: string): ThreadData {
    return toCanonicalThread(parseJbbsThread(text) ?? { res: [] });
  }

  static parseJbbsArchive(text: string): ThreadData {
    return toCanonicalThread(parseJbbsArchiveThread(text) ?? { res: [] });
  }

  static parseMachi(text: string): ThreadData {
    return toCanonicalThread(parseMachiThread(text) ?? { res: [] });
  }
}

const parseCurrentNetThread = (text: string): ParsedThread | null => {
  const titleMatch =
    /<(?:div|h1)\b[^>]*\bid=["']threadtitle["'][^>]*>([\s\S]*?)<\/(?:div|h1)>/i.exec(text);
  const postReg = new RegExp(
    String.raw`(?:<article\b[^>]*>|<div\b(?=[^>]*\bclass=["'][^"']*\bpost\b[^"']*["'])[^>]*>)<details\b[^>]*>[\s\S]*?<summary>\s*<span\b[^>]*\bclass=["'][^"']*\bpostid\b[^"']*["'][^>]*>\d+<\/span><span\b[^>]*\bclass=["'][^"']*\bpostusername\b[^"']*["'][^>]*><b>(?:<a\b[^>]*\bhref=["']mailto:([^"']*)["'][^>]*>|<font\b[^>]*>)?([\s\S]*?)(?:<\/(?:a|font)>)?<\/b><\/span>[\s\S]*?<\/summary>[\s\S]*?<span\b[^>]*\bclass=["'][^"']*\bdate\b[^"']*["'][^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/details>\s*<section\b[^>]*\bclass=["'][^"']*\bpost-content\b[^"']*["'][^>]*>\s?([\s\S]*?)<\/section>`,
    "gi",
  );

  // 過去ログでは、フッターの read.cgi バージョンが 08 でも投稿要素が article ではなく
  // div の場合があるため、バージョン番号に依存する既存分岐より先に現行構造を解析する。
  const thread: ParsedThread = { res: [] };
  if (titleMatch) {
    thread.title = removeNeedlessFromTitle(decodeCharReference(titleMatch[1]));
  }

  for (const postMatch of text.matchAll(postReg)) {
    const id = extractHtmlPostId(postMatch[0]);
    thread.res.push({
      name: normalizeResName(postMatch[2]),
      mail: postMatch[1] || "",
      message: postMatch[4],
      other: normalizeHtmlPostMetadata(postMatch[0], postMatch[3]),
      ...(id ? { id } : {}),
    });
  }

  if (text.includes('<div class="stoplight stopred stopdone">')) {
    thread.expired = true;
  }

  return thread.res.length > 0 ? thread : null;
};

export const parseNetThread = (text: string): ParsedThread | null => {
  let titleReg = /<h1 [^<>]*>(.*)\n?<\/h1>/;
  let reg: RegExp;
  let separator: string;

  const currentThread = parseCurrentNetThread(text);
  if (currentThread) return currentThread;

  if (
    text.includes('<div class="footer push">read.cgi ver 06') &&
    !text.includes("</div></div><br>")
  ) {
    text = text.replace("</h1>", "</h1></div></div>");
    reg =
      /<div class="post"[^<>]*><div class="number">\d+[^<>]* : <\/div><div class="name"><b>(?:<a href="mailto:([^<>]*)">|<font [^<>]*>)?(.*?)(?:<\/(?:a|font)>)?<\/b><\/div><div class="date">(.*)<\/div><div class="message"> ?(.*)/;
    separator = "</div></div>";
  } else if (
    text.includes('<div class="footer push">read.cgi ver 07') ||
    text.includes('<div class="footer push">read.cgi ver 06')
  ) {
    text = text.replace("</h1>", "</h1></div></div><br>");
    reg =
      /<div class="post"[^<>]*><div class="meta"><span class="number">\d+<\/span><span class="name"><b>(?:<a href="mailto:([^<>]*)">|<font [^<>]*>)?(.*?)(?:<\/(?:a|font)>)?<\/b><\/span><span class="date">(.*)<\/span><\/div><div class="message">(?:<span class="escaped">)? ?(.*)(?:<\/span>)/;
    separator = "</div></div><br>";
  } else if (text.match(/<footer[^<>]*><br>read\.cgi ver 07\.([6-9]|\d+)/)) {
    titleReg = /<(?:div|h1) id="threadtitle">(.*)\n?<\/(?:div|h1)>/;
    reg =
      /<span class="postid">\d+<\/span><span class="postusername"><b>(?:<a rel="nofollow" href="mailto:([^<>]*)">|<font [^<>]*>)?(.*?)(?:<\/(?:a|font)>)?<\/b><\/span>(?:<span style=".*">.*<\/span>)?<\/div>(?:<span style=".*">)?<span class="date">(.*)<\/span><\/div><div class="post-content"> ?(.*)/;
    separator = "</div></div>";
  } else if (text.match(/<footer[^<>]*><br>read\.cgi ver 0(7|8)/)) {
    titleReg = /<(?:div|h1) id="threadtitle">(.*)\n?<\/(?:div|h1)>/;
    reg =
      /<article[^<>]*><details[^<>]*><summary><span class="postid">\d+<\/span><span class="postusername"><b>(?:<a href="mailto:([^<>]*)">|<font [^<>]*>)?(.*?)(?:<\/(?:a|font)>)?<\/b><\/span>(?:<span style=".*">.*<\/span>)?<\/summary>(?:<span style=".*">)?<span class="date">(.*)<\/span><\/details><section class="post-content"> ?(.*)<\/section>/;
    separator = "</article>";
  } else {
    reg =
      /^(?:<\/?div.*?(?:<br><br>)?)?<dt>\d+.*：(?:<a href="mailto:([^<>]*)">|<font [^>]*>)?<b>(.*)<\/b>.*：(.*)<dd> ?(.*)<br><br>$/;
    separator = "\n";
  }

  const thread: ParsedThread = { res: [] };
  let gotTitle = false;

  for (const line of text.split(separator)) {
    const title = gotTitle ? null : titleReg.exec(line);
    const regRes = reg.exec(line);

    if (title) {
      thread.title = removeNeedlessFromTitle(decodeCharReference(title[1]));
      gotTitle = true;
    }

    if (regRes) {
      const id = extractHtmlPostId(line);
      thread.res.push({
        name: normalizeResName(regRes[2]),
        mail: regRes[1] || "",
        message: regRes[4],
        other: normalizeHtmlPostMetadata(line, regRes[3]),
        ...(id ? { id } : {}),
      });
    }
  }

  if (text.includes('<div class="stoplight stopred stopdone">')) {
    thread.expired = true;
  }

  return thread.res.length > 0 ? thread : null;
};

export const parseChThread = (text: string): ParsedThread | null => {
  let numberOfBroken = 0;
  const thread: ParsedThread = { res: [] };

  const lines = text.split("\n");
  for (let key = 0; key < lines.length; key++) {
    const line = lines[key];
    if (line === "") {
      continue;
    }

    const sp = line.split("<>");
    if (sp.length >= 4) {
      // 先頭の空行は読み飛ばすため、実際に解析する最初のレスからスレタイを取る。
      if (thread.res.length === 0) {
        thread.title = decodeCharReference(sp[4]);
      }

      thread.res.push({
        name: normalizeResName(sp[0]),
        mail: sp[1],
        message: sp[3],
        other: sp[2],
      });
    } else {
      numberOfBroken++;
      thread.res.push(createBrokenRes());
    }
  }

  return thread.res.length > 0 && thread.res.length > numberOfBroken ? thread : null;
};

const fillAbonedUntil = (
  thread: ParsedThread,
  currentResCount: number,
  targetResCount: number,
): number => {
  let nextCount = currentResCount;
  while (++nextCount !== targetResCount) {
    thread.res.push(createAbonedRes());
  }
  return nextCount;
};

export const parseMachiThread = (text: string): ParsedThread | null => {
  const thread: ParsedThread = { res: [] };
  let resCount = 0;
  let numberOfBroken = 0;

  for (const line of text.split("\n")) {
    if (line === "") {
      continue;
    }

    const sp = line.split("<>");
    if (sp.length >= 5) {
      resCount = fillAbonedUntil(thread, resCount, Number(sp[0]));
      if (resCount === 1) {
        thread.title = decodeCharReference(sp[5]);
      }

      thread.res.push({
        name: normalizeResName(sp[1]),
        mail: sp[2],
        message: sp[4],
        other: sp[3],
      });
    } else {
      numberOfBroken++;
      thread.res.push(createBrokenRes());
    }
  }

  return thread.res.length > 0 && thread.res.length > numberOfBroken ? thread : null;
};

export const parseJbbsThread = (text: string): ParsedThread | null => {
  const thread: ParsedThread = { res: [] };
  let resCount = 0;
  let numberOfBroken = 0;

  for (const line of text.split("\n")) {
    if (line === "") {
      continue;
    }

    const sp = line.split("<>");
    if (sp.length >= 6) {
      resCount = fillAbonedUntil(thread, resCount, Number(sp[0]));
      if (resCount === 1) {
        thread.title = decodeCharReference(sp[5]);
      }

      thread.res.push({
        name: normalizeResName(sp[1]),
        mail: sp[2],
        message: sp[4],
        other: sp[3] + (sp[6] ? ` ID:${sp[6]}` : ""),
      });
    } else {
      numberOfBroken++;
      thread.res.push(createBrokenRes());
    }
  }

  return thread.res.length > 0 && thread.res.length > numberOfBroken ? thread : null;
};

export const parseJbbsArchiveThread = (text: string): ParsedThread | null => {
  text = replaceAll(text, "\n", "");
  text = text.replace(/<\/h1>\s*<dl>/, "</h1></dd><br><br>");

  const reg =
    /<dt[^>]*>\s*\d+ ：\s*(?:<a href="mailto:([^<>]*)">)?\s*(?:<font [^>]*>)?\s*<b>(.*)<\/b>.*：(.*)\s*<\/dt>\s*<dd>\s*(.*)\s*<br>/;
  const separator = /<\/dd>[\s\n]*<br><br>/;
  const titleReg = /<h1>(.*)<\/h1>/;

  const thread: ParsedThread = { res: [] };
  let gotTitle = false;

  for (const line of text.split(separator)) {
    const title = gotTitle ? null : titleReg.exec(line);
    const regRes = reg.exec(line);

    if (title) {
      thread.title = decodeCharReference(title[1]);
      gotTitle = true;
    } else if (regRes) {
      thread.res.push({
        name: normalizeResName(regRes[2]),
        mail: regRes[1] || "",
        message: regRes[4],
        other: regRes[3],
      });
    }
  }

  return thread.res.length > 0 ? thread : null;
};

export const parsePinkThread = (text: string, resLength?: number): ParsedThread | null => {
  let titleReg = /<h1 .*?>(.*)\n?<\/h1>/;
  let reg: RegExp;
  let separator: string;

  if (text.includes('<div class="footer push">read.cgi ver 06')) {
    text = text.replace(/<\/h1>/, "</h1></dd></dl>");
    reg =
      /^.*?<dl class="post".*><dt class=""><span class="number">(\d+).* : <\/span><span class="name"><b>(?:<a href="mailto:([^<>]*)">|<font [^>]*>)?(.*?)(?:<\/a>|<\/font>)?<\/b><\/span><span class="date">(.*)<\/span><\/dt><dd class="thread_in"> ?(.*)$/;
    separator = "</dd></dl>";
  } else if (text.includes('<div class="footer push">read.cgi ver 07')) {
    text = text.replace("</h1>", "</h1></div></div><br>");
    reg =
      /<div class="post"[^<>]*><div class="meta"><span class="number">(\d+).*<\/span><span class="name"><b>(?:<a href="mailto:([^<>]*)">|<font [^<>]*>)?(.*?)(?:<\/(?:a|font)>)?<\/b><\/span>(?:<span style=".*">;.*<\/span>)?(?:<span style=".*">)?<span class="date">(.*)<\/span><\/div><div class="message">(?:<span class="escaped">)? ?(.*)(?:<\/span>)/;
    separator = "</div></div><br>";
  } else if (text.match(/<footer[^<>]*><br>read\.cgi ver 0(8|9)/)) {
    titleReg = /<div id="threadtitle">(.*)\n?<\/div>/;
    reg =
      /<article id="(\d+)"[^<>]*><details[^<>]*><summary><span class="postid">\d+<\/span><span class="postusername"><b>(?:<a href="mailto:([^<>]*)">|<font [^<>]*>)?(.*?)(?:<\/(?:a|font)>)?<\/b><\/span>(?:<span style=".*">;.*<\/span>)?<\/summary>(?:<span style=".*">)?<span class="date">(.*)<\/span><\/details><section class="post-content"> ?(.*)<\/section>/;
    separator = "</article>";
  } else {
    reg =
      /^(?:<\/?div.*?(?:<br><br>)?)?<dt>(\d+).*：(?:<a href="mailto:([^<>]*)">|<font [^>]*>)?<b>(.*)<\/b>.*：(.*)<dd> ?(.*)<br><br>$/;
    separator = "\n";
  }

  const thread: ParsedThread = { res: [] };
  let gotTitle = false;
  let resCount = resLength ?? 0;

  for (const line of text.split(separator)) {
    const title = gotTitle ? null : titleReg.exec(line);
    const regRes = reg.exec(line);

    if (title) {
      thread.title = removeNeedlessFromTitle(decodeCharReference(title[1]));
      gotTitle = true;
    }

    if (regRes) {
      while (++resCount < Number(regRes[1])) {
        thread.res.push(createAbonedRes());
      }
      thread.res.push({
        name: normalizeResName(regRes[3]),
        mail: regRes[2] || "",
        message: regRes[5],
        other: regRes[4],
      });
    }
  }

  return thread.res.length > 0 ? thread : null;
};
