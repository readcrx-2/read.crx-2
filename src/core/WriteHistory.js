// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
/*
 * decaffeinate suggestions:
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
import {indexedDBRequestToPromise} from "./util.coffee";
import {isHttps} from "./URL.ts";

/**
@class WriteHistory
@static
*/
const DB_VERSION = 2;

const _openDB = () => new Promise( (resolve, reject) => {
  const req = indexedDB.open("WriteHistory", DB_VERSION);
  req.onerror = reject;
  req.onupgradeneeded = ({ target: {result: db, transaction: tx}, oldVersion: oldVer }) => {
    if (oldVer < 1) {
      const objStore = db.createObjectStore("WriteHistory", {keyPath: "id", autoIncrement: true});
      objStore.createIndex("url", "url", {unique: false});
      objStore.createIndex("res", "res", {unique: false});
      objStore.createIndex("title", "title", {unique: false});
      objStore.createIndex("date", "date", {unique: false});
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

/**
@method add
@param {Object}
  @param {String} [url]
  @param {Number} [res]
  @param {String} [title]
  @param {String} [name]
  @param {String} [mail]
  @param {String} [inputName]
  @param {String} [inputMail]
  @param {String} [message]
  @param {Number} [date]
@return {Promise}
*/
export var add = async function({url, res, title, name, mail, inputName = null, inputMail = null, message, date}) {
  if (app.assertArg("WriteHistory.add", [
    [url, "string"],
    [res, "number"],
    [title, "string"],
    [name, "string"],
    [mail, "string"],
    [inputName, "string", true],
    [inputMail, "string", true],
    [message, "string"],
    [date, "number"]
  ])) {
    throw new Error("書込履歴に追加しようとしたデータが不正です");
  }

  try {
    const db = await _openDB();
    const req = db
      .transaction("WriteHistory", "readwrite")
      .objectStore("WriteHistory")
      .add({
        url,
        res,
        title,
        name,
        mail,
        input_name: inputName != null ? inputName : name,
        input_mail: inputMail != null ? inputMail : mail,
        message,
        date
      });
    await indexedDBRequestToPromise(req);
  } catch (e) {
    app.log("error", "WriteHistory.add: データの格納に失敗しました");
    throw new Error(e);
  }
};

/**
@method remove
@param {String} url
@param {Number} res
@return {Promise}
*/
export var remove = async function(url, res) {
  if (app.assertArg("WriteHistory.remove", [
    [url, "string"],
    [res, "number"]
  ])) {
    return Promise.reject();
  }

  try {
    const db = await _openDB();
    const store = db
      .transaction("WriteHistory", "readwrite")
      .objectStore("WriteHistory");
    let req = store
      .index("url")
      .getAll(IDBKeyRange.only(url));
    const { target: { result: data } } = await indexedDBRequestToPromise(req);

    await Promise.all(data.map( async function(datum) {
      if (datum.res === res) {
        req = store.delete(datum.id);
        await indexedDBRequestToPromise(req);
      }
    }));
  } catch (e) {
    app.log("error", "WriteHistory.remove: トランザクション中断");
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
  if (app.assertArg("WriteHistory.get", [
    [offset, "number"],
    [limit, "number"]
  ])) {
    return Promise.reject();
  }

  return _openDB().then( db => new Promise( function(resolve, reject) {
    const req = db
      .transaction("WriteHistory")
      .objectStore("WriteHistory")
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
        const {
          value
        } = cursor;
        value.isHttps = isHttps(value.url);
        histories.push(value);
        cursor.continue();
      } else {
        resolve(histories);
      }
    };
    req.onerror = function(e) {
      app.log("error", "WriteHistory.get: トランザクション中断");
      reject(e);
    };
  }));
};

/**
@method getByUrl
@param {String} url
@return {Promise}
*/
export var getByUrl = async function(url) {
  let res;
  if (app.assertArg("WriteHistory.getByUrl", [[url, "string"]])) {
    throw new Error("書込履歴を取得しようとしたデータが不正です");
  }

  try {
    const db = await _openDB();
    const req = db
      .transaction("WriteHistory")
      .objectStore("WriteHistory")
      .index("url")
      .getAll(IDBKeyRange.only(url));
    res = await indexedDBRequestToPromise(req);
  } catch (e) {
    app.log("error", "WriteHistory.remove: トランザクション中断");
    throw new Error(e);
  }
  return res.target.result;
};

/**
@method getAll
@return {Promise}
*/
export var getAll = async function() {
  let res;
  try {
    const db = await _openDB();
    const req = db
      .transaction("WriteHistory")
      .objectStore("WriteHistory")
      .getAll();
    res = await indexedDBRequestToPromise(req);
  } catch (e) {
    app.log("error", "WriteHistory.getAll: トランザクション中断");
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
    const db = await _openDB();
    const req = db
      .transaction("WriteHistory")
      .objectStore("WriteHistory")
      .count();
    res = await indexedDBRequestToPromise(req);
  } catch (e) {
    app.log("error", "WriteHistory.count: トランザクション中断");
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
  if (app.assertArg("WriteHistory.clear", [[offset, "number"]])) {
    return Promise.reject();
  }

  return _openDB().then( db => new Promise( function(resolve, reject) {
    const req = db
      .transaction("WriteHistory", "readwrite")
      .objectStore("WriteHistory")
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
      app.log("error", "WriteHistory.clear: トランザクション中断");
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
  if (app.assertArg("WriteHistory.clearRange", [[day, "number"]])) {
    return Promise.reject();
  }

  const dayUnix = Date.now() - (day*24*60*60*1000);
  try {
    const db = await _openDB();
    const store = db
      .transaction("WriteHistory", "readwrite")
      .objectStore("WriteHistory");
    let req = store
      .index("date")
      .getAllKeys(IDBKeyRange.upperBound(dayUnix, true));
    const { target: { result: keys } } = await indexedDBRequestToPromise(req);

    await Promise.all(keys.map( async function(key) {
      req = store.delete(key);
      await indexedDBRequestToPromise(req);
    }));
  } catch (error) {
    app.log("error", "WriteHistory.clearRange: トランザクション中断");
    throw new Error(e);
  }
};

/**
@method recoveryOfDate
@param {Object} db
@param {Object} tx
@return {Promise}
@private
*/
var _recoveryOfDate = (db, tx) => new Promise( function(resolve, reject) {
  const unixTime201710 = 1506783600; // 2017/10/01 0:00:00
  const req = tx
    .objectStore("WriteHistory")
    .index("date")
    .openCursor(IDBKeyRange.lowerBound(unixTime201710, true));
  req.onsuccess = function({ target: {result: cursor} }) {
    if (cursor) {
      if (cursor.value.res > 1) {
        const date = new Date(+cursor.value.date);
        date.setMonth(date.getMonth()-1);
        cursor.value.date = date.valueOf();
        cursor.update(cursor.value);
      }
      cursor.continue();
    } else {
      resolve();
    }
  };
  req.onerror = function(e) {
    app.log("error", "WriteHistory._recoveryOfDate: トランザクション中断");
    reject(e);
  };
});
