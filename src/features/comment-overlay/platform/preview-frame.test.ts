import { describe, expect, it } from "vite-plus/test";

import { parseCommentOverlayPreviewFrame } from "./preview-frame";

function frameBuffer(width: number, height: number, pixels: number[]): ArrayBuffer {
  const bytes = new Uint8Array(8 + pixels.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, width, true);
  view.setUint32(4, height, true);
  bytes.set(pixels, 8);
  return bytes.buffer;
}

describe("parseCommentOverlayPreviewFrame", () => {
  it("幅・高さ付きのRGBAをフレームへ戻す", () => {
    const frame = parseCommentOverlayPreviewFrame(frameBuffer(2, 1, [1, 2, 3, 255, 4, 5, 6, 255]));
    expect(frame).toMatchObject({ width: 2, height: 1 });
    expect(Array.from(frame!.pixels)).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
  });

  it("撮影に対応しない環境の空データはnullにする", () => {
    expect(parseCommentOverlayPreviewFrame(new ArrayBuffer(0))).toBeNull();
  });

  it("長さが合わない壊れたデータは例外にする", () => {
    expect(() => parseCommentOverlayPreviewFrame(new ArrayBuffer(4))).toThrow();
    expect(() => parseCommentOverlayPreviewFrame(frameBuffer(2, 1, [1, 2, 3, 255]))).toThrow();
    expect(() => parseCommentOverlayPreviewFrame(frameBuffer(0, 0, []))).toThrow();
  });
});
