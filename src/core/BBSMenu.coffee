###*
@namespace app
@class BBSMenu
@static
@requires app.Cache
@requires jQuery
###
class app.BBSMenu
  ###*
  @method get
  @param {Function} Callback
  @param {Boolean} [ForceReload=false]
  ###
  @get: (callback, forceReload = false) ->
    BBSMenu._callbacks.add(callback)
    unless BBSMenu._updating
      BBSMenu._update(forceReload)
    return

  ###*
  @method parse
  @param {String} html
  @return {Array}
  ###
  @parse: (html) ->
    reg_category = ///<b>(.+?)</b>(?:.*[\r\n]+<a\s.*?>.+?</a>)+///gi
    reg_board = ///<a\shref=(http://(?!info\.2ch\.net/|headline\.bbspink\.com)
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

  @_callbacks: $.Callbacks()
  @_updating: false
  @_update: (force_reload) ->
    BBSMenu._updating = true

    url = app.config.get("bbsmenu")
    #キャッシュ取得
    cache = new app.Cache(url)
    cache.get()
      .then(-> $.Deferred (d) ->
        if force_reload
          d.reject()
        else if Date.now() - cache.last_updated < 1000 * 60 * 60 * 12
          d.resolve()
        else
          d.reject()
        return
      )
      #通信
      .then(null, -> $.Deferred (d) ->
        ajax_data =
          url: url
          cache: false
          dataType: "text"
          headers: {}
          mimeType: "text/plain; charset=Shift_JIS"
          timeout: 1000 * 30
          complete: ($xhr) ->
            if $xhr.status is 200
              d.resolve($xhr)
            else if cache.data? and $xhr.status is 304
              d.resolve($xhr)
            else
              d.reject($xhr)
            return

        if cache.last_modified?
          ajax_data.headers["If-Modified-Since"] = new Date(cache.last_modified).toUTCString()

        if cache.etag?
          ajax_data.headers["If-None-Match"] = cache.etag

        $.ajax(ajax_data)
        return
      )
      #パース
      .then((fn = ($xhr) -> $.Deferred (d) ->
        if $xhr?.status is 200
          menu = BBSMenu.parse($xhr.responseText)
        else if cache.data?
          menu = BBSMenu.parse(cache.data)

        if menu?.length > 0
          if $xhr?.status is 200 or $xhr?.status is 304 or (not $xhr and cache.data?)
            d.resolve($xhr, menu)
          else
            d.reject($xhr, menu)
        else
          d.reject()
        return
      ), fn)
      #コールバック
      .done ($xhr, menu) ->
        BBSMenu._callbacks.fire(status: "success", data: menu)
        return
      .fail ($xhr, menu) ->
        message = "板一覧の取得に失敗しました。"
        if menu?
          message += "キャッシュに残っていたデータを表示します。"
          BBSMenu._callbacks.fire({status: "error", data: menu, message})
        else
          BBSMenu._callbacks.fire({status: "error", message})
        return
      .always ->
        BBSMenu._updating = false
        BBSMenu._callbacks.empty()
        return
      #キャッシュ更新
      .done ($xhr, menu) ->
        if $xhr?.status is 200
          last_modified = new Date(
            $xhr.getResponseHeader("Last-Modified") or "dummy"
          ).getTime()

          unless isNaN(last_modified)
            cache.data = $xhr.responseText
            cache.last_updated = Date.now()
            cache.last_modified = last_modified
            cache.put()
        else if cache.data? and $xhr?.status is 304
          cache.last_updated = Date.now()
          cache.put()
        return
    return

app.module "bbsmenu", [], (callback) ->
  callback(app.BBSMenu)
  return
