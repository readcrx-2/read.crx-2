###*
@namespace app
@class BoardTitleSolver
@static
@require app.BBSMenu
@require jQuery
###
class app.BoardTitleSolver
  ###*
  @property _bbsmenu
  @private
  @type Object | null
  ###
  @_bbsmenu: null

  ###*
  @method getBBSMenu
  @return {Promise}
  ###
  @getBBSMenu: ->
    $.Deferred((d) =>
      if @_bbsmenu?
        d.resolve(@_bbsmenu)
      else
        app.BBSMenu.get (result) =>
          if result.data?
            @_bbsmenu = {}
            for category in result.data
              for board in category.board
                @_bbsmenu[board.url] = board.title
            d.resolve(@_bbsmenu)
          else
            d.reject()
          return
      return
    )
    .promise()

  ###*
  @method searchFromBBSMenu
  @param {String} url
  @return {Promise}
  ###
  @searchFromBBSMenu: (url) ->
    @getBBSMenu().then((bbsmenu) => $.Deferred (d) =>
      if bbsmenu[url]?
        d.resolve(bbsmenu[url])
      else
        d.reject()
      return
    )
    .promise()

  ###*
  @method searchFromBookmark
  @param {String} url
  @return {Promise}
  ###
  @searchFromBookmark: (url) ->
    $.Deferred((d) ->
      if bookmark = app.bookmark.get(url)
        if app.url.tsld(bookmark.url) is "2ch.net"
          d.resolve(bookmark.title.replace("＠2ch掲示板", ""))
        else
          d.resolve(bookmark.title)
      else
        d.reject()
      return
    )
    .promise()

  ###*
  @method searchFromSettingTXT
  @param {String} url
  @return {Promise}
  ###
  @searchFromSettingTXT: (url) ->
    $.ajax(url + "SETTING.TXT", {
      dataType: "text"
      timeout: 1000 * 10
      beforeSend: (jqxhr) ->
        jqxhr.overrideMimeType("text/plain; charset=Shift_JIS")
        return
    })
    .then(
      (text) ->
        $.Deferred (d) ->
          if res = /^BBS_TITLE=(.+)$/m.exec(text)
            title = res[1].replace("＠2ch掲示板", "")
            if app.url.tsld(url) is "2ch.sc"
              title += "_sc"
            if app.url.tsld(url) is "open2ch.net"
              title += "_op"
            d.resolve(title)
          else
            d.reject()
          return
      ->
        $.Deferred().reject()
    )
    .promise()

  ###*
  @method searchFromJbbsAPI
  @param {String} url
  @return {Promise}
  ###
  @searchFromJbbsAPI: (url) ->
    tmp = url.split("/")
    ajax_path = "http://jbbs.shitaraba.net/bbs/api/setting.cgi/#{tmp[3]}/#{tmp[4]}/"

    $.ajax(ajax_path, {
      dataType: "text"
      timeout: 1000 * 10
      beforeSend: (jqxhr) ->
        jqxhr.overrideMimeType("text/plain; charset=EUC-JP")
        return
    })
    .then(
      (text) ->
        $.Deferred (d) ->
          if res = /^BBS_TITLE=(.+)$/m.exec(text)
            d.resolve(res[1])
          else
            d.reject()
          return
      ->
        $.Deferred().reject()
    )
    .promise()

  ###*
  @method ask
  @param {Object} prop
    @param {String} prop.url
  @return Promise
  ###
  @ask: (prop) ->
    url = app.url.fix(prop.url)

    #bbsmenu内を検索
    @searchFromBBSMenu(url)
      #ブックマーク内を検索
      .then(null, => @searchFromBookmark(url))
      #SETTING.TXTからの取得を試みる
      .then(null, =>
        if app.url.guess_type(url).bbs_type is "2ch"
          @searchFromSettingTXT(url)
      )
      #したらばのAPIから取得を試みる
      .then(null, =>
        if app.url.guess_type(url).bbs_type is"jbbs"
          @searchFromJbbsAPI(url)
      )
      .promise()

app.module "board_title_solver", [], (callback) ->
  app.BoardTitleSolver.getBBSMenu()
  callback(app.BoardTitleSolver)
  return
