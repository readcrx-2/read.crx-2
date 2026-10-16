import { createLogger } from "src/app/logger";
import {
  COMMENT_OVERLAY_ASPECT_RATIO,
  type CommentOverlayGeometry,
  DEFAULT_COMMENT_OVERLAY_GEOMETRY,
} from "./types";

const logger = createLogger("comment-overlay");

export const COMMENT_OVERLAY_GEOMETRY_STORAGE_KEY = "chlens:comment-overlay-geometry";

export interface CommentOverlayWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function normalizeCommentOverlayGeometry(
  geometry: CommentOverlayGeometry,
): CommentOverlayGeometry {
  return {
    x: Math.round(geometry.x),
    y: Math.round(geometry.y),
    width: Math.max(320, Math.round(geometry.width)),
    height: Math.max(80, Math.round(geometry.height)),
  };
}

export function fitCommentOverlayGeometryToWorkArea(
  geometry: CommentOverlayGeometry,
  workArea: CommentOverlayWorkArea,
): CommentOverlayGeometry {
  const normalized = normalizeCommentOverlayGeometry(geometry);
  const width = Math.min(normalized.width, Math.max(1, Math.round(workArea.width)));
  const height = Math.min(normalized.height, Math.max(1, Math.round(workArea.height)));
  const maxX = workArea.x + workArea.width - width;
  const maxY = workArea.y + workArea.height - height;

  return {
    x: clamp(normalized.x, Math.round(workArea.x), Math.round(maxX)),
    y: clamp(normalized.y, Math.round(workArea.y), Math.round(maxY)),
    width,
    height,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function parseCommentOverlayGeometry(raw: string | null): CommentOverlayGeometry | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<CommentOverlayGeometry>;
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number"
    ) {
      return null;
    }
    return normalizeCommentOverlayGeometry(parsed as CommentOverlayGeometry);
  } catch (error) {
    logger.error("コメントOverlayのgeometry解析に失敗しました:", error);
    return null;
  }
}

export function loadStoredCommentOverlayGeometry(): CommentOverlayGeometry | null {
  try {
    return parseCommentOverlayGeometry(
      globalThis.localStorage.getItem(COMMENT_OVERLAY_GEOMETRY_STORAGE_KEY),
    );
  } catch (error) {
    logger.error("コメントOverlayのgeometry読み込みに失敗しました:", error);
    return null;
  }
}

export function saveStoredCommentOverlayGeometry(geometry: CommentOverlayGeometry): void {
  try {
    globalThis.localStorage.setItem(
      COMMENT_OVERLAY_GEOMETRY_STORAGE_KEY,
      JSON.stringify(normalizeCommentOverlayGeometry(geometry)),
    );
  } catch (error) {
    logger.error("コメントOverlayのgeometry保存に失敗しました:", error);
  }
}

export function cloneCommentOverlayGeometry(
  geometry: CommentOverlayGeometry,
): CommentOverlayGeometry {
  return { ...geometry };
}

/** 縦横比固定を有効にしたとき、左上位置と幅を基準に16:9へ揃える。 */
export function fitCommentOverlayGeometryToAspectRatio(
  geometry: CommentOverlayGeometry,
): CommentOverlayGeometry {
  const normalized = normalizeCommentOverlayGeometry(geometry);
  // 利用者が固定を選んだときだけ変換し、自由な縦横比で保存した領域はそのまま扱う。
  return normalizeCommentOverlayGeometry({
    x: normalized.x,
    y: normalized.y,
    width: normalized.width,
    height: normalized.width / COMMENT_OVERLAY_ASPECT_RATIO,
  });
}

export function fallbackCommentOverlayGeometry(
  geometry: CommentOverlayGeometry | null,
): CommentOverlayGeometry {
  // 変更理由: native windowへ直接渡すgeometryも、保存値と同じ最小サイズ・整数座標へ揃える。
  return normalizeCommentOverlayGeometry(geometry ?? DEFAULT_COMMENT_OVERLAY_GEOMETRY);
}
