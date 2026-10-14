// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  tauriCacheRepository: {
    get: vi.fn(),
    put: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    count: vi.fn(),
    clearOlderThan: vi.fn(),
    listLogs: vi.fn(),
    deleteLogs: vi.fn(),
    searchLogs: vi.fn(),
  },
}));

vi.mock("src/app/platform", () => ({
  platform: {
    storage: {
      getStore: () => {
        throw new Error("ObjectStore should not be used in Tauri tests");
      },
    },
  },
}));

vi.mock("src/core/storage/TauriDrizzleBridge", () => ({
  isTauriRuntime: () => true,
  getTauriRepositories: async () => ({
    tauriCacheRepository: state.tauriCacheRepository,
  }),
}));

vi.mock("src/core/network/url-protocol", () => ({
  isHttps: (url: string) => url.startsWith("https://"),
}));

describe("Cache Tauri log branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("put delegates log metadata to the repository", async () => {
    const { default: Cache } = await import("src/core/storage/Cache");
    const cache = new Cache("https://ex.com/b/dat/1.dat");
    cache.title = "t";
    cache.threadUrl = "https://ex.com/test/read.cgi/b/1/";
    cache.boardUrl = "https://ex.com/b/";
    cache.kind = "thread";
    await cache.put("data");

    expect(state.tauriCacheRepository.put).toHaveBeenCalledTimes(1);
    const arg = state.tauriCacheRepository.put.mock.calls[0][0];
    expect(arg.kind).toBe("thread");
    expect(arg.threadUrl).toBe("https://ex.com/test/read.cgi/b/1/");
    expect(arg.title).toBe("t");
    expect(arg.boardUrl).toBe("https://ex.com/b/");
  });

  it("listLogs maps repository rows into LogRecord with isHttps", async () => {
    state.tauriCacheRepository.listLogs.mockResolvedValueOnce([
      {
        url: "https://ex.com/b/dat/1.dat",
        title: "t",
        threadUrl: "https://ex.com/test/read.cgi/b/1/",
        boardUrl: "https://ex.com/b/",
        boardTitle: null,
        resLength: 3,
        datSize: null,
        lastUpdated: 100,
      },
    ]);

    const { default: Cache } = await import("src/core/storage/Cache");
    const logs = await Cache.listLogs(0, 10);

    expect(state.tauriCacheRepository.listLogs).toHaveBeenCalledWith(0, 10);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.threadUrl).toBe("https://ex.com/test/read.cgi/b/1/");
    expect(logs[0]?.isHttps).toBe(true);
  });

  it("searchLogs delegates to the repository", async () => {
    state.tauriCacheRepository.searchLogs.mockResolvedValueOnce([]);

    const { default: Cache } = await import("src/core/storage/Cache");
    await Cache.searchLogs("キーワード");

    expect(state.tauriCacheRepository.searchLogs).toHaveBeenCalledWith("キーワード");
  });

  it("deleteLogs delegates to the repository", async () => {
    const { default: Cache } = await import("src/core/storage/Cache");
    await Cache.deleteLogs();
    expect(state.tauriCacheRepository.deleteLogs).toHaveBeenCalledTimes(1);
  });
});
