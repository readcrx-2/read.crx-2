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
  @_db_open: $.Deferred (d) ->
    db = openDatabase("Cache", "", "Cache", 0)
    db.transaction(
      (tr) ->
        tr.executeSql """
          CREATE TABLE IF NOT EXISTS Cache(
            url TEXT NOT NULL PRIMARY KEY,
            data TEXT NOT NULL,
            last_updated INTEGER NOT NULL,
            last_modified INTEGER,
            etag TEXT,
            res_length INTEGER,
            dat_size INTEGER
          )
        """
        return
      -> d.reject(); return
      -> d.resolve(db); return
    )
    return

  ###*
  @method get
  @return {Promise}
  ###
  get: ->
    Cache._db_open.then (db) => $.Deferred (d) =>
      db.transaction(
        (tr) =>
          tr.executeSql(
            "SELECT * FROM Cache WHERE url = ?"
            [@key]
            (tr, result) =>
              if result.rows.length is 1
                data = app.deep_copy(result.rows.item(0))
                for key, val of data
                  @[key] = if val? then val else null
                d.resolve()
              else
                d.reject()
              return
          )
          return
        ->
          app.log("error", "Cache::get トランザクション中断")
          d.reject()
          return
      )
      return
    .promise()

  ###*
  @method count
  @return {Promise}
  ###
  count: ->
    unless @key is "*"
      app.log("error", "Cache::count 未実装")
      return $.Deferred().reject().promise()

    Cache._db_open.then (db) => $.Deferred (d) ->
      db.transaction(
        (tr) ->
          tr.executeSql(
            "SELECT count() FROM Cache"
            []
            (tr, result) ->
              d.resolve(result.rows.item(0)["count()"])
              return
          )
          return
        ->
          app.log("error", "Cache::count トランザクション中断")
          d.reject()
          return
      )
      return
    .promise()

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
        (not @res_length? or (typeof @res_length is "number" and not isNaN(@res_length))) and
        (not @dat_size? or (typeof @dat_size is "number" and not isNaN(@dat_size)))
      app.log("error", "Cache::put データが不正です", @)
      return $.Deferred().reject().promise()

    Cache._db_open.then (db) => $.Deferred (d) =>
      db.transaction(
        (tr) =>
          @data = @data.replace(/\u0000/g, "\u0020")

          tr.executeSql(
            "INSERT OR REPLACE INTO Cache values(?, ?, ?, ?, ?, ?, ?)"
            [
              @key
              @data
              @last_updated
              @last_modified or null
              @etag or null
              @res_length or null
              @dat_size or null
            ]
          )
          return
        ->
          app.log("error", "Cache::put トランザクション失敗")
          d.reject()
          return
        ->
          d.resolve()
          return
      )
      return
    .promise()

  ###*
  @method delete
  @return {Promise}
  ###
  delete: ->
    Cache._db_open.then (db) => $.Deferred (d) =>
      db.transaction(
        (tr) =>
          if @key is "*"
            tr.executeSql("DELETE FROM Cache")
          else
            tr.executeSql("DELETE FROM Cache WHERE url = ?", [@key])
          return
        ->
          app.log("error", "Cache::delete: トランザクション中断")
          d.reject()
          return
        ->
          d.resolve()
          return
      )
      return
    .promise()

  ###*
  @method clearRange
  @param {Number} day
  @return {Promise}
  ###
  clearRange: (day) ->
    Cache._db_open.then (db) => $.Deferred (d) =>
      db.transaction(
        (tr) =>
          dayUnix = Date.now()-86400000*day
          tr.executeSql("DELETE FROM Cache WHERE last_updated < ?", [dayUnix])
          return
        ->
          app.log("error", "Cache.clearRange: トランザクション中断")
          d.reject()
          return
        ->
          d.resolve()
          return
      )
      return
    .promise()

app.module "cache", [], (callback) ->
  callback(app.Cache)
  return
