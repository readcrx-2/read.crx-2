import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { recordDebugEvent, resetDebugLogForTest } from "./debug-log";
import {
  appendPersistedLogs,
  clearPersistedLogs,
  installLogPersistence,
  MAX_PERSISTED_ENTRIES,
  type PersistedLogEntry,
  readPersistedLogs,
} from "./log-persistence";

function entry(seq: number, overrides: Partial<PersistedLogEntry> = {}): PersistedLogEntry {
  return {
    seq,
    time: 1_000 + seq,
    level: "error",
    category: "console",
    message: `失敗${seq}`,
    page: "/view/index.html",
    ...overrides,
  };
}

beforeEach(async () => {
  await clearPersistedLogs();
});

afterEach(() => {
  resetDebugLogForTest();
  vi.useRealTimers();
});

describe("ログの永続化", () => {
  it("保存したログを時刻順に読み出し、条件で絞り込める", async () => {
    await appendPersistedLogs([
      entry(2),
      entry(1, { level: "warn", category: "write" }),
      entry(3, { time: 5_000 }),
    ]);

    const all = await readPersistedLogs();
    expect(all.map((log) => log.message)).toEqual(["失敗1", "失敗2", "失敗3"]);
    expect((await readPersistedLogs({ level: "warn" })).map((log) => log.message)).toEqual([
      "失敗1",
    ]);
    expect(await readPersistedLogs({ category: "write" })).toHaveLength(1);
    expect((await readPersistedLogs({ since: 4_000 })).map((log) => log.seq)).toEqual([3]);
    expect((await readPersistedLogs({ limit: 2 })).map((log) => log.seq)).toEqual([2, 3]);
  });

  it("窓ごとに採番したseqが重なっても、別々の記録として残す", async () => {
    await appendPersistedLogs([entry(1, { page: "/a" })]);
    await appendPersistedLogs([entry(1, { page: "/b" })]);

    const logs = await readPersistedLogs();

    expect(logs.map((log) => log.page)).toEqual(["/a", "/b"]);
    expect(new Set(logs.map((log) => log.id)).size).toBe(2);
  });

  it("上限を超えたら古い記録から消す", async () => {
    const total = MAX_PERSISTED_ENTRIES + 600;
    await appendPersistedLogs(Array.from({ length: total }, (_, index) => entry(index + 1)));

    const logs = await readPersistedLogs({ limit: total });

    expect(logs).toHaveLength(MAX_PERSISTED_ENTRIES);
    expect(logs[0].seq).toBe(total - MAX_PERSISTED_ENTRIES + 1);
    expect(logs.at(-1)?.seq).toBe(total);
  });

  it("記録された出来事を一定時間後にまとめて保存し、解除時に残りも保存する", async () => {
    vi.useFakeTimers();
    const dispose = installLogPersistence({ page: "/view/index.html" });

    recordDebugEvent("auto-refresh", "停止", { tabId: "t1" }, { withStack: false });
    expect(await readPersistedLogs()).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(2_100);
    vi.useRealTimers();
    const saved = await readPersistedLogs();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      category: "auto-refresh",
      message: "停止",
      page: "/view/index.html",
      data: { tabId: "t1" },
    });

    recordDebugEvent("auto-refresh", "再開", undefined, { withStack: false });
    dispose();
    await vi.waitFor(async () => expect(await readPersistedLogs()).toHaveLength(2));
  });
});
