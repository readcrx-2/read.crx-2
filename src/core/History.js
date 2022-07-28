/*
 * decaffeinate suggestions:
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
import {indexedDBRequestToPromise} from "./util.coffee";
import {isHttps} from "./URL.ts";

/**
@class History
@static
*/
const DB_VERSION = 2;

const openDB = () => new Promise( (resolve, reject) => {
  const req = indexedDB.open("History", DB_VERSION);
  req.onerror = reject;
  req.onupgradeneeded = ({ target: {result: db, transaction: tx}, oldVersion: oldVer }) => {
    if (oldVer < 1) {
      const objStore = db.createObjectStore("History", {keyPath: "id", autoIncrement: true});
      objStore.createIndex("url", "url", {unique: false});
      objStore.createIndex("title", "title", {unique: false});
      objStore.createIndex("date", "date", {unique: false});
      tx.oncomplete = function() {
        resolve(db);
      };
    }
    if (oldVer === 1) {
      _recoveryOfBoardTitle(db, tx);
      tx.oncomplete = function() {
        resolve(db);
      };
    }
  };
  req.onsuccess = function({ target: {result: db} }) {
    resolve(db);
  };
});

/**
@method add
@param {String} url
@param {String} title
@param {Number} date
@param {String} boardTitle
@return {Promise}
*/
export var add = async function(url, title, date, boardTitle) {
  if (app.assertArg("History.add", [
    [url, "string"],
    [title, "string"],
    [date, "number"],
    [boardTitle, "string"]
  ])) {
    throw new Error("履歴に追加しようとしたデータが不正です");
  }

  try {
    const db = await openDB();
    const req = db
      .transaction("History", "readwrite")
      .objectStore("History")
      .add({url, title, date, boardTitle});
    await indexedDBRequestToPromise(req);
  } catch (e) {
    app.log("error", "History.add: データの格納に失敗しました");
    throw new Error(e);
  }
};

/**
@method remove
@param {String} url
@param {Number} date
@return {Promise}
*/
export var remove = async function(url, date = null) {
  if (app.assertArg("History.remove", [
    [url, "string"],
    [date, "number", true]
  ])) {
    return new Error("履歴から削除しようとしたデータが不正です");
  }

  try {
    let req;
    const db = await openDB();
    const store = db
      .transaction("History", "readwrite")
      .objectStore("History");
    if (date != null) {
      req = store
        .index("url")
        .getAll(IDBKeyRange.only(url));
    } else {
      req = store
        .index("url")
        .getAllKeys(IDBKeyRange.only(url));
    }
    const { target: { result: data } } = await indexedDBRequestToPromise(req);

    if (date != null) {
      await Promise.all(data.map( async function(datum) {
        if (datum.date !== date) { return; }
        req = store.delete(datum.id);
        await indexedDBRequestToPromise(req);
      }));
    } else {
      await Promise.all(data.map( async function(datum) {
        req = store.delete(datum);
        await indexedDBRequestToPromise(req);
      }));
    }
  } catch (e) {
    app.log("error", "History.remove: トランザクション中断");
    throw new Error(e);
  }
};

/**
@method get
@param {Number} offset
@param {Number} limit
@return {Promise}
*/
export var get = function(offset, limit) {
  if (offset == null) { offset = -1; }
  if (limit == null) { limit = -1; }
  if (app.assertArg("History.get", [
    [offset, "number"],
    [limit, "number"]
  ])) {
    return Promise.reject();
  }

  return openDB().then( db => new Promise( function(resolve, reject) {
    const req = db
      .transaction("History")
      .objectStore("History")
      .index("date")
      .openCursor(null, "prev");
    let advanced = false;
    const histories = [];
    req.onsuccess = function({ target: {result: cursor} }) {
      if (cursor && ((limit === -1) || (histories.length < limit))) {
        if (!advanced) {
          advanced = true;
          if (offset !== -1) {
            cursor.advance(offset);
            return;
          }
        }
        const {value} = cursor;
        value.isHttps = isHttps(value.url);
        histories.push(value);
        cursor.continue();
      } else {
        resolve(histories);
      }
    };
    req.onerror = function(e) {
      app.log("error", "History.get: トランザクション中断");
      reject(e);
    };
  }));
};

