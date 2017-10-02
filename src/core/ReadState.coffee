###*
@class app.ReadState
@static
###
class app.ReadState
  @_openDB: new Promise( (resolve, reject) ->
    req = indexedDB.open("ReadState", 1)
    req.onerror = (e) ->
      app.criticalError("既読情報管理システムの起動に失敗しました")
      reject(e)
      return
    req.onupgradeneeded = ({ target: {result: db, transaction: tx} }) ->
      objStore = db.createObjectStore("ReadState", keyPath: "url")
      objStore.createIndex("board_url", "board_url", unique: false)
      tx.oncomplete = ->
        resolve(db)
      return
    req.onsuccess = ({ target: {result: db} }) ->
      resolve(db)
      return
    return
  )

  @_urlFilter = (originalUrl) ->
    originalUrl = app.URL.fix(originalUrl)
    scheme = app.URL.getScheme(originalUrl)

    return {
      original: originalUrl
      replaced: originalUrl
        .replace(/// ^https?://\w+\.5ch\.net/ ///, "#{scheme}://*.5ch.net/")
        .replace(/// ^https?://\w+\.2ch\.net/ ///, "#{scheme}://*.2ch.net/")
      originalOrigin: originalUrl
        .replace(/// ^(https?://\w+\.5ch\.net)/.* ///, "$1")
        .replace(/// ^(https?://\w+\.2ch\.net)/.* ///, "$1")
      replacedOrigin: originalUrl
        .replace(/// ^(https?)://\w+\.([25])ch\.net/.* ///, "$1://*.$2ch.net")
    }

  @set: (readState) ->
    if not readState? or
        typeof readState isnt "object" or
        typeof readState.url isnt "string" or
        not Number.isFinite(readState.last) or
        not Number.isFinite(readState.read) or
        not Number.isFinite(readState.received) or
        not (Number.isFinite(readState.offset) or readState.offset is null)
      app.log("error", "app.ReadState.set: 引数が不正です", arguments)
      return Promise.reject()

    readState = app.deepCopy(readState)

    url = @_urlFilter(readState.url)
    readState.url = url.replaced
    boardUrl = app.URL.threadToBoard(url.original)
    readState.board_url = @_urlFilter(boardUrl).replaced

    return @_openDB.then( (db) =>
      return new Promise( (resolve, reject) =>
        req = db
          .transaction("ReadState", "readwrite")
          .objectStore("ReadState")
          .put(readState)
        req.onsuccess = ->
          delete readState.board_url
          readState.url = readState.url.replace(url.replaced, url.original)
          app.message.send("read_state_updated", {board_url: boardUrl, read_state: readState})
          resolve()
          return
        req.onerror = (e) ->
          app.log("error", "app.ReadState.set: トランザクション失敗")
          reject(e)
          return
        return
      )
    )

  @get: (url) ->
    if app.assertArg("app.read_state.get", ["string"], arguments)
      return Promise.reject()

    url = @_urlFilter(url)

    return @_openDB.then( (db) =>
      new Promise( (resolve, reject) =>
        req = db
          .transaction("ReadState")
          .objectStore("ReadState")
          .get(url.replaced)
        req.onsuccess = ({ target: {result} }) ->
          data = app.deepCopy(result)
          if data?
            data.url = url.original
          resolve(data)
          return
        req.onerror = (e) ->
          app.log("error", "app.ReadState.get: トランザクション中断")
          reject(e)
          return
        return
      )
    )

  @getAll: ->
    return @_openDB.then( (db) ->
      return new Promise( (resolve, reject) ->
        req = db
          .transaction("ReadState")
          .objectStore("ReadState")
          .getAll()
        req.onsuccess = ({ target: {result} }) ->
          resolve(result)
          return
        req.onerror = (e) ->
          app.log("error", "app.ReadState.getAll: トランザクション中断")
          reject(e)
          return
        return
      )
    )

  @getByBoard: (url) ->
    if app.assertArg("app.ReadState.getByBoard", ["string"], arguments)
      return Promise.reject()

    url = @_urlFilter(url)

    return @_openDB.then( (db) ->
      return new Promise( (resolve, reject) ->
        req = db
          .transaction("ReadState")
          .objectStore("ReadState")
          .index("board_url")
          .getAll(IDBKeyRange.only(url.replaced))
        req.onsuccess = ({ target: {result: data} }) ->
          for key, val of data
            data[key].url = val.url.replace(url.replacedOrigin, url.originalOrigin)
          resolve(data)
          return
        req.onerror = (e) ->
          app.log("error", "app.ReadState.getByBoard: トランザクション中断")
          reject(e)
          return
        return
      )
    )

  @remove: (url) ->
    if app.assertArg("app.ReadState.remove", ["string"], arguments)
      return Promise.reject()

    url = @_urlFilter(url)

    return @_openDB.then( (db) ->
      return new Promise( (resolve, reject) ->
        req = db
          .transaction("ReadState", "readwrite")
          .objectStore("ReadState")
          .delete(url.replaced)
        req.onsuccess = ->
          app.message.send("read_state_removed", url: url.original)
          resolve()
          return
        req.onerror = (e) ->
          app.log("error", "app.ReadState.remove: トランザクション中断")
          reject(e)
          return
        return
      )
    )

  @clear: ->
    return @_openDB.then( (db) ->
      return new Promise( (resolve, reject) ->
        req = db
          .transaction("ReadState", "readwrite")
          .objectStore("ReadState")
          .clear()
        req.onsuccess = ->
          resolve()
          return
        req.onerror = (e) ->
          app.log("error", "app.ReadState.clear: トランザクション中断")
          reject(e)
          return
        return
      )
    )
