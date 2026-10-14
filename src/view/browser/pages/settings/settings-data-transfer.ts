import JSZip from "jszip";
import type { Entry as BookmarkEntry, ReadState } from "src/core/bookmark/BookmarkEntryList";
import * as WriteHistory from "src/core/history/WriteHistory";
import Cache, { type LogArchiveRecord } from "src/core/storage/Cache";
import { container } from "src/service-container/index";
import {
  getBrowserSessionJson,
  setBrowserSessionJson,
} from "src/view/browser/state/tabs/browser-session-storage";
import {
  getLegacyBookmarkEntryList,
  getLegacyBookmarkService,
  waitForLegacyBookmarkReady,
} from "src/view/browser/utils/legacy-app";

const ARCHIVE_SCHEMA_VERSION = 2;

const SETTINGS_JSON_PATH = "settings.json";
const HISTORY_JSON_PATH = "history.json";
const WRITE_HISTORY_JSON_PATH = "write-history.json";
const BOOKMARKS_JSON_PATH = "bookmarks.json";
const LOGS_JSON_PATH = "logs.json";
const SESSION_JSON_PATH = "session.json";
const MANIFEST_JSON_PATH = "manifest.json";

interface ExportManifest {
  schemaVersion: number;
  app: string;
  exportedAt: string;
  includedFiles: string[];
}

interface SettingsExportPayload {
  schemaVersion: number;
  exportedAt: string;
  settings: Record<string, string | number>;
}

interface HistoryExportRecord {
  url: string;
  title: string;
  date: number;
  boardTitle: string;
}

interface WriteHistoryExportRecord {
  url: string;
  res: number;
  title: string;
  name: string;
  mail: string;
  input_name: string;
  input_mail: string;
  message: string;
  date: number;
}

interface HistoryExportPayload {
  schemaVersion: number;
  exportedAt: string;
  items: HistoryExportRecord[];
}

interface WriteHistoryExportPayload {
  schemaVersion: number;
  exportedAt: string;
  items: WriteHistoryExportRecord[];
}

interface BookmarkExportPayload {
  schemaVersion: number;
  exportedAt: string;
  items: BookmarkEntry[];
}

interface LogExportPayload {
  schemaVersion: number;
  exportedAt: string;
  items: LogArchiveRecord[];
}

interface SessionExportPayload {
  schemaVersion: number;
  exportedAt: string;
  state: Record<string, unknown> | null;
}

type SettingsImportPayload =
  | SettingsExportPayload
  | {
      schemaVersion?: number;
      exportedAt?: string;
      settings?: Record<string, unknown>;
      [key: string]: unknown;
    };

export interface ExportArchiveOptions {
  includeHistory: boolean;
  includeWriteHistory: boolean;
  includeBookmarks: boolean;
  includeLogs: boolean;
  includeSession: boolean;
}

export interface ImportArchiveResult {
  importedSettingsCount: number;
  importedHistoryCount: number;
  importedWriteHistoryCount: number;
  importedBookmarkCount: number;
  importedLogCount: number;
  importedSessionCount: number;
}

function toJsonString(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

function normalizeConfigEntries(source: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = rawKey.startsWith("config_") ? rawKey.slice(7) : rawKey;
    if (typeof rawValue === "string") {
      normalized[key] = rawValue;
      continue;
    }
    if (typeof rawValue === "number" || typeof rawValue === "boolean") {
      normalized[key] = String(rawValue);
    }
  }

  return normalized;
}

function toHistoryExportRecord(value: unknown): HistoryExportRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.url !== "string" ||
    typeof record.title !== "string" ||
    typeof record.date !== "number" ||
    !Number.isFinite(record.date)
  ) {
    return null;
  }

  return {
    url: record.url,
    title: record.title,
    date: record.date,
    boardTitle: typeof record.boardTitle === "string" ? record.boardTitle : "",
  };
}