/**
@method getUnique
@param {Number} offset
@param {Number} limit
@return {Promise}
*/
export var getUnique = function(offset, limit) {
  if (offset == null) { offset = -1; }
  if (limit == null) { limit = -1; }
  if (app.assertArg("History.getUnique", [
    [offset, "number"],
    [limit, "number"]
  ])) {
    return Promise.reject();
  }

  return openDB().then( db => new Promise( function(resolve, reject) {
    const req = db
      .transaction("History")
      .objectStore("History")
      .index("date")
      .openCursor(null, "prev");
    let advanced = false;
    const histories = [];
    const inserted = new Set();
    req.onsuccess = function({ target: {result: cursor} }) {
      if (cursor && ((limit === -1) || (histories.length < limit))) {
        if (!advanced) {
          advanced = true;
          if (offset !== -1) {
            cursor.advance(offset);
            return;
          }
        }
        const {value} = cursor;
        if (!inserted.has(value.url)) {
          value.isHttps = isHttps(value.url);
          histories.push(value);
          inserted.add(value.url);
        }
        cursor.continue();
      } else {
        resolve(histories);
      }
    };
    req.onerror = function(e) {
      app.log("error", "History.getUnique: トランザクション中断");
      reject(e);
    };
  }));
};

/**
@method getAll
@return {Promise}
*/
export var getAll = async function() {
  let res;
  try {
    const db = await openDB();
    const req = db
      .transaction("History")
      .objectStore("History")
      .getAll();
    res = await indexedDBRequestToPromise(req);
  } catch (e) {
    app.log("error", "History.getAll: トランザクション中断");
    throw new Error(e);
  }
  return res.target.result;
};

/**
@method count
@return {Promise}
*/
export var count = async function() {
  let res;
  try {
    const db = await openDB();
    const req = db
      .transaction("History")
      .objectStore("History")
      .count();
    res = await indexedDBRequestToPromise(req);
  } catch (e) {
    app.log("error", "History.count: トランザクション中断");
    throw new Error(e);
  }
  return res.target.result;
};

/**
@method clear
@param {Number} offset
@return {Promise}
*/
export var clear = function(offset) {
  if (offset == null) { offset = -1; }
  if (app.assertArg("History.clear", [[offset, "number"]])) {
    return Promise.reject();
  }

  return openDB().then( db => new Promise( function(resolve, reject) {
    const req = db
      .transaction("History", "readwrite")
      .objectStore("History")
      .openCursor();
    let advanced = false;
    req.onsuccess = function({ target: {result: cursor} }) {
      if (cursor) {
        if (!advanced) {
          advanced = true;
          if (offset !== -1) {
            cursor.advance(offset);
            return;
          }
        }
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    req.onerror = function(e) {
      app.log("error", "History.clear: トランザクション中断");
      reject(e);
    };
  }));
};

/**
@method clearRange
@param {Number} day
@return {Promise}
*/
export var clearRange = async function(day) {
  if (app.assertArg("History.clearRange", [[day, "number"]])) {
    return Promise.reject();
  }

  const dayUnix = Date.now() - (day*24*60*60*1000);
  try {
    const db = await openDB();
    const store = db
      .transaction("History", "readwrite")
      .objectStore("History");
    let req = store
      .index("date")
      .getAllKeys(IDBKeyRange.upperBound(dayUnix, true));
    const { target: { result: keys } } = await indexedDBRequestToPromise(req);

    await Promise.all(keys.map( async function(key) {
      req = store.delete(key);
      await indexedDBRequestToPromise(req);
    }));
  } catch (e) {
    app.log("error", "History.clearRange: トランザクション中断");
    throw new Error(e);
  }
};

/**
@method _recoveryOfBoardTitle
@param {Object} db
@param {Object} tx
@return {Promise}
@private
*/
({
  _recoveryOfBoardTitle(db, tx) {
    return new Promise( function(resolve, reject) {
      const req = tx
        .objectStore("History")
        .openCursor();
      req.onsuccess = function({ target: {result: cursor} }) {
        if (cursor) {
          cursor.value.boardTitle = "";
          cursor.update(cursor.value);
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = function(e) {
        app.log("error", "History._recoveryOfBoardTitle: トランザクション中断");
        reject(e);
      };
    });
  }
});
