import { upsertOpenedBoardEntry } from "src/core/board/OpenedBoards";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { store, setMock } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    setMock: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  };
});

vi.mock("src/core/ports/registry", () => ({
  corePorts: { config: { get: (key: string) => store.get(key) ?? null, set: setMock } },
}));

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

// 保存は直列キューに積まれるため、積まれた処理が終わるまで待つ。
const flushWrites = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

const readSaved = () => JSON.parse(store.get("opened_board_entries") ?? "[]");

describe("upsertOpenedBoardEntry", () => {
  beforeEach(() => {
    store.clear();
    setMock.mockClear();
  });

  it("新しい板を先頭に追加して保存する", async () => {
    upsertOpenedBoardEntry("https://example.com/sample/", "サンプル板", 100);
    upsertOpenedBoardEntry("https://example.com/other/", "別の板", 200);
    await flushWrites();

    expect(readSaved()).toEqual([
      { url: "https://example.com/other/", title: "別の板", lastVisited: 200 },
      { url: "https://example.com/sample/", title: "サンプル板", lastVisited: 100 },
    ]);
  });

  it("板名が遅れて届いても既存の閲覧日時を保つ", async () => {
    upsertOpenedBoardEntry("https://example.com/sample/", null, 100);
    upsertOpenedBoardEntry("https://example.com/sample/", "サンプル板");
    await flushWrites();

    expect(readSaved()).toEqual([
      { url: "https://example.com/sample/", title: "サンプル板", lastVisited: 100 },
    ]);
  });

  it("内容が変わらない更新では保存しない", async () => {
    upsertOpenedBoardEntry("https://example.com/sample/", "サンプル板", 100);
    await flushWrites();
    setMock.mockClear();

    upsertOpenedBoardEntry("https://example.com/sample/", "サンプル板", 100);
    await flushWrites();

    expect(setMock).not.toHaveBeenCalled();
  });

  it("板として解釈できないURLは保存しない", async () => {
    upsertOpenedBoardEntry("https://twitter.com/home/", "Twitter", 100);
    await flushWrites();

    expect(setMock).not.toHaveBeenCalled();
  });
});
