import { Anchor } from "src/core/thread/anchor";
import { describe, expect, it } from "vite-plus/test";

describe("Anchor", () => {
  it("アンカーの全角数字と逆順範囲を解析する", () => {
    expect(Anchor.parseAnchor("＞＞５-３、８")).toEqual({
      targetCount: 4,
      segments: [
        [3, 5],
        [8, 8],
      ],
    });
  });
});
