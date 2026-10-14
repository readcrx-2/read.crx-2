import { normalizeBoardUrl } from "src/core/board/BoardUrlNormalizer";
import type { OpenedBoardEntry } from "src/core/board/opened-board-entries";

export function isResolvedBoardTitle(boardUrl: string, candidate: string): boolean {
  if (!candidate.trim() || candidate === boardUrl) return false;
  try {
    const parsed = new URL(boardUrl);
    const path = decodeURIComponent(parsed.pathname.replace(/^\/+|\/+$/g, ""));
    // 履歴に保存された板キーやhost/pathを表示名と誤認すると、実際の板名を再取得できない。
    return (
      candidate !== path && candidate !== `${parsed.hostname}/${path}` && candidate !== parsed.href
    );
  } catch {
    return false;
  }
}

/**
 * ボード URL を正規化して比較可能な形にする
 * 異なる入力形式でも同じボードを識別できるようにする
 */
export function normalizeBoardUrlForRemove(url: string): string {
  const normalizedBoardUrl = normalizeBoardUrl(url);
  if (normalizedBoardUrl !== null) {
    return normalizedBoardUrl;
  }

  try {
    return new window.URL(url).href;
  } catch {
    return url;
  }
}

/**
 * メニュー名とカテゴリ名から一意のカテゴリIDを生成
 */
export function buildCategoryId(menuName: string, categoryName: string): string {
  return `${menuName}:${categoryName}`;
}

/**
 * OpenedBoardEntry から表示用のタイトルを導出
 */
export function deriveOpenedBoardTitle(entry: OpenedBoardEntry): string {
  if (entry.title && entry.title.trim() !== "") {
    return entry.title;
  }

  return entry.url;
}
