// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const configStore = new Map<string, string>();

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

describe("NG shared evaluator characterization", () => {
  beforeEach(() => configStore.clear());

  it("keeps the Chlens adapter result aligned with the shared evaluator", async () => {
    const source = `highlight:
  color blue
  label "注目"
  when title contains "注目"

hide:
  when body regex "(imgur\\\\.com/.+?){2}"`;
    const { evaluateBoardRules, evaluateResponseRules, parseRuleDsl } =
      await import("@chlen/chlib");
    const { apply, invalidateCache, isNGBoard, isNGThread } = await import("src/core/ng/NG");
    invalidateCache();
    apply(source);

    const rules = parseRuleDsl(source).rules;
    const boardMatch = evaluateBoardRules(rules, {
      title: "注目スレ",
      url: "https://bbs.eddibb.cc/liveedge/",
      resCount: 10,
    });
    const responseMatch = evaluateResponseRules(rules, {
      all: "name imgur.com/a imgur.com/b",
      title: "通常スレ",
      body: "imgur.com/a imgur.com/b",
      name: "name",
      mail: "",
      url: "https://bbs.eddibb.cc/test/read.cgi/liveedge/1/",
    });

    // 変更理由: 共有化後も製品adapterが表示用結果へ変換する部分だけを担い、
    // 実際の一致種別・presentationは旧Chlensと共有evaluatorで一致することを固定する。
    expect(isNGBoard("注目スレ", "https://bbs.eddibb.cc/liveedge/", 10)).toMatchObject({
      type: boardMatch?.type,
      action: boardMatch?.rule.action,
      params: boardMatch?.params,
    });
    expect(
      isNGThread(
        {
          num: 1,
          name: "name",
          mail: "",
          message: "imgur.com/a imgur.com/b",
        },
        "通常スレ",
        "https://bbs.eddibb.cc/test/read.cgi/liveedge/1/",
      ),
    ).toMatchObject({
      type: responseMatch?.type,
      action: responseMatch?.rule.action,
      params: responseMatch?.params,
    });
  });
});
