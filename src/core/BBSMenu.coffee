###*
@namespace app
@class BBSMenu
@static
@requires app.Cache
###
class app.BBSMenu
  @target: $__("div")
  @serverInfoTriggered: false

  ###*
  @method triggerCreatedServerInfo
  ###
  @triggerCreatedServerInfo: ->
    BBSMenu.triggeredServerInfo = true
    BBSMenu.target.dispatchEvent(new Event("serverinfo-created"))
    return

  ###*
  @method fetch
  @param {String} url
  @param {Boolean} [force=false]
  ###
  @fetch: (url, force) ->
    #キャッシュ取得
    cache = new app.Cache(url)
    promise = new Promise( (resolve, reject) ->
      try
        await cache.get()
        if force
          throw new Error("最新のものを取得するために通信します")
        if Date.now() - cache.lastUpdated > +app.config.get("bbsmenu_update_interval")*1000*60*60*24
          throw new Error("キャッシュが期限切れなので通信します")
      catch
        #通信
        request = new app.HTTP.Request("GET", url,
          mimeType: "text/plain; charset=Shift_JIS"
        )
        if cache.lastModified?
          request.headers["If-Modified-Since"] = new Date(cache.lastModified).toUTCString()

        if cache.etag?
          request.headers["If-None-Match"] = cache.etag
        response = await request.send()

      if response?.status is 200
        menu = BBSMenu.parse(response.body)
      else if cache.data?
        menu = BBSMenu.parse(cache.data)

      if menu?.length > 0
        if response?.status is 200 or response?.status is 304 or (not response and cache.data?)
          resolve({response, menu})
        else
          reject({response, menu})
      else
        reject({response})
      return
    )
    promise.catch(-> return).then( ({response, menu}) ->
      #キャッシュ更新
      if response?.status is 200
        cache.data = response.body
        cache.lastUpdated = Date.now()

        lastModified = new Date(
          response.headers["Last-Modified"] or "dummy"
        ).getTime()

        if Number.isFinite(lastModified)
          cache.lastModified = lastModified
        cache.put()
      else if cache.data? and response?.status is 304
        cache.lastUpdated = Date.now()
        cache.put()
      return
    )
    return promise

  ###*
  @method get
  @param {Function} Callback
  @param {Boolean} [ForceReload=false]
  ###
  @get: (forceReload = false) ->
    BBSMenu._updatingPromise = BBSMenu._update(forceReload) unless BBSMenu._updatingPromise?
    try
      {menu} = await BBSMenu._updatingPromise
      BBSMenu.target.dispatchEvent(new CustomEvent("change", detail: {status: "success", menu}))
    catch {menu, message}
      BBSMenu.target.dispatchEvent(new CustomEvent("change", detail: {status: "error", menu, message}))
      throw {menu, message}
    return {menu}

  ###*
  @method parse
  @param {String} html
  @return {Array}
  ###
  @parse: (html) ->
    regCategory = ///<b>(.+?)</b>(?:.*[\r\n]+<a\s.*?>.+?</a>)+///gi
    regBoard = ///<a\shref=(https?://(?!info\.[25]ch\.net/|headline\.bbspink\.com)
      \w+\.(?:[25]ch\.net|machi\.to|open2ch\.net|2ch\.sc|bbspink\.com)/\w+/)(?:\s.*?)?>(.+?)</a>///gi
    menu = []

    while regCategoryRes = regCategory.exec(html)
      category =
        title: regCategoryRes[1]
        board: []

      while regBoardRes = regBoard.exec(regCategoryRes[0])
        category.board.push(
          url: regBoardRes[1]
          title: regBoardRes[2]
        )

      if category.board.length > 0
        menu.push(category)
    return menu

  @_updatingPromise: null
  @_update: (forceReload) ->
    try
      {menu} = await BBSMenu.fetch(app.config.get("bbsmenu"), forceReload)
    catch {menu}
      message = "板一覧の取得に失敗しました。"
      if menu?
        message += "キャッシュに残っていたデータを表示します。"
        throw new Error({menu, message})
      else
        throw new Error({message})
    return {menu}

app.module("bbsmenu", [], (callback) ->
  callback(app.BBSMenu)
  return
)
