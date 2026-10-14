// @vitest-environment node
import { BBSMenuFetcher } from "src/core/board/BBSMenuFetcher";
import type { ICacheItem } from "src/core/ports/cache";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { requestMock, sendMock } = vi.hoisted(() => ({ requestMock: vi.fn(), sendMock: vi.fn() }));
vi.mock("src/core/network/HTTP", () => ({
  Request: class {
    headers = {};
    constructor(...args: unknown[]) {
      requestMock(...args);
    }
    send = sendMock;
  },
}));

const html =
  "<TITLE>保存済み板一覧</TITLE>\n<BR><BR><B>カテゴリ</B><BR>\n<A HREF=https://example.com/sample/>サンプル板</A>";

describe("通信しない板一覧キャッシュの読み取り", () => {
  beforeEach(() => {
    requestMock.mockClear();
    sendMock.mockReset().mockResolvedValue({ status: 200, body: html, headers: {} });
  });

  function setup(data: string | null) {
    const getMock = vi.fn(async () => undefined);
    const putMock = vi.fn(async () => undefined);
    const cache: ICacheItem = {
      data,
      lastUpdated: 0,
      get: getMock,
      put: putMock,
    };
    const fetcher = new BBSMenuFetcher({ getCache: () => cache, getExcludeTslds: () => new Set() });
    return { getMock, putMock, fetcher };
  }

  it("古い保存済みHTMLも再検証の通信や書き戻しをせず解析する", async () => {
    const { putMock, fetcher } = setup(html);
    const result = await fetcher.getCached("https://example.com/bbsmenu.html");
    expect(result?.categories[0].boards).toEqual([
      { name: "サンプル板", url: "https://example.com/sample/" },
    ]);
    expect(requestMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
    expect(putMock).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "キャッシュ欠落・読み込み失敗でも通信へ進まない（失敗=%s）",
    async (failed) => {
      const { getMock, putMock, fetcher } = setup(null);
      if (failed) getMock.mockRejectedValue(new Error("キャッシュなし"));
      expect(await fetcher.getCached("https://example.com/bbsmenu.html")).toBeNull();
      expect(requestMock).not.toHaveBeenCalled();
      expect(putMock).not.toHaveBeenCalled();
    },
  );

  it("キャッシュ参照の後でも通常取得は通信して板一覧を保存できる", async () => {
    const { putMock, fetcher } = setup(null);
    await fetcher.getCached("https://example.com/bbsmenu.html");
    expect((await fetcher.fetch("https://example.com/bbsmenu.html")).name).toBe("保存済み板一覧");
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(putMock).toHaveBeenCalledWith(html, expect.any(Object));
  });
});

describe("板一覧の強制更新とキャッシュの書き戻し", () => {
  it("304では保存済みHTMLを解析し、本文を変えずに確認日時だけ更新する", async () => {
    requestMock.mockClear();
    sendMock.mockReset().mockResolvedValue({ status: 304, body: "", headers: {} });
    const putMock = vi.fn(async () => undefined);
    const cache: ICacheItem = {
      data: html,
      lastUpdated: 0,
      get: vi.fn(async () => undefined),
      put: putMock,
    };
    const fetcher = new BBSMenuFetcher({ getCache: () => cache, getExcludeTslds: () => new Set() });

    const menu = await fetcher.fetch("https://example.com/bbsmenu.html", true);

    expect(menu.name).toBe("保存済み板一覧");
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(putMock).toHaveBeenCalledWith(html);
  });
});
