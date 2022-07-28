import {indexedDBRequestToPromise} from "./util.coffee"
import {isHttps} from "./URL.ts"

###*
@class WriteHistory
@static
###
DB_VERSION = 2

_openDB = ->
  return new Promise( (resolve, reject) =>
    req = indexedDB.open("WriteHistory", DB_VERSION)
    req.onerror = reject
    req.onupgradeneeded = ({ target: {result: db, transaction: tx}, oldVersion: oldVer }) =>
      if oldVer < 1
        objStore = db.createObjectStore("WriteHistory", keyPath: "id", autoIncrement: true)
        objStore.createIndex("url", "url", unique: false)
        objStore.createIndex("res", "res", unique: false)
        objStore.createIndex("title", "title", unique: false)
        objStore.createIndex("date", "date", unique: false)
        tx.oncomplete = ->
          resolve(db)
          return
      if oldVer is 1
        _recoveryOfDate(db, tx)
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
export add = ({url, res, title, name, mail, inputName = null, inputMail = null, message, date}) ->
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
    db = await _openDB()
    req = db
      .transaction("WriteHistory", "readwrite")
      .objectStore("WriteHistory")
      .add({
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
    await indexedDBRequestToPromise(req)
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
export remove = (url, res) ->
  if app.assertArg("WriteHistory.remove", [
    [url, "string"]
    [res, "number"]
  ])
    return Promise.reject()

  try
    db = await _openDB()
    store = db
      .transaction("WriteHistory", "readwrite")
      .objectStore("WriteHistory")
    req = store
      .index("url")
      .getAll(IDBKeyRange.only(url))
    { target: { result: data } } = await indexedDBRequestToPromise(req)

    await Promise.all(data.map( (datum) ->
      if datum.res is res
        req = store.delete(datum.id)
        await indexedDBRequestToPromise(req)
      return
    ))
  catch e
    app.log("error", "WriteHistory.remove: トランザクション中断")
    throw new Error(e)
  return

###*
@method get
@param {Number} offset
@param {Number} limit
@return {Promise}
###
export get = (offset = -1, limit = -1) ->
  if app.assertArg("WriteHistory.get", [
    [offset, "number"],
    [limit, "number"]
  ])
    return Promise.reject()

  return _openDB().then( (db) ->
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
          value.isHttps = isHttps(value.url)
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
export getByUrl = (url) ->
  if app.assertArg("WriteHistory.getByUrl", [[url, "string"]])
    throw new Error("書込履歴を取得しようとしたデータが不正です")

  try
    db = await _openDB()
    req = db
      .transaction("WriteHistory")
      .objectStore("WriteHistory")
      .index("url")
      .getAll(IDBKeyRange.only(url))
    res = await indexedDBRequestToPromise(req)
  catch e
    app.log("error", "WriteHistory.remove: トランザクション中断")
    throw new Error(e)
  return res.target.result

###*
@method getAll
@return {Promise}
###
export getAll = ->
  try
    db = await _openDB()
    req = db
      .transaction("WriteHistory")
      .objectStore("WriteHistory")
      .getAll()
    res = await indexedDBRequestToPromise(req)
  catch e
    app.log("error", "WriteHistory.getAll: トランザクション中断")
    throw new Error(e)
  return res.target.result

###*
@method count
@return {Promise}
###
export count = ->
  try
    db = await _openDB()
    req = db
      .transaction("WriteHistory")
      .objectStore("WriteHistory")
      .count()
    res = await indexedDBRequestToPromise(req)
  catch e
    app.log("error", "WriteHistory.count: トランザクション中断")
    throw new Error(e)
  return res.target.result

###*
@method clear
@param {Number} offset
@return {Promise}
###
export clear = (offset = -1) ->
  if app.assertArg("WriteHistory.clear", [[offset, "number"]])
    return Promise.reject()

  return _openDB().then( (db) ->
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
export clearRange = (day) ->
  if app.assertArg("WriteHistory.clearRange", [[day, "number"]])
    return Promise.reject()

  dayUnix = Date.now() - day*24*60*60*1000
  try
    db = await _openDB()
    store = db
      .transaction("WriteHistory", "readwrite")
      .objectStore("WriteHistory")
    req = store
      .index("date")
      .getAllKeys(IDBKeyRange.upperBound(dayUnix, true))
    { target: { result: keys } } = await indexedDBRequestToPromise(req)

    await Promise.all(keys.map( (key) ->
      req = store.delete(key)
      await indexedDBRequestToPromise(req)
      return
    ))
  catch
    app.log("error", "WriteHistory.clearRange: トランザクション中断")
    throw new Error(e)
  return

###*
@method recoveryOfDate
@param {Object} db
@param {Object} tx
@return {Promise}
@private
###
_recoveryOfDate = (db, tx) ->
  return new Promise( (resolve, reject) ->
    unixTime201710 = 1506783600 # 2017/10/01 0:00:00
    req = tx
      .objectStore("WriteHistory")
      .index("date")
      .openCursor(IDBKeyRange.lowerBound(unixTime201710, true))
    req.onsuccess = ({ target: {result: cursor} }) ->
      if cursor
        if cursor.value.res > 1
          date = new Date(+cursor.value.date)
          date.setMonth(date.getMonth()-1)
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
