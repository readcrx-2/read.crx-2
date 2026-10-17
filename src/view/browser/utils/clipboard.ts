import { createLogger } from "src/app/logger";
import type { IToastService } from "src/service-container/interfaces";

const logger = createLogger("view/browser");

/**
 * テキスト・画像のクリップボード操作をまとめる。
 * ブラウザAPIへの依存をこのモジュールへ閉じ込めることで、レス変換やフィルタ判定が
 * クリップボード実装を経由して実行環境へ依存しないようにする。
 */

export interface ClipboardSurface {
  window: Window;
  document: Document;
}

export async function copyText(text: string, surface?: ClipboardSurface): Promise<void> {
  // 変更理由: 既存のメイン窓呼び出しは省略形を維持しつつ、別窓のメニューだけは
  // その窓のClipboard APIとフォールバック用DOMを確実に使えるようにする。
  const targetWindow = surface?.window ?? globalThis.window;
  const targetDocument = surface?.document ?? globalThis.document;
  try {
    await targetWindow.navigator.clipboard.writeText(text);
  } catch {
    // clipboard APIが使えない環境向けフォールバック
    const textarea = targetDocument.createElement("textarea");
    try {
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      targetDocument.body.appendChild(textarea);
      textarea.select();
      if (!targetDocument.execCommand("copy")) {
        throw new Error("クリップボードへのコピーに失敗しました");
      }
    } finally {
      // 変更理由: execCommandがfalseを返す環境でも一時textareaを残さず、
      // 呼び出し元へ失敗を返してUIの成功表示と実際の結果を一致させる。
      textarea.remove();
    }
  }
}

export function formatMarkdownLink(title: string, url: string): string {
  // 変更理由: コピー先でMarkdownリンクとして解釈できるようにしつつ、
  // タイトルとURLに含まれる構文文字の意味を保つ。
  const escapedTitle = title.replaceAll("\\", "\\\\").replaceAll("]", "\\]");
  const escapedUrl = url.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  return `[${escapedTitle}](${escapedUrl})`;
}

export function canCopyImageToClipboard(surface?: ClipboardSurface): boolean {
  const targetWindow = surface?.window ?? globalThis.window;
  return (
    typeof targetWindow !== "undefined" &&
    typeof targetWindow.navigator?.clipboard?.write === "function" &&
    typeof (targetWindow as Window & typeof globalThis).ClipboardItem !== "undefined"
  );
}

export async function copyImageBlob(blob: Blob, surface?: ClipboardSurface): Promise<void> {
  const targetWindow = surface?.window ?? globalThis.window;
  if (!canCopyImageToClipboard(surface)) {
    throw new Error("Image clipboard API is not available");
  }

  // 画像コピーはテキストのような安全なフォールバックがないため、
  // 対応ブラウザだけで明示的に ClipboardItem を使う。
  const targetWindowWithClipboard = targetWindow as Window & typeof globalThis;
  await targetWindow.navigator.clipboard.write([
    new targetWindowWithClipboard.ClipboardItem({
      [blob.type]: blob,
    }),
  ]);
}

/** 画像コピーの成功・失敗を全ての画像コピーUIで同じように通知する。 */
export async function copyImageWithNotice(
  createBlob: () => Promise<Blob>,
  surface: ClipboardSurface,
  toast: IToastService,
  label: string,
): Promise<void> {
  try {
    await copyImageBlob(await createBlob(), surface);
    toast.success(`${label}をコピーしました`);
  } catch (error) {
    // 変更理由: 画像コピーにはテキストのような安全な代替経路がないため、失敗を握りつぶさず通知する。
    logger.error(`${label}を画像としてコピーできませんでした`, error);
    toast.error(`${label}をコピーできませんでした`);
  }
}

/** クリップボードからImgurへ投稿できるラスター画像を取得する。 */
export async function readClipboardImage(surface?: ClipboardSurface): Promise<Blob> {
  const targetWindow = surface?.window ?? globalThis.window;
  const clipboard = targetWindow.navigator?.clipboard;
  if (typeof clipboard?.read !== "function") {
    throw new Error("この環境ではクリップボード画像の読み取りに対応していません");
  }

  // 変更理由: Clipboard APIのreadは所属するclipboardオブジェクトをthisとして呼ぶ必要がある。
  const items = await clipboard.read();
  for (const item of items) {
    const imageType = item.types.find(
      (type) => type.startsWith("image/") && type !== "image/svg+xml",
    );
    if (!imageType) continue;
    const image = await item.getType(imageType);
    if (image.size > 0) return image;
  }

  throw new Error("クリップボードに投稿できる画像がありません");
}
