// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const configStore = new Map<string, string>();

vi.mock("src/core/util/jsutil", () => ({
  normalize: (value: string) => value.toLowerCase(),
}));

vi.mock("src/core/ports/registry", () => ({
  corePorts: {
    config: {
      get: (key: string) => configStore.get(key) ?? null,
      set: (key: string, value: string) => {
        configStore.set(key, value);
        return Promise.resolve();
      },
    },
    notice: { ngRuleRegexInvalid: vi.fn(), bbsMenuFetchFailed: vi.fn() },
    message: { send: vi.fn() },
  },
}));

describe("NG Rule service", () => {
  beforeEach(() => configStore.clear());

  it("loads only the block DSL and applies title/body rules", async () => {
    configStore.set(
      "ngwords",
      `highlight:
  color blue
  label "注目"
  sites "bbs.eddibb.cc"
  when title contains "注目"

hide:
  when body regex "(imgur\\\\.com/.+?){15}"`,
    );
    const { get, invalidateCache, isNGBoard, isNGThread } = await import("src/core/ng/NG");
    invalidateCache();

    expect(get()).toHaveLength(2);
    expect(isNGBoard("注目スレ", "https://bbs.eddibb.cc/test/1", 10)).toMatchObject({
      type: "HighlightTitle",
      params: { bgColor: "blue", label: "注目" },
    });
    expect(
      isNGThread(
        {
          num: 1,
          name: "name",
          mail: "",
          message: Array.from({ length: 15 }, () => "imgur.com/a").join(" "),
        },
        "title",
        "https://bbs.eddibb.cc/test/1",
      ),
    ).toMatchObject({
      type: "RegExpBody",
      ruleDescription: `hide:
  when body regex "(imgur\\\\.com/.+?){15}"`,
    });
  });

  it("rejects the removed function-style syntax", async () => {
    const { set } = await import("src/core/ng/NG");
    await expect(set("Body(value=荒らし)")).rejects.toThrow("新しいブロックDSL");
  });

  it("スレ一覧の折りたたみを完全非表示と区別する", async () => {
    const { apply, invalidateCache, isNGBoard } = await import("src/core/ng/NG");
    invalidateCache();
    apply(`collapse:
  when title contains "薄くする"

hide:
  when title contains "隠す"`);

    expect(isNGBoard("薄くするスレ", "https://example.com/board/", 1)).toMatchObject({
      action: "collapse",
    });
    expect(isNGBoard("隠すスレ", "https://example.com/board/", 1)).toMatchObject({
      action: "hide",
    });
  });

  it("タイトルとレス数の条件を組み合わせて板のハイライトを適用する", async () => {
    const { apply, invalidateCache, isNGBoard } = await import("src/core/ng/NG");
    invalidateCache();
    apply(`highlight:
  color red
  when title contains "注目"
  when res-count >= 100`);

    expect(isNGBoard("注目スレ", "https://example.com/board/", 99)).toBeNull();
    expect(isNGBoard("通常スレ", "https://example.com/board/", 100)).toBeNull();
    expect(isNGBoard("注目スレ", "https://example.com/board/", 100)).toMatchObject({
      type: "HighlightTitle",
      ruleDescription: `highlight:
  color red
  when title contains "注目"
  when res-count >= 100`,
    });
  });

  it("applies a stored DSL without writing it back", async () => {
    const { apply, get, invalidateCache } = await import("src/core/ng/NG");
    invalidateCache();
    apply('hide:\n  when body contains "保存済み"');

    expect(configStore.has("ngwords")).toBe(false);
    expect(get()).toEqual([
      expect.objectContaining({
        action: "hide",
        target: "body",
        matchers: [{ kind: "contains", value: "保存済み" }],
      }),
    ]);
  });

  it("matches anchor-count from the response body", async () => {
    const { apply, invalidateCache, isNGThread } = await import("src/core/ng/NG");
    invalidateCache();
    apply("hide:\n  when anchor-count >= 2");

    expect(
      isNGThread(
        {
          num: 2,
          name: "name",
          mail: "",
          message: "&gt;&gt;1 &gt;&gt;1,3",
        },
        "title",
        "https://bbs.eddibb.cc/test/1",
      ),
    ).toMatchObject({ type: "AnchorCount" });
  });

  it("表示方式名で書かれたルールを検証エラーにせずhideとして適用する", async () => {
    // 設定画面で目にする表示方式名を表示方式の設定と混同して動作欄へ書いても、
    // NG判定全体を止めないことを保証する。
    const { apply, get, invalidateCache, validate } = await import("src/core/ng/NG");
    invalidateCache();
    const source = 'hide:\n  when body contains "荒らし"';
    expect(() => validate(source)).not.toThrow();
    apply(source);
    expect(get()).toEqual([expect.objectContaining({ action: "hide", target: "body" })]);
  });
});
