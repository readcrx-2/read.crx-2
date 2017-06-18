###*
@namespace app
@class BBSMenu
@static
@requires app.Cache
@requires jQuery
###
class app.BBSMenu
  ###*
  @property _forceReloadFlag
  @private
  @type Boolean
  ###
  @_forceReloadFlag: false

  ###*
  @property boardTableCallbacks
  @type Object|null
  ###
  @boardTableCallbacks = null

  ###*
  @method get
  @param {Function} Callback
  @param {Boolean} [ForceReload=false]
  ###
  @get: (callback, forceReload = false, otherUrl = null) ->
    BBSMenu._callbacks.add(callback)
    unless BBSMenu._updating
      BBSMenu._update(forceReload, otherUrl)
    return

  ###*
  @method parse
  @param {String} html
  @return {Array}
  ###
  @parse: (html) ->
    reg_category = ///<b>(.+?)</b>(?:.*[\r\n]+<a\s.*?>.+?</a>)+///gi
    reg_board = ///<a\shref=(https?://(?!info\.2ch\.net/|headline\.bbspink\.com)
      \w+\.(?:2ch\.net|machi\.to|open2ch\.net|2ch\.sc|bbspink\.com)/\w+/)(?:\s.*?)?>(.+?)</a>///gi

    menu = []

    while reg_category_res = reg_category.exec(html)
      category =
        title: reg_category_res[1]
        board: []

      while reg_board_res = reg_board.exec(reg_category_res[0])
        category.board.push
          url: reg_board_res[1]
          title: reg_board_res[2]

      if category.board.length > 0
        menu.push(category)

    menu

  @_callbacks: new app.Callbacks({persistent: true})
  @_updating: false
  @_update: (force_reload, otherUrl) ->
    BBSMenu._updating = true
    if force_reload and !@_forceReloadFlag
      @_forceReloadFlag = true

    if otherUrl
      url = otherUrl
      if @_forceReloadFlag
        force_reload = true
        @_forceReloadFlag = false
    else
      url = app.config.get("bbsmenu")
    #キャッシュ取得
    cache = new app.Cache(url)
    cache.get()
      .then( ->
        if force_reload
          return Promise.reject()
        else if Date.now() - cache.last_updated < 1000 * 86400 * +app.config.get("bbsmenu_update_interval")
          return Promise.resolve()
        return Promise.reject()
      )
      #通信
      .catch( ->
        return new Promise( (resolve, reject) ->
          request = new app.HTTP.Request("GET", url, {
            mimeType: "text/plain; charset=Shift_JIS"
          })

          if cache.last_modified?
            request.headers["If-Modified-Since"] = new Date(cache.last_modified).toUTCString()

          if cache.etag?
            request.headers["If-None-Match"] = cache.etag

          request.send (response) ->
            if response.status is 200
              resolve(response)
            else if cache.data? and response.status is 304
              resolve(response)
            else
              reject(response)
            return
          return
        )
      )
      #パース
      .then((fn = (response) ->
        return new Promise( (resolve, reject) ->
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
      ), fn)
      #コールバック
      .then ({response, menu}) ->
        BBSMenu._callbacks.call(status: "success", data: menu, url: url)
        return {response, menu}
      , ({response, menu}) ->
        message = "板一覧の取得に失敗しました。"
        if menu?
          message += "キャッシュに残っていたデータを表示します。"
          BBSMenu._callbacks.call({status: "error", data: menu, url: url, message})
        else
          BBSMenu._callbacks.call({status: "error", url: url, message})
        return {response, menu}
      .then (arg) ->
        BBSMenu._updating = false
        BBSMenu._callbacks.destroy()
        return arg
      #キャッシュ更新
      .then ({response, menu}) ->
        if response?.status is 200
          cache.data = response.body
          cache.last_updated = Date.now()

          last_modified = new Date(
            response.headers["Last-Modified"] or "dummy"
          ).getTime()

          if Number.isFinite(last_modified)
            cache.last_modified = last_modified
          cache.put()
        else if cache.data? and response?.status is 304
          cache.last_updated = Date.now()
          cache.put()
        return
    return

app.module "bbsmenu", [], (callback) ->
  callback(app.BBSMenu)
  return
