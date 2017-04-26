###*
@namespace app
@class Board
@constructor
@param {String} url
@requires jQuery
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
    res_deferred = $.Deferred()

    tmp = Board._get_xhr_info(@url)
    unless tmp
      return res_deferred.reject().promise()
    xhr_path = tmp.path
    xhr_charset = tmp.charset

    hasCache = false

    #キャッシュ取得
    cache = new app.Cache(xhr_path)
    cache.get().then ->
      return new Promise( (resolve, reject) ->
        hasCache = true
        if Date.now() - cache.last_updated < 1000 * 3
          resolve()
        else
          reject()
        return
      )
    #通信
    .catch =>
      return new Promise( (resolve, reject) ->
        request = new app.HTTP.Request("GET", xhr_path, {
          mimeType: "text/plain; charset=#{xhr_charset}"
        })

        if hasCache
          if cache.last_modified?
            request.headers["If-Modified-Since"] =
              new Date(cache.last_modified).toUTCString()
          if cache.etag?
            request.headers["If-None-Match"] = cache.etag

        request.send (response) ->
          if response.status is 200
            resolve(response)
          else if hasCache and response.status is 304
            resolve(response)
          else
            reject(response)
        return
      )
    #パース
    .then( (response) =>
      return new Promise( (resolve, reject) =>
        if response?.status is 200
          thread_list = Board.parse(@url, response.body)
        else if hasCache
          thread_list = Board.parse(@url, cache.data)

        if thread_list?
          if response?.status is 200 or response?.status is 304 or (not response? and hasCache)
            resolve({response, thread_list})
          else
            reject({response, thread_list})
        else
          reject({response})
        return
      )
    )
    #コールバック
    .then ({response, thread_list}) =>
      @thread = thread_list
      res_deferred.resolve()
      return {response, thread_list}
    , ({response, thread_list}) =>
      @message = "板の読み込みに失敗しました。"

      #2chでrejectされている場合は移転を疑う
      if app.url.tsld(@url) is "2ch.net" and response?
        app.util.ch_server_move_detect(@url)
          #移転検出時
          .done (new_board_url) =>
            @message += """
            サーバーが移転している可能性が有ります
            (<a href="#{app.escape_html(app.safe_href(new_board_url))}"
            class="open_in_rcrx">#{app.escape_html(new_board_url)}
            </a>)
            """
          .always =>
            if hasCache and thread_list?
              @message += "キャッシュに残っていたデータを表示します。"

            if thread_list
              @thread = thread_list
      else
        if hasCache and thread_list?
          @message += "キャッシュに残っていたデータを表示します。"

        if thread_list?
          @thread = thread_list
      res_deferred.reject()
      return {response, thread_list}
    #キャッシュ更新部
    .then ({response, thread_list}) ->
      if response?.status is 200
        cache.data = response.body
        cache.last_updated = Date.now()

        last_modified = new Date(
          response.headers["Last-Modified"] or "dummy"
        ).getTime()

        if Number.isFinite(last_modified)
          cache.last_modified = last_modified

        if etag = response.headers["ETag"]
          cache.etag = etag

        cache.put()

        for thread in thread_list
          app.bookmark.update_res_count(thread.url, thread.res_count)

      else if hasCache and response?.status is 304
        cache.last_updated = Date.now()
        cache.put()
      return {response, thread_list}
    #dat落ちスキャン
    .then ({response, thread_list}) =>
      if thread_list
        dict = {}
        for bookmark in app.bookmark.get_by_board(@url) when bookmark.type is "thread"
          dict[bookmark.url] = true

        for thread in thread_list when dict[thread.url]?
          delete dict[thread.url]
          app.bookmark.update_expired(thread.url, false)

        for thread_url of dict
          app.bookmark.update_expired(thread_url, true)
      return
    return res_deferred.promise()

  ###*
  @method _get_xhr_info
  @private
  @static
  @param {String} board_url
  @return {Object | null} xhr_info
  ###
  @_get_xhr_info: (board_url) ->
    tmp = ///^(https?)://((?:\w+\.)?(\w+\.\w+))/(\w+)/(?:(\d+)/)?$///.exec(board_url)
    unless tmp
      return null
    switch tmp[3]
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
    switch tmp[3]
      when "machi.to"
        bbs_type = "machi"
        reg = /^\d+<>(\d+)<>(.+)\((\d+)\)$/gm
        base_url = "#{tmp[1]}://#{tmp[2]}/bbs/read.cgi/#{tmp[4]}/"
      when "shitaraba.net"
        bbs_type = "jbbs"
        reg = /^(\d+)\.cgi,(.+)\((\d+)\)$/gm
        base_url = "#{tmp[1]}://jbbs.shitaraba.net/bbs/read.cgi/#{tmp[4]}/#{tmp[5]}/"
      else
        bbs_type = "2ch"
        reg = /^(\d+)\.dat<>(.+) \((\d+)\)$/gm
        base_url = "#{tmp[1]}://#{tmp[2]}/test/read.cgi/#{tmp[4]}/"

    board = []
    while (reg_res = reg.exec(text))
      title = app.util.decode_char_reference(reg_res[2])
      title = app.util.removeNeedlessFromTitle(title)

      board.push(
        url: base_url + reg_res[1] + "/"
        title: title
        res_count: +reg_res[3]
        created_at: +reg_res[1] * 1000
        ng: app.NG.isNGBoard(title)
        is_net: !title.startsWith("★")
      )

    if bbs_type is "jbbs"
      board.splice(-1, 1)

    if board.length > 0 then board else null

  ###*
  @method get_cached_res_count
  @static
  @param {String} thread_url
  @return {Promise}
  ###
  @get_cached_res_count: (thread_url) ->
    board_url = app.url.threadToBoard(thread_url)
    xhr_path = Board._get_xhr_info(board_url)?.path

    unless xhr_path?
      return Promise.reject()

    cache = new app.Cache(xhr_path)
    return cache.get().then =>
      return new Promise( (resolve, reject) =>
        last_modified = cache.last_modified
        for thread in Board.parse(board_url, cache.data) when thread.url is thread_url
          resolve
            res_count: thread.res_count
            modified: last_modified
          return
        reject()
        return
      )

app.module "board", [], (callback) ->
  callback(app.Board)
  return

app.board =
  get: (url, callback) ->
    board = new app.Board(url)
    board.get()
      .done ->
        callback(status: "success", data: board.thread)
        return
      .fail ->
        tmp = {status: "error"}
        if board.message?
          tmp.message = board.message
        if board.thread?
          tmp.data = board.thread
        callback(tmp)
        return
    return

  get_cached_res_count: (thread_url, callback) ->
    app.Board.get_cached_res_count(thread_url)
      .then( (res) ->
        callback(res)
        return
      , ->
        callback(null)
        return
      )
    return