function toWriteHistoryExportRecord(value: unknown): WriteHistoryExportRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.url !== "string" ||
    typeof record.res !== "number" ||
    !Number.isFinite(record.res) ||
    typeof record.title !== "string" ||
    typeof record.name !== "string" ||
    typeof record.mail !== "string" ||
    typeof record.message !== "string" ||
    typeof record.date !== "number" ||
    !Number.isFinite(record.date)
  ) {
    return null;
  }

  return {
    url: record.url,
    res: record.res,
    title: record.title,
    name: record.name,
    mail: record.mail,
    input_name: typeof record.input_name === "string" ? record.input_name : record.name,
    input_mail: typeof record.input_mail === "string" ? record.input_mail : record.mail,
    message: record.message,
    date: record.date,
  };
}

function toFiniteNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toBookmarkReadState(value: unknown): ReadState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.url !== "string" ||
    typeof record.received !== "number" ||
    !Number.isFinite(record.received) ||
    typeof record.read !== "number" ||
    !Number.isFinite(record.read) ||
    typeof record.last !== "number" ||
    !Number.isFinite(record.last)
  ) {
    return null;
  }

  return {
    url: record.url,
    received: record.received,
    read: record.read,
    last: record.last,
    offset: toFiniteNumberOrNull(record.offset) ?? undefined,
    date: toFiniteNumberOrNull(record.date) ?? undefined,
  };
}

function toBookmarkExportRecord(value: unknown): BookmarkEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const resCount = record.resCount === null ? null : toFiniteNumberOrNull(record.resCount);
  if (
    typeof record.url !== "string" ||
    typeof record.title !== "string" ||
    typeof record.type !== "string" ||
    typeof record.bbsType !== "string" ||
    resCount === undefined ||
    typeof record.expired !== "boolean"
  ) {
    return null;
  }

  return {
    url: record.url,
    title: record.title,
    type: record.type,
    bbsType: record.bbsType,
    resCount,
    readState: record.readState === null ? null : toBookmarkReadState(record.readState),
    expired: record.expired,
  };
}

function toLogArchiveRecord(value: unknown): LogArchiveRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const data = record.data === null ? null : typeof record.data === "string" ? record.data : null;
  const parsed = record.parsed ?? null;
  if (
    typeof record.url !== "string" ||
    typeof record.lastUpdated !== "number" ||
    !Number.isFinite(record.lastUpdated) ||
    (data === null && (parsed === null || typeof parsed !== "object"))
  ) {
    return null;
  }

  return {
    url: record.url,
    data,
    parsed,
    lastUpdated: record.lastUpdated,
    lastModified: toFiniteNumberOrNull(record.lastModified),
    etag: typeof record.etag === "string" ? record.etag : null,
    resLength: toFiniteNumberOrNull(record.resLength),
    datSize: toFiniteNumberOrNull(record.datSize),
    readcgiVer: toFiniteNumberOrNull(record.readcgiVer),
    // 旧バックアップには列がないため、未確認(null)として復元する。
    expired: typeof record.expired === "boolean" ? record.expired : null,
    title: typeof record.title === "string" ? record.title : null,
    threadUrl: typeof record.threadUrl === "string" ? record.threadUrl : null,
    boardUrl: typeof record.boardUrl === "string" ? record.boardUrl : null,
    boardTitle: typeof record.boardTitle === "string" ? record.boardTitle : null,
    kind: "thread",
  };
}

function toSessionExportState(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const hasCurrentState = Array.isArray(record.panes) && typeof record.activePaneId === "string";
  const hasLegacyState = Array.isArray(record.tabs) && typeof record.activeTabId === "string";
  return hasCurrentState || hasLegacyState ? record : null;
}

