import Cache from "./Cache.coffee"
import {Request} from "./HTTP.ts"
import {fix as fixUrl} from "./URL.ts"

bbsmenuOption = null

export target = $__("div")

###*
@method fetchAll
@param {Boolean} [forceReload=false]
###
export fetchAll = (forceReload = false) ->
  bbsmenu = []

  if !bbsmenuOption or forceReload
    unless bbsmenuOption
      bbsmenuOption = new Set()
    else
      bbsmenuOption.clear()
    tmpOpt = app.config.get("bbsmenu_option").split("\n")
    for opt in tmpOpt
      continue if opt is "" or opt.startsWith("//")
      bbsmenuOption.add(opt)

  bbsmenuUrl = app.config.get("bbsmenu").split("\n")
  for url in bbsmenuUrl
    continue if url is "" or url.startsWith("//")
    try
      {menu} = await fetch(url, forceReload)
      bbsmenu.push(menu...)
    catch
      app.message.send("notify",
        message: "板一覧の取得に失敗しました。(#{url})"
        background_color: "red"
      )

  return {menu: bbsmenu}

###*
@method fetch
@param {String} url
@param {Boolean} [force=false]
###
export fetch = (url, force) ->
  #キャッシュ取得
  cache = new Cache(url)

  try
    await cache.get()
    if force
      throw new Error("最新のものを取得するために通信します")
    if Date.now() - cache.lastUpdated > +app.config.get("bbsmenu_update_interval")*1000*60*60*24
      throw new Error("キャッシュが期限切れなので通信します")
  catch
    #通信
    request = new Request("GET", url,
      mimeType: "text/plain; charset=Shift_JIS"
    )
    if cache.lastModified?
      request.headers["If-Modified-Since"] = new Date(cache.lastModified).toUTCString()

    if cache.etag?
      request.headers["If-None-Match"] = cache.etag
    response = await request.send()

  if response?.status is 200
    menu = parse(response.body)

    #キャッシュ更新
    cache.data = response.body
    cache.lastUpdated = Date.now()

    lastModified = new Date(
      response.headers["Last-Modified"] or "dummy"
    ).getTime()

    if Number.isFinite(lastModified)
      cache.lastModified = lastModified
    cache.put()

  else if cache.data?
    menu = parse(cache.data)

    #キャッシュ更新
    if response?.status is 304
      cache.lastUpdated = Date.now()
      cache.put()

  unless menu?.length > 0
    throw {response}

  unless response?.status is 200 or response?.status is 304 or (not response and cache.data?)
    throw {response, menu}

  return {response, menu}

###*
@method get
@param {Function} Callback
@param {Boolean} [ForceReload=false]
###
export get = (forceReload = false) ->
  _updatingPromise = _update(forceReload) unless _updatingPromise?
  try
    obj = await _updatingPromise
    obj.status = "success"
    if forceReload
      target.emit(new CustomEvent("change", detail: obj))
  catch obj
    obj.status = "error"
    if forceReload
      target.emit(new CustomEvent("change", detail: obj))
  return obj

###*
@method parse
@param {String} html
@return {Array}
###
parse = (html) ->
  regCategory = ///<b>(.+?)</b>(?:.*[\r\n]+<a\s.*?>.+?</a>)+///gi
  regBoard = ///<a\shref=(https?://(?!info\.[25]ch\.net/|headline\.bbspink\.com)
    (?:\w+\.(?:[25]ch\.net|open2ch\.net|2ch\.sc|bbspink\.com)|(?:\w+\.)?machi\.to)/\w+/)(?:\s.*?)?>(.+?)</a>///gi
  menu = []
  bbspinkException = bbsmenuOption.has("bbspink.com")

  while regCategoryRes = regCategory.exec(html)
    category =
      title: regCategoryRes[1]
      board: []

    subName = null
    while regBoardRes = regBoard.exec(regCategoryRes[0])
      continue if bbsmenuOption.has(app.URL.tsld(regBoardRes[1]))
      continue if bbspinkException and regBoardRes[1].includes("5ch.net/bbypink")
      unless subName
        if regBoardRes[1].includes("open2ch.net")
          subName = "op"
        else if regBoardRes[1].includes("2ch.sc")
          subName = "sc"
        else
          subName = ""
        if (
          subName isnt "" and
          !(category.title.endsWith("(#{subName})") or
            category.title.endsWith("_#{subName}"))
        )
          category.title += "(#{subName})"
      if (
        subName isnt "" and
        !(regBoardRes[2].endsWith("(#{subName})") or
          regBoardRes[2].endsWith("_#{subName}"))
      )
        regBoardRes[2] += "_#{subName}"
      category.board.push(
        url: fixUrl(regBoardRes[1])
        title: regBoardRes[2]
      )

    if category.board.length > 0
      menu.push(category)
  return menu

_updatingPromise = null
_update = (forceReload) ->
  {menu} = await fetchAll(forceReload)
  _updatingPromise = null
  return {menu}
