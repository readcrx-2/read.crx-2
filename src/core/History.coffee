###*
@class app.History
@static
###
class app.History
  @_openDB: ->
    unless @_openDBPromise?
      @_openDBPromise = $.Deferred((d) ->
        db = openDatabase("History", "", "History", 0)
        db.transaction(
          (transaction) ->
            transaction.executeSql """
              CREATE TABLE IF NOT EXISTS History(
                url TEXT NOT NULL,
                title TEXT NOT NULL,
                date INTEGER NOT NULL
              )
            """
            return
          -> d.reject(); return
          -> d.resolve(db); return
        )
      ).promise()
    @_openDBPromise

  ###*
  @method add
  @param {String} url
  @param {String} title
  @param {Number} date
  @return {Promise}
  ###
  @add: (url, title, date) ->
    if app.assert_arg("History.add", ["string", "string", "number"], arguments)
      return $.Deferred().reject().promise()

    @_openDB().pipe((db) -> $.Deferred (d) ->
      db.transaction(
        (transaction) ->
          transaction.executeSql(
            "INSERT INTO History values(?, ?, ?)"
            [url, title, date]
          )
          return
        ->
          app.log("error", "History.add: データの格納に失敗しました")
          d.reject()
          return
        -> d.resolve(); return
      )
      return
    )
    .promise()

  @remove: (url) ->
    if app.assert_arg("History.remove", ["string"], arguments)
      return $.Deferred().reject().promise()

    @_openDB().pipe((db) -> $.Deferred (d) ->
      db.transaction(
        (transaction) ->
          transaction.executeSql("DELETE FROM History WHERE url = ?", [url])
          return
        ->
          app.log("error", "app.history.remove: トランザクション中断")
          d.reject()
          return
        ->
          d.resolve()
          return
      )
      return
    )
    .promise()

  ###*
  @method get
  @param {Number} offset
  @param {Number} limit
  @return {Promise}
  ###
  @get: (offset = -1, limit = -1) ->
    if app.assert_arg("History.get", ["number", "number"], [offset, limit])
      return $.Deferred().reject().promise()

    @_openDB().pipe((db) -> $.Deferred (d) ->
      db.readTransaction(
        (transaction) ->
          transaction.executeSql(
            "SELECT * FROM History ORDER BY date DESC LIMIT ? OFFSET ?"
            [limit, offset]
            (transaction, result) ->
              data = []
              key = 0
              length = result.rows.length
              while key < length
                data.push(result.rows.item(key))
                key++
              d.resolve(data)
              return
          )
          return
        ->
          app.log("error", "History.get: トランザクション中断")
          d.reject()
          return
      )
    )
    .promise()

  ###*
  @method count
  @return {Promise}
  ###
  @count: ->
    @_openDB().pipe((db) -> $.Deferred (d) ->
      db.readTransaction(
        (transaction) ->
          transaction.executeSql(
            "SELECT count() FROM History"
            []
            (transaction, result) ->
              d.resolve(result.rows.item(0)["count()"])
              return
          )
          return
        ->
          app.log("error", "History.count: トランザクション中断")
          d.reject()
          return
      )
    )
    .promise()

  ###*
  @method clear
  @param {Number} offset
  @return {Promise}
  ###
  @clear = (offset) ->
    if offset? and app.assert_arg("History.clear", ["number"], arguments)
      return $.Deferred().reject().promise()

    @_openDB().pipe((db) -> $.Deferred (d) ->
      db.transaction(
        (transaction) ->
          if typeof offset is "number"
            transaction.executeSql("DELETE FROM History WHERE rowid < (SELECT rowid FROM History ORDER BY date DESC LIMIT 1 OFFSET ?)", [offset - 1])
          else
            transaction.executeSql("DELETE FROM History")
          return
        ->
          app.log("error", "app.history.clear: トランザクション中断")
          d.reject()
          return
        ->
          d.resolve()
          return
      )
      return
    )
    .promise()

  ###*
  @method get_title
  @param {String} url
  @return {Promise}
  ###
  @get_title: (url) ->
    if app.assert_arg("History.get_title", ["string"], arguments)
      return $.Deferred().reject().promise()

    @_openDB().pipe((db) -> $.Deferred (d) ->
      db.readTransaction(
        (transaction) ->
          transaction.executeSql(
            "SELECT url, title FROM History WHERE url = ?"
            [url]
            (transaction, result) ->
              if result.rows.length isnt 0
                got_title = result.rows[0].title
                d.resolve(got_title)
              else
                d.reject("")
              return
          )
          return
        ->
          app.log("error", "History.get_title: トランザクション中断")
          d.reject()
          return
      )
    )
    .promise()

  ###*
  @method get_from_url
  @param {String} url
  @return {Promise}
  ###
  @get_from_url: (url) ->
    if app.assert_arg("History.get_from_url", ["string"], arguments)
      return $.Deferred().reject().promise()

    @_openDB().pipe((db) -> $.Deferred (d) ->
      db.readTransaction(
        (transaction) ->
          transaction.executeSql(
            "SELECT * FROM History WHERE url = ?"
            [url]
            (transaction, result) ->
              if result.rows.length isnt 0
                res = result.rows[0]
                d.resolve(res)
              else
                d.reject("")
              return
          )
          return
        ->
          app.log("error", "History.get_title: トランザクション中断")
          d.reject()
          return
      )
    )
    .promise()

  ###*
  @method get_newest_id
  @param {String} url
  @return {Promise}
  ###
  @get_newest_id: (url) ->
    if app.assert_arg("History.get_newest_id", ["string"], arguments)
      return $.Deferred().reject().promise()

    @_openDB().pipe((db) -> $.Deferred (d) ->
      db.readTransaction(
        (transaction) ->
          transaction.executeSql(
            "SELECT url, rowid FROM History WHERE url = ?"
            [url]
            (transaction, result) ->
              length = result.rows.length
              if length isnt 0
                rowid = result.rows[length-1].rowid
                d.resolve(rowid)
              else
                d.reject("")
              return
          )
          return
        ->
          app.log("error", "History.get_title: トランザクション中断")
          d.reject()
          return
      )
    )
    .promise()

  ###*
  @method get_with_id
  urlが重複しているものは1つしか取得しない
  @param {Number} offset
  @param {Number} limit
  @return {Promise}
  ###
  @get_with_id: (offset = -1, limit = -1) ->
    if app.assert_arg("History.get_with_id", ["number", "number"], [offset, limit])
      return $.Deferred().reject().promise()

    @_openDB().pipe((db) -> $.Deferred (d) ->
      db.readTransaction(
        (transaction) ->
          transaction.executeSql(
            """
            SELECT rowid, date, title, url FROM History
            WHERE rowid IN(SELECT MAX(rowid) FROM History GROUP BY url)
            ORDER BY date
            DESC LIMIT ? OFFSET ?
            """
            [limit, offset]
            (transaction, result) ->
              data = []
              key = 0
              length = result.rows.length
              while key < length
                data.push(result.rows.item(key))
                key++
              d.resolve(data)
              return
          )
          return
        ->
          app.log("error", "History.get: トランザクション中断")
          d.reject()
          return
      )
    )
    .promise()
