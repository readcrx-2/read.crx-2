// @vitest-environment node
import { describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  getBoard: vi.fn(),
  getCachedResCount: vi.fn(),
  getByBoard: vi.fn(),
  getBookmark: vi.fn(),
  isNewerReadState: vi.fn(),
}));

vi.mock("src/core/board/Board.js", () => ({
  default: {
    get: mocks.getBoard,
    getCachedResCount: mocks.getCachedResCount,
  },
}));

vi.mock("src/core/ports/registry", () => ({
  corePorts: {
    readState: { getByBoard: mocks.getByBoard },
    bookmark: { get: mocks.getBookmark },
    util: { isNewerReadState: mocks.isNewerReadState },
  },
}));

import BoardService from "src/core/board/BoardService";

// 実在するスレッドを使わず、通信方式と保存キーの違いを検証する。
vi.mock("packages/chlib/src/url/hosts", async (importOriginal) => {
  const hosts = await importOriginal<typeof import("packages/chlib/src/url/hosts")>();
  return { ...hosts, HOSTNAME: { ...hosts.HOSTNAME, EDDIBB: "edge.example.com" } };
});

describe("BoardService canonical subject adapter", () => {
  it("一覧URLのHTTPSを維持しHTTPの既読キーで既読情報を反映する", async () => {
    mocks.getBoard.mockResolvedValueOnce({
      status: "success",
      data: [
        {
          url: "https://edge.example.com/test/read.cgi/liveedge/1/",
          title: "スレッド",
          resCount: 4,
          createdAt: 1000,
          ng: null,
        },
      ],
    });
    const readState = {
      url: "http://edge.example.com/test/read.cgi/liveedge/1/",
      last: 2,
      read: 2,
      received: 4,
    };
    mocks.getByBoard.mockResolvedValueOnce([readState]);
    mocks.getBookmark.mockReturnValueOnce(undefined);

    await expect(BoardService.getThreads("https://edge.example.com/liveedge/")).resolves.toEqual({
      threads: [
        {
          url: "https://edge.example.com/test/read.cgi/liveedge/1/",
          title: "スレッド",
          resCount: 4,
          createdAt: 1000,
          ng: null,
          demoted: undefined,
          highlight: undefined,
          isNet: undefined,
          readState,
          threadNumber: 0,
        },
      ],
      message: null,
    });
    expect(mocks.getByBoard).toHaveBeenCalledWith("http://edge.example.com/liveedge/");
  });
});
