import {indexedDBRequestToPromise} from "./util.coffee"
import {fix as fixUrl, threadToBoard} from "./URL.ts"

###*
@class ReadState
@static
###

_openDB = new Promise( (resolve, reject) ->
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

_urlFilter = (originalUrl) ->
  originalUrl = fixUrl(originalUrl)

  return {
    original: originalUrl
    replaced: originalUrl
      .replace(/// ^(https?)://\w+\.5ch\.net/ ///, "$1://*.5ch.net/")
    originalOrigin: originalUrl
      .replace(/// ^(https?://\w+\.5ch\.net)/.* ///, "$1")
    replacedOrigin: originalUrl
      .replace(/// ^(https?)://\w+\.5ch\.net/.* ///, "$1://*.5ch.net")
  }

export set = (readState) ->
  if (
    not readState? or
    typeof readState isnt "object"
  )
    app.log("error", "app.ReadState.set: 引数が不正です", arguments)
    throw new Error("既読情報に登録しようとしたデータが不正です")
  if (
    app.assertArg("app.ReadState.set", [
      [readState.url, "string"]
      [readState.last, "number"]
      [readState.read, "number"]
      [readState.received, "number"]
      [readState.offset, "number", true]
    ])
  )
    throw new Error("既読情報に登録しようとしたデータが不正です")

  readState = app.deepCopy(readState)

  url = _urlFilter(readState.url)
  readState.url = url.replaced
  boardUrl = threadToBoard(url.original)
  readState.board_url = _urlFilter(boardUrl).replaced

  try
    db = await _openDB
    req = db
      .transaction("ReadState", "readwrite")
      .objectStore("ReadState")
      .put(readState)
    await indexedDBRequestToPromise(req)
    delete readState.board_url
    readState.url = readState.url.replace(url.replaced, url.original)
    app.message.send("read_state_updated", {board_url: boardUrl, read_state: readState})
  catch e
    app.log("error", "app.ReadState.set: トランザクション失敗")
    throw new Error(e)
  return

export get = (url) ->
  if app.assertArg("app.read_state.get", [[url, "string"]])
    throw new Error("既読情報を取得しようとしたデータが不正です")

  url = _urlFilter(url)

  try
    db = await _openDB
    req = db
      .transaction("ReadState")
      .objectStore("ReadState")
      .get(url.replaced)
    { target: {result} } = await indexedDBRequestToPromise(req)
    data = app.deepCopy(result)
    data.url = url.original if data?
  catch e
    app.log("error", "app.ReadState.get: トランザクション中断")
    throw new Error(e)
  return data

export getAll = ->
  try
    db = await _openDB
    req = db
      .transaction("ReadState")
      .objectStore("ReadState")
      .getAll()
    res = await indexedDBRequestToPromise(req)
  catch e
    app.log("error", "app.ReadState.getAll: トランザクション中断")
    throw new Error(e)
  return res.target.result

export getByBoard = (url) ->
  if app.assertArg("app.ReadState.getByBoard", [[url, "string"]])
    throw new Error("既読情報を取得しようとしたデータが不正です")

  url = _urlFilter(url)

  try
    db = await _openDB
    req = db
      .transaction("ReadState")
      .objectStore("ReadState")
      .index("board_url")
      .getAll(IDBKeyRange.only(url.replaced))
    { target: {result: data} } = await indexedDBRequestToPromise(req)
    for key, val of data
      data[key].url = val.url.replace(url.replacedOrigin, url.originalOrigin)
  catch e
    app.log("error", "app.ReadState.getByBoard: トランザクション中断")
    throw new Error(e)
  return data

export remove = (url) ->
  if app.assertArg("app.ReadState.remove", [[url, "string"]])
    throw new Error("既読情報を削除しようとしたデータが不正です")

  url = _urlFilter(url)

  try
    db = await _openDB
    req = db
      .transaction("ReadState", "readwrite")
      .objectStore("ReadState")
      .delete(url.replaced)
    await indexedDBRequestToPromise(req)
    app.message.send("read_state_removed", url: url.original)
  catch e
    app.log("error", "app.ReadState.remove: トランザクション中断")
    throw new Error(e)
  return

export clear = ->
  try
    db = await _openDB
    req = db
      .transaction("ReadState", "readwrite")
      .objectStore("ReadState")
      .clear()
    await indexedDBRequestToPromise(req)
  catch e
    app.log("error", "app.ReadState.clear: トランザクション中断")
    throw new Error(e)
  return
