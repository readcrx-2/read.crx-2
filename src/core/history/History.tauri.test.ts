import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  tauriHistoryRepository: {
    add: vi.fn(),
    remove: vi.fn(),
    get: vi.fn(),
    getUnique: vi.fn(),
    getAll: vi.fn(),
    getByUrl: vi.fn(),
    count: vi.fn(),
    clear: vi.fn(),
    clearRange: vi.fn(),
  },
}));

vi.mock("src/app/Message", () => ({
  default: {
    send: vi.fn(),
  },
}));

vi.mock("src/core/storage/TauriDrizzleBridge", () => ({
  isTauriRuntime: () => true,
  getTauriRepositories: async () => ({
    tauriHistoryRepository: state.tauriHistoryRepository,
  }),
}));

vi.mock("src/core/network/URL.ts", () => ({
  isHttps: (url: string) => url.startsWith("https://"),
}));

describe("History Tauri branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("add delegates to tauriHistoryRepository", async () => {
    const History = await import("src/core/history/History");

    await History.add("https://example.com/thread", "title", 123, "board");

    expect(state.tauriHistoryRepository.add).toHaveBeenCalledWith(
      "https://example.com/thread",
      "title",
      123,
      "board",
    );
  });

  it("get adds isHttps flag for UI compatibility", async () => {
    state.tauriHistoryRepository.get.mockResolvedValueOnce([
      {
        id: 1,
        url: "https://example.com/thread",
        title: "title",
        date: 123,
        boardTitle: "board",
      },
    ]);

    const History = await import("src/core/history/History");
    const rows = await History.get(0, 10);

    expect(state.tauriHistoryRepository.get).toHaveBeenCalledWith(0, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].isHttps).toBe(true);
  });

  it("getByUrl delegates to the Tauri history repository", async () => {
    state.tauriHistoryRepository.getByUrl.mockResolvedValueOnce([
      {
        id: 1,
        url: "https://example.com/thread",
        title: "title",
        date: 123,
        boardTitle: "board",
      },
    ]);

    const History = await import("src/core/history/History");
    const rows = await History.getByUrl("https://example.com/thread");

    expect(state.tauriHistoryRepository.getByUrl).toHaveBeenCalledWith(
      "https://example.com/thread",
    );
    expect(rows[0]?.isHttps).toBe(true);
  });

  it("clearRange passes unix threshold", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T00:00:00.000Z"));

    const History = await import("src/core/history/History");
    await History.clearRange(7);

    const expected = Date.now() - 7 * 24 * 60 * 60 * 1000;
    expect(state.tauriHistoryRepository.clearRange).toHaveBeenCalledWith(expected);
  });
});
