###*
@namespace app
@class Board
@constructor
@param {String} url
@requires jQuery
@requires app.Cache
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

    #キャッシュ取得
    cache = new app.Cache(xhr_path)
    cache_get_promise = cache.get()
    cache_get_promise.pipe ->
      $.Deferred (d) ->
        if Date.now() - cache.last_updated < 1000 * 3
          d.resolve()
        else
          d.reject()
        return
    #通信
    .pipe null, =>
      $.Deferred (d) ->
        ajax_data =
          url: xhr_path
          cache: false
          dataType: "text"
          headers: {}
          mimeType: "text/plain; charset=" + xhr_charset
          timeout: 1000 * 30
          complete: ($xhr) ->
            if $xhr.status is 200
              d.resolve($xhr)
            else if cache_get_promise.state() is "resolved" and $xhr.status is 304
              d.resolve($xhr)
            else
              d.reject($xhr)
            return

        if cache_get_promise.state() is "resolved"
          if cache.last_modified?
            ajax_data.headers["If-Modified-Since"] =
              new Date(cache.last_modified).toUTCString()

          if cache.etag?
            ajax_data.headers["If-None-Match"] = cache.etag

        $.ajax(ajax_data)
        return
    #パース
    .pipe((fn = ($xhr) =>
      $.Deferred (d) =>
        if $xhr?.status is 200
          thread_list = Board.parse(@url, $xhr.responseText)
        else if cache_get_promise.state() is "resolved"
          thread_list = Board.parse(@url, cache.data)

        if thread_list?
          if $xhr?.status is 200 or $xhr?.status is 304 or (not $xhr? and cache_get_promise.state() is "resolved")
            d.resolve($xhr, thread_list)
          else
            d.reject($xhr, thread_list)
        else
          d.reject($xhr)
        return
    ), fn)
    #コールバック
    .done ($xhr, thread_list) =>
      @thread = thread_list
      res_deferred.resolve()
      return

    .fail ($xhr, thread_list) =>
      @message = "板の読み込みに失敗しました。"

      #2chでrejectされている場合は移転を疑う
      if app.url.tsld(@url) is "2ch.net" and $xhr?
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
            if cache_get_promise.state() is "resolved" and thread_list?
              @message += "キャッシュに残っていたデータを表示します。"

            if thread_list
              @thread = thread_list
      else
        if cache_get_promise.state() is "resolved" and thread_list?
          @message += "キャッシュに残っていたデータを表示します。"

        if thread_list?
          @thread = thread_list
      res_deferred.reject()
      return
    #キャッシュ更新部
    .done ($xhr, thread_list) ->
      if $xhr?.status is 200
        cache.data = $xhr.responseText
        cache.last_updated = Date.now()

        last_modified = new Date(
          $xhr.getResponseHeader("Last-Modified") or "dummy"
        ).getTime()

        if not isNaN(last_modified)
          cache.last_modified = last_modified

        if etag = $xhr.getResponseHeader("ETag")
          cache.etag = etag

        cache.put()

        for thread in thread_list
          app.bookmark.update_res_count(thread.url, thread.res_count)

      else if cache_get_promise.state() is "resolved" and $xhr?.status is 304
        cache.last_updated = Date.now()
        cache.put()
      return
    #dat落ちスキャン
    .done ($xhr, thread_list) =>
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
    res_deferred.promise()

  ###*
  @method _get_xhr_info
  @private
  @static
  @param {String} board_url
  @return {Object | null} xhr_info
  ###
  @_get_xhr_info: (board_url) ->
    tmp = ///^http://(\w+\.(\w+\.\w+))/(\w+)/(?:(\d+)/)?$///.exec(board_url)
    unless tmp
      return null
    switch tmp[2]
      when "machi.to"
        path: "http://#{tmp[1]}/bbs/offlaw.cgi/#{tmp[3]}/"
        charset: "Shift_JIS"
      when "livedoor.jp", "shitaraba.net"
        path: "http://jbbs.shitaraba.net/#{tmp[3]}/#{tmp[4]}/subject.txt"
        charset: "EUC-JP"
      when "open2ch.net"
        path: "http://#{tmp[1]}/#{tmp[3]}/subback.html"
        charset: "UTF-8"
      else
        path: "http://#{tmp[1]}/#{tmp[3]}/subject.txt"
        charset: "Shift_JIS"

  ###*
  @method parse
  @static
  @param {String} url
  @param {String} text
  @return {Array | null} board
  ###
  @parse: (url, text) ->
    tmp = /^http:\/\/(\w+\.(\w+\.\w+))\/(\w+)\/(\w+)?/.exec(url)
    switch tmp[2]
      when "machi.to"
        bbs_type = "machi"
        reg = /^\d+<>(\d+)<>(.+)\((\d+)\)$/gm
        base_url = "http://#{tmp[1]}/bbs/read.cgi/#{tmp[3]}/"
      when "shitaraba.net"
        bbs_type = "jbbs"
        reg = /^(\d+)\.cgi,(.+)\((\d+)\)$/gm
        base_url = "http://jbbs.shitaraba.net/bbs/read.cgi/#{tmp[3]}/#{tmp[4]}/"
      else
        bbs_type = "2ch"
        reg = /^(\d+)\.dat<>(.+) \((\d+)\)$/gm
        if tmp[2] is "open2ch.net"
          reg = /^<a href="\/test\/read\.cgi\/\w+\/(\d+)\/.*">\d+: (.*) \((\d+)\)<\/a>$/gm
        base_url = "http://#{tmp[1]}/test/read.cgi/#{tmp[3]}/"

    ngWords = (app.config.get('ngwords') or "").split('\n')
    ngWords = ngWords.filter (word) -> word

    board = []
    while (reg_res = reg.exec(text))
      title = app.util.decode_char_reference(reg_res[2])
      title2 = title.replace(/ ?(?:\[(?:無断)?転載禁止\]|(?:\(c\)|©|�|&copy;|&#169;)(?:2ch\.net|@?bbspink\.com)) ?/g,"")
      title = if title2 isnt "" then title2 else title
      tmpTitle = app.util.normalize(title)

      board.push(
        url: base_url + reg_res[1] + "/"
        title: title
        res_count: +reg_res[3]
        created_at: +reg_res[1] * 1000
        ng: do (title, ngWords) ->
          for ngWord in ngWords
            # 関係ないプレフィックスは飛ばす
            continue if do (ngWord, prefixes = ["Comment:", "Name:", "Mail:", "ID:", "Body:", "RegExpName:", "RegExpMail:", "RegExpID:", "RegExpBody:"]) ->
              for prefix in prefixes
                if ngWord.indexOf(prefix) is 0
                  return true
              return false

            if ngWord.indexOf("RegExp:") is 0
              try
                reg_ng = new RegExp ngWord.substr(7)
                if reg_ng.test(title)
                  return true
              catch e
                continue
            else if ngWord.indexOf("RegExpTitle:") is 0
              try
                reg_ng = new RegExp ngWord.substr(12)
                if reg_ng.test(title)
                  return true
              catch e
                continue
            else if ngWord.indexOf("Title:") is 0
              if tmpTitle.indexOf(app.util.normalize(ngWord.substr(6))) isnt -1
                return true
            else
              if tmpTitle.indexOf(app.util.normalize(ngWord)) isnt -1
                return true
          return false
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
    board_url = app.url.thread_to_board(thread_url)
    xhr_path = Board._get_xhr_info(board_url)?.path

    unless xhr_path?
      return $.Deferred().reject().promise()

    cache = new app.Cache(xhr_path)
    cache.get().pipe =>
      $.Deferred (d) =>
        last_modified = cache.last_modified
        for thread in Board.parse(board_url, cache.data)
          if thread.url is thread_url
            d.resolve
              res_count: thread.res_count
              modified: last_modified
            return
        d.reject()
        return
    .promise()

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
      .done (res) ->
        callback(res)
        return
      .fail ->
        callback(null)
        return
    return
