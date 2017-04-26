###*
@namespace app
@class Cache
@constructor
@param {String} key
@requires jQuery
###
class app.Cache
  constructor: (@key) ->
    ###*
    @property data
    @type String
    ###
    @data = null

    ###*
    @property last_updated
    @type Number
    ###
    @last_updated = null

    ###*
    @property last_modified
    @type Number
    ###
    @last_modified = null

    ###*
    @property etag
    @type String
    ###
    @etag = null

    ###*
    @property res_length
    @type Number
    ###
    @res_length = null

    ###*
    @property dat_size
    @type Number
    ###
    @dat_size = null

  ###*
  @property _db_open
  @type Promise
  @static
  @private
  ###
  @_db_open: new Promise( (resolve, reject) ->
      req = indexedDB.open("Cache", 1)
      req.onerror = (e) ->
        reject(e)
        return
      req.onupgradeneeded = (e) ->
        db = e.target.result
        objStore = db.createObjectStore("Cache", keyPath: "url")
        objStore.createIndex("last_updated", "last_updated", unique: false)
        objStore.createIndex("last_modified", "last_modified", unique: false)
        e.target.transaction.oncomplete = ->
          resolve(db)
        return
      req.onsuccess = (e) ->
        resolve(e.target.result)
        return
      return
    )

  ###*
  @method get
  @return {Promise}
  ###
  get: ->
    Cache._db_open.then( (db) =>
      new Promise( (resolve, reject) =>
        req = db
          .transaction("Cache")
          .objectStore("Cache")
          .get(@key)
        req.onsuccess = (e) =>
          res = e.target.result
          if res?
            data = app.deep_copy(e.target.result)
            for key, val of data
              @[key] = if val? then val else null
            resolve()
          else
            reject()
          return
        req.onerror = (e) ->
          app.log("error", "Cache::remove: トランザクション中断")
          reject(e)
          return
        return
      )
    )

  ###*
  @method count
  @return {Promise}
  ###
  count: ->
    unless @key is "*"
      app.log("error", "Cache::count: 未実装")
      return Promise.reject()

    return Cache._db_open.then( (db) ->
      return new Promise( (resolve, reject) ->
        req = db
          .transaction("Cache")
          .objectStore("Cache")
          .count()
        req.onsuccess = (e) ->
          resolve(event.target.result)
          return
        req.onerror = (e) ->
          app.log("error", "Cache::count: トランザクション中断")
          reject(e)
          return
        return
      )
    )

  ###*
  @method put
  @return {Promise}
  ###
  put: ->
    unless typeof @key is "string" and
        typeof @data is "string" and
        typeof @last_updated is "number" and
        (not @last_modified? or typeof @last_modified is "number") and
        (not @etag? or typeof @etag is "string") and
        (not @res_length? or Number.isFinite(@res_length)) and
        (not @dat_size? or Number.isFinite(@dat_size))
      app.log("error", "Cache::put: データが不正です", @)
      return Promise.reject()

    return Cache._db_open.then( (db) =>
      return new Promise( (resolve, reject) =>
        req = db
          .transaction("Cache", "readwrite")
          .objectStore("Cache")
          .put(
            url: @key
            data: @data.replace(/\u0000/g, "\u0020")
            last_updated: @last_updated
            last_modified: @last_modified or null
            etag: @etag or null
            res_length: @res_length or null
            dat_size: @dat_size or null
          )
        req.onsuccess = (e) ->
          resolve()
          return
        req.onerror = (e) ->
          app.log("error", "Cache::put: トランザクション失敗")
          reject(e)
          return
        return
      )
    )

  ###*
  @method delete
  @return {Promise}
  ###
  delete: ->
    return Cache._db_open.then( (db) =>
      return new Promise( (resolve, reject) =>
        req = db
          .transaction("Cache", "readwrite")
          .objectStore("Cache")
        if @key is "*"
          req.clear()
        else
          req.delete(url)
        req.onsuccess = (e) ->
          resolve()
          return
        req.onerror = (e) ->
          app.log("error", "Cache::delete: トランザクション中断")
          reject(e)
          return
        return
      )
    )

  ###*
  @method clearRange
  @param {Number} day
  @return {Promise}
  ###
  clearRange: (day) ->
    return Cache._db_open.then( (db) ->
      return new Promise( (resolve, reject) ->
        dayUnix = Date.now()-86400000*day
        req = db
          .transaction("Cache", "readwrite")
          .objectStore("Cache")
          .index("last_updated")
          .openCursor(IDBKeyRange.upperBound(dayUnix, true))
        req.onsuccess = (e) ->
          cursor = e.target.result
          if cursor
            cursor.delete()
            cursor.continue()
          else
            resolve()
          return
        req.onerror = (e) ->
          app.log("error", "History.clearRange: トランザクション中断")
          reject(e)
          return
        return
      )
    )

app.module "cache", [], (callback) ->
  callback(app.Cache)
  return
