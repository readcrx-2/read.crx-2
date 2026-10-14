import { ChURL, normalizeReadStateUrl } from "packages/chlib/src/index";
import { assertArg, criticalError, log } from "src/app/Log";
import message from "src/app/Message";
import { deepCopy } from "src/app/Util";
import type { IReadState } from "src/core/ports/read-state";
import { indexedDBRequestToPromise } from "src/core/storage/idb-request";
import { getTauriRepositories, isTauriRuntime } from "src/core/storage/TauriDrizzleBridge";

const DB_VERSION = 2;

interface ReadStateRecord extends IReadState {
  board_url?: string;
}

interface UrlFilterResult {
  original: ChURL;
  replaced: ChURL;
}

const _openDB: Promise<IDBDatabase> = new Promise((resolve, reject) => {
  const req = indexedDB.open("ReadState", DB_VERSION);
  req.onerror = (e) => {
    void criticalError("既読情報管理システムの起動に失敗しました");
    reject(e);
  };
  req.onupgradeneeded = (event) => {
    const target = event.target as IDBOpenDBRequest;
    const db = target.result;
    const tx = target.transaction;
    const oldVer = event.oldVersion;

    if (oldVer < 1) {
      const objStore = db.createObjectStore("ReadState", { keyPath: "url" });
      objStore.createIndex("board_url", "board_url", { unique: false });
      tx!.oncomplete = () => {
        resolve(db);
      };
    }
    if (oldVer === 1) {
      void _recoveryOfDate(db, tx as IDBTransaction);
      tx!.oncomplete = () => {
        resolve(db);
      };
    }
  };
  req.onsuccess = (event) => {
    const target = event.target as IDBOpenDBRequest;
    resolve(target.result);
  };
});

const _urlFilter = (originalUrlStr: string): UrlFilterResult => {
  const original = new ChURL(originalUrlStr);
  // 変更理由: 旧保存契約ではフラグメントをキーに含めないため、ChURLの入力値から明示的に除く。
  original.hash = "";
  // 変更理由: 5ch横断既読キーのホスト変換はURL仕様なので、保存層へ重複実装しない。
  const replaced = new ChURL(normalizeReadStateUrl(original.href));

  return { original, replaced };
};

export const set = async (readState: ReadStateRecord): Promise<void> => {
  if (readState == null || typeof readState !== "object") {
    log("error", "app.ReadState.set: 引数が不正です", readState);
    throw new Error("既読情報に登録しようとしたデータが不正です");
  }

  if (
    assertArg("app.ReadState.set", [
      [readState.url, "string"],
      [readState.last, "number"],
      [readState.read, "number"],
      [readState.received, "number"],
      [readState.offset, "number", true],
      [readState.date, "number", true],
    ])
  ) {
    throw new Error("既読情報に登録しようとしたデータが不正です");
  }

  const nextReadState = deepCopy(readState) as ReadStateRecord;

  if (isTauriRuntime()) {
    try {
      // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
      const { tauriReadStateRepository } = await getTauriRepositories();
      const result = await tauriReadStateRepository.set(nextReadState);
      nextReadState.url = result.normalizedUrl;
      message.send("read_state_updated", {
        board_url: result.boardUrl,
        read_state: nextReadState,
      });
      return;
    } catch (e) {
      log("error", "app.ReadState.set: トランザクション失敗");
      throw new Error(String(e), { cause: e });
    }
  }

  const url = _urlFilter(nextReadState.url);
  nextReadState.url = url.replaced.href;
  const boardUrl = url.original.toBoard();
  nextReadState.board_url = _urlFilter(boardUrl.href).replaced.href;

  try {
    const db = await _openDB;
    const req = db
      .transaction("ReadState", "readwrite")
      .objectStore("ReadState")
      .put(nextReadState);
    await indexedDBRequestToPromise(req);

    delete nextReadState.board_url;
    nextReadState.url = url.original.href;
    message.send("read_state_updated", {
      board_url: boardUrl.href,
      read_state: nextReadState,
    });
  } catch (e) {
    log("error", "app.ReadState.set: トランザクション失敗");
    throw new Error(String(e), { cause: e });
  }
};

export const get = async (url: string): Promise<ReadStateRecord | null> => {
  if (assertArg("app.read_state.get", [[url, "string"]])) {
    throw new Error("既読情報を取得しようとしたデータが不正です");
  }

  const filteredUrl = _urlFilter(url);

  if (isTauriRuntime()) {
    try {
      // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
      const { tauriReadStateRepository } = await getTauriRepositories();
      const data = await tauriReadStateRepository.get(filteredUrl.original.href);
      return data as ReadStateRecord | null;
    } catch (e) {
      log("error", "app.ReadState.get: トランザクション中断");
      throw new Error(String(e), { cause: e });
    }
  }

  try {
    const db = await _openDB;
    const req = db.transaction("ReadState").objectStore("ReadState").get(filteredUrl.replaced.href);
    const {
      target: { result },
    } = await indexedDBRequestToPromise<ReadStateRecord | null>(req);

    const data = deepCopy(result);
    if (data != null) {
      data.url = filteredUrl.original.href;
    }
    return data;
  } catch (e) {
    log("error", "app.ReadState.get: トランザクション中断");
    throw new Error(String(e), { cause: e });
  }
};

