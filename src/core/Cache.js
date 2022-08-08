let Cache;
import { indexedDBRequestToPromise } from "./jsutil.js";

/**
@class Cache
@constructor
@param {String} key
*/
export default Cache = (function () {
  Cache = class Cache {
    static initClass() {
      /**
      @property _dbOpen
      @type Promise
      @static
      @private
      */
      this._dbOpen = new Promise(function (resolve, reject) {
        const req = indexedDB.open("Cache", 1);
        req.onerror = reject;
        req.onupgradeneeded = function ({
          target: { result: db, transaction: tx },
        }) {
          const objStore = db.createObjectStore("Cache", { keyPath: "url" });
          objStore.createIndex("last_updated", "last_updated", {
            unique: false,
          });
          objStore.createIndex("last_modified", "last_modified", {
            unique: false,
          });
          tx.oncomplete = () => resolve(db);
        };
        req.onsuccess = function ({ target: { result: db } }) {
          resolve(db);
        };
      });
    }
    constructor(key) {
      /**
      @property data
      @type String
      */
      this.key = key;
      this.data = null;

      /**
      @property parsed
      @type Object
      */
      this.parsed = null;

      /**
      @property lastUpdated
      @type Number
      */
      this.lastUpdated = null;

      /**
      @property lastModified
      @type Number
      */
      this.lastModified = null;

      /**
      @property etag
      @type String
      */
      this.etag = null;

      /**
      @property resLength
      @type Number
      */
      this.resLength = null;

      /**
      @property datSize
      @type Number
      */
      this.datSize = null;

      /**
      @property readcgiVer
      @type Number
      */
      this.readcgiVer = null;
    }

    /**
    @method count
    @static
    @return {Promise}
    */
    static async count() {
      let res;
      try {
        const db = await this._dbOpen;
        const req = db.transaction("Cache").objectStore("Cache").count();
        res = await indexedDBRequestToPromise(req);
      } catch (e) {
        app.log("error", "Cache.count: トランザクション中断");
        throw new Error(e);
      }
      return res.target.result;
    }

    /**
    @method delete
    @static
    @return {Promise}
    */
    static async delete() {
      try {
        const db = await this._dbOpen;
        const req = db
          .transaction("Cache", "readwrite")
          .objectStore("Cache")
          .clear();
        await indexedDBRequestToPromise(req);
      } catch (e) {
        app.log("error", "Cache.delete: トランザクション中断");
        throw new Error(e);
      }
    }

    /**
    @method clearRange
    @param {Number} day
    @static
    @return {Promise}
    */
    static async clearRange(day) {
      const dayUnix = Date.now() - day * 24 * 60 * 60 * 1000;
      try {
        const db = await this._dbOpen;
        const store = db.transaction("Cache", "readwrite").objectStore("Cache");
        let req = store
          .index("last_updated")
          .getAllKeys(IDBKeyRange.upperBound(dayUnix, true));
        const {
          target: { result: keys },
        } = await indexedDBRequestToPromise(req);

        await Promise.all(
          keys.map(async function (key) {
            req = store.delete(key);
            await indexedDBRequestToPromise(req);
          })
        );
      } catch (e) {
        app.log("error", "Cache.clearRange: トランザクション中断");
        throw new Error(e);
      }
    }

    /**
    @method get
    @return {Promise}
    */
    async get() {
      try {
        const db = await Cache._dbOpen;
        const req = db.transaction("Cache").objectStore("Cache").get(this.key);
        const {
          target: { result },
        } = await indexedDBRequestToPromise(req);
        if (result == null) {
          throw new Error("キャッシュが存在しません");
        }
        const data = app.deepCopy(result);
        for (var key in data) {
          const val = data[key];
          const newKey = (() => {
            switch (key) {
              case "last_updated":
                return "lastUpdated";
              case "last_modified":
                return "lastModified";
              case "res_length":
                return "resLength";
              case "dat_size":
                return "datSize";
              case "readcgi_ver":
                return "readcgiVer";
              default:
                return key;
            }
          })();
          this[newKey] = val != null ? val : null;
        }
      } catch (e) {
        if (e.message !== "キャッシュが存在しません") {
          app.log("error", "Cache::get: トランザクション中断");
        }
        throw new Error(e);
      }
    }

    /**
    @method put
    @return {Promise}
    */
    async put() {
      if (
        typeof this.key !== "string" ||
        ((this.data == null || typeof this.data !== "string") &&
          (this.parsed == null || !(this.parsed instanceof Object))) ||
        typeof this.lastUpdated !== "number" ||
        (!(this.lastModified == null) &&
          typeof this.lastModified !== "number") ||
        (!(this.etag == null) && typeof this.etag !== "string") ||
        (!(this.resLength == null) && !Number.isFinite(this.resLength)) ||
        (!(this.datSize == null) && !Number.isFinite(this.datSize)) ||
        (!(this.readcgiVer == null) && !Number.isFinite(this.readcgiVer))
      ) {
        app.log("error", "Cache::put: データが不正です", this);
        throw new Error("キャッシュしようとしたデータが不正です");
      }

      const data =
        this.data != null
          ? app.replaceAll(this.data, "\u0000", "\u0020")
          : null;

      try {
        const db = await Cache._dbOpen;
        const req = db
          .transaction("Cache", "readwrite")
          .objectStore("Cache")
          .put({
            url: this.key,
            data,
            parsed: this.parsed || null,
            last_updated: this.lastUpdated,
            last_modified: this.lastModified || null,
            etag: this.etag || null,
            res_length: this.resLength || null,
            dat_size: this.datSize || null,
            readcgi_ver: this.readcgiVer || null,
          });
        await indexedDBRequestToPromise(req);
      } catch (e) {
        app.log("error", "Cache::put: トランザクション中断");
        throw new Error(e);
      }
    }

    /**
    @method delete
    @return {Promise}
    */
    async delete() {
      try {
        const db = await Cache._dbOpen;
        const req = db
          .transaction("Cache", "readwrite")
          .objectStore("Cache")
          .delete(url);
        await indexedDBRequestToPromise(req);
      } catch (e) {
        app.log("error", "Cache::delete: トランザクション中断");
        throw new Error(e);
      }
    }
  };
  Cache.initClass();
  return Cache;
})();
