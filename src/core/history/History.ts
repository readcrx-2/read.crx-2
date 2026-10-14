import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import { assertArg, log } from "src/app/Log";
import message from "src/app/Message";
import { isHttps } from "src/core/network/url-protocol";
import { getTauriRepositories, isTauriRuntime } from "src/core/storage/TauriDrizzleBridge";

const DB_NAME = "History";
const STORE_NAME = "History";
const DB_VERSION = 2;

interface HistoryRecord {
  id?: number;
  url: string;
  title: string;
  date: number;
  boardTitle: string;
}

interface PersistedHistoryRecord extends Omit<HistoryRecord, "id"> {
  id: number;
}

interface HistoryRecordWithHttps extends PersistedHistoryRecord {
  isHttps: boolean;
}

interface HistoryDBSchema extends DBSchema {
  [STORE_NAME]: {
    key: number;
    value: HistoryRecord;
    indexes: {
      url: string;
      title: string;
      date: number;
    };
  };
}

interface HistoryUpdatedPayload {
  type: "added" | "removed" | "cleared" | "range_cleared";
  url?: string;
  date?: number | null;
  offset?: number;
  day?: number;
}

const ensurePersistedRecord = (record: HistoryRecord): PersistedHistoryRecord => {
  if (record.id == null) {
    throw new Error("履歴レコードのIDが不正です");
  }
  return {
    id: record.id,
    url: record.url,
    title: record.title,
    date: record.date,
    boardTitle: record.boardTitle,
  };
};

const notifyHistoryUpdated = (payload: HistoryUpdatedPayload): void => {
  // 変更理由: 閲覧履歴ページは hidden のまま保持されるため、
  // 永続化完了のたびに一覧へ再読込を促して stale 表示を避ける。
  message.send("history_updated", payload);
};

let dbPromise: Promise<IDBPDatabase<HistoryDBSchema>> | null = null;

const getDB = (): Promise<IDBPDatabase<HistoryDBSchema>> => {
  if (dbPromise != null) {
    return dbPromise;
  }

  dbPromise = openDB<HistoryDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        const objStore = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
        objStore.createIndex("url", "url", { unique: false });
        objStore.createIndex("title", "title", { unique: false });
        objStore.createIndex("date", "date", { unique: false });
      }

      if (oldVersion === 1) {
        // 変更理由: 旧DBのboardTitle欠損を migration で必ず埋め、取得側のnullチェック分岐を増やさない。
        void (async () => {
          const store = tx.objectStore(STORE_NAME);
          let cursor = await store.openCursor();
          while (cursor) {
            const value = cursor.value;
            if (value.boardTitle == null) {
              value.boardTitle = "";
              await cursor.update(value);
            }
            cursor = await cursor.continue();
          }
        })();
      }
    },
  });

  return dbPromise;
};

const loadByDateDesc = async (
  offset: number,
  limit: number,
  dedupeByUrl: boolean,
): Promise<HistoryRecordWithHttps[]> => {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME);
  const index = tx.store.index("date");
  let cursor = await index.openCursor(null, "prev");

  const inserted = dedupeByUrl ? new Set<string>() : null;
  const rows: HistoryRecordWithHttps[] = [];
  let skipped = 0;

  while (cursor && (limit === -1 || rows.length < limit)) {
    if (offset !== -1 && skipped < offset) {
      skipped += 1;
      cursor = await cursor.continue();
      continue;
    }

    const persisted = ensurePersistedRecord(cursor.value);
    if (inserted == null || !inserted.has(persisted.url)) {
      if (inserted != null) {
        inserted.add(persisted.url);
      }
      rows.push({
        ...persisted,
        isHttps: isHttps(persisted.url),
      });
    }

    cursor = await cursor.continue();
  }

  await tx.done;
  return rows;
};

const clearByOffset = async (offset: number): Promise<void> => {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  let cursor = await tx.store.openCursor();
  let skipped = 0;

  while (cursor) {
    if (offset !== -1 && skipped < offset) {
      skipped += 1;
      cursor = await cursor.continue();
      continue;
    }
    await cursor.delete();
    cursor = await cursor.continue();
  }

  await tx.done;
};

