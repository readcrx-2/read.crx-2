// @vitest-environment node
import { createNG, type NGDeps } from "src/core/ng/NG";
import { describe, expect, it, vi } from "vite-plus/test";

// 依存は引数で渡し、登録済みのサービスに頼らずに判定の状態を確かめる。
const createDeps = () => {
  const store = new Map<string, string>();
  const deps = {
    config: {
      get: (key: string) => store.get(key) ?? null,
      set: (key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      },
    },
    message: { send: vi.fn() },
    notice: { ngRuleRegexInvalid: vi.fn(), bbsMenuFetchFailed: vi.fn() },
  };
  return deps as unknown as NGDeps;
};

const HIDE_TITLE_RULE = `hide:
  when title contains "NGタイトル"`;

describe("createNG", () => {
  it("適用した規則を同じインスタンスの判定へ反映する", () => {
    const ng = createNG(createDeps());

    ng.apply(HIDE_TITLE_RULE);

    expect(ng.get()).toHaveLength(1);
    expect(ng.isNGBoard("NGタイトルの板", "https://example.com/board/", 1)).not.toBeNull();
  });

  it("別インスタンスの規則を共有しない", () => {
    const first = createNG(createDeps());
    const second = createNG(createDeps());

    first.apply(HIDE_TITLE_RULE);

    expect(second.get()).toHaveLength(0);
    expect(second.isNGBoard("NGタイトルの板", "https://example.com/board/", 1)).toBeNull();
  });
});
