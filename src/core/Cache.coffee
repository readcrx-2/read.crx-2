###*
@namespace app
@class Cache
@constructor
@param {String} key
###
class app.Cache
  constructor: (@key) ->
    ###*
    @property data
    @type String
    ###
    @data = null

    ###*
    @property parsed
    @type Object
    ###
    @parsed = null

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
    @property readcgi_ver
    @type Number
    ###
    @readcgi_ver = null

  ###*
  @property _dbOpen
  @type Promise
  @static
  @private
  ###
  @_dbOpen: new Promise( (resolve, reject) ->
      req = indexedDB.open("Cache", 1)
      req.onerror = (e) ->
        reject(e)
        return
      req.onupgradeneeded = ({ target: {result: db, transaction: tx} }) ->
        objStore = db.createObjectStore("Cache", keyPath: "url")
        objStore.createIndex("last_updated", "last_updated", unique: false)
        objStore.createIndex("last_modified", "last_modified", unique: false)
        tx.oncomplete = ->
          resolve(db)
        return
      req.onsuccess = ({ target: {result: db} }) ->
        resolve(db)
        return
      return
    )

  ###*
  @method count
  @static
  @return {Promise}
  ###
  @count: ->
    try
      db = await @_dbOpen
      req = db
        .transaction("Cache")
        .objectStore("Cache")
        .count()
      res = await app.util.indexedDBRequestToPromise(req)
    catch e
      app.log("error", "Cache.count: トランザクション中断")
      throw new Error(e)
    return res.target.result

  ###*
  @method delete
  @static
  @return {Promise}
  ###
  @delete: ->
    try
      db = await @_dbOpen
      req = db
        .transaction("Cache", "readwrite")
        .objectStore("Cache")
        .clear()
      await app.util.indexedDBRequestToPromise(req)
    catch e
      app.log("error", "Cache.delete: トランザクション中断")
      throw new Error(e)
    return

  ###*
  @method clearRange
  @param {Number} day
  @static
  @return {Promise}
  ###
  @clearRange: (day) ->
    try
      db = await @_dbOpen
      dayUnix = Date.now() - day*24*60*60*1000
      req = db
        .transaction("Cache", "readwrite")
        .objectStore("Cache")
        .index("last_updated")
        .openCursor(IDBKeyRange.upperBound(dayUnix, true))
      res = await app.util.indexedDBRequestToPromise(req)
    catch e
      app.log("error", "Cache.clearRange: トランザクション中断")
      throw new Error(e)
    return res.target.result

  ###*
  @method get
  @return {Promise}
  ###
  get: ->
    try
      db = await Cache._dbOpen
      req = db
        .transaction("Cache")
        .objectStore("Cache")
        .get(@key)
      { target: {result} } = await app.util.indexedDBRequestToPromise(req)
      unless result?
        throw new Error("キャッシュが存在しません")
      data = app.deepCopy(result)
      for key, val of data
        @[key] = val ? null
    catch e
      unless e.message is "キャッシュが存在しません"
        app.log("error", "Cache::get: トランザクション中断")
      throw new Error(e)
    return

  ###*
  @method put
  @return {Promise}
  ###
  put: ->
    unless typeof @key is "string" and
        ((@data? and typeof @data is "string") or (@parsed? and @parsed instanceof Object)) and
        typeof @last_updated is "number" and
        (not @last_modified? or typeof @last_modified is "number") and
        (not @etag? or typeof @etag is "string") and
        (not @res_length? or Number.isFinite(@res_length)) and
        (not @dat_size? or Number.isFinite(@dat_size)) and
        (not @readcgi_ver? or Number.isFinite(@readcgi_ver))
      app.log("error", "Cache::put: データが不正です", @)
      throw new Error("キャッシュしようとしたデータが不正です")

    try
      db = await Cache._dbOpen
      req = db
        .transaction("Cache", "readwrite")
        .objectStore("Cache")
        .put(
          url: @key
          data: if @data? then @data.replace(/\u0000/g, "\u0020") else null
          parsed: @parsed or null
          last_updated: @last_updated
          last_modified: @last_modified or null
          etag: @etag or null
          res_length: @res_length or null
          dat_size: @dat_size or null
          readcgi_ver: @readcgi_ver or null
        )
      await app.util.indexedDBRequestToPromise(req)
    catch e
      app.log("error", "Cache::put: トランザクション中断")
      throw new Error(e)
    return

  ###*
  @method delete
  @return {Promise}
  ###
  delete: ->
    try
      db = await Cache._dbOpen
      req = db
        .transaction("Cache", "readwrite")
        .objectStore("Cache")
        .delete(url)
      await app.util.indexedDBRequestToPromise(req)
    catch e
      app.log("error", "Cache::delete: トランザクション中断")
      throw new Error(e)
    return

app.module("cache", [], (callback) ->
  callback(app.Cache)
  return
)
