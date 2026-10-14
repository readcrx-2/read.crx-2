import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { messageSend } = vi.hoisted(() => ({
  messageSend: vi.fn(),
}));

vi.mock("src/app/Message", () => ({
  default: {
    send: messageSend,
  },
}));

vi.mock("src/core/storage/TauriDrizzleBridge", () => ({
  isTauriRuntime: () => false,
  getTauriRepositories: async () => {
    throw new Error("Tauri repository should not be used in browser tests");
  },
}));

vi.mock("src/core/network/url-protocol", () => ({
  isHttps: (url: string) => url.startsWith("https://"),
}));

vi.mock("src/app/Log", () => ({
  log: vi.fn(),
  assertArg: () => false,
}));

describe("History browser branch", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useRealTimers();
    const History = await import("src/core/history/History");
    await History.clear();
    messageSend.mockClear();
  });

  it("add notifies history_updated after persistence", async () => {
    const History = await import("src/core/history/History");

    await History.add("https://example.com/thread", "t1", 100, "board");

    expect(messageSend).toHaveBeenCalledWith("history_updated", {
      type: "added",
      url: "https://example.com/thread",
      date: 100,
    });
  });

  it("getUnique dedupes by url and adds isHttps", async () => {
    const History = await import("src/core/history/History");

    await History.add("https://example.com/thread-1", "t1", 100, "b1");
    await History.add("http://example.com/thread-1", "t1", 200, "b1");
    await History.add("https://example.com/thread-2", "t2", 300, "b2");

    const uniqueRows = await History.getUnique(0, 10);

    expect(uniqueRows).toHaveLength(3);
    expect(uniqueRows[0]?.url).toBe("https://example.com/thread-2");
    expect(uniqueRows[0]?.isHttps).toBe(true);
    expect(uniqueRows[1]?.url).toBe("http://example.com/thread-1");
    expect(uniqueRows[1]?.isHttps).toBe(false);
  });

  it("getByUrl returns matching visits newest first", async () => {
    const History = await import("src/core/history/History");

    await History.add("https://example.com/thread", "older", 100, "board");
    await History.add("https://example.com/other", "other", 300, "board");
    await History.add("https://example.com/thread", "newer", 200, "board");

    const rows = await History.getByUrl("https://example.com/thread");

    expect(rows.map((row) => row.title)).toEqual(["newer", "older"]);
    expect(rows.every((row) => row.isHttps)).toBe(true);
  });

  it("clearRange removes only rows older than threshold", async () => {
    const fixedNow = new Date("2026-05-04T00:00:00.000Z").valueOf();
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);

    const History = await import("src/core/history/History");
    const now = fixedNow;
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;
    const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;

    await History.add("https://example.com/old", "old", tenDaysAgo, "board");
    await History.add("https://example.com/new", "new", twoDaysAgo, "board");

    await History.clearRange(7);

    const rows = await History.getAll();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.url).toBe("https://example.com/new");
  });

  it("remove deletes only the targeted date first, then all rows for url", async () => {
    const History = await import("src/core/history/History");

    await History.add("https://example.com/thread", "v1", 100, "board");
    await History.add("https://example.com/thread", "v2", 200, "board");
    await History.add("https://example.com/other", "v3", 300, "board");

    await History.remove("https://example.com/thread", 100);

    let rows = await History.getAll();
    expect(rows).toHaveLength(2);
    expect(rows.some((row) => row.url === "https://example.com/thread" && row.date === 100)).toBe(
      false,
    );
    expect(rows.some((row) => row.url === "https://example.com/thread" && row.date === 200)).toBe(
      true,
    );

    await History.remove("https://example.com/thread", null);

    rows = await History.getAll();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.url).toBe("https://example.com/other");
  });

  it("clear(offset) keeps first offset rows in insertion order", async () => {
    const History = await import("src/core/history/History");

    await History.add("https://example.com/1", "t1", 100, "board");
    await History.add("https://example.com/2", "t2", 200, "board");
    await History.add("https://example.com/3", "t3", 300, "board");

    // 変更理由: clear(offset) の境界を固定し、先頭offset件を残す既存仕様の退行を防ぐ。
    await History.clear(1);

    const rows = await History.getAll();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.url).toBe("https://example.com/1");
  });
});
