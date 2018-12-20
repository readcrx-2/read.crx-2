import Cache from "./Cache.coffee"
import {isNGBoard} from "./NG.coffee"
import {Request} from "./HTTP.ts"
import {fix as fixUrl, tsld as getTsld, threadToBoard} from "./URL.ts"
import {chServerMoveDetect, decodeCharReference, removeNeedlessFromTitle} from "./util.coffee"

###*
@class Board
@constructor
@param {String} url
###
export default class Board
  constructor: (url) ->
    ###*
    @property url
    @type String
    ###
    @url = fixUrl(url)

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

      # キャッシュ取得
      cache = new Cache(xhrPath)
      try
        await cache.get()
        hasCache = true
        unless Date.now() - cache.lastUpdated < 1000 * 3
          throw new Error("キャッシュの期限が切れているため通信します")
      catch
        try
          # 通信
          request = new Request("GET", xhrPath,
            mimeType: "text/plain; charset=#{xhrCharset}"
            preventCache: true
          )
          if hasCache
            if cache.lastModified?
              request.headers["If-Modified-Since"] =
                new Date(cache.lastModified).toUTCString()
            if cache.etag?
              request.headers["If-None-Match"] = cache.etag

          response = await request.send()

          # パース

          # 2chで自動移動しているときはサーバー移転
          if (
            getTsld(@url) is "5ch.net" and
            @url.split("/")[2] isnt response.responseURL.split("/")[2]
          )
            newBoardUrl = response.responseURL.slice(0, -"subject.txt".length)
            throw {response, newBoardUrl}

          if response?.status is 200
            threadList = Board.parse(@url, response.body)
          else if hasCache
            threadList = Board.parse(@url, cache.data)

          unless threadList?
            throw {response}
          unless response?.status is 200 or response?.status is 304 or (not response? and hasCache)
            throw {response, threadList}

          #コールバック
          @thread = threadList
          resolve()

          #キャッシュ更新部
          if response?.status is 200
            cache.data = response.body
            cache.lastUpdated = Date.now()

            lastModified = new Date(
              response.headers["Last-Modified"] or "dummy"
            ).getTime()

            if Number.isFinite(lastModified)
              cache.lastModified = lastModified

            if etag = response.headers["ETag"]
              cache.etag = etag

            cache.put()

            for thread in threadList
              app.bookmark.updateResCount(thread.url, thread.resCount)

          else if hasCache and response?.status is 304
            cache.lastUpdated = Date.now()
            cache.put()

        catch {response, threadList, newBoardUrl}
          #コールバック
          @message = "板の読み込みに失敗しました。"

          if newBoardUrl? and getTsld(@url) is "5ch.net"
            try
              newBoardUrl = await chServerMoveDetect(@url)
              @message += """
                サーバーが移転しています
                (<a href="#{app.escapeHtml(app.safeHref(newBoardUrl))}"
                class="open_in_rcrx">#{app.escapeHtml(newBoardUrl)}
                </a>)
                """
          #2chでrejectされている場合は移転を疑う
          else if getTsld(@url) is "5ch.net" and response?
            try
              newBoardUrl = await chServerMoveDetect(@url)
              #移転検出時
              @message += """
              サーバーが移転している可能性が有ります
              (<a href="#{app.escapeHtml(app.safeHref(newBoardUrl))}"
              class="open_in_rcrx">#{app.escapeHtml(newBoardUrl)}
              </a>)
              """
            if hasCache and threadList?
              @message += "キャッシュに残っていたデータを表示します。"

            if threadList
              @thread = threadList
          else
            if hasCache and threadList?
              @message += "キャッシュに残っていたデータを表示します。"

            if threadList?
              @thread = threadList
          reject()

      #dat落ちスキャン
      return unless threadList
      dict = {}
      for bookmark in app.bookmark.getByBoard(@url) when bookmark.type is "thread"
        dict[bookmark.url] = true

      for thread in threadList when dict[thread.url]?
        dict[thread.url] = false
        app.bookmark.updateExpired(thread.url, false)

      for threadUrl, val of dict when val
        app.bookmark.updateExpired(threadUrl, true)
      return
    )

  ###*
  @method get
  @static
  @param {String} url
  @return {Promise}
  ###
  @get: (url) ->
    board = new Board(url)
    try
      await board.get()
      return {status: "success", data: board.thread}
    catch
      return {
        status: "error"
        message: board.message ? null
        data: board.thread ? null
      }

  ###*
  @method _getXhrInfo
  @private
  @static
  @param {String} boardUrl
  @return {Object | null} xhrInfo
  ###
  @_getXhrInfo: (boardUrl) ->
    tmp = ///^(https?)://((?:\w+\.)*(\w+\.\w+))/(\w+)(?:/(\d+)/|/?)$///.exec(boardUrl)
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
    tmp = /^(https?):\/\/((?:\w+\.)*(\w+\.\w+))\/(\w+)(?:\/(\w+)|\/?)/.exec(url)
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
      title = decodeCharReference(regRes[2])
      title = removeNeedlessFromTitle(title)

      resCount = +regRes[3]

      board.push({
        url: baseUrl + regRes[1] + "/"
        title
        resCount
        createdAt: +regRes[1] * 1000
        ng: isNGBoard(title, url, resCount)
        isNet: if scFlg then !title.startsWith("★") else null
      })

    if bbsType is "jbbs"
      board.pop()

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
    boardUrl = threadToBoard(threadUrl)
    xhrPath = Board._getXhrInfo(boardUrl)?.path

    unless xhrPath?
      throw new Error("その板の取得方法の情報が存在しません")

    cache = new Cache(xhrPath)
    try
      await cache.get()
      {lastModified, data} = cache
      for {url, resCount} in Board.parse(boardUrl, data) when url is threadUrl
        return {
          resCount
          modified: lastModified
        }
    throw new Error("板のスレ一覧にそのスレが存在しません")
    return
