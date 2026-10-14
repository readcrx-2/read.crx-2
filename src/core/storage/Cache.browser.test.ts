import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

// インメモリ ObjectStore（url を keyPath とする）で Cache のブラウザ分岐を検証する。
// fake-indexeddb / webextension-polyfill を避け、Cache のログ用ロジックだけを切り出してテストする。
interface Row {
  url: string;
  [key: string]: unknown;
}

const rows = new Map<string, Row>();

function matchesRange(value: unknown, query: unknown): boolean {
  if (query == null) return true;
  const range = query as {
    upper?: number;
    upperOpen?: boolean;
  };
  if (typeof value !== "number") return false;
  if (range.upper != null) {
    return range.upperOpen ? value < range.upper : value <= range.upper;
  }
  return true;
}

const store = {
  async get(key: string) {
    return rows.get(key) ?? null;
  },
  async put(value: Row) {
    rows.set(value.url, value);
  },
  async delete(key: string) {
    rows.delete(key);
  },
  async getAll() {
    return [...rows.values()];
  },
  async clear() {
    rows.clear();
  },
  async count() {
    return rows.size;
  },
  index(name: string) {
    return {
      async getAll(query?: unknown) {
        return [...rows.values()].filter((row) => matchesRange(row[name], query));
      },
      async getAllKeys(query?: unknown) {
        return [...rows.values()]
          .filter((row) => matchesRange(row[name], query))
          .map((row) => row.url);
      },
      async getPage({
        query,
        direction = "next",
        offset = 0,
        limit,
        filter,
      }: {
        query?: unknown;
        direction?: IDBCursorDirection;
        offset?: number;
        limit: number;
        filter?: { key: string; value: unknown };
      }) {
        const ordered = [...rows.values()]
          .filter((row) => matchesRange(row[name], query))
          .filter((row) => !filter || row[filter.key] === filter.value)
          .sort((a, b) => Number(a[name] ?? 0) - Number(b[name] ?? 0));
        if (direction === "prev" || direction === "prevunique") {
          ordered.reverse();
        }
        const values = ordered.slice(offset, offset + limit);
        return {
          values,
          hasMore: ordered.length > offset + values.length,
        };
      },
    };
  },
};

