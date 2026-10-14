import type { BoardDeps } from "src/core/board/Board";
import { describe, expect, it, vi } from "vite-plus/test";

const boardGet = vi.hoisted(() => vi.fn());
vi.mock("src/core/board/Board", () => ({ default: { get: boardGet } }));

import { searchNextThreadCandidates } from "src/core/board/next-thread-candidates";

// 板の取得は Board.get に任せるため、依存は受け渡しを確かめる目印だけでよい。
const deps = { marker: "テスト用の依存" } as unknown as BoardDeps;

describe("旧来の次スレ候補の検索", () => {
  it("渡された依存で板を取得し、元スレと1001以上のスレを除いてタイトルの近い順に返す", async () => {
    boardGet.mockResolvedValue({
      data: [
        {
          title: "テスト実況スレ Part2",
          url: "https://example.com/test/read.cgi/board/2/",
          resCount: 10,
        },
        {
          title: "まったく別の話題",
          url: "https://example.com/test/read.cgi/board/3/",
          resCount: 10,
        },
        {
          title: "テスト実況スレ Part1",
          url: "https://example.com/test/read.cgi/board/1/",
          resCount: 900,
        },
        {
          title: "テスト実況スレ Part0",
          url: "https://example.com/test/read.cgi/board/0/",
          resCount: 1001,
        },
      ],
    });

    const result = await searchNextThreadCandidates(
      "https://example.com/test/read.cgi/board/1/",
      "テスト実況スレ Part1",
      "",
      deps,
    );

    expect(boardGet).toHaveBeenCalledWith("https://example.com/board/", deps);
    expect(result.map((candidate) => candidate.url)).toEqual([
      "https://example.com/test/read.cgi/board/2/",
      "https://example.com/test/read.cgi/board/3/",
    ]);
  });

  it("板を取得できなければ例外にする", async () => {
    boardGet.mockResolvedValue({ data: null });

    await expect(
      searchNextThreadCandidates("https://example.com/test/read.cgi/board/1/", "スレ", "", deps),
    ).rejects.toThrow("板の取得に失敗しました");
  });
});
