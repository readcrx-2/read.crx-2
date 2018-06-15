###*
@class app.History
@static
###
class app.History
  @DB_VERSION = 2

  @_openDB: ->
    return new Promise( (resolve, reject) =>
      req = indexedDB.open("History", @DB_VERSION)
      req.onerror = reject
      req.onupgradeneeded = ({ target: {result: db, transaction: tx}, oldVersion: oldVer }) =>
        if oldVer < 1
          objStore = db.createObjectStore("History", keyPath: "id", autoIncrement: true)
          objStore.createIndex("url", "url", unique: false)
          objStore.createIndex("title", "title", unique: false)
          objStore.createIndex("date", "date", unique: false)
          tx.oncomplete = ->
            resolve(db)
            return
        if oldVer is 1
          @_recoveryOfBoardTitle(db, tx)
          tx.oncomplete = ->
            resolve(db)
            return
        return
      req.onsuccess = ({ target: {result: db} }) ->
        resolve(db)
        return
      return
    )

  ###*
  @method add
  @param {String} url
  @param {String} title
  @param {Number} date
  @param {String} boardTitle
  @return {Promise}
  ###
  @add: (url, title, date, boardTitle) ->
    if app.assertArg("History.add", [
      [url, "string"]
      [title, "string"]
      [date, "number"]
      [boardTitle, "string"]
    ])
      throw new Error("履歴に追加しようとしたデータが不正です")

    try
      db = await @_openDB()
      req = db
        .transaction("History", "readwrite")
        .objectStore("History")
        .put({url, title, date, boardTitle})
      await app.util.indexedDBRequestToPromise(req)
    catch e
      app.log("error", "History.add: データの格納に失敗しました")
      throw new Error(e)
    return

  ###*
  @method remove
  @param {String} url
  @param {Number} date
  @return {Promise}
  ###
  @remove: (url, date = null) ->
    if app.assertArg("History.remove", [
      [url, "string"]
      [date, "number", true]
    ])
      return new Error("履歴から削除しようとしたデータが不正です")

    try
      db = await @_openDB()
      store = db
        .transaction("History", "readwrite")
        .objectStore("History")
      if date?
        req = store
          .index("url")
          .getAll(IDBKeyRange.only(url))
      else
        req = store
          .index("url")
          .getAllKeys(IDBKeyRange.only(url))
      { target: { result: data } } = await app.util.indexedDBRequestToPromise(req)

      if date?
        await Promise.all(data.map( (datum) ->
          return if datum.date isnt date
          req = store.delete(datum.id)
          await app.util.indexedDBRequestToPromise(req)
          return
        ))
      else
        await Promise.all(data.map( (datum) ->
          req = store.delete(datum)
          await app.util.indexedDBRequestToPromise(req)
          return
        ))
    catch e
      app.log("error", "History.remove: トランザクション中断")
      throw new Error(e)
    return

  ###*
  @method get
  @param {Number} offset
  @param {Number} limit
  @return {Promise}
  ###
  @get: (offset = -1, limit = -1) ->
    if app.assertArg("History.get", [
      [offset, "number"]
      [limit, "number"]
    ])
      return Promise.reject()

    return @_openDB().then( (db) ->
      return new Promise( (resolve, reject) ->
        req = db
          .transaction("History")
          .objectStore("History")
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
            {value} = cursor
            value.isHttps = (app.URL.getScheme(value.url) is "https")
            histories.push(value)
            cursor.continue()
          else
            resolve(histories)
          return
        req.onerror = (e) ->
          app.log("error", "History.get: トランザクション中断")
          reject(e)
          return
        return
      )
    )

  ###*
  @method getUnique
  @param {Number} offset
  @param {Number} limit
  @return {Promise}
  ###
  @getUnique: (offset = -1, limit = -1) ->
    if app.assertArg("History.getUnique", [
      [offset, "number"]
      [limit, "number"]
    ])
      return Promise.reject()

    return @_openDB().then( (db) ->
      return new Promise( (resolve, reject) ->
        req = db
          .transaction("History")
          .objectStore("History")
          .index("date")
          .openCursor(null, "prev")
        advanced = false
        histories = []
        inserted = new Set()
        req.onsuccess = ({ target: {result: cursor} }) ->
          if cursor and (limit is -1 or histories.length < limit)
            if !advanced
              advanced = true
              if offset isnt -1
                cursor.advance(offset)
                return
            {value} = cursor
            unless inserted.has(value.url)
              value.isHttps = (app.URL.getScheme(value.url) is "https")
              histories.push(value)
              inserted.add(value.url)
            cursor.continue()
          else
            resolve(histories)
          return
        req.onerror = (e) ->
          app.log("error", "History.getUnique: トランザクション中断")
          reject(e)
          return
        return
      )
    )

  ###*
  @method getAll
  @return {Promise}
  ###
  @getAll: ->
    try
      db = await @_openDB()
      req = db
        .transaction("History")
        .objectStore("History")
        .getAll()
      res = await app.util.indexedDBRequestToPromise(req)
    catch e
      app.log("error", "History.getAll: トランザクション中断")
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
        .transaction("History")
        .objectStore("History")
        .count()
      res = await app.util.indexedDBRequestToPromise(req)
    catch e
      app.log("error", "History.count: トランザクション中断")
      throw new Error(e)
    return res.target.result

  ###*
  @method clear
  @param {Number} offset
  @return {Promise}
  ###
  @clear = (offset = -1) ->
    if app.assertArg("History.clear", [[offset, "number"]])
      return Promise.reject()

    return @_openDB().then( (db) ->
      return new Promise( (resolve, reject) ->
        req = db
          .transaction("History", "readwrite")
          .objectStore("History")
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
          app.log("error", "History.clear: トランザクション中断")
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
    if app.assertArg("History.clearRange", [[day, "number"]])
      return Promise.reject()

    dayUnix = Date.now() - day*24*60*60*1000
    try
      db = await @_openDB()
      store = db
        .transaction("History", "readwrite")
        .objectStore("History")
      req = store
        .index("date")
        .getAllKeys(IDBKeyRange.upperBound(dayUnix, true))
      { target: { result: keys } } = await app.util.indexedDBRequestToPromise(req)

      await Promise.all(keys.map( (key) ->
        req = store.delete(key)
        await app.util.indexedDBRequestToPromise(req)
        return
      ))
    catch e
      app.log("error", "History.clearRange: トランザクション中断")
      throw new Error(e)
    return

  ###*
  @method _recoveryOfBoardTitle
  @param {Object} db
  @param {Object} tx
  @return {Promise}
  @private
  ###
  @_recoveryOfBoardTitle: (db, tx) ->
    return new Promise( (resolve, reject) ->
      req = tx
        .objectStore("History")
        .openCursor()
      req.onsuccess = ({ target: {result: cursor} }) ->
        if cursor
          cursor.value.boardTitle = ""
          cursor.update(cursor.value)
          cursor.continue()
        else
          resolve()
        return
      req.onerror = (e) ->
        app.log("error", "History._recoveryOfBoardTitle: トランザクション中断")
        reject(e)
        return
      return
    )
