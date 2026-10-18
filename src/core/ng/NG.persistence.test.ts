// @vitest-environment node
import { createNG, type NGDeps } from "src/core/ng/NG";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  configStore: new Map<string, string>(),
  holdWrites: false,
  pendingWrites: [] as Array<{
    key: string;
    value: string;
    resolve: () => void;
  }>,
  messageSend: vi.fn(),
  ngRuleRegexInvalid: vi.fn(),
}));

// 依存は登録済みのサービスに頼らず、テスト用の値を create 関数へ直接渡す。
const deps = {
  config: {
    get: (key: string) => mocks.configStore.get(key) ?? null,
    set: (key: string, value: string) => {
      if (!mocks.holdWrites) {
        mocks.configStore.set(key, value);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        mocks.pendingWrites.push({
          key,
          value,
          resolve: () => {
            mocks.configStore.set(key, value);
            resolve();
          },
        });
      });
    },
  },
  notice: { ngRuleRegexInvalid: mocks.ngRuleRegexInvalid, bbsMenuFetchFailed: vi.fn() },
  message: { send: mocks.messageSend },
} as unknown as NGDeps;

describe("NG Rule persistence", () => {
  beforeEach(() => {
    mocks.configStore.clear();
    mocks.holdWrites = false;
    mocks.pendingWrites.length = 0;
    mocks.messageSend.mockReset();
    mocks.ngRuleRegexInvalid.mockReset();
  });

  it("waits for the DSL write and restores the Rule after reload", async () => {
    mocks.holdWrites = true;
    const { add, get, invalidateCache } = createNG(deps);
    invalidateCache();

    let settled = false;
    const addPromise = add('hide:\n  when id contains "abc123"').then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(mocks.pendingWrites[0]).toMatchObject({ key: "ngwords" });
    expect(settled).toBe(false);
    expect(mocks.messageSend).not.toHaveBeenCalled();

    const write = mocks.pendingWrites.shift();
    write?.resolve();
    await addPromise;

    expect(mocks.configStore.get("ngwords")).toBe('hide:\n  when id contains "abc123"');
    expect(mocks.messageSend).toHaveBeenCalledWith("ng_changed");

    invalidateCache();
    expect(get()).toEqual([
      expect.objectContaining({
        action: "hide",
        target: "id",
        matchers: [{ kind: "contains", value: "abc123" }],
      }),
    ]);
  });

  it("rejects the removed legacy function syntax", async () => {
    const { add } = createNG(deps);
    await expect(add("ID(value=abc123)")).rejects.toThrow("新しいブロックDSL");
  });

  it("appends semi-automatically added rules after existing rules", async () => {
    mocks.configStore.set("ngwords", 'hide:\n  when id contains "existing"');
    const { add, get, invalidateCache } = createNG(deps);
    invalidateCache();

    await add('hide:\n  when id contains "added"');

    expect(get().flatMap((rule) => rule.matchers)).toEqual([
      { kind: "contains", value: "existing" },
      { kind: "contains", value: "added" },
    ]);
    // 単純なID containsルールは既存ルールへ集約する仕様（765bf5c）のため、ブロックは1つのまま。
    expect(mocks.configStore.get("ngwords")).toBe(
      'hide:\n  when id contains:\n    "existing"\n    "added"',
    );
  });
});
