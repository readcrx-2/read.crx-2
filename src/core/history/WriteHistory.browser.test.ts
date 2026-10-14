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

describe("WriteHistory browser branch", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useRealTimers();
    const WriteHistory = await import("src/core/history/WriteHistory");
    await WriteHistory.clear();
    messageSend.mockClear();
  });

  it("add stores fallback input_name/input_mail and get adds isHttps", async () => {
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

    const byUrl = await WriteHistory.getByUrl("https://example.com/thread");
    expect(byUrl).toHaveLength(1);
    expect(byUrl[0]?.input_name).toBe("name");
    expect(byUrl[0]?.input_mail).toBe("mail");

    const rows = await WriteHistory.get(0, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isHttps).toBe(true);
    expect(messageSend).toHaveBeenCalledWith("write_history_updated", {
      type: "added",
      id: expect.any(Number),
      url: "https://example.com/thread",
      res: 42,
    });
  });

  it("update rewrites an existing provisional entry", async () => {
    const WriteHistory = await import("src/core/history/WriteHistory");

    const provisionalId = await WriteHistory.add({
      url: "https://example.com/thread",
      res: 0,
      title: "title",
      name: "input name",
      mail: "sage",
      message: "message",
      date: 123,
    });
    if (provisionalId == null) {
      throw new Error("provisional write history ID was not created");
    }

    await WriteHistory.update({
      id: provisionalId,
      url: "https://example.com/thread",
      res: 42,
      title: "title",
      name: "actual name",
      mail: "actual mail",
      inputName: "input name",
      inputMail: "sage",
      message: "message",
      date: 456,
    });

    const byUrl = await WriteHistory.getByUrl("https://example.com/thread");
    expect(byUrl).toHaveLength(1);
    expect(byUrl[0]).toMatchObject({
      id: provisionalId,
      res: 42,
      name: "actual name",
      mail: "actual mail",
      input_name: "input name",
      input_mail: "sage",
      date: 456,
    });
  });

  it("clearRange removes only old entries", async () => {
    const fixedNow = new Date("2026-05-04T00:00:00.000Z").valueOf();
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);

    const WriteHistory = await import("src/core/history/WriteHistory");
    const now = fixedNow;
    const oldDate = now - 10 * 24 * 60 * 60 * 1000;
    const recentDate = now - 1 * 24 * 60 * 60 * 1000;

    await WriteHistory.add({
      url: "https://example.com/old",
      res: 1,
      title: "old",
      name: "name",
      mail: "mail",
      message: "message",
      date: oldDate,
    });

    await WriteHistory.add({
      url: "https://example.com/new",
      res: 1,
      title: "new",
      name: "name",
      mail: "mail",
      message: "message",
      date: recentDate,
    });

    await WriteHistory.clearRange(7);

    const allRows = await WriteHistory.getAll();
    expect(allRows).toHaveLength(1);
    expect(allRows[0]?.url).toBe("https://example.com/new");
  });

  it("remove deletes only matched url and res", async () => {
    const WriteHistory = await import("src/core/history/WriteHistory");

    await WriteHistory.add({
      url: "https://example.com/thread",
      res: 1,
      title: "old",
      name: "name",
      mail: "mail",
      message: "message",
      date: 100,
    });

    await WriteHistory.add({
      url: "https://example.com/thread",
      res: 2,
      title: "new",
      name: "name",
      mail: "mail",
      message: "message",
      date: 200,
    });

    await WriteHistory.remove("https://example.com/thread", 1);

    const rows = await WriteHistory.getByUrl("https://example.com/thread");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.res).toBe(2);
  });

  it("clear(offset) keeps first offset rows in insertion order", async () => {
    const WriteHistory = await import("src/core/history/WriteHistory");

    await WriteHistory.add({
      url: "https://example.com/1",
      res: 1,
      title: "a",
      name: "name",
      mail: "mail",
      message: "message",
      date: 100,
    });

    await WriteHistory.add({
      url: "https://example.com/2",
      res: 1,
      title: "b",
      name: "name",
      mail: "mail",
      message: "message",
      date: 200,
    });

    await WriteHistory.add({
      url: "https://example.com/3",
      res: 1,
      title: "c",
      name: "name",
      mail: "mail",
      message: "message",
      date: 300,
    });

    // 変更理由: clear(offset) の境界仕様を固定し、先頭offset件のみ保持する挙動を保証する。
    await WriteHistory.clear(2);

    const rows = await WriteHistory.getAll();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.url).toBe("https://example.com/1");
    expect(rows[1]?.url).toBe("https://example.com/2");
  });
});
