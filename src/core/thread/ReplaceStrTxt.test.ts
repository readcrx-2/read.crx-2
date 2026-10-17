// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const loggerMock = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn() }));
vi.mock("src/app/logger", () => ({ createLogger: () => loggerMock }));

const { config, save } = vi.hoisted(() => {
  const config = new Map<string, string>();
  return {
    config,
    save: vi.fn(async (key: string, value: string) => {
      config.set(key, value);
    }),
  };
});
vi.mock("src/core/ports/registry", () => ({
  corePorts: { config: { get: (key: string) => config.get(key) ?? null, set: save } },
}));

const response = { name: "a", mail: "a", other: "a", message: "a", number: 1 };
const source = (to: string) => `replace body:\n  from "a"\n  to "${to}"`;

describe("置換設定の保存とキャッシュ", () => {
  beforeEach(() => {
    config.clear();
    save.mockClear();
    vi.resetModules();
  });
  afterEach(() => vi.restoreAllMocks());

  it("DSL文字列だけを保存し、直後のレスから適用する", async () => {
    const replacement = await import("./ReplaceStrTxt");
    expect((await replacement.set(source("b"))).diagnostics).toEqual([]);
    expect(save).toHaveBeenCalledExactlyOnceWith("replace_str_txt", source("b"));
    expect(replacement.replace("", "", response)).toEqual({ ...response, message: "b" });
    expect(response.message).toBe("a");
  });

  it("不正な編集は保存せず、有効な設定を引き続き適用する", async () => {
    const replacement = await import("./ReplaceStrTxt");
    await replacement.set(source("b"));
    save.mockClear();
    expect((await replacement.set('replace body:\n  from "a"')).diagnostics.length).toBeGreaterThan(
      0,
    );
    expect(save).not.toHaveBeenCalled();
    expect(replacement.replace("", "", response).message).toBe("b");
  });

  it("外部からの設定変更と空文字によるルール解除を検出する", async () => {
    const replacement = await import("./ReplaceStrTxt");
    config.set("replace_str_txt", source("b"));
    expect(replacement.replace("", "", response).message).toBe("b");
    config.set("replace_str_txt", source("c"));
    expect(replacement.replace("", "", response).message).toBe("c");
    config.set("replace_str_txt", "");
    expect(replacement.replace("", "", response)).toEqual(response);
  });

  it("不正な外部更新は一度だけログに出し、直前のルールを維持する", async () => {
    loggerMock.error.mockClear();
    const replacement = await import("./ReplaceStrTxt");
    await replacement.set(source("b"));
    config.set("replace_str_txt", "a\tb\tmsg");
    expect(replacement.replace("", "", response).message).toBe("b");
    expect(replacement.replace("", "", response).message).toBe("b");
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    config.set("replace_str_txt", source("c"));
    expect(replacement.replace("", "", response).message).toBe("c");
  });

  it("保存失敗をログへ出して返し、有効な設定を維持する", async () => {
    loggerMock.error.mockClear();
    const replacement = await import("./ReplaceStrTxt");
    await replacement.set(source("b"));
    save.mockRejectedValueOnce(new Error("保存失敗"));
    await expect(replacement.set(source("c"))).rejects.toThrow("保存失敗");
    expect(loggerMock.error).toHaveBeenCalled();
    expect(replacement.replace("", "", response).message).toBe("b");
  });
});
