import type { IRes } from "src/service-container/interfaces";
import type { ThreadPage } from "src/view/browser/types";

/** ファイルから読み込んだスレッドの本文。通信で再取得できないため、メモリ上に保持する。 */
export interface ImportedThread {
  title: string;
  responses: IRes[];
}

// 旧版のSikiログタブが復元されても読み込み済みとして扱えるよう、既知のキーはすべて残す。
const IMPORTED_THREAD_QUERY_KEYS = ["read_crx_siki", "read_crx_dat"] as const;

const importedThreads = new Map<string, ImportedThread>();
let importSequence = 0;

export function registerImportedThread(
  queryKey: string,
  threadUrl: string,
  imported: ImportedThread,
): ThreadPage {
  const importedUrl = new URL(threadUrl);
  // 同じスレの別ファイルも個別タブで開けるよう、既存URLと衝突しない識別子をクエリへ付ける。
  importedUrl.searchParams.set(queryKey, String(++importSequence));
  const page: ThreadPage = {
    type: "thread",
    title: imported.title,
    threadUrl: importedUrl.href,
  };

  importedThreads.set(page.threadUrl, {
    title: imported.title,
    responses: imported.responses.map((response) => ({ ...response })),
  });
  return page;
}

export function isImportedThreadUrl(threadUrl: string): boolean {
  try {
    const { searchParams } = new URL(threadUrl);
    return IMPORTED_THREAD_QUERY_KEYS.some((key) => searchParams.has(key));
  } catch {
    return false;
  }
}

export function getImportedThread(threadUrl: string): ImportedThread | null {
  const imported = importedThreads.get(threadUrl);
  if (!imported) {
    return null;
  }

  return {
    title: imported.title,
    responses: imported.responses.map((response) => ({ ...response })),
  };
}
