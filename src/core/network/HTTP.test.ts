// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
}));

vi.mock("src/app/platform", () => ({
  platform: { http: { fetch: mocks.fetch } },
}));

vi.mock("src/app/logger", () => ({
  createLogger: () => ({ debug: mocks.debug, error: mocks.error }),
}));

import { Request, Response } from "src/core/network/HTTP";

describe("HTTPリクエスト", () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.debug.mockReset();
    mocks.error.mockReset();
  });

  it("省略時の既定値を使い、取得結果をResponseへ変換する", async () => {
    mocks.fetch.mockResolvedValue({
      status: 200,
      headers: { ETag: "test" },
      body: "本文",
      url: "https://example.com/result",
    });

    const response = await new Request("GET", "https://example.com/request").send();

    expect(mocks.fetch).toHaveBeenCalledWith("https://example.com/request", {
      method: "GET",
      headers: {},
      mimeType: undefined,
      timeout: 30_000,
    });
    expect(response).toBeInstanceOf(Response);
    expect(response).toMatchObject({
      status: 200,
      headers: { ETag: "test" },
      body: "本文",
      responseURL: "https://example.com/result",
    });
    expect(mocks.debug).toHaveBeenCalledTimes(2);
  });

  it("指定値を渡し、キャッシュ抑止ヘッダーを追加する", async () => {
    mocks.fetch.mockResolvedValue({
      status: 304,
      headers: {},
      body: "",
      url: "https://example.com/",
    });
    const headers = { "If-None-Match": "etag" };

    await new Request("GET", "https://example.com/", {
      mimeType: "text/plain",
      headers,
      timeout: 500,
      preventCache: true,
    }).send();

    expect(headers).toEqual({
      "If-None-Match": "etag",
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
    });
    expect(mocks.fetch).toHaveBeenCalledWith("https://example.com/", {
      method: "GET",
      headers,
      mimeType: "text/plain",
      timeout: 500,
    });
  });

  it("通信例外を記録して呼び出し元へ返す", async () => {
    const error = new Error("通信失敗");
    mocks.fetch.mockRejectedValue(error);

    await expect(new Request("POST", "https://example.com/write").send()).rejects.toBe(error);
    expect(mocks.error).toHaveBeenCalledWith(
      "HTTP request failed: POST https://example.com/write",
      { error },
    );
  });

  it("HTTPヘッダーの継続行を直前のヘッダーへ追加する", () => {
    expect(
      Request.parseHTTPHeader(
        " orphan\nETag: one\r\n two\r\nLast-Modified: yesterday\n\tcontinued\ninvalid",
      ),
    ).toEqual({ ETag: "one two", "Last-Modified": "yesterday\tcontinued" });
  });

  it("abortは互換APIとして何もしない", () => {
    expect(() => new Request("GET", "https://example.com/").abort()).not.toThrow();
  });

  it("Responseのヘッダーは省略時に空で初期化する", () => {
    expect(new Response(200, undefined, "ok", "https://example.com/").headers).toEqual({});
  });
});
