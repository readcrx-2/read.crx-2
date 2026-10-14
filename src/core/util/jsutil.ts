import {
  type NextThreadCandidate,
  searchNextThreadCandidates,
} from "src/core/board/next-thread-candidates";
import { corePorts } from "src/core/ports/registry";

// 既存利用箇所のimport互換を保ちつつ、責務別の実装を直接利用できるよう再公開する。
export { chServerMoveDetect } from "src/core/board/ch-server-move-detect";
export { isNewerReadState } from "src/core/bookmark/read-state-compare";
export { indexedDBRequestToPromise } from "src/core/storage/idb-request";
export { Anchor } from "src/core/thread/anchor";
export { decodeCharReference } from "src/core/util/char-reference";
export { stampToDate, stringToDate } from "src/core/util/date-convert";
export { normalize } from "src/core/util/string-normalize";

// マウス操作ごとの開き方は既存画面の挙動を維持するため同じ対応表を使う。
type OpenHowTo = { newTab: boolean; newWindow: boolean; background: boolean };
const openMap = new Map<string, OpenHowTo>([
  ["0falsefalse", { newTab: false, newWindow: false, background: false }],
  ["0truefalse", { newTab: false, newWindow: true, background: false }],
  ["0falsetrue", { newTab: true, newWindow: false, background: true }],
  ["0truetrue", { newTab: true, newWindow: false, background: false }],
  ["1falsefalse", { newTab: true, newWindow: false, background: true }],
  ["1truefalse", { newTab: true, newWindow: false, background: false }],
  ["1falsetrue", { newTab: true, newWindow: false, background: true }],
  ["1truetrue", { newTab: true, newWindow: false, background: false }],
]);

export function getHowToOpen({
  type,
  button,
  shiftKey,
  ctrlKey,
  metaKey,
}: {
  type: string;
  button: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): OpenHowTo {
  // 既定値は呼び出しごとに作り、従来の返却オブジェクトの独立性を保つ。
  const defaultOpenHowTo: OpenHowTo = { newTab: false, newWindow: false, background: false };
  const controlKey = ctrlKey || metaKey;
  if (type === "mousedown") {
    return openMap.get(`${button}${shiftKey}${controlKey}`) ?? defaultOpenHowTo;
  }
  return defaultOpenHowTo;
}

// window.app.util の公開 API を保つため、登録済みのサービス（corePorts）で板を取得する入口を残す。
// 実装は依存を引数で受け取る core/board/next-thread-candidates にある。
export function searchNextThread(
  threadUrlStr: string,
  threadTitle: string,
  resString: string,
): Promise<NextThreadCandidate[]> {
  return searchNextThreadCandidates(threadUrlStr, threadTitle, resString, corePorts);
}

export const stripTags = (str: string): string => str.replace(/<[^>]+>/gi, "");

const titleReg =
  / ?(?:\[(?:無断)?転載禁止\]|(?:\(c\)|©|�|&copy;|&#169;)(?:2ch\.net|@?bbspink\.com)) ?/g;
/** タイトルから転載禁止表記と検索ハイライト用タグを取り除く。 */
export function removeNeedlessFromTitle(title: string): string {
  const title2 = title.replace(titleReg, "");
  title = title2 === "" ? title : title2;
  return title.replaceAll("<mark>", "").replaceAll("</mark>", "");
}

type PromiseState = "pending" | "resolved" | "rejected";
export function promiseWithState<T>(promise: Promise<T>) {
  let state: PromiseState = "pending";
  promise.then(
    () => {
      state = "resolved";
    },
    () => {
      state = "rejected";
    },
  );
  return {
    isResolved: () => state === "resolved",
    isRejected: () => state === "rejected",
    getState: () => state,
    promise,
  };
}
