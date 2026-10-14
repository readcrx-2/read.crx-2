// @vitest-environment node
import type { ImageReplaceDeps } from "src/core/thread/ImageReplaceDat";
import { createImageReplaceDat } from "src/core/thread/ImageReplaceDat";
import { describe, expect, it, vi } from "vite-plus/test";

// 依存は引数で渡し、登録済みのサービスに頼らずに置換規則の動きを確かめる。
const createDeps = () => {
  const store = new Map<string, string>();
  const deps = {
    config: {
      get: (key: string) => store.get(key) ?? null,
      set: vi.fn((key: string, value: string) => {
        store.set(key, value);
      }),
    },
    message: { send: vi.fn() },
  };
  return deps as unknown as ImageReplaceDeps & typeof deps;
};

// 正規表現の記号は [.] のように文字クラスで書き、エスケープの自動修正で意味が変わらないようにする。
const RULE = "https?://example[.]com/([0-9]+)[.]jpg\thttps://cdn.example.com/$1.jpg";

describe("createImageReplaceDat", () => {
  it("保存した置換規則を同じインスタンスで適用する", () => {
    const dat = createImageReplaceDat(createDeps());

    dat.set(RULE);

    expect(dat.replace("https://example.com/12.jpg").res).toEqual({
      type: "default",
      text: "https://cdn.example.com/12.jpg",
    });
  });

  it("別インスタンスの規則を共有しない", () => {
    const first = createImageReplaceDat(createDeps());
    const second = createImageReplaceDat(createDeps());

    first.set(RULE);

    expect(second.replace("https://example.com/12.jpg").err).toBe("Fail noBaseUrlReg");
  });

  it("不正な正規表現は通知してその行だけを無効化する", () => {
    const deps = createDeps();
    const dat = createImageReplaceDat(deps);

    dat.set("(\t https://cdn.example.com/\n");

    expect(deps.message.send).toHaveBeenCalledWith(
      "notify",
      expect.objectContaining({ background_color: "red" }),
    );
    expect(dat.replace("https://example.com/").err).toBe("Fail noBaseUrlReg");
  });
});
