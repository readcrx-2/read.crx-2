import type { CommentOverlayPreviewFrame } from "./types";

const HEADER_BYTES = 8;

/**
 * nativeが返す「幅・高さ（u32リトルエンディアン）＋RGBA」のバイナリをプレビューのフレームへ戻す。
 * 撮影に対応しない環境の空データはnullにする。長さが合わないデータは壊れているので例外にする。
 */
export function parseCommentOverlayPreviewFrame(
  buffer: ArrayBuffer,
): CommentOverlayPreviewFrame | null {
  if (buffer.byteLength === 0) return null;
  if (buffer.byteLength < HEADER_BYTES) {
    throw new Error(`プレビューのフレームが短すぎます（${buffer.byteLength}バイト）`);
  }
  const header = new DataView(buffer);
  const width = header.getUint32(0, true);
  const height = header.getUint32(4, true);
  const expectedBytes = HEADER_BYTES + width * height * 4;
  if (width === 0 || height === 0 || buffer.byteLength !== expectedBytes) {
    throw new Error(
      `プレビューのフレームの大きさが不正です（${width}x${height}、${buffer.byteLength}バイト）`,
    );
  }
  return { width, height, pixels: new Uint8ClampedArray(buffer, HEADER_BYTES, width * height * 4) };
}
