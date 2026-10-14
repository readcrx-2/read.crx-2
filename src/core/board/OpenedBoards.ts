import { getBoardUrlKey, normalizeBoardUrl } from "src/core/board/BoardUrlNormalizer";
import type { CorePorts } from "src/core/ports/registry";
import { corePorts } from "src/core/ports/registry";

// 変更理由: 「一度開いた板」の保存キーと読み書きが画面・BBSMenuModel・設定画面へ散らばり、
// 正規化や重複排除の規則が実装ごとにずれていたため、保存形式の責務をここへ集約する。
export const OPENED_BOARDS_CONFIG_KEY = "opened_board_entries";
export const MAX_OPENED_BOARD_ENTRIES = 500;

export interface OpenedBoardEntry {
  url: string;
  title?: string;
  lastVisited?: number;
  subjectVerified?: true;
}

/**
 * JSON文字列から OpenedBoardEntry 配列をパース
 * 破損データや不正な形式は安全に無視する
 */
export function parseOpenedBoardEntries(raw: string | null): OpenedBoardEntry[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Array<{
      url?: unknown;
      title?: unknown;
      lastVisited?: unknown;
      subjectVerified?: unknown;
    }>;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const entries = parsed
      .map((entry): OpenedBoardEntry | null => {
        if (!entry || typeof entry.url !== "string") {
          return null;
        }

        // 未確認の外部サイトを除外しつつ、スレ一覧を取得できた独自ホストは保存記録で認める。
        const normalizedUrl = normalizeBoardUrl(entry.url, {
          requireCompatibleHost: true,
          subjectVerified: entry.subjectVerified === true,
        });
        if (!normalizedUrl) {
          return null;
        }

        const normalizedEntry: OpenedBoardEntry = { url: normalizedUrl };
        if (entry.subjectVerified === true) normalizedEntry.subjectVerified = true;
        if (typeof entry.title === "string") {
          normalizedEntry.title = entry.title;
        }
        // 日時のない旧データはそのまま読み込み、不正な日時で「今日」に分類されるのを防ぐ。
        if (typeof entry.lastVisited === "number" && Number.isFinite(entry.lastVisited)) {
          normalizedEntry.lastVisited = entry.lastVisited;
        }
        return normalizedEntry;
      })
      .filter((entry): entry is OpenedBoardEntry => entry !== null);

    const uniqueEntries: OpenedBoardEntry[] = [];
    const indexByBoardKey = new Map<string, number>();
    for (const entry of entries) {
      const boardKey = getBoardUrlKey(entry.url, {
        requireCompatibleHost: true,
        subjectVerified: entry.subjectVerified === true,
      });
      if (boardKey === null) {
        continue;
      }

      const existingIndex = indexByBoardKey.get(boardKey);
      if (existingIndex === undefined) {
        indexByBoardKey.set(boardKey, uniqueEntries.length);
        uniqueEntries.push(entry);
        continue;
      }

      // 重複レコードのうち後ろにだけ板名がある場合は、その名前を引き継ぐ。
      if (!uniqueEntries[existingIndex].title && entry.title) {
        uniqueEntries[existingIndex] = { ...uniqueEntries[existingIndex], title: entry.title };
      }
      if (entry.subjectVerified) uniqueEntries[existingIndex].subjectVerified = true;
      if ((entry.lastVisited ?? 0) > (uniqueEntries[existingIndex].lastVisited ?? 0)) {
        uniqueEntries[existingIndex] = {
          ...uniqueEntries[existingIndex],
          lastVisited: entry.lastVisited,
        };
      }
    }

    return uniqueEntries;
  } catch (error) {
    // 破損データは空扱いにして板一覧表示を継続するが、原因調査のため必ずログに残す。
    console.error("開いた板の記録を読み込めませんでした", { error });
    return [];
  }
}

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
      .catch((error) => console.error("開いた板の保存に失敗しました", { boardUrl, error }));
  }

  return { upsertOpenedBoardEntry };
}

// 既存の import 先（view の板一覧・スレ一覧）を維持するため、登録済みのサービスで組み立てた既定のインスタンスを公開する。
// 依存は関数が呼ばれた時点で参照されるため、ここでの組み立てで未登録の例外は出ない。
const defaultOpenedBoards = createOpenedBoards(corePorts);

export const { upsertOpenedBoardEntry } = defaultOpenedBoards;
