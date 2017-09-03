do ->
  return if navigator.platform.includes("Win")
  font = localStorage.getItem("textar_font")
  return unless font?
  document.on("DOMContentLoaded", ->
    style = $__("style")
    style.textContent = """
      @font-face {
        font-family: "Textar";
        src: url(#{font});
      }
    """
    document.head.addLast(style)
    return
  )
  return

app.boot("/write/write.html", ->
  param = app.URL.parseQuery(location.search)
  arg =
    url: app.URL.fix(param.get("url"))
    title: param.get("title") ? param.get("url")
    name: param.get("name") ? app.config.get("default_name")
    mail: param.get("mail") ? app.config.get("default_mail")
    message: param.get("message") ? ""

  chrome.tabs.getCurrent( ({id}) ->
    chrome.webRequest.onBeforeSendHeaders.addListener( ({method, url, requestHeaders}) ->
      origin = chrome.extension.getURL("")[...-1]
      isSameOrigin = requestHeaders.some( ({name, value}) ->
        return name is "Origin" and (value is origin or value is "null")
      )
      if (
        method is "POST" and isSameOrigin and
        (
          ///^https?://\w+\.(2ch\.net|bbspink\.com|2ch\.sc|open2ch\.net)/test/bbs\.cgi ///.test(url) or
          ///^https?://jbbs\.shitaraba\.net/bbs/write\.cgi/ ///.test(url)
        )
      )
        if (
          app.URL.tsld(arg.url) is "2ch.sc" and
          app.URL.getScheme(arg.url) is "https"
        )
          refUrl = app.URL.changeScheme(arg.url)
        else
          refUrl = arg.url
        requestHeaders.push(name: "Referer", value: refUrl)

        # UA変更処理
        ua = app.config.get("useragent").trim()
        if ua.length > 0
          for header, i in requestHeaders when header.name is "User-Agent"
            requestHeaders[i].value = ua
            break

        return {requestHeaders}
      return
    {
      tabId: id
      types: ["sub_frame"]
      urls: [
        "*://*.2ch.net/test/bbs.cgi*"
        "*://*.bbspink.com/test/bbs.cgi*"
        "*://*.2ch.sc/test/bbs.cgi*"
        "*://*.open2ch.net/test/bbs.cgi*"
        "*://jbbs.shitaraba.net/bbs/write.cgi/*"
      ]
    }
    ["requestHeaders", "blocking"])
    return
  )

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
      return
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
    for {input_name, input_mail} in data
      if names.length <= 5
        names.push(input_name) unless names.includes(input_name)
      if mails.length <= 5
        mails.push(input_mail) unless mails.includes(input_mail)
      if names.length+mails.length >= 10
        break
    $names = $__("datalist")
    $names.id = "names"
    for n in names
      $option = $__("option")
      $option.value = n
      $names.addLast($option)
    $mails = $__("datalist")
    $mails.id = "mails"
    for m in mails
      $option = $__("option")
      $option.value = m
      $mails.addLast($option)
    $$.I("main").addLast($names)
    $$.I("main").addLast($mails)
    return
  )

  $notice = $view.C("notice")[0]
  onError = (message) ->
    for dom from $view.$$("form input, form textarea")
      dom.disabled = false unless dom.hasClass("mail") and app.config.get("sage_flag") is "on"

    if message
      $notice.textContent = "書き込み失敗 - #{message}"
    else
      $notice.textContent = ""
      UI.Animate.fadeIn($view.C("iframe_container")[0])

    chrome.runtime.sendMessage(type: "written?", url: arg.url, mes: arg.message, name: arg.name, mail: arg.mail)
    return

  writeTimer =
    wake: ->
      if @timer? then @kill()
      @timer = setTimeout( ->
        onError("一定時間経過しても応答が無いため、処理を中断しました")
        return
      , 1000 * 30)
      return
    kill: ->
      clearTimeout(@timer)
      @timer = null
      return

  window.on("message", ({data, source}) ->
    {type, message} = JSON.parse(data)
    switch type
      when "ping"
        source.postMessage("write_iframe_pong", "*")
        writeTimer.wake()
      when "success"
        $notice.textContent = "書き込み成功"
        setTimeout( ->
          mes = $view.C("message")[0].value
          name = $view.C("name")[0].value
          mail = $view.C("mail")[0].value
          chrome.runtime.sendMessage({type: "written", url: arg.url, mes, name, mail})
          chrome.tabs.getCurrent( ({id}) ->
            chrome.tabs.remove(id)
            return
          )
          return
        , 2000)
        writeTimer.kill()
      when "confirm"
        UI.Animate.fadeIn($view.C("iframe_container")[0])
        writeTimer.kill()
      when "error"
        onError(message)
        writeTimer.kill()
    return
  )

  $view.C("hide_iframe")[0].on("click", ->
    writeTimer.kill()
    $iframeContainer = $view.C("iframe_container")[0]
    UI.Animate.fadeOut($iframeContainer).on("finish", ->
      $iframeContainer.T("iframe")[0].remove()
      return
    )
    for dom from $view.$$("input, textarea")
      dom.disabled = false unless dom.hasClass("mail") and app.config.get("sage_flag") is "on"
    $notice.textContent = ""
    return
  )

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

    {bbsType} = app.URL.guessType(arg.url)

    iframeArg =
      rcrxName: $view.C("name")[0].value
      rcrxMail: if $view.C("sage")[0].checked then "sage" else $view.C("mail")[0].value
      rcrxMessage: $view.C("message")[0].value

    $iframe = $__("iframe")
    $iframe.src = "/view/empty.html"
    $iframe.on("load", fn = ->
      $iframe.off("load", fn)

      scheme = app.URL.getScheme(arg.url)
      #2ch
      if bbsType is "2ch"
        #open2ch
        if app.URL.tsld(arg.url) is "open2ch.net"
          tmp = arg.url.split("/")
          formData =
            action: "#{scheme}://#{tmp[2]}/test/bbs.cgi"
            charset: "UTF-8"
            input:
              submit: "書"
              bbs: tmp[5]
              key: tmp[6]
              FROM: iframeArg.rcrxName
              mail: iframeArg.rcrxMail
            textarea:
              MESSAGE: iframeArg.rcrxMessage
        else
          tmp = arg.url.split("/")
          formData =
            action: "#{scheme}://#{tmp[2]}/test/bbs.cgi"
            charset: "Shift_JIS"
            input:
              submit: "書きこむ"
              time: Math.floor(Date.now() / 1000) - 60
              bbs: tmp[5]
              key: tmp[6]
              FROM: iframeArg.rcrxName
              mail: iframeArg.rcrxMail
            textarea:
              MESSAGE: iframeArg.rcrxMessage
      #したらば
      else if bbsType is "jbbs"
        tmp = arg.url.split("/")
        formData =
          action: "#{scheme}://jbbs.shitaraba.net/bbs/write.cgi/#{tmp[5]}/#{tmp[6]}/#{tmp[7]}/"
          charset: "EUC-JP"
          input:
            TIME: Math.floor(Date.now() / 1000) - 60
            DIR: tmp[5]
            BBS: tmp[6]
            KEY: tmp[7]
            NAME: iframeArg.rcrxName
            MAIL: iframeArg.rcrxMail
          textarea:
            MESSAGE: iframeArg.rcrxMessage
      #フォーム生成
      form = @contentDocument.createElement("form")
      form.setAttribute("accept-charset", formData.charset)
      form.action = formData.action
      form.method = "POST"
      for key, val of formData.input
        input = @contentDocument.createElement("input")
        input.name = key
        input.setAttribute("value", val)
        form.appendChild(input)
      for key, val of formData.textarea
        textarea = @contentDocument.createElement("textarea")
        textarea.name = key
        textarea.textContent = val
        form.appendChild(textarea)
      @contentDocument.body.appendChild(form)
      Object.getPrototypeOf(form).submit.call(form)
      return
    )
    $$.C("iframe_container")[0].addLast($iframe)

    writeTimer.wake()

    $notice.textContent = "書き込み中"
    return
  )

  # 忍法帳関連処理
  do ->
    return if app.URL.tsld(arg.url) isnt "2ch.net"

    app.Ninja.getCookie( (cookies) ->
      backup = app.Ninja.getBackup()

      availableCookie = cookies.some(({site}) -> site.siteId is "2ch")
      availableBackup = backup.some(({site}) -> site.siteId is "2ch")

      if (not availableCookie) and availableBackup
        $notice.innerHTML = """
          忍法帳クッキーが存在しませんが、バックアップが利用可能です。
          <button class="ninja_restore">バックアップから復元</button>
        """
      return
    )

    $view.on("click", (e) ->
      return unless e.target.hasClass("ninja_restore")
      e.preventDefault()
      $notice.textContent = "復元中です。"
      app.Ninja.restore("2ch", ->
        $notice.textContent = "忍法帳クッキーの復元が完了しました。"
        return
      )
      return
    )
    return

  window.on("beforeunload", ->
    chrome.runtime.sendMessage(type: "writesize", x: screenX, y: screenY)
    return
  )
  return
)