vi.mock("src/app/platform", () => ({
  platform: {
    storage: {
      getStore: () => store,
    },
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

async function saveThreadLog(opts: {
  key: string;
  threadUrl: string;
  title: string;
  boardUrl: string;
  data?: string;
  parsed?: unknown;
  resLength?: number;
  expired?: boolean;
  lastUpdated: number;
}): Promise<void> {
  const { default: Cache } = await import("src/core/storage/Cache");
  const cache = new Cache(opts.key);
  cache.title = opts.title;
  cache.threadUrl = opts.threadUrl;
  cache.boardUrl = opts.boardUrl;
  cache.kind = "thread";
  cache.resLength = opts.resLength ?? null;
  cache.expired = opts.expired ?? null;
  cache.parsed = opts.parsed ?? null;
  cache.lastUpdated = opts.lastUpdated;
  await cache.put(opts.data ?? "dummy");
  // put() は data 指定時 lastUpdated を Date.now() で上書きするため、明示的に戻す。
  cache.lastUpdated = opts.lastUpdated;
  await cache.put();
}

describe("Cache browser log branch", () => {
  beforeEach(() => {
    rows.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips log metadata through put/get", async () => {
    const { default: Cache } = await import("src/core/storage/Cache");
    await saveThreadLog({
      key: "https://ex.com/board/dat/1.dat",
      threadUrl: "https://ex.com/test/read.cgi/board/1/",
      title: "テストスレ",
      boardUrl: "https://ex.com/board/",
      resLength: 5,
      lastUpdated: 100,
    });

    const cache = new Cache("https://ex.com/board/dat/1.dat");
    await cache.get();
    expect(cache.title).toBe("テストスレ");
    expect(cache.threadUrl).toBe("https://ex.com/test/read.cgi/board/1/");
    expect(cache.boardUrl).toBe("https://ex.com/board/");
    expect(cache.kind).toBe("thread");
    expect(cache.resLength).toBe(5);
  });

  it("本文のないdat落ち状態だけを保存しログ本文として扱わない", async () => {
    const { default: Cache } = await import("src/core/storage/Cache");
    const state = new Cache("https://ex.com/board/dat/1.dat");
    state.expired = true;
    state.kind = "thread_state";
    state.lastUpdated = 100;

    await state.put();

    const restored = new Cache(state.key);
    await restored.get();
    expect(restored.expired).toBe(true);
    expect(restored.data).toBeNull();
    expect(restored.parsed).toBeNull();
    expect(await Cache.listLogs()).toEqual([]);
  });

  it("kind未設定でも確認済みdat落ちキャッシュは期間削除から保持する", async () => {
    const { default: Cache } = await import("src/core/storage/Cache");
    vi.stubGlobal("IDBKeyRange", {
      upperBound: (upper: number, upperOpen: boolean) => ({ upper, upperOpen }),
    });
    const oldExpired = new Cache("https://ex.com/b/dat/1.dat");
    oldExpired.data = "保存済み本文";
    oldExpired.lastUpdated = Date.now() - 10 * 24 * 60 * 60 * 1000;
    oldExpired.expired = true;
    // 変更理由: dat落ち判定以前の本文キャッシュにはkindが付いていないことがある。
    await oldExpired.put();
    const oldBoard = new Cache("https://ex.com/b/subject.txt");
    oldBoard.data = "板キャッシュ";
    oldBoard.lastUpdated = oldExpired.lastUpdated;
    await oldBoard.put();

    await Cache.clearRange(1);

    expect(await store.get(oldExpired.key)).toMatchObject({ expired: true });
    expect(await store.get(oldBoard.key)).toBeNull();
  });

  it("listLogs returns only thread logs, newest first, with threadUrl + isHttps", async () => {
    const { default: Cache } = await import("src/core/storage/Cache");

    await saveThreadLog({
      key: "https://ex.com/b/dat/1.dat",
      threadUrl: "https://ex.com/test/read.cgi/b/1/",
      title: "old",
      boardUrl: "https://ex.com/b/",
      lastUpdated: 100,
    });
    await saveThreadLog({
      key: "http://ex.com/b/dat/2.dat",
      threadUrl: "http://ex.com/test/read.cgi/b/2/",
      title: "new",
      boardUrl: "http://ex.com/b/",
      lastUpdated: 200,
    });
    // スレ以外のキャッシュ（板の subject.txt 等）はログに含めない。
    await store.put({
      url: "https://ex.com/b/subject.txt",
      kind: null,
      last_updated: 300,
      title: "board-cache",
    });

    const logs = await Cache.listLogs();
    expect(logs).toHaveLength(2);
    expect(logs[0]?.title).toBe("new");
    expect(logs[0]?.threadUrl).toBe("http://ex.com/test/read.cgi/b/2/");
    expect(logs[0]?.isHttps).toBe(false);
    expect(logs[1]?.title).toBe("old");
    expect(logs[1]?.isHttps).toBe(true);
  });

  it("listLogs returns a requested page without including non-thread caches", async () => {
    const { default: Cache } = await import("src/core/storage/Cache");
    for (const [index, lastUpdated] of [100, 200, 300].entries()) {
      await saveThreadLog({
        key: `https://ex.com/b/dat/${index}.dat`,
        threadUrl: `https://ex.com/test/read.cgi/b/${index}/`,
        title: `thread-${lastUpdated}`,
        boardUrl: "https://ex.com/b/",
        lastUpdated,
      });
    }
    await store.put({
      url: "https://ex.com/b/subject.txt",
      kind: null,
      last_updated: 250,
    });

    const logs = await Cache.listLogs(1, 1);
    expect(logs.map((log) => log.title)).toEqual(["thread-200"]);
  });

  it("deleteLogs removes only thread logs", async () => {
    const { default: Cache } = await import("src/core/storage/Cache");

    await saveThreadLog({
      key: "https://ex.com/b/dat/1.dat",
      threadUrl: "https://ex.com/test/read.cgi/b/1/",
      title: "t",
      boardUrl: "https://ex.com/b/",
      lastUpdated: 100,
    });
    await store.put({
      url: "https://ex.com/b/subject.txt",
      kind: null,
      last_updated: 300,
    });

    await Cache.deleteLogs();

    const all = await store.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.url).toBe("https://ex.com/b/subject.txt");
  });

  it("exports and restores the full log cache including body and parsed data", async () => {
    const { default: Cache } = await import("src/core/storage/Cache");

    await saveThreadLog({
      key: "https://ex.com/b/dat/1.dat",
      threadUrl: "https://ex.com/test/read.cgi/b/1/",
      title: "保存対象",
      boardUrl: "https://ex.com/b/",
      data: "本文データ",
      parsed: { responses: [{ num: 1, message: "parsed" }] },
      expired: true,
      lastUpdated: 100,
    });
    await store.put({
      url: "https://ex.com/b/subject.txt",
      kind: null,
      last_updated: 300,
      data: "board",
    });

    const records = await Cache.getLogArchiveRecords();
    expect(records).toHaveLength(1);
    expect(records[0]?.data).toBe("本文データ");
    expect(records[0]?.parsed).toEqual({ responses: [{ num: 1, message: "parsed" }] });
    expect(records[0]?.expired).toBe(true);

    await Cache.replaceLogArchiveRecords(records);

    const restored = await store.get("https://ex.com/b/dat/1.dat");
    expect(restored).toMatchObject({
      data: "本文データ",
      parsed: { responses: [{ num: 1, message: "parsed" }] },
      expired: true,
      kind: "thread",
    });
    expect(await store.get("https://ex.com/b/subject.txt")).not.toBeNull();
  });

  it("searchLogs matches dat body and parsed content", async () => {
    const { default: Cache } = await import("src/core/storage/Cache");

    await saveThreadLog({
      key: "https://ex.com/b/dat/1.dat",
      threadUrl: "https://ex.com/test/read.cgi/b/1/",
      title: "スレA",
      boardUrl: "https://ex.com/b/",
      data: "名無し<>sage<>2026<> 重要キーワードを含む本文 <>",
      lastUpdated: 100,
    });
    await saveThreadLog({
      key: "https://ex.com/b/dat/2.dat",
      threadUrl: "https://ex.com/test/read.cgi/b/2/",
      title: "スレB",
      boardUrl: "https://ex.com/b/",
      data: "別の本文",
      lastUpdated: 200,
    });

    const hits = await Cache.searchLogs("重要キーワード");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.title).toBe("スレA");

    // クエリが空ならログ全件を返す。
    const all = await Cache.searchLogs("  ");
    expect(all).toHaveLength(2);
  });

  it("searchLogsPage scans body logs in bounded chunks", async () => {
    const { default: Cache } = await import("src/core/storage/Cache");
    await saveThreadLog({
      key: "https://ex.com/b/dat/1.dat",
      threadUrl: "https://ex.com/test/read.cgi/b/1/",
      title: "older",
      boardUrl: "https://ex.com/b/",
      data: "needle",
      lastUpdated: 100,
    });
    await saveThreadLog({
      key: "https://ex.com/b/dat/2.dat",
      threadUrl: "https://ex.com/test/read.cgi/b/2/",
      title: "newer",
      boardUrl: "https://ex.com/b/",
      data: "no match",
      lastUpdated: 200,
    });

    const first = await Cache.searchLogsPage("needle", 0, 1);
    expect(first.logs).toHaveLength(0);
    expect(first.nextOffset).toBe(1);
    expect(first.hasMore).toBe(true);

    const second = await Cache.searchLogsPage("needle", first.nextOffset, 1);
    expect(second.logs.map((log) => log.title)).toEqual(["older"]);
    expect(second.hasMore).toBe(false);
  });
});
