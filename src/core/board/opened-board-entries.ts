import { getBoardUrlKey, normalizeBoardUrl } from "src/core/board/BoardUrlNormalizer";

// 開いた板の記録の保存形式と、その読み取り（解析）だけを置く純粋なモジュール。
// 書き込み（OpenedBoards.ts の upsertOpenedBoardEntry）は設定の保存を伴うため、view・features からは
// サービスコンテナ経由で使う。読み取りは直接使えるよう、ここへ分けた（計画書 §3.6）。

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
