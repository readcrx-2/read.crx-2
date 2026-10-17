import { ChURL, ThreadParser } from "@chlen/chlib";
import type { IRes } from "src/service-container/interfaces";
import type { ThreadPage } from "src/view/browser/types";
import { registerImportedThread } from "src/view/browser/utils/imported-thread";
import { selectLocalFile } from "src/view/browser/utils/local-file";

const LOCAL_DAT_QUERY_KEY = "read_crx_dat";
// datファイル単体には板やスレのURLが無いため、取得先に使われない予約ドメインの架空URLを割り当てる。
const LOCAL_DAT_BASE_URL = "https://local-dat.invalid/local/dat/";

export interface ParsedLocalDat {
  title: string;
  threadUrl: string;
  responses: IRes[];
}

export function decodeLocalDat(buffer: ArrayBuffer): string {
  // 5ch系のdatはShift_JISで保存されているため、UTF-8として読むと本文が崩れる。
  return new TextDecoder("shift_jis").decode(buffer);
}

export function parseLocalDatText(text: string, fileName: string): ParsedLocalDat {
  const threadUrl = `${LOCAL_DAT_BASE_URL}${encodeURIComponent(fileName)}`;
  const thread = ThreadParser.parse(new ChURL(threadUrl), text);
  if (thread.posts.length === 0) {
    throw new Error(`${fileName}に表示できるレスがありません`);
  }

  return {
    title: thread.title || fileName.replace(/\.dat$/i, ""),
    threadUrl,
    // 共有ライブラリのレスは number、画面側のレスは num で番号を持つため、ここで変換する。
    responses: thread.posts.map(({ number, ...response }) => ({ ...response, num: number })),
  };
}

export async function parseLocalDatFile(
  file: Pick<File, "name" | "arrayBuffer">,
): Promise<ParsedLocalDat> {
  return parseLocalDatText(decodeLocalDat(await file.arrayBuffer()), file.name);
}

export function selectLocalDatFile(): Promise<File | null> {
  return selectLocalFile(".dat,text/plain");
}

export function registerLocalDatThread(parsed: ParsedLocalDat): ThreadPage {
  return registerImportedThread(LOCAL_DAT_QUERY_KEY, parsed.threadUrl, parsed);
}
