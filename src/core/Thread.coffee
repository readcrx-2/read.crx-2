###*
@namespace app
@class Thread
@constructor
@param {String} url
###
class app.Thread
  constructor: (url) ->
    @url = app.url.fix(url)
    @title = null
    @res = null
    @message = null
    @tsld = app.url.tsld(@url)
    return

  get: (forceUpdate) ->
    resDeferred = $.Deferred()

    xhrInfo = Thread._getXhrInfo(@url)
    unless xhrInfo then return resDeferred.reject().promise()
    xhrPath = xhrInfo.path
    xhrCharset = xhrInfo.charset

    getCachedInfo = $.Deferred (d) =>
      if @tsld in ["shitaraba.net", "machi.to"]
        app.Board.get_cached_res_count(@url)
          .done (res) ->
            d.resolve(res)
            return
          .fail ->
            d.reject()
            return
      else
        d.reject()
      return

    cache = new app.Cache(xhrPath)
    deltaFlg = false
    readcgisixFlg = false
    noChangeFlg = false

    #キャッシュ取得
    promiseCacheGet = cache.get()
    promiseCacheGet.then =>
      $.Deferred (d) =>
        if forceUpdate or Date.now() - cache.last_updated > 1000 * 3
          #通信が生じる場合のみ、notifyでキャッシュを送出する
          app.defer =>
            tmp = Thread.parse(@url, cache.data)
            return unless tmp?
            @res = tmp.res
            @title = tmp.title
            resDeferred.notify()
            return
          d.reject()
        else
          d.resolve()
        return
    #通信
    .then null, =>
      $.Deferred (d) =>
        if @tsld in ["shitaraba.net", "machi.to"]
          if promiseCacheGet.state() is "resolved"
            deltaFlg = true
            xhrPath += (+cache.res_length + 1) + "-"
        # 2ch.netは差分を-nで取得
        else if (app.config.get("format_2chnet") isnt "dat" and @tsld is "2ch.net") or @tsld is "bbspink.com"
          if promiseCacheGet.state() is "resolved"
            deltaFlg = true
            if cache.data.includes("<div class=\"footer push\">read.cgi ver 06")
              readcgisixFlg = true
              xhrPath += (+cache.res_length + 1) + "-n"
            else
              xhrPath += (+cache.res_length) + "-n"

        request = new app.HTTP.Request("GET", xhrPath, {
          mimeType: "text/plain; charset=#{xhrCharset}"
        })

        if promiseCacheGet.state() is "resolved"
          if cache.last_modified?
            request.headers["If-Modified-Since"] =
              new Date(cache.last_modified).toUTCString()
          if cache.etag?
            request.headers["If-None-Match"] = cache.etag

        request.send (response) ->
          if response.status is 200
            d.resolve(response)
          else if response.status is 500 and readcgisixFlg
            d.resolve(response)
          else if promiseCacheGet.state() is "resolved" and response.status is 304
            d.resolve(response)
          else
            d.reject(response)

    #パース
    .then((fn = (response) =>
      $.Deferred (d) =>
        guessRes = app.url.guess_type(@url)

        if response?.status is 200 or (readcgisixFlg and response?.status is 500)
          if deltaFlg
            # 2ch.netなら-nを使って前回取得したレスの後のレスからのものを取得する
            if @tsld in ["2ch.net", "bbspink.com"]
              threadCache = Thread.parse(@url, cache.data)
              # readcgi ver6だと変更がないと500が帰ってくる
              if readcgisixFlg and response.status is 500
                noChangeFlg = true
                thread = threadCache
              else
                threadResponse = Thread.parse(@url, response.body)
                # 新しいレスがない場合は最後のレスのみ表示されるのでその場合はキャッシュを送る
                if !readcgisixFlg and threadResponse.res.length is 1
                  noChangeFlg = true
                  thread = threadCache
                else
                  unless readcgisixFlg
                    threadResponse.res.splice(0, 1)
                  thread = threadResponse
                  thread.res = threadCache.res.concat(threadResponse.res)
            else
              thread = Thread.parse(@url, cache.data + response.body)
          else
            thread = Thread.parse(@url, response.body)
        #2ch系BBSのdat落ち
        else if guessRes.bbs_type is "2ch" and response?.status is 203
          if promiseCacheGet.state() is "resolved"
            thread = Thread.parse(@url, cache.data)
          else
            thread = Thread.parse(@url, response.body)
        else if promiseCacheGet.state() is "resolved"
          thread = Thread.parse(@url, cache.data)

        #パース成功
        if thread
          #通信成功
          if response?.status is 200 or
              #通信成功（更新なし）
              response?.status is 304 or
              #通信成功（2ch read.cgi ver6の差分更新なし）
              (readcgisixFlg and response?.status is 500) or
              #キャッシュが期限内だった場合
              (not response and promiseCacheGet.state() is "resolved")
            d.resolve(response, thread)
          #2ch系BBSのdat落ち
          else if guessRes.bbs_type is "2ch" and response?.status is 203
            d.reject(response, thread)
          else
            d.reject(response, thread)
        #パース失敗
        else
          d.reject(response)
    ), fn)

    #したらば/まちBBS最新レス削除対策
    .then (response, thread) ->
      $.Deferred (d) ->
        getCachedInfo
          .done (cachedInfo) ->
            while thread.res.length < cachedInfo.res_count
              thread.res.push
                name: "あぼーん"
                mail: "あぼーん"
                message: "あぼーん"
                other: "あぼーん"
            d.resolve(response, thread)
            return
          .fail ->
            d.resolve(response, thread)
            return
        return

    #コールバック
    .always (response, thread) =>
      if thread
        @title = thread.title
        @res = thread.res
      return

    .done (response, thread) =>
      resDeferred.resolve()
      return

    .fail (response, thread) =>
      @message = ""

      #2chでrejectされてる場合は移転を疑う
      if @tsld is "2ch.net" and response
        app.util.ch_server_move_detect(app.url.thread_to_board(@url))
          #移転検出時
          .done (newBoardURL) =>
            tmp = ///^http://(\w+)\.2ch\.net/ ///.exec(newBoardURL)[1]
            newURL = @url.replace(
              ///^(http://)\w+(\.2ch\.net/test/read\.cgi/\w+/\d+/)$///,
              ($0, $1, $2) -> $1 + tmp + $2
            )

            @message += """
            スレッドの読み込みに失敗しました。
            サーバーが移転している可能性が有ります
            (<a href="#{app.escape_html(app.safe_href(newURL))}"
              class="open_in_rcrx">#{app.escape_html(newURL)}</a>)
            """
            return
          #移転検出出来なかった場合
          .fail =>
            if response?.status is 203
              @message += "dat落ちしたスレッドです。"
            else
              @message += "スレッドの読み込みに失敗しました。"
            return
          .always =>
            if promiseCacheGet.state() is "resolved" and thread
              @message += "キャッシュに残っていたデータを表示します。"
            resDeferred.reject()
            return
      else
        @message += "スレッドの読み込みに失敗しました。"

        if promiseCacheGet.state() is "resolved" and thread
          @message += "キャッシュに残っていたデータを表示します。"

        resDeferred.reject()
      return

    #キャッシュ更新部
    .done (response, thread) =>
      #通信に成功した場合
      if response?.status is 200 or (readcgisixFlg and response?.status is 500)
        cache.last_updated = Date.now()

        if deltaFlg
          if @tsld in ["2ch.net", "bbspink.com"] and noChangeFlg is false
            if readcgisixFlg
              before = response.body.indexOf("<div class=\"thread\">")+20
              after = response.body.indexOf("</div></div></div>")+12
              place = cache.data.indexOf("</div></div></div>")+12
              cache.data = cache.data.slice(0, place) + response.body.slice(before, after) + cache.data.slice(place, cache.data.length)
            else
              # 1つのときは</dl>がなぜか存在しないので別処理
              if cache.res_length is 1
                cache.data = response.body
              else
                beforeCacheFinalRes = cache.data.indexOf("<dt>#{cache.res_length} ：")
                afterCacheFinalRes = cache.data.indexOf("</dl>")
                beforeResponseFirstRes = response.body.indexOf("<dt>#{cache.res_length} ：")
                afterResponseFinalRes = response.body.indexOf("</dl>")
                cache.data = cache.data.slice(0, beforeCacheFinalRes) + response.body.slice(beforeResponseFirstRes, afterResponseFinalRes) + cache.data.slice(afterCacheFinalRes, cache.data.length)
            cache.res_length = thread.res.length
          else if noChangeFlg is false
            cache.res_length = thread.res.length
            cache.data += response.body
        else
          cache.res_length = thread.res.length
          cache.data = response.body

        lastModified = new Date(
          response.headers["Last-Modified"] or "dummy"
        ).getTime()

        if Number.isFinite(lastModified)
          cache.last_modified = lastModified

        etag = response.headers["ETag"]
        if etag
          cache.etag = etag

        cache.put()

      #304だった場合はアップデート時刻のみ更新
      else if promiseCacheGet.state() is "resolved" and response?.status is 304
        cache.last_updated = Date.now()
        cache.put()
      return

    #ブックマーク更新部
    .always (response, thread) =>
      if thread?
        app.bookmark.update_res_count(@url, thread.res.length)
      return

    #dat落ち検出
    .fail (response, thread) =>
      if response?.status is 203
        app.bookmark.update_expired(@url, true)
      return

    resDeferred.promise()

  ###*
  @method _getXhrInfo
  @static
  @param {String} url
  @return {null|Object}
  ###
  @_getXhrInfo = (url) ->
    tmp = ///^http://((?:\w+\.)?(\w+\.\w+))/(?:test|bbs)/read\.cgi/
      (\w+)/(\d+)/(?:(\d+)/)?$///.exec(url)
    unless tmp then return null
    switch tmp[2]
      when "machi.to"
        path: "http://#{tmp[1]}/bbs/offlaw.cgi/#{tmp[3]}/#{tmp[4]}/",
        charset: "Shift_JIS"
      when "shitaraba.net"
        path: "http://jbbs.shitaraba.net/" +
            "bbs/rawmode.cgi/#{tmp[3]}/#{tmp[4]}/#{tmp[5]}/",
        charset: "EUC-JP"
      when "2ch.net"
        if app.config.get("format_2chnet") is "dat"
          path: "http://#{tmp[1]}/#{tmp[3]}/dat/#{tmp[4]}.dat",
          charset: "Shift_JIS"
        else
          path: tmp[0],
          charset: "Shift_JIS"
      when "bbspink.com"
        path: tmp[0],
        charset: "Shift_JIS"
      else
        path: "http://#{tmp[1]}/#{tmp[3]}/dat/#{tmp[4]}.dat",
        charset: "Shift_JIS"

  ###*
  @method parse
  @static
  @param {String} url
  @param {String} text
  @return {null|Object}
  ###
  @parse: (url, text) ->
    switch app.url.tsld(url)
      when ""
        null
      when "machi.to"
        Thread._parseMachi(text)
      when "shitaraba.net"
        Thread._parseJbbs(text)
      when "2ch.net"
        if app.config.get("format_2chnet") is "dat"
          Thread._parseCh(text)
        else
          Thread._parseNet(text)
      when "bbspink.com"
        Thread._parseNet(text)
      else
        Thread._parseCh(text)

  ###*
  @method _parseNet
  @static
  @private
  @param {String} text
  @return {null|Object}
  ###
  @_parseNet = (text) ->
    # name, mail, other, message, thread_title
    if text.includes("<div class=\"footer push\">read.cgi ver 06")
      text = text.replace(/<\/h1>/, "</h1></div></div>")
      reg = /^.*?<div class="post".*><div class="number">\d+.* : <\/div><div class="name"><b>(?:<a href="mailto:([^<>]*)">|<font [^>]*>)?(.*?)(?:<\/a>|<\/font>)?<\/b><\/div><div class="date">(.*)<\/div><div class="message"> ?(.*)$/
      separator = "</div></div>"
    else
      reg = /^(?:<\/?div.*?(?:<br><br>)?)?<dt>\d+.*：(?:<a href="mailto:([^<>]*)">|<font [^>]*>)?<b>(.*)<\/b>.*：(.*)<dd> ?(.*)<br><br>$/
      separator = "\n"
    titleReg = /<h1 .*?>(.*)\n?<\/h1>/;
    numberOfBroken = 0
    thread = res: []
    first = true

    for line in text.split(separator)
      title = titleReg.exec(line)
      regRes = reg.exec(line)

      if title
        thread.title = app.util.decode_char_reference(title[1])
        thread.title = app.util.removeNeedlessFromTitle(thread.title)
      else if regRes
        thread.res.push
          name: regRes[2]
          mail: regRes[1] or ""
          message: regRes[4]
          other: regRes[3]

    if thread.res.length > 0 and thread.res.length > numberOfBroken
      thread
    else
      null

  ###*
  @method _parseCh
  @static
  @private
  @param {String} text
  @return {null|Object}
  ###
  @_parseCh = (text) ->
    numberOfBroken = 0
    thread = res: []
    first = true

    for line, key in text.split("\n")
      continue if line is ""
      # name, mail, other, message, thread_title
      sp = line.split("<>")
      if sp.length >= 4
        if key is 0
          thread.title = app.util.decode_char_reference(sp[4])

        thread.res.push
          name: sp[0]
          mail: sp[1]
          message: sp[3]
          other: sp[2]
      else
        continue if line is ""
        numberOfBroken++
        thread.res.push
          name: "</b>データ破損<b>"
          mail: ""
          message: "データが破損しています"
          other: ""

    if thread.res.length > 0 and thread.res.length > numberOfBroken
      thread
    else
      null

  ###*
  @method _parseMachi
  @static
  @private
  @param {String} text
  @return {null|Object}
  ###
  @_parseMachi = (text) ->
    thread = {res: []}
    resCount = 0
    numberOfBroken = 0

    for line in text.split("\n")
      continue if line is ""
      # res_num, name, mail, other, message, thread_title
      sp = line.split("<>")
      if sp.length >= 5
        while ++resCount isnt +sp[0]
          thread.res.push
            name: "あぼーん"
            mail: "あぼーん"
            message: "あぼーん"
            other: "あぼーん"

        if resCount is 1
          thread.title = app.util.decode_char_reference(sp[5])

        thread.res.push
          name: sp[1]
          mail: sp[2]
          message: sp[4]
          other: sp[3]
      else
        continue if line is ""
        numberOfBroken++
        thread.res.push
          name: "</b>データ破損<b>"
          mail: ""
          message: "データが破損しています"
          other: ""

    if thread.res.length > 0 and thread.res.length > numberOfBroken
      thread
    else
      null

  ###*
  @method _parseJbbs
  @static
  @private
  @param {String} text
  @return {null|Object}
  ###
  @_parseJbbs = (text) ->
    thread = {res: []}
    resCount = 0
    numberOfBroken = 0

    for line in text.split("\n")
      continue if line is ""
      # res_num, name, mail, date, message, thread_title, id
      sp = line.split("<>")
      if sp.length >= 6
        while ++resCount isnt +sp[0]
          thread.res.push
            name: "あぼーん"
            mail: "あぼーん"
            message: "あぼーん"
            other: "あぼーん"

        if resCount is 1
          thread.title = app.util.decode_char_reference(sp[5])

        thread.res.push
          name: sp[1]
          mail: sp[2]
          message: sp[4]
          other: sp[3] + if sp[6] then " ID:#{sp[6]}" else ""

      else
        continue if line is ""
        numberOfBroken++
        thread.res.push
          name: "</b>データ破損<b>"
          mail: ""
          message: "データが破損しています"
          other: ""

    if thread.res.length > 0 and thread.res.length > numberOfBroken
      thread
    else
      null
