###*
@namespace app
@class Board
@constructor
@param {String} url
@requires app.Cache
@requires app.NG
###
class app.Board
  constructor: (@url) ->
    ###*
    @property thread
    @type Array | null
    ###
    @thread = null

    ###*
    @property message
    @type String | null
    ###
    @message = null
    return

  ###*
  @method get
  @return {Promise}
  ###
  get: ->
    return new Promise( (resolve, reject) =>
      tmp = Board._getXhrInfo(@url)
      unless tmp
        reject()
        return
      {path: xhrPath, charset: xhrCharset} = tmp

      hasCache = false

      #キャッシュ取得
      cache = new app.Cache(xhrPath)
      cache.get().then( ->
        return new Promise( (resolve, reject) ->
          hasCache = true
          if Date.now() - cache.last_updated < 1000 * 3
            resolve()
          else
            reject()
          return
        )
      ).catch( =>
        #通信
        request = new app.HTTP.Request("GET", xhrPath,
          mimeType: "text/plain; charset=#{xhrCharset}"
        )
        if hasCache
          if cache.last_modified?
            request.headers["If-Modified-Since"] =
              new Date(cache.last_modified).toUTCString()
          if cache.etag?
            request.headers["If-None-Match"] = cache.etag

        return request.send()
      ).then(fn = (response) =>
        #パース
        return new Promise( (resolve, reject) =>
          if response?.status is 200
            threadList = Board.parse(@url, response.body)
          else if hasCache
            threadList = Board.parse(@url, cache.data)

          if threadList?
            if response?.status is 200 or response?.status is 304 or (not response? and hasCache)
              resolve({response, threadList})
            else
              reject({response, threadList})
          else
            reject({response})
          return
        )
      , fn).then( ({response, threadList}) =>
        #コールバック
        @thread = threadList
        resolve()
        return {response, threadList}
      , ({response, threadList}) =>
        @message = "板の読み込みに失敗しました。"

        #2chでrejectされている場合は移転を疑う
        if app.URL.tsld(@url) is "2ch.net" and response?
          app.util.chServerMoveDetect(@url)
            #移転検出時
            .then( (newBoardUrl) =>
              @message += """
              サーバーが移転している可能性が有ります
              (<a href="#{app.escapeHtml(app.safeHref(newBoardUrl))}"
              class="open_in_rcrx">#{app.escapeHtml(newBoardUrl)}
              </a>)
              """
            ).catch( ->
              return
            ).then( =>
              if hasCache and threadList?
                @message += "キャッシュに残っていたデータを表示します。"

              if threadList
                @thread = threadList
              reject()
            )
        else
          if hasCache and threadList?
            @message += "キャッシュに残っていたデータを表示します。"

          if thread_list?
            @thread = threadList
          reject()
        return Promise.reject({response, threadList})
      ).then( ({response, threadList}) ->
        #キャッシュ更新部
        if response?.status is 200
          cache.data = response.body
          cache.last_updated = Date.now()

          lastModified = new Date(
            response.headers["Last-Modified"] or "dummy"
          ).getTime()

          if Number.isFinite(lastModified)
            cache.last_modified = lastModified

          if etag = response.headers["ETag"]
            cache.etag = etag

          cache.put()

          for thread in threadList
            app.bookmark.update_res_count(thread.url, thread.resCount)

        else if hasCache and response?.status is 304
          cache.last_updated = Date.now()
          cache.put()
        return {response, threadList}
      ).then( ({response, threadList}) =>
        #dat落ちスキャン
        return unless threadList
        dict = {}
        for bookmark in app.bookmark.get_by_board(@url) when bookmark.type is "thread"
          dict[bookmark.url] = true

        for thread in threadList when dict[thread.url]?
          dict[thread.url] = false
          app.bookmark.update_expired(thread.url, false)

        for threadUrl, val of dict when val
          app.bookmark.update_expired(threadUrl, true)
        return
      ).catch( ->
        return
      )
    )

  ###*
  @method get
  @static
  @param {String} url
  @return {Promise}
  ###
  @get: (url) ->
    return new Promise( (resolve, reject) ->
      board = new app.Board(url)
      board.get().then( ->
        resolve(status: "success", data: board.thread)
        return
      , ->
        resolve(
          status: "error"
          message: board.message ? null
          data: board.thread ? null
        )
        return
      )
    )

  ###*
  @method _getXhrInfo
  @private
  @static
  @param {String} boardUrl
  @return {Object | null} xhrInfo
  ###
  @_getXhrInfo: (boardUrl) ->
    tmp = ///^(https?)://((?:\w+\.)?(\w+\.\w+))/(\w+)/(?:(\d+)/)?$///.exec(boardUrl)
    return null unless tmp
    return switch tmp[3]
      when "machi.to"
        path: "#{tmp[1]}://#{tmp[2]}/bbs/offlaw.cgi/#{tmp[4]}/"
        charset: "Shift_JIS"
      when "livedoor.jp", "shitaraba.net"
        path: "#{tmp[1]}://jbbs.shitaraba.net/#{tmp[4]}/#{tmp[5]}/subject.txt"
        charset: "EUC-JP"
      else
        path: "#{tmp[1]}://#{tmp[2]}/#{tmp[4]}/subject.txt"
        charset: "Shift_JIS"

  ###*
  @method parse
  @static
  @param {String} url
  @param {String} text
  @return {Array | null} board
  ###
  @parse: (url, text) ->
    tmp = /^(https?):\/\/((?:\w+\.)?(\w+\.\w+))\/(\w+)\/(\w+)?/.exec(url)
    scFlg = false
    switch tmp[3]
      when "machi.to"
        bbsType = "machi"
        reg = /^\d+<>(\d+)<>(.+)\((\d+)\)$/gm
        baseUrl = "#{tmp[1]}://#{tmp[2]}/bbs/read.cgi/#{tmp[4]}/"
      when "shitaraba.net"
        bbsType = "jbbs"
        reg = /^(\d+)\.cgi,(.+)\((\d+)\)$/gm
        baseUrl = "#{tmp[1]}://jbbs.shitaraba.net/bbs/read.cgi/#{tmp[4]}/#{tmp[5]}/"
      else
        scFlg = (tmp[3] is "2ch.sc")
        bbsType = "2ch"
        reg = /^(\d+)\.dat<>(.+) \((\d+)\)$/gm
        baseUrl = "#{tmp[1]}://#{tmp[2]}/test/read.cgi/#{tmp[4]}/"

    board = []
    while (regRes = reg.exec(text))
      title = app.util.decodeCharReference(regRes[2])
      title = app.util.removeNeedlessFromTitle(title)

      board.push(
        url: baseUrl + regRes[1] + "/"
        title: title
        resCount: +regRes[3]
        createdAt: +regRes[1] * 1000
        ng: app.NG.isNGBoard(title)
        isNet: if scFlg then !title.startsWith("★") else null
      )

    if bbsType is "jbbs"
      board.splice(-1, 1)

    if board.length > 0
      return board
    return null

  ###*
  @method getCachedResCount
  @static
  @param {String} threadUrl
  @return {Promise}
  ###
  @getCachedResCount: (threadUrl) ->
    return new Promise( (resolve, reject) ->
      boardUrl = app.URL.threadToBoard(threadUrl)
      xhrPath = Board._getXhrInfo(threadUrl)?.path

      unless xhrPath?
        reject()
        return

      cache = new app.Cache(xhrPath)
      cache.get()
        .then( ->
          lastModified = cache.last_modified
          for thread in Board.parse(boardUrl, cache.data) when thread.url is threadUrl
            resolve(
              resCount: thread.resCount
              modified: lastModified
            )
            return
          reject()
          return
        , ->
          reject()
          return
        )
    )

app.module("board", [], (callback) ->
  callback(app.Board)
  return
)
