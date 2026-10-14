import { normalize } from "src/core/util/string-normalize";
import { describe, expect, it } from "vite-plus/test";

describe("normalize", () => {
  it("旧対象範囲内の半角カタカナだけを検索表記へ変換する", () => {
    // 旧正規表現はFF9DまでをNFKC変換し、FF9Eの濁点はそのまま残す。
    expect(normalize("ｶﾞＡＢＣ　 テスト")).toBe("かﾞabcてすと");
  });
});
