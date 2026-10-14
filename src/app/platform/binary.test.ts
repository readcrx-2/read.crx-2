// @vitest-environment node
import { describe, expect, it } from "vite-plus/test";

import { decodeBase64, decodeBase64ArrayBuffer, encodeBase64 } from "./binary";

describe("バイナリIPC変換", () => {
  it("大きな本文もBase64で往復できる", () => {
    const source = Uint8Array.from({ length: 100_000 }, (_, index) => index % 256);
    const encoded = encodeBase64(source);

    expect([...decodeBase64(encoded)]).toEqual([...source]);
    expect([...new Uint8Array(decodeBase64ArrayBuffer(encoded))]).toEqual([...source]);
  });

  it("空の本文を空のまま往復する", () => {
    expect(encodeBase64(new Uint8Array())).toBe("");
    expect(decodeBase64ArrayBuffer("")).toEqual(new ArrayBuffer(0));
  });
});
