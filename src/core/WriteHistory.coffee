###*
@class app.WriteHistory
@static
###
class app.WriteHistory
  @DB_VERSION = 2

  @_openDB: ->
    return new Promise( (resolve, reject) =>
      req = indexedDB.open("WriteHistory", @DB_VERSION)
      req.onerror = (e) ->
        reject(e)
        return
      req.onupgradeneeded = ({ target: {result: db, transaction: tx}, oldVersion: oldVer }) =>
        if oldVer < 1
          objStore = db.createObjectStore("WriteHistory", keyPath: "id", autoIncrement: true)
          objStore.createIndex("url", "url", unique: false)
          objStore.createIndex("res", "res", unique: false)
          objStore.createIndex("title", "title", unique: false)
          objStore.createIndex("date", "date", unique: false)
          tx.oncomplete = ->
            resolve(db)

        if oldVer is 1
          @_recoveryOfDate(db, tx)
          tx.oncomplete = ->
            resolve(db)

        return
      req.onsuccess = ({ target: {result: db} }) ->
        resolve(db)
        return
      return
    )

  ###*
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
  ###
  @add: ({url, res, title, name, mail, inputName = null, inputMail = null, message, date}) ->
    if app.assertArg("WriteHistory.add", [
      [url, "string"]
      [res, "number"]
      [title, "string"]
      [name, "string"]
      [mail, "string"]
      [inputName, "string", true]
      [inputMail, "string", true]
      [message, "string"]
      [date, "number"]
    ])
      throw new Error("書込履歴に追加しようとしたデータが不正です")

    try
      db = await @_openDB()
      req = db
        .transaction("WriteHistory", "readwrite")
        .objectStore("WriteHistory")
        .put({
          url
          res
          title
          name
          mail
          input_name: inputName ? name
          input_mail: inputMail ? mail
          message
          date
        })
      await app.util.indexedDBRequestToPromise(req)
    catch e
      app.log("error", "WriteHistory.add: データの格納に失敗しました")
      throw new Error(e)
    return

  ###*
  @method remove
  @param {String} url
  @param {Number} res
  @return {Promise}
  ###
  @remove: (url, res) ->
    if app.assertArg("WriteHistory.remove", [
      [url, "string"]
      [res, "number"]
    ])
      return Promise.reject()

    return @_openDB().then( (db) ->
      return new Promise( (resolve, reject) ->
        req = db
          .transaction("WriteHistory", "readwrite")
          .objectStore("WriteHistory")
          .index("url")
          .openCursor(IDBKeyRange.only(url))
        req.onsuccess = ({ target: {result: cursor} }) ->
          if cursor
            if cursor.value.res is res
              cursor.delete()
            cursor.continue()
          else
            resolve()
          return
        req.onerror = (e) ->
          app.log("error", "WriteHistory.remove: トランザクション中断")
          reject(e)
          return
        return
      )
    )

  ###*
  @method get
  @param {Number} offset
  @param {Number} limit
  @return {Promise}
  ###
  @get: (offset = -1, limit = -1) ->
    if app.assertArg("WriteHistory.get", [
      [offset, "number"],
      [limit, "number"]
    ])
      return Promise.reject()

    return @_openDB().then( (db) ->
      return new Promise( (resolve, reject) ->
        req = db
          .transaction("WriteHistory")
          .objectStore("WriteHistory")
          .index("date")
          .openCursor(null, "prev")
        advanced = false
        histories = []
        req.onsuccess = ({ target: {result: cursor} }) ->
          if cursor and (limit is -1 or histories.length < limit)
            if !advanced
              advanced = true
              if offset isnt -1
                cursor.advance(offset)
                return
            value = cursor.value
            value.isHttps = (app.URL.getScheme(value.url) is "https")
            histories.push(value)
            cursor.continue()
          else
            resolve(histories)
          return
        req.onerror = (e) ->
          app.log("error", "WriteHistory.get: トランザクション中断")
          reject(e)
          return
        return
      )
    )

  ###*
  @method getByUrl
  @param {String} url
  @return {Promise}
  ###
  @getByUrl: (url) ->
    if app.assertArg("WriteHistory.getByUrl", [[url, "string"]])
      throw new Error("書込履歴を取得しようとしたデータが不正です")

    try
      db = await @_openDB()
      req = db
        .transaction("WriteHistory")
        .objectStore("WriteHistory")
        .index("url")
        .getAll(IDBKeyRange.only(url))
      res = await app.util.indexedDBRequestToPromise(req)
    catch e
      app.log("error", "WriteHistory.remove: トランザクション中断")
      throw new Error(e)
    return res.target.result

  ###*
  @method getAll
  @return {Promise}
  ###
  @getAll: ->
    try
      db = await @_openDB()
      req = db
        .transaction("WriteHistory")
        .objectStore("WriteHistory")
        .getAll()
      res = await app.util.indexedDBRequestToPromise(req)
    catch e
      app.log("error", "WriteHistory.getAll: トランザクション中断")
      throw new Error(e)
    return res.target.result

  ###*
  @method count
  @return {Promise}
  ###
  @count: ->
    try
      db = await @_openDB()
      req = db
        .transaction("WriteHistory")
        .objectStore("WriteHistory")
        .count()
      res = await app.util.indexedDBRequestToPromise(req)
    catch e
      app.log("error", "WriteHistory.count: トランザクション中断")
      throw new Error(e)
    return res.target.result

  ###*
  @method clear
  @param {Number} offset
  @return {Promise}
  ###
  @clear = (offset = -1) ->
    if app.assertArg("WriteHistory.clear", [[offset, "number"]])
      return Promise.reject()

    return @_openDB().then( (db) ->
      return new Promise( (resolve, reject) ->
        req = db
          .transaction("WriteHistory", "readwrite")
          .objectStore("WriteHistory")
          .openCursor()
        advanced = false
        req.onsuccess = ({ target: {result: cursor} }) ->
          if cursor
            if !advanced
              advanced = true
              if offset isnt -1
                cursor.advance(offset)
                return
            cursor.delete()
            cursor.continue()
          else
            resolve()
          return
        req.onerror = (e) ->
          app.log("error", "WriteHistory.clear: トランザクション中断")
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
  @clearRange = (day) ->
    if app.assertArg("WriteHistory.clearRange", [[day, "number"]])
      return Promise.reject()

    return @_openDB().then( (db) ->
      return new Promise( (resolve, reject) ->
        dayUnix = Date.now() - day*24*60*60*1000
        req = db
          .transaction("WriteHistory", "readwrite")
          .objectStore("WriteHistory")
          .index("date")
          .openCursor(IDBKeyRange.upperBound(dayUnix, true))
        req.onsuccess = ({ target: {result: cursor} }) ->
          if cursor
            cursor.delete()
            cursor.continue()
          else
            resolve()
          return
        req.onerror = (e) ->
          app.log("error", "WriteHistory.clearRange: トランザクション中断")
          reject(e)
          return
        return
      )
    )

  ###*
  @method recoveryOfDate
  @param {Object} db
  @param {Object} tx
  @return {Promise}
  @private
  ###
  @_recoveryOfDate: (db, tx) ->
    return new Promise( (resolve, reject) ->
      req = tx
        .objectStore("WriteHistory")
        .openCursor()
      req.onsuccess = ({ target: {result: cursor} }) ->
        if cursor
          date = new Date(+cursor.value.date)
          year = date.getFullYear()
          month = date.getMonth()
          if (year > 2017 or (year is 2017 and month > 9)) and cursor.value.res > 1
            month--
            if month < 0
              date.setFullYear(date.getFullYear() - 1)
              month = 11
            date.setMonth(month)
            cursor.value.date = date.valueOf()
            cursor.update(cursor.value)
          cursor.continue()
        else
          resolve()
        return
      req.onerror = (e) ->
        app.log("error", "WriteHistory._recoveryOfDate: トランザクション中断")
        reject(e)
        return
      return
    )
