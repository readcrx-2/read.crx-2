import { createLogger } from "src/app/logger";
import {
  KeyValueStore,
  ObjectStore,
  ObjectStoreIndex,
  StorageManager,
} from "src/app/platform/types";
import {
  getStore2All,
  getStore2String,
  removeStore2Value,
  setStore2String,
} from "src/app/Store2Storage";

const logger = createLogger("platform");

function parseStorageEventValue(rawValue: string | null): string | null {
  if (rawValue == null) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (typeof parsed === "string") {
      return parsed;
    }
    if (typeof parsed === "number" || typeof parsed === "boolean") {
      return String(parsed);
    }
  } catch {
    // localStorageへ生文字列が入っている場合はそのまま扱う。
  }

  return rawValue;
}

// localStorageはTauri webview内でサンドボックスされており、
// 拡張機能のbrowser.storage.localと同様に永続化される
const TauriKeyValueStore: KeyValueStore = {
  async get(key: string): Promise<string | null> {
    return getStore2String(key);
  },

  async set(key: string, value: string): Promise<void> {
    void setStore2String(key, value);
  },

  async remove(key: string): Promise<void> {
    void removeStore2Value(key);
  },

  async getAll(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    const allValues = getStore2All();
    for (const [key, value] of Object.entries(allValues)) {
      if (typeof value === "string") {
        result[key] = value;
        continue;
      }
      if (typeof value === "number" || typeof value === "boolean") {
        result[key] = String(value);
      }
    }
    return result;
  },

  onChanged(
    callback: (
      changes: Record<string, { oldValue: string | null; newValue: string | null }>,
    ) => void,
  ): void {
    window.addEventListener("storage", (event) => {
      if (event.key !== null) {
        callback({
          [event.key]: {
            oldValue: parseStorageEventValue(event.oldValue),
            newValue: parseStorageEventValue(event.newValue),
          },
        });
      }
    });
  },
};

// IndexedDBはTauri webviewでも利用可能
class TauriObjectStore implements ObjectStore {
  private static dbCache = new Map<string, IDBDatabase>();

  constructor(private dbName: string) {}

  private async getDB(): Promise<IDBDatabase> {
    // 既存の接続をキャッシュから取得
    if (TauriObjectStore.dbCache.has(this.dbName)) {
      const cachedDb = TauriObjectStore.dbCache.get(this.dbName)!;
      // キャッシュされたDBが有効か確認
      if (!cachedDb.objectStoreNames.contains(this.dbName)) {
        // オブジェクトストアが存在しない場合はキャッシュをクリア
        TauriObjectStore.dbCache.delete(this.dbName);
      } else {
        return cachedDb;
      }
    }

    // 新しい接続を作成
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 2);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const tx = (event.target as IDBOpenDBRequest).transaction;
        if (!tx) {
          reject(new Error("Transaction not available"));
          return;
        }

        // オブジェクトストアが存在しない場合は作成
        if (!db.objectStoreNames.contains(this.dbName)) {
          logger.debug(`Creating object store: ${this.dbName}`);
          const objStore = db.createObjectStore(this.dbName, {
            keyPath: "url",
          });
          objStore.createIndex("last_updated", "last_updated", {
            unique: false,
          });
          objStore.createIndex("last_modified", "last_modified", {
            unique: false,
          });
        }
      };
    });

    TauriObjectStore.dbCache.set(this.dbName, db);
    return db;
  }

  async get(key: string): Promise<unknown> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(this.dbName).objectStore(this.dbName).get(key);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  }

  async put(value: unknown): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(this.dbName, "readwrite").objectStore(this.dbName).put(value);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }

  async delete(key: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(this.dbName, "readwrite").objectStore(this.dbName).delete(key);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }

  async getAll(): Promise<unknown[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(this.dbName).objectStore(this.dbName).getAll();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  }

  async clear(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(this.dbName, "readwrite").objectStore(this.dbName).clear();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }

  async count(): Promise<number> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(this.dbName).objectStore(this.dbName).count();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  }

  index(name: string): ObjectStoreIndex {
    const getStore = async () => {
      const db = await this.getDB();
      return db.transaction(this.dbName).objectStore(this.dbName);
    };

    return {
      getAll: async (query?: IDBKeyRange) => {
        const store = await getStore();
        return new Promise<unknown[]>((resolve, reject) => {
          const req = store.index(name).getAll(query as IDBKeyRange | undefined);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve(req.result);
        });
      },
      getAllKeys: async (query?: IDBKeyRange) => {
        const store = await getStore();
        return new Promise<unknown[]>((resolve, reject) => {
          const req = store.index(name).getAllKeys(query as IDBKeyRange | undefined);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve(req.result);
        });
      },
      getPage: async ({ query, direction = "next", offset = 0, limit, filter }) => {
        const store = await getStore();
        return new Promise<{ values: unknown[]; hasMore: boolean }>((resolve, reject) => {
          const values: unknown[] = [];
          let matchedCount = 0;
          const req = store
            .index(name)
            .openCursor(query as IDBValidKey | IDBKeyRange | null | undefined, direction);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) {
              resolve({ values, hasMore: false });
              return;
            }
            const value = cursor.value as Record<string, unknown>;
            if (!filter || value[filter.key] === filter.value) {
              if (matchedCount >= offset) {
                if (values.length >= limit) {
                  resolve({ values, hasMore: true });
                  return;
                }
                values.push(value);
              }
              matchedCount += 1;
            }
            cursor.continue();
          };
        });
      },
    };
  }
}

export const TauriStorageManager: StorageManager = {
  kv: TauriKeyValueStore,
  getStore(name: string): ObjectStore {
    return new TauriObjectStore(name);
  },
};
