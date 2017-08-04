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
    return @getBBSMenu().then( (bbsmenu) ->
      return new Promise( (resolve, reject) ->
        # スキーム違いについても確認をする
        url2 = app.URL.changeScheme(url)
        if bbsmenu[url]?
          resolve(bbsmenu[url])
        else if bbsmenu[url2]?
          resolve(bbsmenu[url2])
        else
          reject()
        return
      )
      return
    )

  ###*
  @method searchFromBookmark
  @param {String} url
  @return {Promise}
  ###
  @searchFromBookmark: (url) ->
    return new Promise( (resolve, reject) ->
      # スキーム違いについても確認をする
      url2 = app.URL.changeScheme(url)
      bookmark = app.bookmark.get(url) ? app.bookmark.get(url2)
      if bookmark
        if app.URL.tsld(bookmark.url) is "2ch.net"
          resolve(bookmark.title.replace("＠2ch掲示板", ""))
        else
          resolve(bookmark.title)
      else
        reject()
      return
    )

  ###*
  @method searchFromSettingTXT
  @param {String} url
  @return {Promise}
  ###
  @searchFromSettingTXT: (url) ->
    return new Promise( (resolve, reject) ->
      request = new app.HTTP.Request("GET", "#{url}SETTING.TXT",
        mimeType: "text/plain; charset=Shift_JIS"
        timeout: 1000 * 10
      )
      request.send( (response) ->
        if response.status is 200
          resolve(response.body)
        else
          reject(response.body)
        return
      )
      return
    ).then( (text) ->
      return new Promise( (resolve, reject) ->
        if res = /^BBS_TITLE=(.+)$/m.exec(text)
          title = res[1].replace("＠2ch掲示板", "")
          tsld = app.URL.tsld(url)
          if tsld is "2ch.sc"
            title += "_sc"
          else if tsld is "open2ch.net"
            title += "_op"
          resolve(title)
        else
          reject()
        return
      )
    , ->
      Promise.reject()
      return
    )

  ###*
  @method searchFromJbbsAPI
  @param {String} url
  @return {Promise}
  ###
  @searchFromJbbsAPI: (url) ->
    tmp = url.split("/")
    scheme = app.URL.getScheme(url)
    ajaxPath = "#{scheme}://jbbs.shitaraba.net/bbs/api/setting.cgi/#{tmp[3]}/#{tmp[4]}/"

    return new Promise( (resolve, reject) ->
      request = new app.HTTP.Request("GET", ajaxPath,
        mimeType: "text/plain; charset=EUC-JP"
        timeout: 1000 * 10
      )
      request.send( (response) ->
        if response.status is 200
          resolve(response.body)
          return
        reject(response.body)
        return
      )
      return
    ).then( (text) ->
      return new Promise( (resolve, reject) ->
        if res = /^BBS_TITLE=(.+)$/m.exec(text)
          resolve(res[1])
        else
          reject()
        return
      )
    , ->
      Promise.reject()
      return
    )

  ###*
  @method ask
  @param {String} url
  @return Promise
  ###
  @ask: (url) ->
    url = app.URL.fix(url)

    #bbsmenu内を検索
    return @searchFromBBSMenu(url)
      .catch( =>
        #ブックマーク内を検索
        return @searchFromBookmark(url)
      ).catch( =>
        #SETTING.TXTからの取得を試みる
        if app.URL.guessType(url).bbsType is "2ch"
          return @searchFromSettingTXT(url)
        else
          return Promise.reject()
      ).catch( =>
        #したらばのAPIから取得を試みる
        if app.URL.guessType(url).bbsType is"jbbs"
          return @searchFromJbbsAPI(url)
        else
          return Promise.reject()
      )

app.module("board_title_solver", [], (callback) ->
  app.BoardTitleSolver.getBBSMenu()
  callback(app.BoardTitleSolver)
  return
)