export const getAll = async (): Promise<ReadStateRecord[]> => {
  if (isTauriRuntime()) {
    try {
      // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
      const { tauriReadStateRepository } = await getTauriRepositories();
      return (await tauriReadStateRepository.getAll()) as ReadStateRecord[];
    } catch (e) {
      log("error", "app.ReadState.getAll: トランザクション中断");
      throw new Error(String(e), { cause: e });
    }
  }

  try {
    const db = await _openDB;
    const req = db.transaction("ReadState").objectStore("ReadState").getAll();
    const event = await indexedDBRequestToPromise<ReadStateRecord[]>(req);
    return event.target.result;
  } catch (e) {
    log("error", "app.ReadState.getAll: トランザクション中断");
    throw new Error(String(e), { cause: e });
  }
};

export const getByBoard = async (url: string): Promise<ReadStateRecord[]> => {
  if (assertArg("app.ReadState.getByBoard", [[url, "string"]])) {
    throw new Error("既読情報を取得しようとしたデータが不正です");
  }

  const filteredUrl = _urlFilter(url);

  if (isTauriRuntime()) {
    try {
      // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
      const { tauriReadStateRepository } = await getTauriRepositories();
      return (await tauriReadStateRepository.getByBoard(
        filteredUrl.original.href,
      )) as ReadStateRecord[];
    } catch (e) {
      log("error", "app.ReadState.getByBoard: トランザクション中断");
      throw new Error(String(e), { cause: e });
    }
  }

  try {
    const db = await _openDB;
    const req = db
      .transaction("ReadState")
      .objectStore("ReadState")
      .index("board_url")
      .getAll(IDBKeyRange.only(filteredUrl.replaced.href));

    const {
      target: { result: data },
    } = await indexedDBRequestToPromise<ReadStateRecord[]>(req);

    for (const readState of data) {
      readState.url = readState.url.replace(
        filteredUrl.replaced.origin,
        filteredUrl.original.origin,
      );
    }

    return data;
  } catch (e) {
    log("error", "app.ReadState.getByBoard: トランザクション中断");
    throw new Error(String(e), { cause: e });
  }
};

export const remove = async (url: string): Promise<void> => {
  if (assertArg("app.ReadState.remove", [[url, "string"]])) {
    throw new Error("既読情報を削除しようとしたデータが不正です");
  }

  const filteredUrl = _urlFilter(url);

  if (isTauriRuntime()) {
    try {
      // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
      const { tauriReadStateRepository } = await getTauriRepositories();
      const normalizedUrl = await tauriReadStateRepository.remove(filteredUrl.original.href);
      message.send("read_state_removed", {
        url: normalizedUrl,
      });
      return;
    } catch (e) {
      log("error", "app.ReadState.remove: トランザクション中断");
      throw new Error(String(e), { cause: e });
    }
  }

  try {
    const db = await _openDB;
    const req = db
      .transaction("ReadState", "readwrite")
      .objectStore("ReadState")
      .delete(filteredUrl.replaced.href);
    await indexedDBRequestToPromise(req);
    message.send("read_state_removed", {
      url: filteredUrl.original.href,
    });
  } catch (e) {
    log("error", "app.ReadState.remove: トランザクション中断");
    throw new Error(String(e), { cause: e });
  }
};

export const clear = async (): Promise<void> => {
  if (isTauriRuntime()) {
    try {
      // 変更理由: Tauri版はIndexedDBではなくSQLite(Drizzle)を正とする。
      const { tauriReadStateRepository } = await getTauriRepositories();
      await tauriReadStateRepository.clear();
      return;
    } catch (e) {
      log("error", "app.ReadState.clear: トランザクション中断");
      throw new Error(String(e), { cause: e });
    }
  }

  try {
    const db = await _openDB;
    const req = db.transaction("ReadState", "readwrite").objectStore("ReadState").clear();
    await indexedDBRequestToPromise(req);
  } catch (e) {
    log("error", "app.ReadState.clear: トランザクション中断");
    throw new Error(String(e), { cause: e });
  }
};

const _recoveryOfDate = (_db: IDBDatabase, tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    const req = tx.objectStore("ReadState").openCursor();
    req.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        const value = cursor.value as ReadStateRecord;
        value.date = undefined;
        cursor.update(value);
        cursor.continue();
      } else {
        resolve();
      }
    };
    req.onerror = (e) => {
      log("error", "app.ReadState._recoveryOfDate: トランザクション中断");
      reject(e);
    };
  });