const removeByUrlAndOptionalDate = async (url: string, date: number | null): Promise<void> => {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const urlIndex = tx.store.index("url");

  if (date != null) {
    const rows = await urlIndex.getAll(url);
    for (const row of rows) {
      const persisted = ensurePersistedRecord(row);
      if (persisted.date === date) {
        await tx.store.delete(persisted.id);
      }
    }
    await tx.done;
    return;
  }

  const keys = await urlIndex.getAllKeys(url);
  for (const key of keys) {
    await tx.store.delete(key);
  }
  await tx.done;
};

const clearByDateBefore = async (dayUnix: number): Promise<void> => {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const keys = await tx.store.index("date").getAllKeys(IDBKeyRange.upperBound(dayUnix, true));

  for (const key of keys) {
    await tx.store.delete(key);
  }

  await tx.done;
};

const parseErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const reportError = (context: string, error: unknown): never => {
  log("error", `${context}: ${parseErrorMessage(error)}`, error);
  throw new Error(parseErrorMessage(error));
};

const rejectInvalidArgs = (message: string): Promise<never> => {
  return Promise.reject(new Error(message));
};

const toPersistedRows = (rows: HistoryRecord[]): PersistedHistoryRecord[] => {
  return rows.map((row) => ensurePersistedRecord(row));
};

const countRows = async (): Promise<number> => {
  const db = await getDB();
  return await db.count(STORE_NAME);
};

const addRow = async (row: Omit<HistoryRecord, "id">): Promise<void> => {
  const db = await getDB();
  await db.add(STORE_NAME, row);
};

const getAllRows = async (): Promise<PersistedHistoryRecord[]> => {
  const db = await getDB();
  const rows = await db.getAll(STORE_NAME);
  return toPersistedRows(rows);
};

const getByUrlRows = async (url: string): Promise<PersistedHistoryRecord[]> => {
  const db = await getDB();
  const rows = await db.getAllFromIndex(STORE_NAME, "url", url);
  return toPersistedRows(rows).sort((a, b) => b.date - a.date);
};

const clearAllRows = async (): Promise<void> => {
  const db = await getDB();
  await db.clear(STORE_NAME);
};

const toRowsWithHttps = (rows: PersistedHistoryRecord[]): HistoryRecordWithHttps[] => {
  return rows.map((value) => ({
    ...value,
    isHttps: isHttps(value.url),
  }));
};

const isInvalidPagingArg = (offset: number, limit: number): boolean => {
  return assertArg("History.get", [
    [offset, "number"],
    [limit, "number"],
  ]);
};

const isInvalidPagingArgForUnique = (offset: number, limit: number): boolean => {
  return assertArg("History.getUnique", [
    [offset, "number"],
    [limit, "number"],
  ]);
};

const normalizePaging = (offset?: number, limit?: number): { offset: number; limit: number } => {
  return {
    offset: offset == null ? -1 : offset,
    limit: limit == null ? -1 : limit,
  };
};

const normalizeOffset = (offset?: number): number => {
  return offset == null ? -1 : offset;
};

const dayToUnixThreshold = (day: number): number => {
  return Date.now() - day * 24 * 60 * 60 * 1000;
};

const isInvalidRemoveArgs = (url: string, date: number | null): boolean => {
  return assertArg("History.remove", [
    [url, "string"],
    [date, "number", true],
  ]);
};

const isInvalidAddArgs = (
  url: string,
  title: string,
  date: number,
  boardTitle: string,
): boolean => {
  return assertArg("History.add", [
    [url, "string"],
    [title, "string"],
    [date, "number"],
    [boardTitle, "string"],
  ]);
};

const isInvalidClearArg = (offset: number): boolean => {
  return assertArg("History.clear", [[offset, "number"]]);
};

const isInvalidClearRangeArg = (day: number): boolean => {
  return assertArg("History.clearRange", [[day, "number"]]);
};

const invalidArgError = (message: string): Error => {
  return new Error(message);
};

