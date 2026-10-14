import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { messageSend } = vi.hoisted(() => ({
  messageSend: vi.fn(),
}));

const state = vi.hoisted(() => ({
  tauriWriteHistoryRepository: {
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    get: vi.fn(),
    getByUrl: vi.fn(),
    getAll: vi.fn(),
    count: vi.fn(),
    clear: vi.fn(),
    clearRange: vi.fn(),
  },
}));

vi.mock("src/app/Message", () => ({
  default: {
    send: messageSend,
  },
}));

vi.mock("src/core/storage/TauriDrizzleBridge", () => ({
  isTauriRuntime: () => true,
  getTauriRepositories: async () => ({
    tauriWriteHistoryRepository: state.tauriWriteHistoryRepository,
  }),
}));

vi.mock("src/core/network/url-protocol", () => ({
  isHttps: (url: string) => url.startsWith("https://"),
}));

describe("WriteHistory Tauri branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageSend.mockClear();
  });

  it("add delegates with fallback input_name/input_mail", async () => {
    state.tauriWriteHistoryRepository.getByUrl.mockResolvedValueOnce([
      {
        id: 1,
        url: "https://example.com/thread",
        res: 42,
        title: "title",
        name: "name",
        mail: "mail",
        input_name: "name",
        input_mail: "mail",
        message: "message",
        date: 123,
      },
    ]);

    const WriteHistory = await import("src/core/history/WriteHistory");

    await WriteHistory.add({
      url: "https://example.com/thread",
      res: 42,
      title: "title",
      name: "name",
      mail: "mail",
      message: "message",
      date: 123,
    });

    expect(state.tauriWriteHistoryRepository.add).toHaveBeenCalledWith({
      url: "https://example.com/thread",
      res: 42,
      title: "title",
      name: "name",
      mail: "mail",
      inputName: "name",
      inputMail: "mail",
      message: "message",
      date: 123,
    });
    expect(messageSend).toHaveBeenCalledWith("write_history_updated", {
      type: "added",
      id: 1,
      url: "https://example.com/thread",
      res: 42,
    });
  });

  it("update delegates with explicit id", async () => {
    const WriteHistory = await import("src/core/history/WriteHistory");

    await WriteHistory.update({
      id: 99,
      url: "https://example.com/thread",
      res: 100,
      title: "title",
      name: "name",
      mail: "mail",
      message: "message",
      date: 456,
    });

    expect(state.tauriWriteHistoryRepository.update).toHaveBeenCalledWith({
      id: 99,
      url: "https://example.com/thread",
      res: 100,
      title: "title",
      name: "name",
      mail: "mail",
      inputName: "name",
      inputMail: "mail",
      message: "message",
      date: 456,
    });
  });

  it("get adds isHttps flag for UI compatibility", async () => {
    state.tauriWriteHistoryRepository.get.mockResolvedValueOnce([
      {
        id: 1,
        url: "https://example.com/thread",
        res: 42,
        title: "title",
        name: "name",
        mail: "mail",
        input_name: "name",
        input_mail: "mail",
        message: "message",
        date: 123,
      },
    ]);

    const WriteHistory = await import("src/core/history/WriteHistory");
    const rows = await WriteHistory.get(0, 10);

    expect(state.tauriWriteHistoryRepository.get).toHaveBeenCalledWith(0, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].isHttps).toBe(true);
  });
});
