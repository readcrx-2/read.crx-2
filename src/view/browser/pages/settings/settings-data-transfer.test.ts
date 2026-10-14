// @vitest-environment node
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  configGetAll: vi.fn(),
  configSet: vi.fn(),
  messageSend: vi.fn(),
  historyGetAll: vi.fn(),
  historyClear: vi.fn(),
  historyAdd: vi.fn(),
  writeHistoryGetAll: vi.fn(),
  writeHistoryClear: vi.fn(),
  writeHistoryAdd: vi.fn(),
  bookmarkGetAll: vi.fn(),
  bookmarkImport: vi.fn(),
  setRootNodeId: vi.fn(),
  waitForBookmarkReady: vi.fn(),
  getLogArchiveRecords: vi.fn(),
  replaceLogArchiveRecords: vi.fn(),
  getBrowserSessionJson: vi.fn(),
  setBrowserSessionJson: vi.fn(),
}));

vi.mock("src/service-container/index", () => ({
  container: {
    // core/storage/Cache のログの書き出し・読み込みはサービスコンテナの threadLog から使う。
    threadLog: {
      getLogArchiveRecords: mocks.getLogArchiveRecords,
      replaceLogArchiveRecords: mocks.replaceLogArchiveRecords,
    },
    // src/core/history/WriteHistory はサービスコンテナの writeHistory から使う。
    writeHistory: {
      getAll: mocks.writeHistoryGetAll,
      clear: mocks.writeHistoryClear,
      add: mocks.writeHistoryAdd,
    },
    // src/core/history/History はサービスコンテナの history から使う。
    history: { getAll: mocks.historyGetAll, clear: mocks.historyClear, add: mocks.historyAdd },
    // ブックマークと保存先は window.app ではなくサービスコンテナから使う（legacy-window-app-plan の Phase 2）。
    bookmark: {
      ready: mocks.waitForBookmarkReady,
      getAll: mocks.bookmarkGetAll,
      import: mocks.bookmarkImport,
    },
    bookmarkRoot: { setRootNodeId: mocks.setRootNodeId },
    config: {
      getAll: mocks.configGetAll,
      set: mocks.configSet,
    },
    message: {
      send: mocks.messageSend,
    },
  },
}));

vi.mock("src/view/browser/state/tabs/browser-session-storage", () => ({
  getBrowserSessionJson: mocks.getBrowserSessionJson,
  setBrowserSessionJson: mocks.setBrowserSessionJson,
}));

const bookmark = {
  url: "https://example.com/test/read.cgi/software/1/",
  title: "ブックマーク",
  type: "thread",
  bbsType: "5ch",
  resCount: 10,
  readState: {
    url: "https://example.com/test/read.cgi/software/1/",
    received: 10,
    read: 8,
    last: 10,
  },
  expired: false,
};

const log = {
  url: "https://example.com/software/dat/1.dat",
  data: "本文",
  parsed: null,
  lastUpdated: 100,
  lastModified: null,
  etag: null,
  resLength: 10,
  datSize: 100,
  readcgiVer: null,
  expired: true,
  title: "過去ログ",
  threadUrl: "https://example.com/test/read.cgi/software/1/",
  boardUrl: "https://example.com/software/",
  boardTitle: "ソフトウェア",
  kind: "thread",
};

describe("settings data transfer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configGetAll.mockReturnValue({ config_theme: "dark" });
    mocks.configSet.mockResolvedValue(undefined);
    mocks.historyGetAll.mockResolvedValue([]);
    mocks.historyClear.mockResolvedValue(undefined);
    mocks.historyAdd.mockResolvedValue(undefined);
    mocks.writeHistoryGetAll.mockResolvedValue([]);
    mocks.writeHistoryClear.mockResolvedValue(undefined);
    mocks.writeHistoryAdd.mockResolvedValue(undefined);
    mocks.bookmarkGetAll.mockReturnValue([bookmark]);
    mocks.bookmarkImport.mockResolvedValue(true);
    mocks.setRootNodeId.mockResolvedValue(true);
    mocks.waitForBookmarkReady.mockResolvedValue(undefined);
    mocks.getLogArchiveRecords.mockResolvedValue([log]);
    mocks.replaceLogArchiveRecords.mockResolvedValue(undefined);
    mocks.getBrowserSessionJson.mockReturnValue(
      JSON.stringify({ panes: [], activePaneId: "pane-1" }),
    );
    mocks.setBrowserSessionJson.mockResolvedValue(undefined);
  });

  it("includes bookmarks, full logs, and session state in the archive", async () => {
    const { exportDataArchive } =
      await import("src/view/browser/pages/settings/settings-data-transfer");

    const blob = await exportDataArchive({
      includeHistory: false,
      includeWriteHistory: false,
      includeBookmarks: true,
      includeLogs: true,
      includeSession: true,
    });
    const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()));

    expect(zip["bookmarks.json"]).toBeDefined();
    expect(zip["logs.json"]).toBeDefined();
    expect(zip["session.json"]).toBeDefined();
    expect(JSON.parse(strFromU8(zip["bookmarks.json"]!)).items).toEqual([bookmark]);
    expect(JSON.parse(strFromU8(zip["logs.json"]!)).items).toEqual([log]);
    expect(JSON.parse(strFromU8(zip["session.json"]!)).state).toEqual({
      panes: [],
      activePaneId: "pane-1",
    });
  });

  it("restores bookmarks, logs, and session state from the archive", async () => {
    const { importDataArchive } =
      await import("src/view/browser/pages/settings/settings-data-transfer");
    const zip = zipSync({
      "settings.json": strToU8(JSON.stringify({ settings: { config_bookmark_id: "folder-1" } })),
      "bookmarks.json": strToU8(JSON.stringify({ items: [bookmark] })),
      "logs.json": strToU8(JSON.stringify({ items: [log] })),
      "session.json": strToU8(JSON.stringify({ state: { panes: [], activePaneId: "pane-1" } })),
    });
    const blob = new Blob([zip], { type: "application/zip" });
    const file = new File([blob], "backup.zip", { type: "application/zip" });

    const result = await importDataArchive(file);

    expect(result).toMatchObject({
      importedSettingsCount: 1,
      importedBookmarkCount: 1,
      importedLogCount: 1,
      importedSessionCount: 1,
    });
    expect(mocks.configSet).toHaveBeenCalledWith("bookmark_id", "folder-1");
    expect(mocks.setRootNodeId).toHaveBeenCalledWith("folder-1");
    expect(mocks.bookmarkImport).toHaveBeenCalledWith(bookmark);
    expect(mocks.replaceLogArchiveRecords).toHaveBeenCalledWith([log]);
    expect(mocks.messageSend).toHaveBeenCalledWith("log_updated", { type: "restored" });
    expect(mocks.setBrowserSessionJson).toHaveBeenCalledWith(
      JSON.stringify({ panes: [], activePaneId: "pane-1" }),
    );
  });
});
