// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
/*
 * decaffeinate suggestions:
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
import {indexedDBRequestToPromise} from "./util.coffee";
import {URL} from "./URL.ts";

/**
@class ReadState
@static
*/
const DB_VERSION = 2;

const _openDB = new Promise( function(resolve, reject) {
  const req = indexedDB.open("ReadState", DB_VERSION);
  req.onerror = function(e) {
    app.criticalError("既読情報管理システムの起動に失敗しました");
    reject(e);
  };
  req.onupgradeneeded = function({ target: {result: db, transaction: tx}, oldVersion: oldVer }) {
    if (oldVer < 1) {
      const objStore = db.createObjectStore("ReadState", {keyPath: "url"});
      objStore.createIndex("board_url", "board_url", {unique: false});
      tx.oncomplete = function() {
        resolve(db);
      };
    }
    if (oldVer === 1) {
      _recoveryOfDate(db, tx);
      tx.oncomplete = function() {
        resolve(db);
      };
    }
  };
  req.onsuccess = function({ target: {result: db} }) {
    resolve(db);
  };
});

const _urlFilter = function(originalUrlStr) {
  const original = new URL(originalUrlStr);
  const replaced = new URL(originalUrlStr);
  if (original.hostname.endsWith(".5ch.net")) {
    replaced.hostname = "*.5ch.net";
  }

  return { original, replaced };
};

export var set = async function(readState) {
  if (
    (readState == null) ||
    (typeof readState !== "object")
  ) {
    app.log("error", "app.ReadState.set: 引数が不正です", arguments);
    throw new Error("既読情報に登録しようとしたデータが不正です");
  }
  if (
    app.assertArg("app.ReadState.set", [
      [readState.url, "string"],
      [readState.last, "number"],
      [readState.read, "number"],
      [readState.received, "number"],
      [readState.offset, "number", true],
      [readState.date, "number", true]
    ])
  ) {
    throw new Error("既読情報に登録しようとしたデータが不正です");
  }

  readState = app.deepCopy(readState);

  const url = _urlFilter(readState.url);
  readState.url = url.replaced.href;
  const boardUrl = url.original.toBoard();
  readState.board_url = _urlFilter(boardUrl.href).replaced.href;

  try {
    const db = await _openDB;
    const req = db
      .transaction("ReadState", "readwrite")
      .objectStore("ReadState")
      .put(readState);
    await indexedDBRequestToPromise(req);
    delete readState.board_url;
    readState.url = url.original.href;
    app.message.send("read_state_updated", {board_url: boardUrl.href, read_state: readState});
  } catch (e) {
    app.log("error", "app.ReadState.set: トランザクション失敗");
    throw new Error(e);
  }
};

export var get = async function(url) {
  let data;
  if (app.assertArg("app.read_state.get", [[url, "string"]])) {
    throw new Error("既読情報を取得しようとしたデータが不正です");
  }

  url = _urlFilter(url);

  try {
    const db = await _openDB;
    const req = db
      .transaction("ReadState")
      .objectStore("ReadState")
      .get(url.replaced.href);
    const { target: {result} } = await indexedDBRequestToPromise(req);
    data = app.deepCopy(result);
    if (data != null) { data.url = url.original.href; }
  } catch (e) {
    app.log("error", "app.ReadState.get: トランザクション中断");
    throw new Error(e);
  }
  return data;
};

export var getAll = async function() {
  let res;
  try {
    const db = await _openDB;
    const req = db
      .transaction("ReadState")
      .objectStore("ReadState")
      .getAll();
    res = await indexedDBRequestToPromise(req);
  } catch (e) {
    app.log("error", "app.ReadState.getAll: トランザクション中断");
    throw new Error(e);
  }
  return res.target.result;
};

export var getByBoard = async function(url) {
  let data;
  if (app.assertArg("app.ReadState.getByBoard", [[url, "string"]])) {
    throw new Error("既読情報を取得しようとしたデータが不正です");
  }

  url = _urlFilter(url);

  try {
    const db = await _openDB;
    const req = db
      .transaction("ReadState")
      .objectStore("ReadState")
      .index("board_url")
      .getAll(IDBKeyRange.only(url.replaced.href));
    ({ target: {result: data} } = await indexedDBRequestToPromise(req));
    for (let key in data) {
      const val = data[key];
      data[key].url = val.url.replace(url.replaced.origin, url.original.origin);
    }
  } catch (e) {
    app.log("error", "app.ReadState.getByBoard: トランザクション中断");
    throw new Error(e);
  }
  return data;
};

export var remove = async function(url) {
  if (app.assertArg("app.ReadState.remove", [[url, "string"]])) {
    throw new Error("既読情報を削除しようとしたデータが不正です");
  }

  url = _urlFilter(url);

  try {
    const db = await _openDB;
    const req = db
      .transaction("ReadState", "readwrite")
      .objectStore("ReadState")
      .delete(url.replaced.href);
    await indexedDBRequestToPromise(req);
    app.message.send("read_state_removed", {url: url.original.href});
  } catch (e) {
    app.log("error", "app.ReadState.remove: トランザクション中断");
    throw new Error(e);
  }
};

export var clear = async function() {
  try {
    const db = await _openDB;
    const req = db
      .transaction("ReadState", "readwrite")
      .objectStore("ReadState")
      .clear();
    await indexedDBRequestToPromise(req);
  } catch (e) {
    app.log("error", "app.ReadState.clear: トランザクション中断");
    throw new Error(e);
  }
};

var _recoveryOfDate = (db, tx) => new Promise( function(resolve, reject) {
  const req = tx
    .objectStore("ReadState")
    .openCursor();
  req.onsuccess = function({ target: {result: cursor} }) {
    if (cursor) {
      cursor.value.date = null;
      cursor.update(cursor.value);
      cursor.continue();
    } else {
      resolve();
    }
  };
  req.onerror = function(e) {
    app.log("error", "app.ReadState._recoveryOfDate: トランザクション中断");
    reject(e);
  };
});
