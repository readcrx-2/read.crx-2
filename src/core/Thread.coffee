###*
@namespace app
@class Thread
@constructor
@param {String} url
###
class app.Thread
  constructor: (url) ->
    @url = app.URL.fix(url)
    @title = null
    @res = null
    @message = null
    @tsld = app.URL.tsld(@url)
    return

  get: (forceUpdate, progress) ->
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

    return new Promise( (resolve, reject) =>
      xhrInfo = Thread._getXhrInfo(@url)
      unless xhrInfo then return reject()
      xhrPath = xhrInfo.path
      xhrCharset = xhrInfo.charset

      cache = new app.Cache(xhrPath)
      hasCache = false
      deltaFlg = false
      readcgiVer = 5
      noChangeFlg = false

      #キャッシュ取得
      cache.get().then =>
        return new Promise( (resolve, reject) =>
          hasCache = true
          if forceUpdate or Date.now() - cache.last_updated > 1000 * 3
            #通信が生じる場合のみ、notifyでキャッシュを送出する
            app.defer =>
              if cache.parsed?
                tmp = cache.parsed
              else
                tmp = Thread.parse(@url, cache.data)
              return unless tmp?
              @res = tmp.res
              @title = tmp.title
              progress()
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
              readcgiVer = cache.readcgi_ver
              if readcgiVer >= 6
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
            else if response.status is 500 and readcgiVer >= 6
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
          guessRes = app.URL.guessType(@url)

          if response?.status is 200 or (readcgiVer >= 6 and response?.status is 500)
            if deltaFlg
              # 2ch.netなら-nを使って前回取得したレスの後のレスからのものを取得する
              if @tsld in ["2ch.net", "bbspink.com"]
                threadCache = cache.parsed
                # readcgi ver6,7だと変更がないと500が帰ってくる
                if readcgiVer >= 6 and response.status is 500
                  noChangeFlg = true
                  thread = threadCache
                else
                  threadResponse = Thread.parse(@url, response.body, +cache.res_length)
                  # 新しいレスがない場合は最後のレスのみ表示されるのでその場合はキャッシュを送る
                  if readcgiVer < 6 and threadResponse.res.length is 1
                    noChangeFlg = true
                    thread = threadCache
                  else
                    if readcgiVer < 6
                      threadResponse.res.splice(0, 1)
                    thread = threadResponse
                    thread.res = threadCache.res.concat(threadResponse.res)
              else
                thread = Thread.parse(@url, cache.data + response.body)
            else
              thread = Thread.parse(@url, response.body)
          #2ch系BBSのdat落ち
          else if guessRes.bbsType is "2ch" and response?.status is 203
            if hasCache
              if deltaFlg and @tsld in ["2ch.net", "bbspink.com"]
                thread = cache.parsed
              else
                thread = Thread.parse(@url, cache.data)
            else
              thread = Thread.parse(@url, response.body)
          else if hasCache
            if (app.config.get("format_2chnet") isnt "dat" and @tsld is "2ch.net") or @tsld is "bbspink.com"
              thread = cache.parsed
            else
              thread = Thread.parse(@url, cache.data)

          #パース成功
          if thread
            #通信成功
            if response?.status is 200 or
                #通信成功（更新なし）
                response?.status is 304 or
                #通信成功（2ch read.cgi ver6,7の差分更新なし）
                (readcgiVer >= 6 and response?.status is 500) or
                #キャッシュが期限内だった場合
                (not response and hasCache)
              resolve({response, thread})
            #2ch系BBSのdat落ち
            else if guessRes.bbsType is "2ch" and response?.status is 203
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
        @message = ""
        resolve()
        return {response, thread}
      , ({response, thread}) =>
        @message = ""

        #2chでrejectされてる場合は移転を疑う
        if @tsld is "2ch.net" and response
          app.util.ch_server_move_detect(app.URL.threadToBoard(@url))
            #移転検出時
            .then (newBoardURL) =>
              tmp = ///^https?://(\w+)\.2ch\.net/ ///.exec(newBoardURL)[1]
              newURL = @url.replace(
                ///^(https?://)\w+(\.2ch\.net/test/read\.cgi/\w+/\d+/)$///,
                ($0, $1, $2) -> $1 + tmp + $2
              )

              @message += """
              スレッドの読み込みに失敗しました。
              サーバーが移転している可能性が有ります
              (<a href="#{app.escapeHtml(app.safeHref(newURL))}"
                class="open_in_rcrx">#{app.escapeHtml(newURL)}</a>)
              """
              return
            #移転検出出来なかった場合
            .catch =>
              if response?.status is 203
                @message += "dat落ちしたスレッドです。"
              else
                @message += "スレッドの読み込みに失敗しました。"
              return
            .then =>
              if hasCache and !thread
                @message += "キャッシュに残っていたデータを表示します。"
              reject()
              return
        else if @tsld is "shitaraba.net" and @url.includes("/read.cgi/")
          newURL = @url.replace("/read.cgi/", "/read_archive.cgi/")
          @message += """
          スレッドの読み込みに失敗しました。
          過去ログの可能性が有ります
          (<a href="#{app.escapeHtml(app.safeHref(newURL))}"
            class="open_in_rcrx">#{app.escapeHtml(newURL)}</a>)
          """
          reject()
          return
        else
          @message += "スレッドの読み込みに失敗しました。"

          if hasCache and !thread
            @message += "キャッシュに残っていたデータを表示します。"

          reject()
        return {response, thread}
      #キャッシュ更新部
      .then ({response, thread}) =>
        #通信に成功した場合
        if (response?.status is 200 and thread) or (readcgiVer >= 6 and response?.status is 500)
          cache.last_updated = Date.now()

          html2ch = false
          if (app.config.get("format_2chnet") isnt "dat" and @tsld is "2ch.net") or @tsld is "bbspink.com"
            readcgiPlace = response.body.indexOf("<div class=\"footer push\">read.cgi ver ")
            if readcgiPlace isnt -1
              readcgiVer = parseInt(response.body.substr(readcgiPlace+38, 2))
            else
              readcgiVer = 5
            html2ch = true

          if deltaFlg
            if @tsld in ["2ch.net", "bbspink.com"] and noChangeFlg is false
              cache.parsed = thread
              cache.readcgi_ver = readcgiVer
            else if noChangeFlg is false
              cache.data += response.body
            cache.res_length = thread.res.length
          else
            if html2ch
              cache.parsed = thread
              cache.readcgi_ver = readcgiVer
            else
              cache.data = response.body
            cache.res_length = thread.res.length

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

      return
    )

  ###*
  @method _getXhrInfo
  @static
  @param {String} url
  @return {null|Object}
  ###
  @_getXhrInfo = (url) ->
    tmp = ///^(https?)://((?:\w+\.)?(\w+\.\w+))/(?:test|bbs)/read(?:_archive)?\.cgi/
      (\w+)/(\d+)/(?:(\d+)/)?$///.exec(url)
    unless tmp then return null
    switch tmp[3]
      when "machi.to"
        path: "#{tmp[1]}://#{tmp[2]}/bbs/offlaw.cgi/#{tmp[4]}/#{tmp[5]}/",
        charset: "Shift_JIS"
      when "shitaraba.net"
        if url.includes("/read_archive.cgi/")
          path: tmp[0],
          charset: "EUC-JP"
        else
          path: "#{tmp[1]}://jbbs.shitaraba.net/" +
            "bbs/rawmode.cgi/#{tmp[4]}/#{tmp[5]}/#{tmp[6]}/",
          charset: "EUC-JP"
      when "2ch.net"
        if app.config.get("format_2chnet") is "dat"
          path: "#{tmp[1]}://#{tmp[2]}/#{tmp[4]}/dat/#{tmp[5]}.dat",
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
    switch app.URL.tsld(url)
      when ""
        null
      when "machi.to"
        Thread._parseMachi(text)
      when "shitaraba.net"
        if url.includes("/read_archive.cgi/")
          Thread._parseJbbsArchive(text)
        else
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
      text = text.replace("</h1>", "</h1></div></div>")
      reg = /<div class="post"[^<>]*><div class="number">\d+[^<>]* : <\/div><div class="name"><b>(?:<a href="mailto:([^<>]*)">|<font [^<>]*>)?(.*?)(?:<\/(?:a|font)>)?<\/b><\/div><div class="date">(.*)<\/div><div class="message"> ?(.*)/
      separator = "</div></div>"
    else if text.includes("<div class=\"footer push\">read.cgi ver 07")
      text = text.replace("</h1>", "</h1></div></div><br>")
      reg = /<div class="post"[^<>]*><div class="meta"><span class="number">\d+<\/span><span class="name"><b>(?:<a href="mailto:([^<>]*)">|<font [^<>]*>)?([^<>]*?)(?:<\/(?:a|font)>)?<\/b><\/span><span class="date">(.*)<\/span><\/div><div class="message">(?:<span class="escaped">)? ?(.*)/
      separator = "</div></div><br>"
    else
      reg = /^(?:<\/?div.*?(?:<br><br>)?)?<dt>\d+.*：(?:<a href="mailto:([^<>]*)">|<font [^>]*>)?<b>(.*)<\/b>.*：(.*)<dd> ?(.*)<br><br>$/
      separator = "\n"
    titleReg = /<h1 [^<>]*>(.*)\n?<\/h1>/;
    numberOfBroken = 0
    thread = res: []
    gotTitle = false

    for line in text.split(separator)
      title = if gotTitle then false else titleReg.exec(line)
      regRes = reg.exec(line)

      if title
        thread.title = app.util.decode_char_reference(title[1])
        thread.title = app.util.removeNeedlessFromTitle(thread.title)
        gotTitle = true
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
  @method _parseJbbsArchive
  @static
  @private
  @param {String} text
  @return {null|Object}
  ###
  @_parseJbbsArchive = (text) ->
    # name, mail, other, message, thread_title
    text = text.replace(/<dl><dt>/, "<dl>\n<dt>")
    reg = /^<dt><a.*>\d+<\/a> ：(?:<a href="mailto:([^<>]*)">|<font [^>]*>)?<b>(.*)<\/b>.*：(.*)<dd> ?(.*)<br><br>$/
    separator = "\n"

    titleReg = /<font size=.*?>(.*)\n?<\/font><\/b>/;
    numberOfBroken = 0
    thread = res: []
    first = true

    for line in text.split(separator)
      title = titleReg.exec(line)
      regRes = reg.exec(line)

      if title
        thread.title = app.util.decode_char_reference(title[1])
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
  @method _parsePink
  @static
  @private
  @param {String} text
  @param {Number} resLength
  @return {null|Object}
  ###
  @_parsePink = (text, resLength) ->
    # name, mail, other, message, thread_title
    if text.includes("<div class=\"footer push\">read.cgi ver 06")
      text = text.replace(/<\/h1>/, "</h1></dd></dl>")
      reg = /^.*?<dl class="post".*><dt class=\"\"><span class="number">(\d+).* : <\/span><span class="name"><b>(?:<a href="mailto:([^<>]*)">|<font [^>]*>)?(.*?)(?:<\/a>|<\/font>)?<\/b><\/span><span class="date">(.*)<\/span><\/dt><dd class="thread_in"> ?(.*)$/
      separator = "</dd></dl>"
    else
      reg = /^(?:<\/?div.*?(?:<br><br>)?)?<dt>(\d+).*：(?:<a href="mailto:([^<>]*)">|<font [^>]*>)?<b>(.*)<\/b>.*：(.*)<dd> ?(.*)<br><br>$/
      separator = "\n"

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
        while ++resCount < +regRes[1]
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
