import { parseOpenedBoardEntries } from "src/core/board/opened-board-entries";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("src/core/board/BoardUrlNormalizer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("src/core/board/BoardUrlNormalizer")>();
  // 保存形式のテストでは予約済みドメインを掲示板ホストとして扱う。
  return {
    ...actual,
    normalizeBoardUrl: (url: string, options?: Parameters<typeof actual.normalizeBoardUrl>[1]) =>
      actual.normalizeBoardUrl(url, url.includes("example.com") ? {} : options),
    getBoardUrlKey: (url: string, options?: Parameters<typeof actual.getBoardUrlKey>[1]) =>
      actual.getBoardUrlKey(url, url.includes("example.com") ? {} : options),
  };
});

describe("parseOpenedBoardEntries", () => {
  it("外部サイトを除外し、同じ板の別URL表記をまとめる", () => {
    const entries = parseOpenedBoardEntries(
      JSON.stringify([
        { url: "https://twitter.com/home/", title: "Twitter" },
        { url: "https://bbs.eddibb.cc/liveedge/", title: "エッヂ" },
        {
          url: "http://bbs.eddibb.cc/test/read.cgi/liveedge/",
          title: "別名",
        },
      ]),
    );

    expect(entries).toEqual([{ url: "https://bbs.eddibb.cc/liveedge/", title: "エッヂ" }]);
  });

  it("壊れたJSONは空配列として扱う", () => {
    expect(parseOpenedBoardEntries("壊れた設定")).toEqual([]);
  });

  it("旧データの板名を保ち、プロトコル違いの記録から最新の日時を引き継ぐ", () => {
    expect(
      parseOpenedBoardEntries(
        JSON.stringify([
          { url: "https://example.com/sample/", title: "サンプル板" },
          { url: "http://example.com/sample/", lastVisited: 200 },
          { url: "https://example.com/sample/", lastVisited: 100 },
        ]),
      ),
    ).toEqual([{ url: "https://example.com/sample/", title: "サンプル板", lastVisited: 200 }]);
  });

  it("数値でない日時を採用せず、日時を持たない旧データを読み込む", () => {
    expect(
      parseOpenedBoardEntries(
        JSON.stringify([
          { url: "https://example.com/sample/", title: "サンプル板", lastVisited: "今日" },
        ]),
      ),
    ).toEqual([{ url: "https://example.com/sample/", title: "サンプル板" }]);
  });
});
