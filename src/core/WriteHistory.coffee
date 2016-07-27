###*
@class app.WriteHistory
@static
###
class app.WriteHistory
  @_openDB: ->
    unless @_openDBPromise?
      @_openDBPromise = $.Deferred((d) ->
        db = openDatabase("WriteHistory", "", "WriteHistory", 0)
        db.transaction(
          (transaction) ->
            transaction.executeSql """
              CREATE TABLE IF NOT EXISTS WriteHistory(
                url TEXT NOT NULL,
                res INTEGER NOT NULL,
                title TEXT NOT NULL,
                name TEXT,
                mail TEXT,
                input_name TEXT,
                input_mail TEXT,
                message TEXT,
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
  @param {Number} res
  @param {String} title
  @param {String} name
  @param {String} mail
  @param {String} message
  @param {Number} date
  @return {Promise}
  ###
  @add: (url, res, title, name, mail, input_name, input_mail, message, date) ->
    if app.assert_arg("WriteHistory.add", ["string", "number", "string", "string", "string", "string", "string", "string", "number"], arguments)
      return $.Deferred().reject().promise()

    @_openDB().pipe((db) -> $.Deferred (d) ->
      db.transaction(
        (transaction) ->
          transaction.executeSql(
            "INSERT INTO WriteHistory values(?, ?, ?, ?, ?, ?, ?, ?, ?)"
            [url, res, title, name, mail, input_name, input_mail, message, date]
          )
          return
        ->
          app.log("error", "WriteHistory.add: データの格納に失敗しました")
          d.reject()
          return
        -> d.resolve(); return
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
    if app.assert_arg("WriteHistory.get", ["number", "number"], [offset, limit])
      return $.Deferred().reject().promise()

    @_openDB().pipe((db) -> $.Deferred (d) ->
      db.readTransaction(
        (transaction) ->
          transaction.executeSql(
            "SELECT * FROM WriteHistory ORDER BY date DESC LIMIT ? OFFSET ?"
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
          app.log("error", "WriteHistory.get: トランザクション中断")
          d.reject()
          return
      )
    )
    .promise()

  ###*
  @method getByUrl
  @param {String} url
  @return {Promise}
  ###
  @getByUrl: (url) ->
    if app.assert_arg("WriteHistory.getByUrl", ["string"], arguments)
      return $.Deferred().reject().promise()

    @_openDB().pipe((db) -> $.Deferred (d) ->
      db.readTransaction(
        (transaction) ->
          transaction.executeSql(
            "SELECT * FROM WriteHistory WHERE url = ? ORDER BY date"
            [url]
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
          app.log("error", "WriteHistory.getByUrl: トランザクション中断")
          d.reject()
          return
      )
    )
    .promise()

  ###*
  @method get_all
  @return {Promise}
  ###
  @get_all: () ->
    @_openDB().pipe((db) -> $.Deferred (d) ->
      db.readTransaction(
        (transaction) ->
          transaction.executeSql(
            "SELECT * FROM WriteHistory"
            []
            (transaction, result) ->
              d.resolve(result.rows)
              return
          )
          return
        ->
          app.log("error", "WriteHistory.get_all: トランザクション中断")
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
            "SELECT count() FROM WriteHistory"
            []
            (transaction, result) ->
              d.resolve(result.rows.item(0)["count()"])
              return
          )
          return
        ->
          app.log("error", "WriteHistory.count: トランザクション中断")
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
    if offset? and app.assert_arg("WriteHistory.clear", ["number"], arguments)
      return $.Deferred().reject().promise()

    @_openDB().pipe((db) -> $.Deferred (d) ->
      db.transaction(
        (transaction) ->
          if typeof offset is "number"
            transaction.executeSql("DELETE FROM WriteHistory WHERE rowid < (SELECT rowid FROM WriteHistory ORDER BY date DESC LIMIT 1 OFFSET ?)", [offset - 1])
          else
            transaction.executeSql("DELETE FROM WriteHistory")
          return
        ->
          app.log("error", "app.WriteHistory.clear: トランザクション中断")
          d.reject()
          return
        ->
          d.resolve()
          return
      )
      return
    )
    .promise()
