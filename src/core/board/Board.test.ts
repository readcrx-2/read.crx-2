// @vitest-environment node
import { corePorts } from "src/core/ports/registry";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { fetchMock, cache } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  cache: {
    data: "1000000001.dat<>古いスレ一覧 (1)\n",
    lastUpdated: 0,
    lastModified: null as number | null,
    etag: null as string | null,
    get: vi.fn(async () => {}),
    put: vi.fn(async () => {}),
  },
}));

vi.mock("src/app/platform", () => ({
  platform: {
    http: {
      fetch: fetchMock,
    },
  },
}));

vi.mock("src/core/util/jsutil", () => ({
  chServerMoveDetect: vi.fn(),
}));

vi.mock("src/core/ports/registry", () => ({
  corePorts: {
    bookmark: {
      getByBoard: vi.fn(() => []),
      updateExpired: vi.fn(),
      updateResCount: vi.fn(),
    },
    cache: {
      getCache: vi.fn(() => cache),
    },
    ng: {
      isNGBoard: vi.fn(() => null),
    },
  },
}));

import Board from "src/core/board/Board";

describe("Board", () => {
  beforeEach(() => {
    cache.data = "1000000001.dat<>古いスレ一覧 (1)\n";
    cache.lastUpdated = 0;
    cache.get.mockReset();
    cache.get.mockResolvedValue(undefined);
    fetchMock.mockReset();
  });

  it("同じ板を同時に取得してもsubject.txtの通信を共有する", async () => {
    let resolveFetch:
      | ((response: {
          status: number;
          headers: Record<string, string>;
          body: string;
          url: string;
        }) => void)
      | undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const first = new Board("https://example.com/board/", corePorts);
    const second = new Board("https://example.com/board/", corePorts);

    const firstRequest = first.get(true);
    const secondRequest = second.get(true);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    resolveFetch?.({
      status: 200,
      headers: {},
      body: "1000000001.dat<>テストスレッド (1)\n",
      url: "https://example.com/board/subject.txt",
    });

    await Promise.all([firstRequest, secondRequest]);

    expect(first.thread).toEqual(second.thread);
    expect(first.subjectListVerified).toBe(true);
    expect(second.subjectListVerified).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("板キャッシュがなくても最新一覧からスレッドの存在を確認する", async () => {
    cache.get.mockRejectedValue(new Error("キャッシュ未取得"));
    fetchMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: "1000000002.dat<>現在のスレ一覧 (2)\n",
      url: "https://example.com/board/subject.txt",
    });

    const result = await Board.getCachedResCount(
      "https://example.com/test/read.cgi/board/1000000002/",
      corePorts,
      { forceUpdate: true },
    );

    expect(result.resCount).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("板キャッシュがなくても最新一覧から消えたスレッドを検知する", async () => {
    cache.get.mockRejectedValue(new Error("キャッシュ未取得"));
    fetchMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: "1000000003.dat<>別のスレッド (3)\n",
      url: "https://example.com/board/subject.txt",
    });

    await expect(
      Board.getCachedResCount("https://example.com/test/read.cgi/board/1000000002/", corePorts, {
        forceUpdate: true,
      }),
    ).rejects.toThrow("板のスレ一覧にそのスレが存在しません");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("板キャッシュも通信結果もない場合はスレッド不在と誤判定しない", async () => {
    cache.get.mockRejectedValue(new Error("キャッシュ未取得"));
    fetchMock.mockRejectedValue(new Error("通信に失敗しました"));

    await expect(
      Board.getCachedResCount("https://example.com/test/read.cgi/board/1000000002/", corePorts, {
        forceUpdate: true,
      }),
    ).rejects.not.toThrow("板のスレ一覧にそのスレが存在しません");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stale subjectキャッシュと通信失敗だけではスレッド不在を確定しない", async () => {
    cache.data = "1000000001.dat<>古いスレ一覧 (1)\n";
    cache.lastUpdated = 0;
    fetchMock.mockResolvedValue({
      status: 503,
      headers: {},
      body: "",
      url: "https://example.com/board/subject.txt",
    });

    await expect(
      Board.getCachedResCount("https://example.com/test/read.cgi/board/1000000002/", corePorts),
    ).rejects.not.toThrow("板のスレ一覧にそのスレが存在しません");
  });

  it("200応答でもsubjectとして解析できない本文から不在を確定しない", async () => {
    cache.data = "1000000001.dat<>古いスレ一覧 (1)\n";
    cache.lastUpdated = 0;
    fetchMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: "<html>エラーページ</html>",
      url: "https://example.com/board/subject.txt",
    });

    await expect(
      Board.getCachedResCount("https://example.com/test/read.cgi/board/1000000002/", corePorts),
    ).rejects.not.toThrow("板のスレ一覧にそのスレが存在しません");
  });

  it("板キャッシュが解析不能でも短時間キャッシュへ戻らず最新一覧を確認する", async () => {
    cache.lastUpdated = Date.now();
    const parseSpy = vi.spyOn(Board, "parse").mockReturnValueOnce(null);
    fetchMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: "1000000002.dat<>現在のスレ一覧 (2)\n",
      url: "https://example.com/board/subject.txt",
    });

    try {
      const result = await Board.getCachedResCount(
        "https://example.com/test/read.cgi/board/1000000002/",
        corePorts,
      );
      expect(result.resCount).toBe(2);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      parseSpy.mockRestore();
    }
  });

  it("confirms a cached subject miss against a freshly fetched subject", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: "1000000002.dat<>現在のスレ一覧 (2)\n",
      url: "https://egg.5ch.io/software/subject.txt",
    });

    const result = await Board.getCachedResCount(
      "https://egg.5ch.io/test/read.cgi/software/1000000002/",
      corePorts,
    );

    expect(result.resCount).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports not_found only after the refreshed subject also lacks the thread", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: "1000000003.dat<>別のスレッド (3)\n",
      url: "https://egg.5ch.io/software/subject.txt",
    });

    await expect(
      Board.getCachedResCount("https://egg.5ch.io/test/read.cgi/software/1000000002/", corePorts),
    ).rejects.toThrow("板のスレ一覧にそのスレが存在しません");
  });

  it("強制更新時はキャッシュ上で見つかるスレッドもsubject.txtで再確認する", async () => {
    cache.data = "1000000002.dat<>古いスレ一覧 (1)\n";
    cache.lastUpdated = Date.now();
    fetchMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: "1000000003.dat<>現在のスレ一覧 (3)\n",
      url: "https://egg.5ch.io/software/subject.txt",
    });

    const result = await Board.getCachedResCount(
      "https://egg.5ch.io/test/read.cgi/software/1000000003/",
      corePorts,
      { forceUpdate: true },
    );

    expect(result.resCount).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("強制更新でsubject.txtから消えたスレッドを検知する", async () => {
    cache.data = "1000000002.dat<>古いスレ一覧 (1)\n";
    cache.lastUpdated = Date.now();
    fetchMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: "1000000003.dat<>別のスレッド (3)\n",
      url: "https://egg.5ch.io/software/subject.txt",
    });

    await expect(
      Board.getCachedResCount("https://egg.5ch.io/test/read.cgi/software/1000000002/", corePorts, {
        forceUpdate: true,
      }),
    ).rejects.toThrow("板のスレ一覧にそのスレが存在しません");
  });
});
