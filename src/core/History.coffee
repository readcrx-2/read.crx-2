###*
@class app.History
@static
###
class app.History
  @_openDB: ->
    return new Promise( (resolve, reject) ->
      req = indexedDB.open("History", 1)
      req.onerror = (e) ->
        reject(e)
        return
      req.onupgradeneeded = ({ target: {result: db, transaction: tx} }) ->
        objStore = db.createObjectStore("History", keyPath: "id", autoIncrement: true)
        objStore.createIndex("url", "url", unique: false)
        objStore.createIndex("title", "title", unique: false)
        objStore.createIndex("date", "date", unique: false)
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
  @param {String} url
  @param {String} title
  @param {Number} date
  @return {Promise}
  ###
  @add: (url, title, date) ->
    if app.assertArg("History.add", [
      [url, "string"]
      [title, "string"]
      [date, "number"]
    ])
      throw new Error("履歴に追加しようとしたデータが不正です")

    try
      db = await @_openDB()
      req = db
        .transaction("History", "readwrite")
        .objectStore("History")
        .put({url, title, date})
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
      return Promise.reject()

    return @_openDB().then( (db) ->
      return new Promise( (resolve, reject) ->
        req = db
          .transaction("History", "readwrite")
          .objectStore("History")
          .index("url")
          .openCursor(IDBKeyRange.only(url))
        req.onsuccess = ({ target: {result: cursor} }) ->
          unless cursor
            resolve()
            return
          if date?
            ddate = cursor.value.date
            if date < ddate < date + 60*1000
              cursor.delete()
          else
            cursor.delete()
          cursor.continue()
          return
        req.onerror = (e) ->
          app.log("error", "History.remove: トランザクション中断")
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

    return @_openDB().then( (db) ->
      return new Promise( (resolve, reject) ->
        dayUnix = Date.now() - day*24*60*60*1000
        req = db
          .transaction("History", "readwrite")
          .objectStore("History")
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
          app.log("error", "History.clearRange: トランザクション中断")
          reject(e)
          return
        return
      )
    )
