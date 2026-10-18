import { createLogger } from "src/app/logger";
import { getBoardUrlKey, normalizeBoardUrl } from "src/core/board/BoardUrlNormalizer";
import {
  MAX_OPENED_BOARD_ENTRIES,
  OPENED_BOARDS_CONFIG_KEY,
  type OpenedBoardEntry,
  parseOpenedBoardEntries,
} from "src/core/board/opened-board-entries";
import type { CorePorts } from "src/core/ports/registry";

const logger = createLogger("core/board");

/** 開いた板の記録の読み書きに必要なサービス。呼び出し側が渡す（C-2）。 */
export type OpenedBoardsDeps = Pick<CorePorts, "config">;

/** 開いた板の記録を書き込むインスタンスを作る。書き込みの順番はインスタンスごとに保つ。 */
export function createOpenedBoards(deps: OpenedBoardsDeps) {
  function readOpenedBoardEntriesForUpsert(): OpenedBoardEntry[] {
    const raw = deps.config.get(OPENED_BOARDS_CONFIG_KEY);
    if (!raw) {
      return [];
    }

    return parseOpenedBoardEntries(raw).map((entry) => ({
      url: entry.url,
      title: entry.title ?? "",
      lastVisited: entry.lastVisited,
      ...(entry.subjectVerified ? { subjectVerified: true as const } : {}),
    }));
  }

  let openedBoardWrite = Promise.resolve();

  function upsertOpenedBoardEntry(
    boardUrl: string,
    boardTitle: string | null,
    lastVisited?: number,
    subjectVerified = false,
  ): void {
    const normalizedUrl = normalizeBoardUrl(boardUrl);
    if (normalizedUrl === null) {
      // 板のパスとして解釈できないURLは、取得確認があっても保存対象から除外する。
      return;
    }
    const nextTitle = boardTitle && boardTitle.trim() !== "" ? boardTitle : undefined;
    // 板の初回記録と遅れて届く板名、複数タブの保存が互いを上書きしないよう順番に保存する。
    openedBoardWrite = openedBoardWrite
      .then(async () => {
        const entries = readOpenedBoardEntriesForUpsert();
        const key = getBoardUrlKey(normalizedUrl);
        const existing = entries.find((entry) => getBoardUrlKey(entry.url) === key);
        const verified = subjectVerified || existing?.subjectVerified === true;
        if (
          !normalizeBoardUrl(normalizedUrl, {
            requireCompatibleHost: true,
            subjectVerified: verified,
          })
        )
          return;
        // 独自ホストの取得確認をレコードへ残し、ホーム・板一覧・再起動で同じ判断を使う。
        const needsConfirmation = !normalizeBoardUrl(normalizedUrl, {
          requireCompatibleHost: true,
        });
        const updated: OpenedBoardEntry = {
          url: normalizedUrl,
          title: nextTitle ?? existing?.title ?? "",
          lastVisited: lastVisited ?? existing?.lastVisited,
          ...(verified && needsConfirmation ? { subjectVerified: true as const } : {}),
        };
        if (
          existing &&
          existing.title === updated.title &&
          existing.lastVisited === updated.lastVisited &&
          existing.subjectVerified === updated.subjectVerified
        )
          return;
        const nextEntries = [
          updated,
          ...entries.filter((entry) => getBoardUrlKey(entry.url) !== key),
        ];
        await deps.config.set(
          OPENED_BOARDS_CONFIG_KEY,
          JSON.stringify(nextEntries.slice(0, MAX_OPENED_BOARD_ENTRIES)),
        );
      })
      .catch((error) => logger.error("開いた板の保存に失敗しました", { boardUrl, error }));
  }

  return { upsertOpenedBoardEntry };
}
