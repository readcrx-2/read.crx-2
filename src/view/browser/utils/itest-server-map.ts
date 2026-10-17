import type { ParsedBBSMenu } from "packages/chlib/src/index";
import { createItestServerMap } from "packages/chlib/src/index";
import { createLogger } from "src/app/logger";

const logger = createLogger("view/browser");

const STORAGE_KEY = "itestServerMap";

// URLの解釈と対応表の組み立てはchlibへ委譲し、画面側では保存した結果だけを扱う。
let serverMap = new Map<string, string>();

function loadPersistedMap(): void {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      serverMap = new Map(
        Object.entries(parsed).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
    }
  } catch (error) {
    // 変更理由: 保存領域が無効でも画面を起動できるよう復元は続行しつつ、原因を調査できるよう記録する。
    logger.error("itestサーバー対応表を復元できませんでした:", error);
  }
}

function persistMap(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(serverMap)));
  } catch (error) {
    // 変更理由: 保存に失敗しても現在セッションのメモリ上の対応表は使えるため、失敗を記録して動作を続ける。
    logger.error("itestサーバー対応表を保存できませんでした:", error);
  }
}

// 初回起動直後（bbsmenu未取得）でも前回の対応表を利用できるよう、読み込み時に復元する。
if (typeof window !== "undefined" && "localStorage" in window) {
  loadPersistedMap();
}

/** bbsmenuの板URLから作った対応表を保存する。 */
export function applyBBSMenuToItestServerMap(menus: readonly ParsedBBSMenu[]): void {
  const boardUrls = menus.flatMap((menu) =>
    menu.categories.flatMap((category) => category.boards.map((board) => board.url)),
  );
  const next = createItestServerMap(boardUrls);
  // 変更理由: 空のメニュー取得で有効な保存済み対応表を消さず、次の更新まで解決を続ける。
  if (next.size === 0) return;
  serverMap = new Map(next);
  persistMap();
}

/** 板キーから実サーバーのホスト名を返す。未知の板はnull。 */
export function resolveItestServerHostname(boardKey: string): string | null {
  return serverMap.get(boardKey) ?? null;
}

/** テスト用: 対応表を直接設定する。 */
export function setItestServerMapForTesting(entries: readonly [string, string][]): void {
  serverMap = new Map(entries);
}
