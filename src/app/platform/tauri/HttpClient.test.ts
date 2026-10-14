// @vitest-environment node
import type { HttpRequestOptions } from "src/app/platform/types";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { fetchTauriBinary, TauriHttpClient } from "./HttpClient";

describe("Tauri共有HTTPトランスポート", () => {
  beforeEach(() => invokeMock.mockReset());

  it("別ウィンドウからも共有Rustコマンドへ要求を渡す", async () => {
    invokeMock.mockResolvedValue({
      status: 200,
      headers: { "last-modified": "yesterday" },
      bodyBase64: btoa(String.fromCharCode(...new TextEncoder().encode("応答"))),
      url: "https://example.com/result",
    });

    const options: HttpRequestOptions = {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: new Uint8Array([1, 2, 3]).buffer,
      timeout: 500,
      mimeType: "text/plain; charset=utf-8",
    };
    const results = await Promise.all([
      TauriHttpClient.fetch("https://example.com/one", options),
      TauriHttpClient.fetch("https://example.com/two", options),
    ]);

    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock).toHaveBeenCalledWith(
      "shared_http_request",
      expect.objectContaining({
        request: expect.objectContaining({
          bodyBase64: "AQID",
          timeout: 500,
          method: "POST",
        }),
      }),
    );
    expect(results[0]?.body).toBe("応答");
  });

  it("バイナリ応答をArrayBufferへ戻す", async () => {
    invokeMock.mockResolvedValue({
      status: 200,
      headers: {},
      bodyBase64: "AAH/",
      url: "https://example.com/image",
    });

    const response = await fetchTauriBinary("https://example.com/image");
    expect([...new Uint8Array(response.body)]).toEqual([0, 1, 255]);
  });
});
