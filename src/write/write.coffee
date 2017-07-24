do ->
  return if /windows/i.test(navigator.userAgent)
  if "textar_font" of localStorage
    document.on("DOMContentLoaded", ->
      style = $__("style")
      style.textContent = """
        @font-face {
          font-family: "Textar";
          src: url(#{localStorage.textar_font});
        }
      """
      document.head.addLast(style)
      return
    )
  return

app.boot "/write/write.html", ->
  param = app.URL.parseQuery(location.search)
  arg = {}
  arg.url = app.URL.fix(param.get("url"))
  arg.title = param.get("title") ? param.get("url")
  arg.name = param.get("name") ? app.config.get("default_name")
  arg.mail = param.get("mail") ? app.config.get("default_mail")
  arg.message = param.get("message") ? ""

  chrome.tabs.getCurrent (tab) ->
    chrome.webRequest.onBeforeSendHeaders.addListener(
      (req) ->
        origin = chrome.extension.getURL("")[...-1]
        is_same_origin = req.requestHeaders.some((header) -> header.name is "Origin" and (header.value is origin or header.value is "null"))
        if req.method is "POST" and is_same_origin
          if (
            ///^https?://\w+\.(2ch\.net|bbspink\.com|2ch\.sc|open2ch\.net)/test/bbs\.cgi ///.test(req.url) or
            ///^https?://jbbs\.shitaraba\.net/bbs/write\.cgi/ ///.test(req.url)
          )
            if (
              app.URL.tsld(arg.url) is "2ch.sc" and
              app.URL.getScheme(arg.url) is "https"
            )
              refUrl = app.URL.changeScheme(arg.url)
            else
              refUrl = arg.url
            req.requestHeaders.push(name: "Referer", value: refUrl)

            # UA変更処理
            ua = app.config.get("useragent").trim()
            if ua.length > 0
              for i in [0..req.requestHeaders.length-1] when req.requestHeaders[i].name is "User-Agent"
                req.requestHeaders[i].value = ua
                break

            return requestHeaders: req.requestHeaders
        return
      {
        tabId: tab.id
        types: ["sub_frame"]
        urls: [
          "*://*.2ch.net/test/bbs.cgi*"
          "*://*.bbspink.com/test/bbs.cgi*"
          "*://*.2ch.sc/test/bbs.cgi*"
          "*://*.open2ch.net/test/bbs.cgi*"
          "*://jbbs.shitaraba.net/bbs/write.cgi/*"
        ]
      }
      ["requestHeaders", "blocking"]
    )
    return

  $view = $$.C("view_write")[0]

  $view.C("preview_button")[0].on("click", (e) ->
    e.preventDefault()

    text = $view.T("textarea")[0].value
    #行頭のスペースは削除される。複数のスペースは一つに纏められる。
    text = text.replace(/^\u0020*/g, "").replace(/\u0020+/g, " ")

    $div = $__("div")
    $div.addClass("preview")
    $pre = $__("pre")
    $pre.textContent = text
    $div.addLast($pre)
    $button = $__("button")
    $button.addClass("close_preview")
    $button.textContent = "戻る"
    $button.on("click", ->
      @parentElement.remove()
    )
    $div.addLast($button)
    document.body.addLast($div)
    return
  )

  $view.C("message")[0].on("keyup", ->
    line = @value.split(/\n/).length
    $view.C("notice")[0].textContent = "#{@value.length}文字 #{line}行"
    return
  )

  $sage = $view.C("sage")[0]
  $mail = $view.C("mail")[0]

  if app.config.get("sage_flag") is "on"
    $sage.checked = true
    $mail.disabled = true
  $view.C("sage")[0].on("change", ->
    if @checked
      app.config.set("sage_flag", "on")
      $mail.disabled = true
    else
      app.config.set("sage_flag", "off")
      $mail.disabled = false
    return
  )

  app.WriteHistory.getByUrl(arg.url).then( (data) ->
    names = []
    mails = []
    for d in data
      if names.length <= 5
        names.push(d.input_name) unless names.includes(d.input_name)
      if mails.length <= 5
        mails.push(d.input_mail) unless mails.includes(d.input_mail)
      if names.length+mails.length >= 10
        break
    html = "<datalist id=\"names\">"
    for n in names
      html += "<option value=\"#{n}\">"
    html += "</datalist>"
    html += "<datalist id=\"mails\">"
    for m in mails
      html += "<option value=\"#{m}\">"
    html += "</datalist>"
    $$.I("main").insertAdjacentHTML("beforeend", html)
    return
  )

  $notice = $view.C("notice")[0]
  on_error = (message) ->
    for dom from $view.$$("form input, form textarea")
      dom.disabled = false unless dom.hasClass("mail") and app.config.get("sage_flag") is "on"

    if message
      $notice.textContent = "書き込み失敗 - #{message}"
    else
      $notice.textContent = ""
      UI.Animate.fadeIn($view.C("iframe_container")[0])

    chrome.runtime.sendMessage(type: "written?", url: arg.url, mes: arg.message, name: arg.name, mail: arg.mail)
    return

  write_timer =
    wake: ->
      if @timer? then @kill()
      @timer = setTimeout ->
        on_error("一定時間経過しても応答が無いため、処理を中断しました")
      , 1000 * 30
    kill: ->
      clearTimeout(@timer)
      @timer = null

  window.on "message", (e) ->
    message = JSON.parse(e.data)
    if message.type is "ping"
      e.source.postMessage("write_iframe_pong", "*")
      write_timer.wake()
    else if message.type is "success"
      $notice.textContent = "書き込み成功"
      setTimeout ->
        message = $view.C("message")[0].value
        name = $view.C("name")[0].value
        mail = $view.C("mail")[0].value
        chrome.runtime.sendMessage(type: "written", url: arg.url, mes: message, name: name, mail: mail)
        chrome.tabs.getCurrent (tab) ->
          chrome.tabs.remove(tab.id)
      , 2000
      write_timer.kill()
    else if message.type is "confirm"
      UI.Animate.fadeIn($view.C("iframe_container")[0])
      write_timer.kill()
    else if message.type is "error"
      on_error(message.message)
      write_timer.kill()
    return

  $view.C("hide_iframe")[0].on "click", ->
    write_timer.kill()
    $iframeContainer = $view.C("iframe_container")[0]
    UI.Animate.fadeOut($iframeContainer).on("finish", ->
      $iframeContainer.T("iframe")[0].remove()
      return
    )
    for dom from $view.$$("input, textarea")
      dom.disabled = false unless dom.hasClass("mail") and app.config.get("sage_flag") is "on"
    $notice.textContent = ""
    return

  document.title = arg.title
  $h1 = $view.T("h1")[0]
  $h1.textContent = arg.title
  $h1.addClass("https") if app.URL.getScheme(arg.url) is "https"
  $view.C("name")[0].value = arg.name
  $view.C("mail")[0].value = arg.mail
  $view.C("message")[0].value = arg.message

  $view.T("form")[0].on("submit", (e) ->
    e.preventDefault()

    for dom from $view.$$("input, textarea")
      dom.disabled = true unless dom.hasClass("mail") and app.config.get("sage_flag") is "on"

    guess_res = app.URL.guessType(arg.url)

    iframe_arg =
      rcrx_name: $view.C("name")[0].value
      rcrx_mail: if $view.C("sage")[0].checked then "sage" else $view.C("mail")[0].value
      rcrx_message: $view.C("message")[0].value

    $iframe = $__("iframe")
    $iframe.src = "/view/empty.html"
    $iframe.on("load", fn = ->
      $iframe.off("load", fn)

      scheme = app.URL.getScheme(arg.url)
      #2ch
      if guess_res.bbsType is "2ch"
        #open2ch
        if app.URL.tsld(arg.url) is "open2ch.net"
          tmp = arg.url.split("/")
          form_data =
            action: "#{scheme}://#{tmp[2]}/test/bbs.cgi"
            charset: "UTF-8"
            input:
              submit: "書"
              bbs: tmp[5]
              key: tmp[6]
              FROM: iframe_arg.rcrx_name
              mail: iframe_arg.rcrx_mail
            textarea:
              MESSAGE: iframe_arg.rcrx_message
        else
          tmp = arg.url.split("/")
          form_data =
            action: "#{scheme}://#{tmp[2]}/test/bbs.cgi"
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
      else if guess_res.bbsType is "jbbs"
        tmp = arg.url.split("/")
        form_data =
          action: "#{scheme}://jbbs.shitaraba.net/bbs/write.cgi/#{tmp[5]}/#{tmp[6]}/#{tmp[7]}/"
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
      form = @contentDocument.createElement("form")
      form.setAttribute("accept-charset", form_data.charset)
      form.action = form_data.action
      form.method = "POST"
      for key, val of form_data.input
        input = @contentDocument.createElement("input")
        input.name = key
        input.setAttribute("value", val)
        form.appendChild(input)
      for key, val of form_data.textarea
        textarea = @contentDocument.createElement("textarea")
        textarea.name = key
        textarea.textContent = val
        form.appendChild(textarea)
      @contentDocument.body.appendChild(form)
      Object.getPrototypeOf(form).submit.call(form)
      return
    )
    $$.C("iframe_container")[0].addLast($iframe)

    write_timer.wake()

    $notice.textContent = "書き込み中"
    return
  )

  # 忍法帳関連処理
  do ->
    return if app.URL.tsld(arg.url) isnt "2ch.net"

    app.Ninja.getCookie (cookies) ->
      backup = app.Ninja.getBackup()

      availableCookie = cookies.some((info) -> info.site.siteId is "2ch")
      availableBackup = backup.some((info) -> info.site.siteId is "2ch")

      if (not availableCookie) and availableBackup
        $notice.innerHTML = """
          忍法帳クッキーが存在しませんが、バックアップが利用可能です。
          <button class="ninja_restore">バックアップから復元</button>
        """
      return

    $view.on "click", (e) ->
      return unless e.target.hasClass("ninja_restore")
      e.preventDefault()
      $notice.textContent = "復元中です。"
      app.Ninja.restore "2ch", ->
        $notice.textContent = "忍法帳クッキーの復元が完了しました。"
        return
      return
    return

  window.on("beforeunload", ->
    chrome.runtime.sendMessage(type: "writesize", x: screenX, y: screenY)
    return
  )
  return
