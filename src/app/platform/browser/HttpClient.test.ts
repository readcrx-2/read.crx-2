// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const browserApi = vi.hoisted(() => ({
  cookies: { set: vi.fn() },
  runtime: { sendMessage: vi.fn() },
}));

vi.mock("webextension-polyfill", () => ({
  default: browserApi,
}));

vi.mock("packages/chlib/src/url/hosts", async (importOriginal) => {
  const original = await importOriginal<typeof import("packages/chlib/src/url/hosts")>();
  // 実在の掲示板へ依存せず、エッヂ固有の投稿経路を予約済みドメインで検証する。
  return {
    ...original,
    HOSTNAME: { ...original.HOSTNAME, EDDIBB: "edge.example.com" },
    classifyBoardHost: (hostname: string) =>
      hostname === "edge.example.com" ? "eddibb" : original.classifyBoardHost(hostname),
  };
});

import { resolveBoardUrl } from "packages/chlib/src/url/resolveBoardUrl";
import { getWriteFormData } from "packages/chlib/src/url/write";

import { BrowserHttpClient } from "./HttpClient";

const TOKEN = "0123456789abcdef0123456789abcdef";

describe("拡張機能版の書き込み認証", () => {
  beforeEach(() => {
    browserApi.cookies.set.mockReset();
    browserApi.runtime.sendMessage.mockReset();
    // 認証Cookieの手動設定を復活させず、ブラウザ標準の送信に委ねることを確認する。
    browserApi.cookies.set.mockRejectedValue(new Error("認証Cookieを手動設定しないでください"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it.each(["http:", "https:"])(
    "%s の通信方式とメール欄のトークンを投稿まで維持する",
    async (protocol) => {
      const form = getWriteFormData(
        `${protocol}//edge.example.com/test/read.cgi/sample-board/123/`,
        {
          name: "",
          mail: `#${TOKEN}`,
          message: "本文",
        },
      );
      expect(form?.action).toBe(`${protocol}//edge.example.com/test/bbs.cgi`);
      expect(form?.referer).toBe(`${protocol}//edge.example.com/sample-board/`);
      expect(form?.input.mail).toBe(`#${TOKEN}`);

      await BrowserHttpClient.setupWriteHeaders(form!.action);
      expect(browserApi.cookies.set).not.toHaveBeenCalled();
    },
  );

  it("別の掲示板のHTTP投稿先は維持する", () => {
    expect(
      getWriteFormData("http://other.example.com/test/read.cgi/sample-board/123/", {
        name: "",
        mail: "sage",
        message: "本文",
      })?.action,
    ).toBe("http://other.example.com/test/bbs.cgi");
  });

  it("HTTP要求を共有バックグラウンドへ送り、バイナリ本文をシリアライズする", async () => {
    browserApi.runtime.sendMessage.mockResolvedValue({
      ok: true,
      response: {
        status: 200,
        headers: {},
        body: "ok",
        url: "https://example.com/result",
      },
    });
    const body = new Uint8Array([1, 2, 3]).buffer;

    await expect(
      BrowserHttpClient.fetch("https://example.com/request", { method: "POST", body }),
    ).resolves.toMatchObject({ status: 200, body: "ok" });

    expect(browserApi.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "shared-http-request",
        url: "https://example.com/request",
        options: expect.objectContaining({ method: "POST", bodyBase64: "AQID" }),
      }),
    );
  });

  it("共有バックグラウンドからの失敗を呼び出し元へ返す", async () => {
    browserApi.runtime.sendMessage.mockResolvedValue({
      ok: false,
      error: "HTTP待ち行列が上限に達しました",
    });

    await expect(BrowserHttpClient.fetch("https://example.com/request")).rejects.toThrow(
      "HTTP待ち行列が上限に達しました",
    );
  });

  it.each(["http:", "https:"])("短縮URLの%sを内部遷移から投稿まで維持する", (protocol) => {
    const page = resolveBoardUrl(`${protocol}//edge.example.com/sample-board/123/`, {
      mode: "strict",
    });
    expect(page?.type).toBe("thread");
    const form = getWriteFormData(page!.url, { name: "", mail: `#${TOKEN}`, message: "本文" });
    expect(form?.action).toBe(`${protocol}//edge.example.com/test/bbs.cgi`);
  });
});
