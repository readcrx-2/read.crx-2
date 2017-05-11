###*
@class app.WriteHistory
@static
###
class app.WriteHistory
  @_openDB: ->
    return new Promise( (resolve, reject) ->
      req = indexedDB.open("WriteHistory", 1)
      req.onerror = (e) ->
        reject(e)
        return
      req.onupgradeneeded = (e) ->
        db = e.target.result
        objStore = db.createObjectStore("WriteHistory", keyPath: "id", autoIncrement: true)
        objStore.createIndex("url", "url", unique: false)
        objStore.createIndex("res", "res", unique: false)
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
  @param {Number} res
  @param {String} title
  @param {String} name
  @param {String} mail
  @param {String} message
  @param {Number} date
  @return {Promise}
  ###
  @add: (url, res, title, name, mail, input_name, input_mail, message, date) ->
    if app.assertArg("WriteHistory.add", ["string", "number", "string", "string", "string", "string", "string", "string", "number"], arguments)
      return Promise.reject()

    return @_openDB().then( (db) ->
      return new Promise( (resolve, reject) ->
        req = db
          .transaction("WriteHistory", "readwrite")
          .objectStore("WriteHistory")
          .put({
            url
            res
            title
            name
            mail
            input_name
            input_mail
            message
            date
          })
        req.onsuccess = (e) ->
          resolve()
          return
        req.onerror = (e) ->
          app.log("error", "WriteHistory.add: データの格納に失敗しました")
          reject(e)
          return
        return
      )
    )

  ###*
  @method remove
  @param {String} url
  @param {Number} res
  @return {Promise}
  ###
  @remove: (url, res) ->
    if app.assertArg("WriteHistory.remove", ["string", "number"], arguments)
      return Promise.reject()

    return @_openDB().then( (db) ->
      return new Promise( (resolve, reject) ->
        req = db
          .transaction("WriteHistory", "readwrite")
          .objectStore("WriteHistory")
          .index("url")
          .openCursor(IDBKeyRange.only(url))
        req.onsuccess = (e) ->
          cursor = e.target.result
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
    if app.assertArg("WriteHistory.get", ["number", "number"], [offset, limit])
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
    if app.assertArg("WriteHistory.getByUrl", ["string"], arguments)
      return Promise.reject()

    return @_openDB().then( (db) ->
      return new Promise( (resolve, reject) ->
        req = db
          .transaction("WriteHistory")
          .objectStore("WriteHistory")
          .index("url")
          .getAll(IDBKeyRange.only(url))
        req.onsuccess = (e) ->
          resolve(e.target.result)
          return
        req.onerror = (e) ->
          app.log("error", "WriteHistory.remove: トランザクション中断")
          reject(e)
          return
        return
      )
    )

  ###*
  @method getAll
  @return {Promise}
  ###
  @getAll: () ->
    return @_openDB().then( (db) ->
      return new Promise( (resolve, reject) ->
        req = db
          .transaction("WriteHistory")
          .objectStore("WriteHistory")
          .getAll()
        req.onsuccess = (e) ->
          resolve(e.target.result)
          return
        req.onerror = (e) ->
          app.log("error", "WriteHistory.getAll: トランザクション中断")
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
          .transaction("WriteHistory")
          .objectStore("WriteHistory")
          .count()
        req.onsuccess = (e) ->
          resolve(e.target.result)
          return
        req.onerror = (e) ->
          app.log("error", "WriteHistory.count: トランザクション中断")
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
    if app.assertArg("WriteHistory.clear", ["number"], [offset])
      return Promise.reject()

    return @_openDB().then( (db) ->
      return new Promise( (resolve, reject) ->
        req = db
          .transaction("WriteHistory", "readwrite")
          .objectStore("WriteHistory")
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
    if app.assertArg("WriteHistory.clearRange", ["number"], arguments)
      return Promise.reject()

    return @_openDB().then( (db) ->
      return new Promise( (resolve, reject) ->
        dayUnix = Date.now()-86400000*day
        req = db
          .transaction("WriteHistory", "readwrite")
          .objectStore("WriteHistory")
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
          app.log("error", "WriteHistory.clearRange: トランザクション中断")
          reject(e)
          return
        return
      )
    )
