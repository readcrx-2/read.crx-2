// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { fetchHttpsFirst, normalizeHttpsMode } from "./https-first";

describe("HTTPS優先の読み込み", () => {
  afterEach(() => vi.restoreAllMocks());

  it("HTTPのGETはHTTPSへ置き換えて読み込む", async () => {
    const fetchUrl = vi.fn().mockResolvedValue({ status: 200 });

    await expect(fetchHttpsFirst("http://example.com/board/", "GET", fetchUrl)).resolves.toEqual({
      status: 200,
    });

    expect(fetchUrl).toHaveBeenCalledExactlyOnceWith("https://example.com/board/");
  });

  it("HTTPSへの通信失敗時だけ元のHTTP URLで再試行する", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchUrl = vi
      .fn()
      .mockRejectedValueOnce(new Error("TLS接続失敗"))
      .mockResolvedValueOnce({ status: 200 });

    await expect(
      fetchHttpsFirst("http://example.com/board/", undefined, fetchUrl),
    ).resolves.toEqual({ status: 200 });

    expect(fetchUrl.mock.calls).toEqual([
      ["https://example.com/board/"],
      ["http://example.com/board/"],
    ]);
  });

  it("HTTPSの応答エラーではHTTPへ再送しない", async () => {
    const fetchUrl = vi.fn().mockResolvedValue({ status: 403 });

    await expect(fetchHttpsFirst("http://example.com/board/", "GET", fetchUrl)).resolves.toEqual({
      status: 403,
    });

    expect(fetchUrl).toHaveBeenCalledExactlyOnceWith("https://example.com/board/");
  });

  it("書き込みなどGET以外の要求はURLを変更しない", async () => {
    const fetchUrl = vi.fn().mockResolvedValue({ status: 200 });

    await fetchHttpsFirst("http://example.com/submit", "POST", fetchUrl);

    expect(fetchUrl).toHaveBeenCalledExactlyOnceWith("http://example.com/submit");
  });

  it("HTTPSのURLはそのまま読み込む", async () => {
    const fetchUrl = vi.fn().mockResolvedValue({ status: 200 });

    await fetchHttpsFirst("https://example.com/board/", "GET", fetchUrl);

    expect(fetchUrl).toHaveBeenCalledExactlyOnceWith("https://example.com/board/");
  });

  it("通信中断はHTTPで再試行しない", async () => {
    const fetchUrl = vi.fn().mockRejectedValue("abort");

    await expect(fetchHttpsFirst("http://example.com/board/", "GET", fetchUrl)).rejects.toBe(
      "abort",
    );

    expect(fetchUrl).toHaveBeenCalledExactlyOnceWith("https://example.com/board/");
  });

  it("認証情報付き要求はHTTPSに失敗してもHTTPへ再送しない", async () => {
    const fetchUrl = vi.fn().mockRejectedValue(new Error("TLS接続失敗"));

    await expect(
      fetchHttpsFirst("http://example.com/board/", "GET", fetchUrl, {
        Authorization: "Bearer secret",
      }),
    ).rejects.toThrow("TLS接続失敗");

    expect(fetchUrl).toHaveBeenCalledExactlyOnceWith("https://example.com/board/");
  });
});

describe("HTTPSへの切り替え方針", () => {
  afterEach(() => vi.restoreAllMocks());

  it("HTTPSのみでは、HTTPSへの通信に失敗してもHTTPで再試行しない", async () => {
    const fetchUrl = vi.fn().mockRejectedValue(new Error("TLS接続失敗"));

    await expect(
      fetchHttpsFirst("http://example.com/board/", "GET", fetchUrl, undefined, "https_only"),
    ).rejects.toThrow("TLS接続失敗");

    expect(fetchUrl).toHaveBeenCalledExactlyOnceWith("https://example.com/board/");
  });

  it("自動では、HTTPのURLをHTTPSへ切り替えずにそのまま読み込む", async () => {
    const fetchUrl = vi.fn().mockResolvedValue({ status: 200 });

    await fetchHttpsFirst("http://example.com/board/", "GET", fetchUrl, undefined, "auto");

    expect(fetchUrl).toHaveBeenCalledExactlyOnceWith("http://example.com/board/");
  });

  it("未設定や不正な保存値は、従来どおりHTTPS優先として扱う", () => {
    expect(normalizeHttpsMode(null)).toBe("https_first");
    expect(normalizeHttpsMode("unknown")).toBe("https_first");
    expect(normalizeHttpsMode("https_only")).toBe("https_only");
    expect(normalizeHttpsMode("auto")).toBe("auto");
  });
});
