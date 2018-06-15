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
    @property lastUpdated
    @type Number
    ###
    @lastUpdated = null

    ###*
    @property lastModified
    @type Number
    ###
    @lastModified = null

    ###*
    @property etag
    @type String
    ###
    @etag = null

    ###*
    @property resLength
    @type Number
    ###
    @resLength = null

    ###*
    @property datSize
    @type Number
    ###
    @datSize = null

    ###*
    @property readcgiVer
    @type Number
    ###
    @readcgiVer = null

  ###*
  @property _dbOpen
  @type Promise
  @static
  @private
  ###
  @_dbOpen: new Promise( (resolve, reject) ->
      req = indexedDB.open("Cache", 1)
      req.onerror = reject
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
    dayUnix = Date.now() - day*24*60*60*1000
    try
      db = await @_dbOpen
      store = db
        .transaction("Cache", "readwrite")
        .objectStore("Cache")
      req = store
        .index("last_updated")
        .getAllKeys(IDBKeyRange.upperBound(dayUnix, true))
      { target: { result: keys } } = await app.util.indexedDBRequestToPromise(req)

      await Promise.all(keys.map( (key) ->
        req = store.delete(key)
        await app.util.indexedDBRequestToPromise(req)
        return
      ))
    catch e
      app.log("error", "Cache.clearRange: トランザクション中断")
      throw new Error(e)
    return

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
        newKey = switch key
          when "last_updated" then "lastUpdated"
          when "last_modified" then "lastModified"
          when "res_length" then "resLength"
          when "dat_size" then "datSize"
          when "readcgi_ver" then "readcgiVer"
          else key
        @[newKey] = val ? null
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
        typeof @lastUpdated is "number" and
        (not @lastModified? or typeof @lastModified is "number") and
        (not @etag? or typeof @etag is "string") and
        (not @resLength? or Number.isFinite(@resLength)) and
        (not @datSize? or Number.isFinite(@datSize)) and
        (not @readcgiVer? or Number.isFinite(@readcgiVer))
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
          last_updated: @lastUpdated
          last_modified: @lastModified or null
          etag: @etag or null
          res_length: @resLength or null
          dat_size: @datSize or null
          readcgi_ver: @readcgiVer or null
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