const safeGetTauriHistoryRepository = async () => {
  const { tauriHistoryRepository } = await getTauriRepositories();
  return tauriHistoryRepository;
};

const mapTauriRowsWithHttps = async (
  offset: number,
  limit: number,
): Promise<HistoryRecordWithHttps[]> => {
  const tauriHistoryRepository = await safeGetTauriHistoryRepository();
  const histories = await tauriHistoryRepository.get(offset, limit);
  return toRowsWithHttps(histories as PersistedHistoryRecord[]);
};

const mapTauriUniqueRowsWithHttps = async (
  offset: number,
  limit: number,
): Promise<HistoryRecordWithHttps[]> => {
  const tauriHistoryRepository = await safeGetTauriHistoryRepository();
  const histories = await tauriHistoryRepository.getUnique(offset, limit);
  return toRowsWithHttps(histories as PersistedHistoryRecord[]);
};

const addTauriRow = async (
  url: string,
  title: string,
  date: number,
  boardTitle: string,
): Promise<void> => {
  const tauriHistoryRepository = await safeGetTauriHistoryRepository();
  await tauriHistoryRepository.add(url, title, date, boardTitle);
};

const removeTauriRow = async (url: string, date: number | null): Promise<void> => {
  const tauriHistoryRepository = await safeGetTauriHistoryRepository();
  await tauriHistoryRepository.remove(url, date);
};

const getAllTauriRows = async (): Promise<PersistedHistoryRecord[]> => {
  const tauriHistoryRepository = await safeGetTauriHistoryRepository();
  const rows = await tauriHistoryRepository.getAll();
  return rows as PersistedHistoryRecord[];
};

const getByUrlTauriRows = async (url: string): Promise<PersistedHistoryRecord[]> => {
  const tauriHistoryRepository = await safeGetTauriHistoryRepository();
  return (await tauriHistoryRepository.getByUrl(url)) as PersistedHistoryRecord[];
};

const countTauriRows = async (): Promise<number> => {
  const tauriHistoryRepository = await safeGetTauriHistoryRepository();
  return await tauriHistoryRepository.count();
};

const clearTauriRows = async (offset: number): Promise<void> => {
  const tauriHistoryRepository = await safeGetTauriHistoryRepository();
  await tauriHistoryRepository.clear(offset);
};

const clearTauriRowsByDateBefore = async (dayUnix: number): Promise<void> => {
  const tauriHistoryRepository = await safeGetTauriHistoryRepository();
  await tauriHistoryRepository.clearRange(dayUnix);
};

/**
@method add
@param {String} url
@param {String} title
@param {Number} date
@param {String} boardTitle
@return {Promise}
*/
export const add = async function (
  url: string,
  title: string,
  date: number,
  boardTitle: string,
): Promise<void> {
  if (isInvalidAddArgs(url, title, date, boardTitle)) {
    throw new Error("履歴に追加しようとしたデータが不正です");
  }

  try {
    // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
    if (isTauriRuntime()) {
      await addTauriRow(url, title, date, boardTitle);
      notifyHistoryUpdated({ type: "added", url, date });
      return;
    }

    await addRow({ url, title, date, boardTitle });
    notifyHistoryUpdated({ type: "added", url, date });
  } catch (e) {
    reportError("History.add: データの格納に失敗しました", e);
  }
};

/**
@method remove
@param {String} url
@param {Number} date
@return {Promise}
*/
export const remove = async function (
  url: string,
  date: number | null = null,
): Promise<void | Error> {
  if (isInvalidRemoveArgs(url, date)) {
    return invalidArgError("履歴から削除しようとしたデータが不正です");
  }

  try {
    // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
    if (isTauriRuntime()) {
      await removeTauriRow(url, date);
      notifyHistoryUpdated({ type: "removed", url, date });
      return;
    }

    await removeByUrlAndOptionalDate(url, date);
    notifyHistoryUpdated({ type: "removed", url, date });
  } catch (e) {
    reportError("History.remove: トランザクション中断", e);
  }
};

