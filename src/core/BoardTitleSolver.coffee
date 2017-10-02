###*
@namespace app
@class BoardTitleSolver
@static
@require app.BBSMenu
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
    return new Promise( (resolve, reject) =>
      if @_bbsmenu?
        resolve(@_bbsmenu)
        return

      app.BBSMenu.get( ({data}) =>
        unless data?
          reject()
          return

        @_bbsmenu = {}
        for {board} in data
          for {url, title} in board
            @_bbsmenu[url] = title
        resolve(@_bbsmenu)
        return
      )
      return
    )

  ###*
  @method searchFromBBSMenu
  @param {String} url
  @return {Promise}
  ###
  @searchFromBBSMenu: (url) ->
    bbsmenu = await @getBBSMenu()
    # スキーム違いについても確認をする
    url2 = app.URL.changeScheme(url)
    if bbsmenu[url]?
      return bbsmenu[url]
    if bbsmenu[url2]?
      return bbsmenu[url2]
    throw new Error("板一覧にその板は存在しません")
    return

  ###*
  @method searchFromBookmark
  @param {String} url
  @return {Promise}
  ###
  @searchFromBookmark: (url) ->
    # スキーム違いについても確認をする
    url2 = app.URL.changeScheme(url)
    bookmark = app.bookmark.get(url) ? app.bookmark.get(url2)
    if bookmark
      if app.URL.tsld(bookmark.url) is "2ch.net"
        return bookmark.title.replace("＠2ch掲示板", "")
      return bookmark.title
    throw new Error("ブックマークにその板は存在しません")
    return

  ###*
  @method searchFromSettingTXT
  @param {String} url
  @return {Promise}
  ###
  @searchFromSettingTXT: (url) ->
    {status, body} = await new app.HTTP.Request("GET", "#{url}SETTING.TXT",
      mimeType: "text/plain; charset=Shift_JIS"
      timeout: 1000 * 10
    ).send()
    if status isnt 200
      throw new Error("SETTING.TXTを取得する通信に失敗しました")
    if res = /^BBS_TITLE_ORIG=(.+)$/m.exec(body)
      title = res[1].replace("＠2ch掲示板", "")
      switch app.URL.tsld(url)
        when "2ch.sc" then title += "_sc"
        when "open2ch.net" then title += "_op"
      return title
    if res = /^BBS_TITLE=(.+)$/m.exec(body)
      title = res[1].replace("＠2ch掲示板", "")
      switch app.URL.tsld(url)
        when "2ch.sc" then title += "_sc"
        when "open2ch.net" then title += "_op"
      return title
    throw new Error("SETTING.TXTに名前の情報がありません")
    return

  ###*
  @method searchFromJbbsAPI
  @param {String} url
  @return {Promise}
  ###
  @searchFromJbbsAPI: (url) ->
    tmp = url.split("/")
    scheme = app.URL.getScheme(url)
    ajaxPath = "#{scheme}://jbbs.shitaraba.net/bbs/api/setting.cgi/#{tmp[3]}/#{tmp[4]}/"

    {status, body} = await new app.HTTP.Request("GET", ajaxPath,
      mimeType: "text/plain; charset=EUC-JP"
      timeout: 1000 * 10
    ).send()
    if status isnt 200
      throw new Error("したらばの板のAPIの通信に失敗しました")
    if res = /^BBS_TITLE=(.+)$/m.exec(body)
      return res[1]
    throw new Error("したらばの板のAPIに名前の情報がありません")
    return

  ###*
  @method ask
  @param {String} url
  @return Promise
  ###
  @ask: (url) ->
    url = app.URL.fix(url)

    try
      #bbsmenu内を検索
      return await @searchFromBBSMenu(url)
    try
      #ブックマーク内を検索
      return await @searchFromBookmark(url)
    try
      #SETTING.TXTからの取得を試みる
      if app.URL.guessType(url).bbsType is "2ch"
        return await @searchFromSettingTXT(url)
    try
      #したらばのAPIから取得を試みる
      if app.URL.guessType(url).bbsType is"jbbs"
        return await @searchFromJbbsAPI(url)
    throw new Error("板名の取得に失敗しました")
    return

app.module("board_title_solver", [], (callback) ->
  app.BoardTitleSolver.getBBSMenu()
  callback(app.BoardTitleSolver)
  return
)
