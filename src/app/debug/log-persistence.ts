/**
 * debug-log の記録を IndexedDB へ残す。
 *
 * 変更理由: リングバッファはメモリだけなので、画面を閉じたり再起動したりすると原因調査の
 * 手がかりが消えていた。拡張機能もTauriも同じWebViewのIndexedDBを使えるため、
 * プラットフォームを分けずにここで保存する。別窓も同じ保存先へ書くので、
 * どの窓のログかは page で見分ける。
 */
import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import { type DebugLogEntry, type DebugLogQuery, subscribeDebugLog } from "src/app/debug/debug-log";

const DB_NAME = "chlens-debug-log";
const STORE_NAME = "entries";
const DB_VERSION = 1;

/** 保存する最大件数。超えた分は古いものから消す。 */
export const MAX_PERSISTED_ENTRIES = 5000;
// 1件追加するたびに削除すると書き込みが増えるため、余裕を持たせてまとめて削除する。
const TRIM_MARGIN = 500;
const FLUSH_INTERVAL_MS = 2000;
const FLUSH_BATCH_SIZE = 50;

export interface PersistedLogEntry extends DebugLogEntry {
  /** 保存時の連番。窓ごとに採番する seq とは別に、保存先全体で一意にする。 */
  id?: number;
  /** どの窓が出したログか（location.pathname）。 */
  page: string;
}

interface DebugLogDb extends DBSchema {
  entries: {
    key: number;
    value: PersistedLogEntry;
    indexes: { time: number };
  };
}

let dbPromise: Promise<IDBPDatabase<DebugLogDb>> | null = null;

function openLogDb(): Promise<IDBPDatabase<DebugLogDb>> {
  dbPromise ??= openDB<DebugLogDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      store.createIndex("time", "time");
    },
  }).catch((error: unknown) => {
    // 一度の失敗でキャッシュしたまま使えなくならないよう、次回は開き直せるようにする。
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

export async function appendPersistedLogs(entries: readonly PersistedLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const db = await openLogDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  // 窓をまたいで seq が衝突するため、id は保存先に採番させる。
  await Promise.all(entries.map(({ id: _id, ...rest }) => tx.store.add(rest as PersistedLogEntry)));
  const count = await tx.store.count();
  if (count > MAX_PERSISTED_ENTRIES + TRIM_MARGIN) {
    let excess = count - MAX_PERSISTED_ENTRIES;
    let cursor = await tx.store.openCursor();
    while (cursor && excess > 0) {
      await cursor.delete();
      excess -= 1;
      cursor = await cursor.continue();
    }
  }
  await tx.done;
}

export async function readPersistedLogs(query: DebugLogQuery = {}): Promise<PersistedLogEntry[]> {
  const { limit = 200, level, category, since } = query;
  const db = await openLogDb();
  const all = await db.getAllFromIndex(STORE_NAME, "time");
  const filtered = all.filter(
    (entry) =>
      (level == null || entry.level === level) &&
      (category == null || entry.category === category) &&
      (since == null || entry.time >= since),
  );
  return filtered.slice(-Math.max(1, limit));
}

export async function clearPersistedLogs(): Promise<void> {
  const db = await openLogDb();
  await db.clear(STORE_NAME);
}

let installed = false;

/**
 * 記録を一定件数・一定時間ごとにまとめて保存し始める。解除関数は残りを保存してから購読を外す。
 * 保存の失敗は記録の経路（console）を巻き込まないよう、最初の1回だけ警告にして以後は捨てる。
 */
export function installLogPersistence(
  options: { page?: string; target?: Window } = {},
): () => void {
  if (installed) return () => undefined;
  installed = true;

  const target = options.target ?? window;
  const page = options.page ?? target.location?.pathname ?? "unknown";
  let buffer: PersistedLogEntry[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let reportedFailure = false;

  const flush = (): void => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    appendPersistedLogs(batch).catch((error: unknown) => {
      if (reportedFailure) return;
      reportedFailure = true;
      console.warn("[ChLens Debug] ログの保存に失敗しました。以後の失敗は報告しません:", error);
    });
  };

  const unsubscribe = subscribeDebugLog((entry) => {
    buffer.push({ ...entry, page });
    if (buffer.length >= FLUSH_BATCH_SIZE) {
      flush();
    } else {
      timer ??= setTimeout(flush, FLUSH_INTERVAL_MS);
    }
  });

  // 画面を閉じる直前の分が失われないよう、非表示になった時点で保存する。
  const onHidden = (): void => {
    if (target.document?.visibilityState === "hidden") flush();
  };
  target.addEventListener("pagehide", flush);
  target.document?.addEventListener("visibilitychange", onHidden);

  return () => {
    unsubscribe();
    target.removeEventListener("pagehide", flush);
    target.document?.removeEventListener("visibilitychange", onHidden);
    flush();
    installed = false;
  };
}
