export const COMMENT_OVERLAY_ATTACHMENT_STORAGE_KEY = "chlens:comment-overlay-attachment";

export interface StoredOverlayAttachment {
  processPath: string;
  title: string;
}

export function loadOverlayAttachment(): StoredOverlayAttachment | null {
  try {
    const raw = globalThis.localStorage.getItem(COMMENT_OVERLAY_ATTACHMENT_STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      typeof value !== "object" ||
      value === null ||
      !("processPath" in value) ||
      typeof value.processPath !== "string" ||
      value.processPath.trim() === "" ||
      !("title" in value) ||
      typeof value.title !== "string"
    ) {
      throw new Error("保存された追従先の形式が不正です");
    }
    return { processPath: value.processPath, title: value.title };
  } catch (error: unknown) {
    console.error("[ChLens] コメントOverlayの追従先の読み込みに失敗しました:", error);
    return null;
  }
}

export function saveOverlayAttachment(target: StoredOverlayAttachment | null): void {
  // HWNDとPIDは次回起動時に別の窓へ再利用されるため、実行ファイルと選択時のタイトルだけを保存する。
  if (target) {
    globalThis.localStorage.setItem(COMMENT_OVERLAY_ATTACHMENT_STORAGE_KEY, JSON.stringify(target));
  } else {
    globalThis.localStorage.removeItem(COMMENT_OVERLAY_ATTACHMENT_STORAGE_KEY);
  }
}
