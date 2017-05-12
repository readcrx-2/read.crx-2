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
    req.onupgradeneeded = (e) ->
      db = e.target.result
      objStore = db.createObjectStore("ReadState", keyPath: "url")
      objStore.createIndex("board_url", "board_url", unique: false)
      e.target.transaction.oncomplete = ->
        resolve(db)
      return
    req.onsuccess = (e) ->
      resolve(e.target.result)
      return
    return
  )

  @_url_filter = (original_url) ->
    original_url = app.URL.fix(original_url)
    scheme = app.URL.getScheme(original_url)

    return {
      original: original_url
      replaced: original_url
        .replace(/// ^https?://\w+\.2ch\.net/ ///, "#{scheme}://*.2ch.net/")
      original_origin: original_url
        .replace(/// ^(https?://\w+\.2ch\.net)/.* ///, "$1")
      replaced_origin: "#{scheme}://*.2ch.net"
    }

  @set: (read_state) ->
    if not read_state? or
        typeof read_state isnt "object" or
        typeof read_state.url isnt "string" or
        not Number.isFinite(read_state.last) or
        not Number.isFinite(read_state.read) or
        not Number.isFinite(read_state.received)
      app.log("error", "app.ReadState.set: 引数が不正です", arguments)
      return Promise.reject()

    read_state = app.deepCopy(read_state)

    url = @_url_filter(read_state.url)
    read_state.url = url.replaced
    board_url = app.URL.threadToBoard(url.original)
    read_state.board_url = @_url_filter(board_url).replaced

    return @_openDB.then( (db) =>
      return new Promise( (resolve, reject) =>
        req = db
          .transaction("ReadState", "readwrite")
          .objectStore("ReadState")
          .put(read_state)
        req.onsuccess = (e) ->
          delete read_state.board_url
          read_state.url = read_state.url.replace(url.replaced, url.original)
          app.message.send("read_state_updated", {board_url, read_state})
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

    url = @_url_filter(url)

    return @_openDB.then( (db) =>
      new Promise( (resolve, reject) =>
        req = db
          .transaction("ReadState")
          .objectStore("ReadState")
          .get(url.replaced)
        req.onsuccess = (e) ->
          data = app.deepCopy(e.target.result)
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
        req.onsuccess = (e) ->
          resolve(e.target.result)
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

    url = @_url_filter(url)

    return @_openDB.then( (db) ->
      return new Promise( (resolve, reject) ->
        req = db
          .transaction("ReadState")
          .objectStore("ReadState")
          .index("board_url")
          .getAll(IDBKeyRange.only(url.replaced))
        req.onsuccess = (e) ->
          data = e.target.result
          for key, val of data
            data[key].url = val.url.replace(url.replaced_origin, url.original_origin)
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

    url = @_url_filter(url)

    return @_openDB.then( (db) ->
      return new Promise( (resolve, reject) ->
        req = db
          .transaction("ReadState", "readwrite")
          .objectStore("ReadState")
          .delete(url.replaced)
        req.onsuccess = (e) ->
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
        req.onsuccess = (e) ->
          resolve()
          return
        req.onerror = (e) ->
          app.log("error", "app.ReadState.clear: トランザクション中断")
          reject(e)
          return
        return
      )
    )
