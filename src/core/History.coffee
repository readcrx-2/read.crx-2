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
      req.onupgradeneeded = (e) ->
        db = e.target.result
        objStore = db.createObjectStore("History", keyPath: "id", autoIncrement: true)
        objStore.createIndex("url", "url", unique: false)
        objStore.createIndex("title", "title", unique: false)
        objStore.createIndex("date", "date", unique: false)
        e.target.transaction.oncomplete = ->
          resolve(db)
        return
      req.onsuccess = (e) ->
        resolve(e.target.result)
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
    if app.assertArg("History.add", ["string", "string", "number"], arguments)
      return Promise.reject()

    return @_openDB().then( (db) ->
      return new Promise( (resolve, reject) ->
        req = db
          .transaction("History", "readwrite")
          .objectStore("History")
          .put(url: url, title: title, date: date)
        req.onsuccess = (e) ->
          resolve()
          return
        req.onerror = (e) ->
          app.log("error", "History.add: データの格納に失敗しました")
          reject(e)
          return
        return
      )
    )

  ###*
  @method remove
  @param {String} url
  @param {Number} date
  @return {Promise}
  ###
  @remove: (url, date) ->
    if (
      (date? and app.assertArg("History.remove", ["string", "number"], arguments)) or
      app.assertArg("History.remove", ["string"], arguments)
    )
      return Promise.reject()

    return @_openDB().then( (db) ->
      return new Promise( (resolve, reject) ->
        req = db
          .transaction("History", "readwrite")
          .objectStore("History")
          .index("url")
          .openCursor(IDBKeyRange.only(url))
        req.onsuccess = (e) ->
          cursor = e.target.result
          if cursor
            if date?
              ddate = cursor.value.date
              if date < ddate < date+60000
                cursor.delete()
            else
              cursor.delete()
            cursor.continue()
          else
            resolve()
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
    if app.assertArg("History.get", ["number", "number"], [offset, limit])
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
        req.onsuccess = (e) ->
          cursor = e.target.result
          if cursor and (limit is -1 or histories.length < limit)
            if !advanced
              advanced = true
              if offset isnt -1
                cursor.advance(offset)
                return
            value = cursor.value
            value.is_https = (app.URL.getScheme(value.url) is "https")
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
  @method getAll
  @return {Promise}
  ###
  @getAll: ->
    return @_openDB().then( (db) ->
      return new Promise( (resolve, reject) ->
        req = db
          .transaction("History")
          .objectStore("History")
          .getAll()
        req.onsuccess = (e) ->
          resolve(e.target.result)
          return
        req.onerror = (e) ->
          app.log("error", "History.getAll: トランザクション中断")
          reject(e)
          return
        return
      )
    )

  ###*
  @method count
  @return {Promise}
  ###
  @count: ->
    return @_openDB().then( (db) ->
      return new Promise( (resolve, reject) ->
        req = db
          .transaction("History")
          .objectStore("History")
          .count()
        req.onsuccess = (e) ->
          resolve(e.target.result)
          return
        req.onerror = (e) ->
          app.log("error", "History.count: トランザクション中断")
          reject(e)
          return
        return
      )
    )

  ###*
  @method clear
  @param {Number} offset
  @return {Promise}
  ###
  @clear = (offset = -1) ->
    if app.assertArg("History.clear", ["number"], [offset])
      return Promise.reject()

    return @_openDB().then( (db) ->
      return new Promise( (resolve, reject) ->
        req = db
          .transaction("History", "readwrite")
          .objectStore("History")
          .openCursor()
        advanced = false
        req.onsuccess = (e) ->
          cursor = e.target.result
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
    if app.assertArg("History.clearRange", ["number"], arguments)
      return Promise.reject()

    return @_openDB().then( (db) ->
      return new Promise( (resolve, reject) ->
        dayUnix = Date.now()-86400000*day
        req = db
          .transaction("History", "readwrite")
          .objectStore("History")
          .index("date")
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