/**
@method get
@param {Number} offset
@param {Number} limit
@return {Promise}
*/
export const get = function (offset?: number, limit?: number): Promise<HistoryRecordWithHttps[]> {
  const normalized = normalizePaging(offset, limit);

  if (isInvalidPagingArg(normalized.offset, normalized.limit)) {
    return rejectInvalidArgs("History.get: 引数が不正です");
  }

  if (isTauriRuntime()) {
    // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
    return mapTauriRowsWithHttps(normalized.offset, normalized.limit);
  }

  return loadByDateDesc(normalized.offset, normalized.limit, false);
};

/**
@method getUnique
@param {Number} [offset]
@param {Number} [limit]
@return {Promise}
*/
export const getUnique = function (
  offset?: number,
  limit?: number,
): Promise<HistoryRecordWithHttps[]> {
  const normalized = normalizePaging(offset, limit);

  if (isInvalidPagingArgForUnique(normalized.offset, normalized.limit)) {
    return rejectInvalidArgs("History.getUnique: 引数が不正です");
  }

  if (isTauriRuntime()) {
    // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
    return mapTauriUniqueRowsWithHttps(normalized.offset, normalized.limit);
  }

  return loadByDateDesc(normalized.offset, normalized.limit, true);
};

/**
@method getAll
@return {Promise}
*/
export const getAll = async function (): Promise<HistoryRecord[]> {
  try {
    if (isTauriRuntime()) {
      // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
      return await getAllTauriRows();
    }

    return await getAllRows();
  } catch (e) {
    return reportError("History.getAll: トランザクション中断", e);
  }
};

/**
@method getByUrl
@param {String} url
@return {Promise}
*/
export const getByUrl = async function (url: string): Promise<HistoryRecordWithHttps[]> {
  if (assertArg("History.getByUrl", [[url, "string"]])) {
    return rejectInvalidArgs("History.getByUrl: 引数が不正です");
  }

  try {
    // 変更理由: URLだけで開かれたスレの仮タイトルで、既知の履歴タイトルを失わないようにする。
    const rows = isTauriRuntime() ? await getByUrlTauriRows(url) : await getByUrlRows(url);
    return toRowsWithHttps(rows);
  } catch (e) {
    return reportError("History.getByUrl: トランザクション中断", e);
  }
};

/**
@method count
@return {Promise}
*/
export const count = async function (): Promise<number> {
  try {
    if (isTauriRuntime()) {
      // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
      return await countTauriRows();
    }

    return await countRows();
  } catch (e) {
    return reportError("History.count: トランザクション中断", e);
  }
};

/**
@method clear
@param {Number} offset
@return {Promise}
*/
export const clear = function (offset?: number): Promise<void> {
  const normalizedOffset = normalizeOffset(offset);
  if (isInvalidClearArg(normalizedOffset)) {
    return rejectInvalidArgs("History.clear: 引数が不正です");
  }

  return (async () => {
    try {
      if (isTauriRuntime()) {
        // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
        await clearTauriRows(normalizedOffset);
      } else if (normalizedOffset === -1) {
        await clearAllRows();
      } else {
        await clearByOffset(normalizedOffset);
      }

      notifyHistoryUpdated({ type: "cleared", offset: normalizedOffset });
    } catch (e) {
      reportError("History.clear: トランザクション中断", e);
    }
  })();
};

/**
@method clearRange
@param {Number} day
@return {Promise}
*/
export const clearRange = async function (day: number): Promise<void> {
  if (isInvalidClearRangeArg(day)) {
    return rejectInvalidArgs("History.clearRange: 引数が不正です");
  }

  const dayUnix = dayToUnixThreshold(day);
  try {
    if (isTauriRuntime()) {
      // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
      await clearTauriRowsByDateBefore(dayUnix);
      notifyHistoryUpdated({ type: "range_cleared", day });
      return;
    }

    await clearByDateBefore(dayUnix);
    notifyHistoryUpdated({ type: "range_cleared", day });
  } catch (e) {
    reportError("History.clearRange: トランザクション中断", e);
  }
};
