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

    getCachedInfo = new Promise( (resolve, reject) =>
      if @tsld in ["shitaraba.net", "machi.to"]
        app.Board.get_cached_res_count(@url).then( (res) ->
          resolve(res)
          return
        , ->
          reject()
          return
        )
        return
      else
        reject()
      return
    )

    cache = new app.Cache(xhrPath)
    hasCache = false
    deltaFlg = false
    readcgisixFlg = false
    readcgiSevenFlg = false
    noChangeFlg = false

    #キャッシュ取得
    cache.get().then =>
      return new Promise( (resolve, reject) =>
        hasCache = true
        if forceUpdate or Date.now() - cache.last_updated > 1000 * 3
          #通信が生じる場合のみ、notifyでキャッシュを送出する
          app.defer =>
            tmp = Thread.parse(@url, cache.data)
            return unless tmp?
            @res = tmp.res
            @title = tmp.title
            resDeferred.notify()
            return
          reject()
        else
          resolve()
        return
      )
    #通信
    .catch =>
      return new Promise( (resolve, reject) =>
        if @tsld in ["shitaraba.net", "machi.to"]
          if hasCache
            deltaFlg = true
            xhrPath += (+cache.res_length + 1) + "-"
        # 2ch.netは差分を-nで取得
        else if (app.config.get("format_2chnet") isnt "dat" and @tsld is "2ch.net") or @tsld is "bbspink.com"
          if hasCache
            deltaFlg = true
            if cache.data.includes("<div class=\"footer push\">read.cgi ver 06")
              readcgisixFlg = true
              xhrPath += (+cache.res_length + 1) + "-n"
            else if cache.data.includes("<div class=\"footer push\">read.cgi ver 07")
              readcgisixFlg = true
              readcgiSevenFlg = true
              xhrPath += (+cache.res_length + 1) + "-n"
            else
              xhrPath += (+cache.res_length) + "-n"

        request = new app.HTTP.Request("GET", xhrPath, {
          mimeType: "text/plain; charset=#{xhrCharset}"
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
          else if response.status is 500 and readcgisixFlg
            resolve(response)
          else if hasCache and response.status is 304
            resolve(response)
          else
            reject(response)
          return
        return
      )
    #パース
    .then( (response) =>
      return new Promise( (resolve, reject) =>
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
                threadResponse = Thread.parse(@url, response.body, +cache.res_length)
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
          if hasCache
            thread = Thread.parse(@url, cache.data)
          else
            thread = Thread.parse(@url, response.body)
        else if hasCache
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
              (not response and hasCache)
            resolve({response, thread})
          #2ch系BBSのdat落ち
          else if guessRes.bbs_type is "2ch" and response?.status is 203
            reject({response, thread})
          else
            reject({response, thread})
        #パース失敗
        else
          reject({response})
        return
      )
    )
    #したらば/まちBBS最新レス削除対策
    .then ({response, thread}) ->
      return new Promise( (resolve, reject) ->
        getCachedInfo
          .then( (cachedInfo) ->
            while thread.res.length < cachedInfo.res_count
              thread.res.push
                name: "あぼーん"
                mail: "あぼーん"
                message: "あぼーん"
                other: "あぼーん"
            resolve({response, thread})
            return
          , ->
            resolve({response, thread})
            return
          )
        return
      )

    #コールバック
    .then(({response, thread}) =>
      if thread
        @title = thread.title
        @res = thread.res
      return Promise.resolve({response, thread})
    , ({response, thread}) =>
      if thread
        @title = thread.title
        @res = thread.res
      return Promise.reject({response, thread})
    )

    .then ({response, thread}) =>
      resDeferred.resolve()
      return {response, thread}
    , ({response, thread}) =>
      @message = ""

      #2chでrejectされてる場合は移転を疑う
      if @tsld is "2ch.net" and response
        app.util.ch_server_move_detect(app.url.threadToBoard(@url))
          #移転検出時
          .done (newBoardURL) =>
            tmp = ///^https?://(\w+)\.2ch\.net/ ///.exec(newBoardURL)[1]
            newURL = @url.replace(
              ///^(https?://)\w+(\.2ch\.net/test/read\.cgi/\w+/\d+/)$///,
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
            if hasCache and thread
              @message += "キャッシュに残っていたデータを表示します。"
            resDeferred.reject()
            return
      else
        @message += "スレッドの読み込みに失敗しました。"

        if hasCache and thread
          @message += "キャッシュに残っていたデータを表示します。"

        resDeferred.reject()
      return {response, thread}

    #キャッシュ更新部
    .then ({response, thread}) =>
      #通信に成功した場合
      if response?.status is 200 or (readcgisixFlg and response?.status is 500)
        cache.last_updated = Date.now()

        if deltaFlg
          if @tsld in ["2ch.net", "bbspink.com"] and noChangeFlg is false
            if readcgisixFlg or readcgiSevenFlg
              if @tsld is "bbspink.com"
                before = response.body.indexOf("</h1><dl class=\"post\"")+5
                after = response.body.indexOf("</dd></dl></section><div>")
                if after isnt -1
                  after += 10
                else
                  after = response.body.indexOf("</dd></dl></section>")+10
                place = cache.data.indexOf("</dd></dl></section><div>")
                if place isnt -1
                  place +=10
                else
                  place = cache.data.indexOf("</dd></dl></section>")
              else if readcgiSevenFlg
                before = response.body.indexOf("<div class=\"thread\">")+20
                after = response.body.indexOf("</span></div></div><br></div>")
                if after isnt -1
                  after += 23
                else
                  after = response.body.indexOf("</span></div></div><br>")+23
                place = cache.data.indexOf("</span></div></div><br></div>")
                if place isnt -1
                  place += 23
                else
                  place = cache.data.indexOf("</span></div></div><br>")+23
              else
                before = response.body.indexOf("<div class=\"thread\">")+20
                after = response.body.indexOf("</div></div></div><div class=\"cLength\">")
                if after isnt -1
                  after += 12
                else
                  after = response.body.indexOf("</div></div></div>")+12
                place = cache.data.indexOf("</div></div></div><div class=\"cLength\">")
                if place isnt -1
                  place += 12
                else
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
      else if hasCache and response?.status is 304
        cache.last_updated = Date.now()
        cache.put()
      return {response, thread}

    #ブックマーク更新部
    .then ({response, thread}) =>
      if thread?
        app.bookmark.update_res_count(@url, thread.res.length)
      return {response, thread}

    #dat落ち検出
    .then ({response, thread}) =>
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
    tmp = ///^(https?)://((?:\w+\.)?(\w+\.\w+))/(?:test|bbs)/read\.cgi/
      (\w+)/(\d+)/(?:(\d+)/)?$///.exec(url)
    unless tmp then return null
    switch tmp[3]
      when "machi.to"
        path: "#{tmp[1]}://#{tmp[2]}/bbs/offlaw.cgi/#{tmp[4]}/#{tmp[5]}/",
        charset: "Shift_JIS"
      when "shitaraba.net"
        path: "#{tmp[1]}://jbbs.shitaraba.net/" +
            "bbs/rawmode.cgi/#{tmp[4]}/#{tmp[5]}/#{tmp[6]}/",
        charset: "EUC-JP"
      when "2ch.net"
        if app.config.get("format_2chnet") is "dat"
          path: "#{tmp[1]}//#{tmp[2]}/#{tmp[4]}/dat/#{tmp[5]}.dat",
          charset: "Shift_JIS"
        else
          path: tmp[0],
          charset: "Shift_JIS"
      when "bbspink.com"
        path: tmp[0],
        charset: "Shift_JIS"
      else
        path: "#{tmp[1]}://#{tmp[2]}/#{tmp[4]}/dat/#{tmp[5]}.dat",
        charset: "Shift_JIS"

  ###*
  @method parse
  @static
  @param {String} url
  @param {String} text
  @param {Number} resLength
  @return {null|Object}
  ###
  @parse: (url, text, resLength) ->
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
        Thread._parsePink(text, resLength)
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
    else if text.includes("<div class=\"footer push\">read.cgi ver 07")
      text = text.replace(/<\/h1>/, "</h1></div></div><br>")
      reg = /^.*?<div class="post".*><div class="meta"><span class="number">\d+<\/span><span class="name"><b>(?:<a href="mailto:([^<>]*)">|<font [^>]*>)?(.*?)(?:<\/a>|<\/font>)?<\/b><\/span><span class="date">(.*)<\/span><\/div><div class="message">(?:<span class="escaped">)? ?(.*)$/
      separator = "</div></div><br>"
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

  ###*
  @method _parsePink
  @static
  @private
  @param {String} text
  @param {Number} resLength
  @return {null|Object}
  ###
  @_parsePink = (text, resLength) ->
    # name, mail, other, message, thread_title
    text = text.replace(/<\/h1>/, "</h1></dd></dl>")
    reg = /^.*?<dl class="post".*><dt class=\"\"><span class="number">(\d+).* : <\/span><span class="name"><b>(?:<a href="mailto:([^<>]*)">|<font [^>]*>)?(.*?)(?:<\/a>|<\/font>)?<\/b><\/span><span class="date">(.*)<\/span><\/dt><dd class="thread_in"> ?(.*)$/
    separator = "</dd></dl>"

    titleReg = /<h1 .*?>(.*)\n?<\/h1>/;
    numberOfBroken = 0
    thread = res: []
    first = true
    resCount = if resLength? then resLength else 0

    for line in text.split(separator)
      title = titleReg.exec(line)
      regRes = reg.exec(line)

      if title
        thread.title = app.util.decode_char_reference(title[1])
        thread.title = app.util.removeNeedlessFromTitle(thread.title)
      else if regRes
        while ++resCount isnt +regRes[1]
          thread.res.push
            name: "あぼーん"
            mail: "あぼーん"
            message: "あぼーん"
            other: "あぼーん"
        thread.res.push
          name: regRes[3]
          mail: regRes[2] or ""
          message: regRes[5]
          other: regRes[4]

    if thread.res.length > 0 and thread.res.length > numberOfBroken
      thread
    else
      null
