do ->
  return if /windows/i.test(navigator.userAgent)
  if "textar_font" of localStorage
    $ ->
      style = document.createElement("style")
      style.textContent = """
        @font-face {
          font-family: "Textar";
          src: url(#{localStorage.textar_font});
        }
      """
      document.head.appendChild(style)
      return
  return

app.boot "/write/write.html", ->
  arg = app.url.parse_query(location.href)
  arg.url = app.url.fix(arg.url)
  arg.title or= arg.url
  arg.name or= app.config.get("default_name")
  arg.mail or= app.config.get("default_mail")
  arg.message or= ""

  chrome.tabs.getCurrent (tab) ->
    chrome.webRequest.onBeforeSendHeaders.addListener(
      (req) ->
        origin = chrome.extension.getURL("")[...-1]
        is_same_origin = req.requestHeaders.some((header) -> header.name is "Origin" and (header.value is origin or header.value is "null"))
        if req.method is "POST" and is_same_origin
          if (
            ///^http://\w+\.(2ch\.net|bbspink\.com)/test/bbs\.cgi ///.test(req.url) or
            ///^http://jbbs\.shitaraba\.net/bbs/write\.cgi/ ///.test(req.url)
          )
            req.requestHeaders.push(name: "Referer", value: arg.url)

            # UA変更処理
            ua = app.config.get("useragent").trim()
            if ua.length > 0
              for i in [0..req.requestHeaders.length-1]
                if req.requestHeaders[i].name is "User-Agent"
                  req.requestHeaders[i].value = ua
                  break

            return requestHeaders: req.requestHeaders
        return
      {
        tabId: tab.id
        types: ["sub_frame"]
        urls: [
          "http://*.2ch.net/test/bbs.cgi*"
          "http://*.bbspink.com/test/bbs.cgi*"
          "http://jbbs.shitaraba.net/bbs/write.cgi/*"
        ]
      }
      ["requestHeaders", "blocking"]
    )
    return

  $view = $(".view_write")

  $view.find(".preview_button").on "click", (e) ->
    e.preventDefault()

    text = $view.find("textarea").val()
    #行頭のスペースは削除される。複数のスペースは一つに纏められる。
    text = text.replace(/^\u0020*/g, "").replace(/\u0020+/g, " ")

    $("<div>", class: "preview")
      .append($("<pre>", {text}))
      .append(
        $("<button>", class: "close_preview", text: "戻る").on "click", ->
          $(@).parent().remove()
          return
      )
      .appendTo(document.body)
    return

  $view.find(".message").on "keyup", (e) ->
    line = this.value.split(/\n/).length
    $view.find(".notice").text("#{this.value.length}文字 #{line}行")
    return

  on_error = (message) ->
    $view.find("form input, form textarea").removeAttr("disabled")

    if message
      $view.find(".notice").text("書き込み失敗 - #{message}")
    else
      $view.find(".notice").text("")
      $view.find(".iframe_container").fadeIn("fast")

    chrome.extension.sendRequest(type: "written?", url: arg.url)

  write_timer =
    wake: ->
      if @timer? then @kill()
      @timer = setTimeout ->
        on_error("一定時間経過しても応答が無いため、処理を中断しました")
      , 1000 * 30
    kill: ->
      clearTimeout(@timer)
      @timer = null

  window.addEventListener "message", (e) ->
    message = JSON.parse(e.data)
    if message.type is "ping"
      e.source.postMessage("write_iframe_pong", "*")
      write_timer.wake()
    else if message.type is "success"
      $view.find(".notice").text("書き込み成功")
      setTimeout ->
        chrome.extension.sendRequest(type: "written", url: arg.url)
        chrome.tabs.getCurrent (tab) ->
          chrome.tabs.remove(tab.id)
      , 2000
      write_timer.kill()
    else if message.type is "confirm"
      $view.find(".iframe_container").fadeIn("fast")
      write_timer.kill()
    else if message.type is "error"
      on_error(message.message)
      write_timer.kill()
    return

  $view.find(".hide_iframe").bind "click", ->
    write_timer.kill()
    $view
      .find(".iframe_container")
        .find("iframe")
          .remove()
        .end()
      .fadeOut("fast")
    $view.find("input, textarea").removeAttr("disabled")
    $view.find(".notice").text("")
    return

  document.title = arg.title
  $view.find("h1").text(arg.title)
  $view.find(".name").val(arg.name)
  $view.find(".mail").val(arg.mail)
  $view.find(".message").val(arg.message)

  $view.find("form").bind "submit", (e) ->
    e.preventDefault()

    $view.find("input, textarea").attr("disabled", true)

    guess_res = app.url.guess_type(arg.url)

    iframe_arg =
      rcrx_name: $view.find(".name").val()
      rcrx_mail: $view.find(".mail").val()
      rcrx_message: $view.find(".message").val()

    $iframe = $("<iframe>", src: "/view/empty.html")
    $iframe.one "load", ->
      #2ch
      if guess_res.bbs_type is "2ch"
        tmp = arg.url.split("/")
        form_data =
          action: "http://#{tmp[2]}/test/bbs.cgi"
          charset: "Shift_JIS"
          input:
            submit: "書きこむ"
            time: Math.floor(Date.now() / 1000) - 60
            bbs: tmp[5]
            key: tmp[6]
            FROM: iframe_arg.rcrx_name
            mail: iframe_arg.rcrx_mail
          textarea:
            MESSAGE: iframe_arg.rcrx_message
      #したらば
      else if guess_res.bbs_type is "jbbs"
        tmp = arg.url.split("/")
        form_data =
          action: "http://jbbs.shitaraba.net/bbs/write.cgi/#{tmp[5]}/#{tmp[6]}/#{tmp[7]}/"
          charset: "EUC-JP"
          input:
            TIME: Math.floor(Date.now() / 1000) - 60
            DIR: tmp[5]
            BBS: tmp[6]
            KEY: tmp[7]
            NAME: iframe_arg.rcrx_name
            MAIL: iframe_arg.rcrx_mail
          textarea:
            MESSAGE: iframe_arg.rcrx_message
      #フォーム生成
      form = @contentWindow.document.createElement("form")
      form.setAttribute("accept-charset", form_data.charset)
      form.action = form_data.action
      form.method = "POST"
      for key, val of form_data.input
        input = @contentWindow.document.createElement("input")
        input.name = key
        input.setAttribute("value", val)
        form.appendChild(input)
      for key, val of form_data.textarea
        textarea = @contentWindow.document.createElement("textarea")
        textarea.name = key
        textarea.textContent = val
        form.appendChild(textarea)
      form.__proto__.submit.call(form)
      return
    $iframe.appendTo(".iframe_container")

    write_timer.wake()

    $view.find(".notice").text("書き込み中")

  # 忍法帳関連処理
  do ->
    return if app.url.tsld(arg.url) isnt "2ch.net"

    app.Ninja.getCookie (cookies) ->
      backup = app.Ninja.getBackup()

      availableCookie = cookies.some((info) -> info.site.siteId is "2ch")
      availableBackup = backup.some((info) -> info.site.siteId is "2ch")

      if (not availableCookie) and availableBackup
        $view.find(".notice").html("""
          忍法帳クッキーが存在しませんが、バックアップが利用可能です。
          <button class="ninja_restore">バックアップから復元</button>
        """)
      return

    $view.on "click", ".ninja_restore", (e) ->
      e.preventDefault()
      $view.find(".notice").text("復元中です。")
      app.Ninja.restore "2ch", ->
        $view.find(".notice").text("忍法帳クッキーの復元が完了しました。")
        return
      return
    return
  return
