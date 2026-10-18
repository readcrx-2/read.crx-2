import { type BoardTitleSolverDeps, createBoardTitleSolver } from "src/core/board/BoardTitleSolver";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { cachedMenuMock, menuMock, requestMock, sendMock, titlesConfig, bookmarks } = vi.hoisted(
  () => ({
    cachedMenuMock: vi.fn(),
    menuMock: vi.fn(),
    requestMock: vi.fn(),
    sendMock: vi.fn(),
    titlesConfig: { raw: "{}" },
    bookmarks: { boards: [] as { url: string; title: string }[] },
  }),
);
vi.mock("src/core/network/HTTP", () => ({
  Request: class {
    constructor(...args: unknown[]) {
      requestMock(...args);
    }
    send = sendMock;
  },
}));
vi.mock("src/core/network/URL", () => ({
  URL: class extends window.URL {
    getTsld() {
      return this.hostname.split(".").slice(-2).join(".");
    }
    createProtocolToggled() {
      const url = new window.URL(this.href);
      url.protocol = this.protocol === "https:" ? "http:" : "https:";
      return url;
    }
    guessType() {
      return { bbsType: "2ch" };
    }
  },
}));
// 依存は登録済みのサービスに頼らず、テスト用の値を create 関数へ直接渡す。
const deps = {
  config: { get: () => titlesConfig.raw },
  bookmark: {
    promiseFirstScan: Promise.resolve(true),
    getAllBoards: () => bookmarks.boards,
    get: () => null,
  },
  bbsMenu: {
    getCached: cachedMenuMock,
    get: menuMock,
    onChange: { add: vi.fn(), remove: vi.fn() },
  },
} as unknown as BoardTitleSolverDeps;

describe("保存済み板名の参照と選択した板の取得", () => {
  beforeEach(() => {
    cachedMenuMock.mockReset().mockResolvedValue({ status: "success", menu: [] });
    menuMock.mockReset().mockResolvedValue({ status: "success", menu: [] });
    requestMock.mockClear();
    sendMock
      .mockReset()
      .mockResolvedValue({ status: 200, body: "BBS_TITLE_ORIG=選択した板の名前" });
    titlesConfig.raw = "{}";
    bookmarks.boards = [];
  });
  it("保存済み板一覧・その他の板名・お気に入りを通信せずまとめて参照する", async () => {
    cachedMenuMock.mockResolvedValue({
      status: "success",
      menu: [
        {
          name: "板一覧",
          categories: [
            {
              name: "カテゴリ",
              boards: [{ url: "http://example.com/sample/", name: "サンプル板" }],
            },
          ],
        },
      ],
    });
    titlesConfig.raw = JSON.stringify({ "https://example.com/other/": "その他の板" });
    bookmarks.boards = [{ url: "https://example.com/favorite/", title: "お気に入りの板" }];
    const { getCachedTitles } = createBoardTitleSolver(deps);
    expect(await getCachedTitles()).toEqual(
      new Map([
        ["example.com/sample/", "サンプル板"],
        ["example.com/other/", "その他の板"],
        ["example.com/favorite/", "お気に入りの板"],
      ]),
    );
    expect(menuMock).not.toHaveBeenCalled();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("保存データがなくてもHTTPへ進まず、仮の板キーやURLも表示名として採用しない", async () => {
    titlesConfig.raw = JSON.stringify({
      "https://example.com/sample/": "sample",
      "https://example.com/other/": "http://example.com/other/",
    });
    const { getCachedTitles } = createBoardTitleSolver(deps);
    expect(await getCachedTitles()).toEqual(new Map());
    expect(menuMock).not.toHaveBeenCalled();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("未解決の一覧があっても、選択した1件のSETTING.TXTだけを取得する", async () => {
    // 未登録板の仮タイトルを返す通常の板一覧でも、取得範囲を選択した板に限定する。
    menuMock.mockResolvedValue({
      status: "success",
      menu: [
        {
          name: "その他",
          categories: [
            {
              name: "一度開いた板",
              boards: ["selected", "unselected"].map((key) => ({
                url: `https://example.com/${key}/`,
                name: `https://example.com/${key}/`,
              })),
            },
          ],
        },
      ],
    });
    const { askByUrl } = createBoardTitleSolver(deps);
    expect(await askByUrl("https://example.com/selected/")).toBe("選択した板の名前");
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledWith(
      "GET",
      "https://example.com/selected/SETTING.TXT",
      expect.any(Object),
    );
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
