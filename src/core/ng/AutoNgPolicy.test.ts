// @vitest-environment node
import { evaluateAutoNg, isAutoNgEnabled } from "src/core/ng/AutoNgPolicy";
import { beforeEach, describe, expect, it } from "vite-plus/test";

const config = new Map<string, string>();
const cfg = { get: (key: string) => config.get(key) ?? null };

describe("AutoNgPolicy", () => {
  beforeEach(() => config.clear());

  it("detects a missing ID from the configured thread policy", () => {
    config.set("nothing_id_ng", "on");
    config.set("how_to_judgment_id", "first_res");
    expect(
      evaluateAutoNg({
        config: cfg,
        response: { num: 2, message: "body" },
        bbsType: "2ch",
        existsIdAtFirstResponse: true,
        existsSlipAtFirstResponse: false,
        hasAnyId: true,
        hasAnySlip: false,
        chainedIds: new Set(),
        chainedSlips: new Set(),
        repeatedMessages: new Map(),
        canApply: () => true,
      }),
    ).toBe("NothingID");
  });

  it("uses the shared message index for repeat detection", () => {
    config.set("repeat_message_ng_count", "2");
    const repeatedMessages = new Map<string, Set<number>>();
    const base = {
      bbsType: "2ch",
      existsIdAtFirstResponse: false,
      existsSlipAtFirstResponse: false,
      hasAnyId: false,
      hasAnySlip: false,
      chainedIds: new Set<string>(),
      chainedSlips: new Set<string>(),
      repeatedMessages,
      canApply: () => true,
    };
    expect(
      evaluateAutoNg({
        config: cfg,
        ...base,
        response: { num: 1, message: "same" },
      }),
    ).toBeNull();
    expect(
      evaluateAutoNg({
        config: cfg,
        ...base,
        response: { num: 2, message: "same" },
      }),
    ).toBe("RepeatMessage");
  });

  it("真偽設定は on のときだけ有効とみなし、既定値の off は無効にする", () => {
    config.set("chain_ng", "off");
    expect(isAutoNgEnabled(cfg, "chain")).toBe(false);
    config.set("chain_ng", "on");
    expect(isAutoNgEnabled(cfg, "chain")).toBe(true);
  });
});