function readSessionExportState(): Record<string, unknown> | null {
  const raw = getBrowserSessionJson();
  if (!raw) {
    return null;
  }

  try {
    return toSessionExportState(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function readJsonEntry<T>(zip: JSZip, path: string): Promise<T | null> {
  const file = zip.file(path);
  if (!file) {
    return null;
  }

  const text = await file.async("string");
  return JSON.parse(text) as T;
}

export async function exportDataArchive(options: ExportArchiveOptions): Promise<Blob> {
  const zip = new JSZip();
  const exportedAt = new Date().toISOString();
  const includedFiles: string[] = [SETTINGS_JSON_PATH];

  const settingsPayload: SettingsExportPayload = {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    exportedAt,
    settings: container.config.getAll(),
  };
  zip.file(SETTINGS_JSON_PATH, toJsonString(settingsPayload));

  if (options.includeHistory) {
    const rows = await container.history.getAll();
    const normalizedRows = rows
      .map((row) => toHistoryExportRecord(row))
      .filter((row): row is HistoryExportRecord => row != null);
    const payload: HistoryExportPayload = {
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
      exportedAt,
      items: normalizedRows,
    };
    zip.file(HISTORY_JSON_PATH, toJsonString(payload));
    includedFiles.push(HISTORY_JSON_PATH);
  }

  if (options.includeWriteHistory) {
    const rows = await WriteHistory.getAll();
    const normalizedRows = rows
      .map((row) => toWriteHistoryExportRecord(row))
      .filter((row): row is WriteHistoryExportRecord => row != null);

    const payload: WriteHistoryExportPayload = {
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
      exportedAt,
      items: normalizedRows,
    };
    zip.file(WRITE_HISTORY_JSON_PATH, toJsonString(payload));
    includedFiles.push(WRITE_HISTORY_JSON_PATH);
  }

  if (options.includeBookmarks) {
    await waitForLegacyBookmarkReady();
    const bookmarkRows = getLegacyBookmarkService()?.getAll?.();
    const normalizedRows = (Array.isArray(bookmarkRows) ? bookmarkRows : [])
      .map((row) => toBookmarkExportRecord(row))
      .filter((row): row is BookmarkEntry => row != null);
    const payload: BookmarkExportPayload = {
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
      exportedAt,
      items: normalizedRows,
    };
    zip.file(BOOKMARKS_JSON_PATH, toJsonString(payload));
    includedFiles.push(BOOKMARKS_JSON_PATH);
  }

  if (options.includeLogs) {
    const payload: LogExportPayload = {
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
      exportedAt,
      items: await Cache.getLogArchiveRecords(),
    };
    zip.file(LOGS_JSON_PATH, toJsonString(payload));
    includedFiles.push(LOGS_JSON_PATH);
  }

  if (options.includeSession) {
    const payload: SessionExportPayload = {
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
      exportedAt,
      state: readSessionExportState(),
    };
    zip.file(SESSION_JSON_PATH, toJsonString(payload));
    includedFiles.push(SESSION_JSON_PATH);
  }

  const manifest: ExportManifest = {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    app: "chlens",
    exportedAt,
    includedFiles,
  };
  zip.file(MANIFEST_JSON_PATH, toJsonString(manifest));

  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

export async function importDataArchive(archiveFile: File): Promise<ImportArchiveResult> {
  const zip = await JSZip.loadAsync(archiveFile);

  const settingsPayload = await readJsonEntry<SettingsImportPayload>(zip, SETTINGS_JSON_PATH);
  const settingsSource =
    settingsPayload && "settings" in settingsPayload ? settingsPayload.settings : settingsPayload;
  const normalizedSettings =
    settingsSource && typeof settingsSource === "object"
      ? normalizeConfigEntries(settingsSource as Record<string, unknown>)
      : {};

  // 変更理由: zip一発で復元できるUXを優先し、既存設定は差分ではなく上書きで同期する。
  await Promise.all(
    Object.entries(normalizedSettings).map(async ([key, value]) => {
      await container.config.set(key, value);
    }),
  );

  // 設定内のブックマーク保存先を復元した場合、Chrome側の再スキャン完了を待ってから項目を追加する。
  const bookmarkRootNodeId = normalizedSettings.bookmark_id;
  if (bookmarkRootNodeId) {
    await getLegacyBookmarkEntryList()?.setRootNodeId?.(bookmarkRootNodeId);
  }

  const historyPayload = await readJsonEntry<HistoryExportPayload | { items?: unknown[] }>(
    zip,
    HISTORY_JSON_PATH,
  );

  const historyItems = Array.isArray(historyPayload?.items)
    ? historyPayload.items
        .map((row) => toHistoryExportRecord(row))
        .filter((row): row is HistoryExportRecord => row != null)
    : [];

  if (historyPayload !== null) {
    // 変更理由: 空の履歴も含め、エクスポート時点の状態を再現するため既存履歴を置換する。
    await container.history.clear();
    for (const row of historyItems) {
      await container.history.add(row.url, row.title, row.date, row.boardTitle);
    }
  }

  const writeHistoryPayload = await readJsonEntry<
    WriteHistoryExportPayload | { items?: unknown[] }
  >(zip, WRITE_HISTORY_JSON_PATH);

  const writeHistoryItems = Array.isArray(writeHistoryPayload?.items)
    ? writeHistoryPayload.items
        .map((row) => toWriteHistoryExportRecord(row))
        .filter((row): row is WriteHistoryExportRecord => row != null)
    : [];

  if (writeHistoryPayload !== null) {
    // 変更理由: 空の履歴も含め、既存データへ単純追加せず完全置換する。
    await WriteHistory.clear();
    for (const row of writeHistoryItems) {
      await WriteHistory.add({
        url: row.url,
        res: row.res,
        title: row.title,
        name: row.name,
        mail: row.mail,
        inputName: row.input_name,
        inputMail: row.input_mail,
        message: row.message,
        date: row.date,
      });
    }
  }

  const bookmarksPayload = await readJsonEntry<BookmarkExportPayload | { items?: unknown[] }>(
    zip,
    BOOKMARKS_JSON_PATH,
  );
  const bookmarkItems = Array.isArray(bookmarksPayload?.items)
    ? bookmarksPayload.items
        .map((row) => toBookmarkExportRecord(row))
        .filter((row): row is BookmarkEntry => row != null)
    : [];

  let importedBookmarkCount = 0;
  if (bookmarksPayload !== null) {
    await waitForLegacyBookmarkReady();
    const bookmarkService = getLegacyBookmarkService();
    if (bookmarkService?.import) {
      for (const row of bookmarkItems) {
        if (await bookmarkService.import(row)) {
          importedBookmarkCount += 1;
        }
      }
    }
  }

  const logsPayload = await readJsonEntry<LogExportPayload | { items?: unknown[] }>(
    zip,
    LOGS_JSON_PATH,
  );
  const logItems = Array.isArray(logsPayload?.items)
    ? logsPayload.items
        .map((row) => toLogArchiveRecord(row))
        .filter((row): row is LogArchiveRecord => row != null)
    : [];

  if (logsPayload !== null) {
    await Cache.replaceLogArchiveRecords(logItems);
    container.message.send("log_updated", { type: "restored" });
  }

  const sessionPayload = await readJsonEntry<SessionExportPayload | { state?: unknown }>(
    zip,
    SESSION_JSON_PATH,
  );
  let importedSessionCount = 0;
  if (sessionPayload !== null && "state" in sessionPayload) {
    const sessionState = toSessionExportState(sessionPayload.state);
    if (sessionPayload.state === null || sessionState !== null) {
      // セッションは次回ページ再読み込み時に use-tab-store が復元する。
      await setBrowserSessionJson(JSON.stringify(sessionState));
      importedSessionCount = sessionState === null ? 0 : 1;
    }
  }

  return {
    importedSettingsCount: Object.keys(normalizedSettings).length,
    importedHistoryCount: historyItems.length,
    importedWriteHistoryCount: writeHistoryItems.length,
    importedBookmarkCount,
    importedLogCount: logItems.length,
    importedSessionCount,
  };
}

export function buildDataExportFilename(now = new Date()): string {
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  return `chlens-data-${timestamp}.zip`;
}
