import {fix as fixUrl, parseQuery, setScheme, getScheme, tsld as getTsld, guessType} from "../core/URL.ts"
import {fadeIn, fadeOut} from "../ui/Animate.coffee"

class Timer
  _timeout: null
  _MSEC: 30 * 1000

  constructor: (@onFinish) ->
    return

  wake: ->
    @kill() if @_timeout?
    @_timeout = setTimeout( =>
      @onFinish()
      return
    , @_MSEC)
    return

  kill: ->
    clearTimeout(@_timeout)
    @_timeout = null
    return

export default class Write
  url: null
  title: null
  name: null
  mail: null
  message: null

  $view: $$.C("view_write")[0]
  timer: null
  _PONG_MSG: "write_iframe_pong"

  @setFont: ->
    return if navigator.platform.includes("Win")
    font = localStorage.getItem("textar_font")
    return unless font?
    fontface = new FontFace("Textar", "url(#{font})")
    document.fonts.add(fontface)
    return

  constructor: ->
    param = parseQuery(location.search)
    @url = fixUrl(param.get("url"))
    @title = param.get("title") ? param.get("url")
    @name = param.get("name") ? app.config.get("default_name")
    @mail = param.get("mail") ? app.config.get("default_mail")
    @message = param.get("message") ? ""
    @timer = new Timer(@_onTimerFinish)

    @_setHeaderModifier()
    @_setupTheme()
    @_setDOM()
    @_setBeforeUnload()
    @_setTitle()
    @_setupMessage()
    @_setupForm()
    return

  _beforeSendFunc: ->
    url = @url
    return ({method, requestHeaders}) ->
      origin = browser.runtime.getURL("")[...-1]
      isSameOrigin = (
        requestHeaders.some( ({name, value}) ->
          return name is "Origin" and (value is origin or value is "null")
        ) or
        !requestHeaders.includes("Origin")
      )
      return unless method is "POST" and isSameOrigin
      if getTsld(url) is "2ch.sc"
        url = setScheme(url, "http")
      requestHeaders.push(name: "Referer", value: url)

      # UA変更処理
      ua = app.config.get("useragent").trim()
      if ua.length > 0
        for {name}, i in requestHeaders when name is "User-Agent"
          requestHeaders[i].value = ua
          break

      return {requestHeaders}

  _setHeaderModifier: ->
    return

  _setupTheme: ->
    # テーマ適用
    @_changeTheme(app.config.get("theme_id"))
    @_insertUserCSS()

    # テーマ更新反映
    app.message.on("config_updated", ({key, val}) =>
      if key is "theme_id"
        @_changeTheme(val)
      return
    )
    return

  _changeTheme: (themeId) ->
    # テーマ適用
    @$view.removeClass("theme_default", "theme_dark", "theme_none")
    @$view.addClass("theme_#{themeId}")
    return

  _insertUserCSS: ->
    style = $__("style")
    style.id = "user_css"
    style.textContent = app.config.get("user_css")
    document.head.addLast(style)
    return

  _setDOM: ->
    @_setSageDOM()
    @_setDefaultInput()

    @$view.C("preview_button")[0].on("click", (e) ->
      e.preventDefault()

      text = $view.T("textarea")[0].value
      #行頭のスペースは削除される。複数のスペースは一つに纏められる。
      text = text.replace(/^\u0020*/g, "").replace(/\u0020+/g, " ")

      $div = $__("div").addClass("preview")
      $pre = $__("pre")
      $pre.textContent = text
      $button = $__("button").addClass("close_preview")
      $button.textContent = "戻る"
      $button.on("click", ->
        @parent().remove()
        return
      )
      $div.addLast($pre, $button)
      document.body.addLast($div)
      return
    )

    @$view.C("message")[0].on("keyup", ({target}) =>
      line = target.value.split(/\n/).length
      @$view.C("notice")[0].textContent = "#{target.value.length}文字 #{line}行"
      return
    )
    return

  _setSageDOM: ->
    $sage = @$view.C("sage")[0]
    $mail = @$view.C("mail")[0]

    if app.config.isOn("sage_flag")
      $sage.checked = true
      $mail.disabled = true
    @$view.C("sage")[0].on("change", ->
      if @checked
        app.config.set("sage_flag", "on")
        $mail.disabled = true
      else
        app.config.set("sage_flag", "off")
        $mail.disabled = false
      return
    )
    return

  _setDefaultInput: ->
    @$view.C("name")[0].value = @name
    @$view.C("mail")[0].value = @mail
    @$view.C("message")[0].value = @message
    return

  _setTitle: ->
    $h1 = @$view.T("h1")[0]
    document.title = @title
    $h1.textContent = @title
    $h1.addClass("https") if getScheme(@url) is "https"
    return

  _setBeforeUnload: ->
    window.on("beforeunload", ->
      browser.runtime.sendMessage(type: "write_position", x: screenX, y: screenY)
      return
    )
    return

  _onTimerFinish: ->
    @_onError("一定時間経過しても応答が無いため、処理を中断しました")
    return

  _onError: (message) ->
    for dom from @$view.$$("form input, form textarea")
      dom.disabled = false unless dom.hasClass("mail") and app.config.isOn("sage_flag")

    $notice = @$view.C("notice")[0]
    if message
      $notice.textContent = "書き込み失敗 - #{message}"
    else
      $notice.textContent = ""
      fadeIn(@$view.C("iframe_container")[0])
    return

  _onSuccess: (key) ->
    return

  _setupMessage: ->
    window.on("message", ({ data: {type, key, message}, source }) =>
      switch type
        when "ping"
          source.postMessage(@_PONG_MSG, "*")
          @timer.wake()
        when "success"
          @$view.C("notice")[0].textContent = "書き込み成功"
          @timer.kill()
          await app.wait(message)
          @_onSuccess(key)
          {id} = await browser.tabs.getCurrent()
          browser.tabs.remove(id)
        when "confirm"
          fadeIn($view.C("iframe_container")[0])
          @timer.kill()
        when "error"
          @_onError(message)
          @timer.kill()
      return
    )
    return

  _getIframeArgs: ->
    return {
      rcrxName: @$view.C("name")[0].value
      rcrxMail: if @$view.C("sage")[0].checked then "sage" else @$view.C("mail")[0].value
      rcrxMessage: @$view.C("message")[0].value
    }

  _getFormData: ->
    scheme = getScheme(@url)
    {bbsType} = guessType(@url)
    splittedUrl = @url.split("/")
    args = @_getIframeArgs()
    return {scheme, bbsType, splittedUrl, args}

  _setupForm: ->
    @$view.C("hide_iframe")[0].on("click", =>
      @timer.kill()
      $iframeC = @$view.C("iframe_container")[0]
      do ->
        ani = await fadeOut($iframeC)
        ani.on("finish", ->
          $iframeC.T("iframe")[0].remove()
          return
        )
        return
      for dom from @$view.$$("input, textarea")
        dom.disabled = false unless dom.hasClass("mail") and app.config.isOn("sage_flag")
      @$view.C("notice")[0].textContent = ""
      return
    )

    @$view.T("form")[0].on("submit", (e) =>
      e.preventDefault()

      for dom from @$view.$$("input, textarea")
        dom.disabled = true unless dom.hasClass("mail") and app.config.isOn("sage_flag")

      $iframe = $__("iframe")
      $iframe.src = "/view/empty.html"
      $iframe.on("load", =>
        formData = @_getFormData()
        iframeDoc = $iframe.contentDocument
        #フォーム生成
        form = iframeDoc.createElement("form")
        form.setAttribute("accept-charset", formData.charset)
        form.action = formData.action
        form.method = "POST"
        for key, val of formData.input
          input = iframeDoc.createElement("input")
          input.name = key
          input.setAttribute("value", val)
          form.appendChild(input)
        for key, val of formData.textarea
          textarea = iframeDoc.createElement("textarea")
          textarea.name = key
          textarea.textContent = val
          form.appendChild(textarea)
        iframeDoc.body.appendChild(form)
        Object.getPrototypeOf(form).submit.call(form)
        return
      , once: true)
      $$.C("iframe_container")[0].addLast($iframe)

      @timer.wake()
      @$view.C("notice")[0].textContent = "書き込み中"
      return
    )
    return
