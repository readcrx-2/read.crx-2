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
    return new Promise( (resolve, reject) =>
      if @_bbsmenu?
        resolve(@_bbsmenu)
      else
        app.BBSMenu.get (result) =>
          if result.data?
            @_bbsmenu = {}
            for category in result.data
              for board in category.board
                @_bbsmenu[board.url] = board.title
            resolve(@_bbsmenu)
          else
            reject()
          return
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
        url2 = app.url.changeScheme(url)
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
      url2 = app.url.changeScheme(url)
      bookmark = app.bookmark.get(url) ? app.bookmark.get(url2)
      if bookmark
        if app.url.tsld(bookmark.url) is "2ch.net"
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
      request = new app.HTTP.Request("GET", url + "SETTING.TXT", {
        mimeType: "text/plain; charset=Shift_JIS"
        timeout: 1000 * 10
      })
      request.send (response) ->
        if response.status is 200
          resolve(response.body)
        else
          reject(response.body)
        return
      return
    ).then( (text) ->
      return new Promise( (resolve, reject) ->
        if res = /^BBS_TITLE=(.+)$/m.exec(text)
          title = res[1].replace("＠2ch掲示板", "")
          tsld = app.url.tsld(url)
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
    scheme = app.url.getScheme(url)
    ajax_path = "#{scheme}://jbbs.shitaraba.net/bbs/api/setting.cgi/#{tmp[3]}/#{tmp[4]}/"

    return new Promise( (resolve, reject) ->
      request = new app.HTTP.Request("GET", ajax_path, {
        mimeType: "text/plain; charset=EUC-JP"
        timeout: 1000 * 10
      })
      request.send (response) ->
        if response.status is 200
          resolve(response.body)
        else
          reject(response.body)
        return
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
    url = app.url.fix(url)

    #bbsmenu内を検索
    return @searchFromBBSMenu(url)
      #ブックマーク内を検索
      .catch( =>
        return @searchFromBookmark(url)
      )
      #SETTING.TXTからの取得を試みる
      .catch( =>
        if app.url.guess_type(url).bbs_type is "2ch"
          return @searchFromSettingTXT(url)
        else
          return Promise.reject()
      )
      #したらばのAPIから取得を試みる
      .catch( =>
        if app.url.guess_type(url).bbs_type is"jbbs"
          return @searchFromJbbsAPI(url)
        else
          return Promise.reject()
      )

app.module "board_title_solver", [], (callback) ->
  app.BoardTitleSolver.getBBSMenu()
  callback(app.BoardTitleSolver)
  return
