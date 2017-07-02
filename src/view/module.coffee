do ->
  if frameElement
    modules = [
      "BoardTitleSolver"
      "History"
      "WriteHistory"
      "Thread"
      "board"
      "bookmark"
      "bookmarkEntryList"
      "config"
      "contextMenus"
      "DOMData"
      "HTTP"
      "ImageReplaceDat"
      "module"
      "ReplaceStrTxt"
      "Ninja"
      "NG"
      "notification"
      "ReadState"
      "URL"
      "util"
    ]

    for module in modules
      app[module] = parent.app[module]
  return

app.view ?= {}

###*
@namespace app.view
@class View
@constructor
@param {Element} element
@requires jQuery
###
class app.view.View
  constructor: (@$element) ->
    @_setupTheme()
    @_setupOpenInRcrx()
    return

  ###*
  @method _changeTheme
  @private
  @param {String} themeId
  ###
  _changeTheme: (themeId) ->
    # テーマ適用
    @$element.removeClass("theme_default")
    @$element.removeClass("theme_dark")
    @$element.removeClass("theme_none")
    @$element.addClass("theme_#{themeId}")
    return

  ###*
  @method _setupTheme
  @private
  ###
  _setupTheme: ->
    # テーマ適用
    @_changeTheme(app.config.get("theme_id"))

    # テーマ更新反映
    app.message.addListener "config_updated", (message) =>
      if message.key is "theme_id"
        @_changeTheme(message.val)
      return
    return

  ###*
  @method _insertUserCSS
  @private
  ###
  _insertUserCSS: ->
    style = $__("style")
    style.textContent = app.config.get("user_css")
    document.head.addLast(style)
    return

  ###*
  @method _setupOpenInRcrx
  @private
  ###
  _setupOpenInRcrx: ->
    # .open_in_rcrxリンクの処理
    @$element.on("mousedown", (e) ->
      target = e.target.closest(".open_in_rcrx")
      return unless target?
      e.preventDefault()
      if e.which isnt 3
        url = target.dataset.href or target.href
        title = target.dataset.title or target.textContent
        writtenResNum = if target.getAttr("ignore-res-number") is "on" then null else target.dataset.writtenResNum
        paramResFlg = (
          (app.config.get("enable_link_with_res_number") is "on" and
           target.getAttr("toggle_param_res_num") isnt "on") or
          (app.config.get("enable_link_with_res_number") is "off" and
           target.getAttr("toggle_param_res_num") is "on")
        )
        paramResNum = if paramResFlg then target.dataset.paramResNum else null
        target.removeAttribute("toggle_param_res_num")
        target.removeAttribute("ignore-res-number")
        howToOpen = app.util.get_how_to_open(e)
        newTab = app.config.get("always_new_tab") is "on"
        newTab or= howToOpen.new_tab or howToOpen.new_window
        background = howToOpen.background

        app.message.send("open", {url, new_tab: newTab, background, title, written_res_num: writtenResNum, param_res_num: paramResNum})
      return
    )
    @$element.on("click", (e) ->
      e.preventDefault() if e.target.hasClass("open_in_rcrx")
      return
    )
    return

###*
@namespace app.view
@class IframeView
@extends app.view.View
@constructor
@param {Element} element
###
class app.view.IframeView extends app.view.View
  constructor: (element) ->
    super(element)

    @_setupKeyboard()
    @_setupCommandBox()
    @_numericInput = ""
    return

  ###*
  @method close
  ###
  close: ->
    parent.postMessage(
      JSON.stringify(type: "request_killme"),
      location.origin
    )
    return

  _write: (param) ->
    if @$element.hasClass("view_thread")
      htmlname = "write"
      height = "300"
    else if @$element.hasClass("view_board")
      htmlname = "submit_thread"
      height = "400"
    param or= {}
    param.title = document.title
    param.url = @$element.dataset.url
    open(
      "/write/#{htmlname}.html?#{app.URL.buildQuery(param)}"
      undefined
      "width=600,height=#{height}"
    )
    return

  ###*
  @method execCommand
  @param {String} command
  @param {Number} [repeatCount]
  ###
  execCommand: (command, repeatCount = 1) ->
    # 数値コマンド
    if /^\d+$/.test(command)
      app.DOMData.get(@$element, "selectableItemList")?.select(+command)

    if @$element.hasClass("view_thread")
      # 返信レス
      if (m = /^w([1-9][0-9]?[0-9]?[0-9]?)$/.exec(command))
        @_write(message: ">>#{m[1]}\n")
      else if (m = /^w-([1-9][0-9]?[0-9]?[0-9]?)$/.exec(command))
        @_write(message: """
        >>#{m[1]}
        #{@$element.C("content")[0].child()[m[1]-1].$(".message").textContent.replace(/^/gm, '>')}\n
        """)
    if @$element.hasClass("view_thread") or @$element.hasClass("view_board")
      if command is "w"
        @_write()

    switch command
      when "up"
        app.DOMData.get(@$element, "selectableItemList")?.selectPrev(repeatCount)
      when "down"
        app.DOMData.get(@$element, "selectableItemList")?.selectNext(repeatCount)
      when "left"
        if @$element.hasClass("view_sidemenu")
          $a = @$element.$("li > a.selected")
          if $a?
            app.DOMData.get(@$element, "accordion").select($a.closest("ul").prev())
      when "right"
        if @$element.hasClass("view_sidemenu")
          $a = @$element.$("h3.selected + ul a")
          if $a?
            app.DOMData.get(@$element, "accordion").select($a)
      when "clearSelect"
        app.DOMData.get(@$element, "selectableItemList")?.clearSelect()
      when "focusUpFrame", "focusDownFrame", "focusLeftFrame", "focusRightFrame"
        app.message.send("requestFocusMove", {command, repeatCount}, parent)
      when "r"
        @$element.dispatchEvent(new Event("request_reload"))
      when "q"
        @close()
      when "openCommandBox"
        @_openCommandBox()
      when "enter"
        @$element.C("selected")[0].dispatchEvent(
          new Event("mousedown", bubbles: true)
        )
        @$element.C("selected")[0].dispatchEvent(
          new Event("mouseup", bubbles: true)
        )
      when "shift+enter"
        @$element.C("selected")[0].dispatchEvent(
          new MouseEvent("mousedown", shiftKey: true, bubbles: true)
        )
        @$element.C("selected")[0].dispatchEvent(
          new MouseEvent("mouseup", shiftKey: true, bubbles: true)
        )
      when "help"
        app.message.send("showKeyboardHelp", null, parent)
    return

  ###*
  @method _setupCommandBox
  ###
  _setupCommandBox: ->
    $input = $__("input")
    $input.addClass("command")
    $input.on "keydown", (e) =>
      # Enter
      if e.which is 13
        @execCommand(e.target.value.replace(/[\s]/g, ""))
        @_closeCommandBox()
      # Esc
      else if e.which is 27
        @_closeCommandBox()
      return
    $input.addClass("hidden")
    @$element.addLast($input)
    return

  ###*
  @method _openCommandBox
  ###
  _openCommandBox: ->
    $command = @$element.C("command")[0]
    app.DOMData.set($command, "lastActiveElement", document.activeElement)
    $command.removeClass("hidden")
    $command.focus()
    return

  ###*
  @method _closeCommandBox
  ###
  _closeCommandBox: ->
    $command = @$element.C("command")[0]
    $command.value = ""
    $command.addClass("hidden")
    app.DOMData.get($command, "lastActiveElement")?.focus()
    return

  ###*
  @method _setupKeyboard
  @private
  ###
  _setupKeyboard: ->
    @$element.on "keydown", (e) =>
      # F5 or Ctrl+r or ⌘+r
      if e.which is 116 or (e.ctrlKey and e.which is 82) or (e.metaKey and e.which is 82)
        e.preventDefault()
        command = "r"
      else if e.ctrlKey or e.metaKey
        return

      # Windows版ChromeでのBackSpace誤爆対策
      if e.which is 8 and not (e.target.tagName in ["INPUT", "TEXTAREA"])
        e.preventDefault()

      # Esc (空白の入力欄に入力された場合)
      else if (
        e.which is 27 and
        e.target.tagName in ["INPUT", "TEXTAREA"] and
        e.target.value is "" and
        not e.target.hasClass("command")
      )
        @$element.C("content")[0].focus()

      # 入力欄内では発動しない系
      else if not (e.target.tagName in ["INPUT", "TEXTAREA"])
        switch (e.which)
          # Enter
          when 13
            if e.shiftKey
              command = "shift+enter"
            else
              command = "enter"
          # esc
          when 27
            command = "clearSelect"
          # h
          when 72
            if e.shiftKey
              command = "focusLeftFrame"
            else
              command = "left"
          # l
          when 76
            if e.shiftKey
              command = "focusRightFrame"
            else
              command = "right"
          # k
          when 75
            if e.shiftKey
              command = "focusUpFrame"
            else
              command = "up"
          # j
          when 74
            if e.shiftKey
              command = "focusDownFrame"
            else
              command = "down"
          # r
          when 82
            # Shift+r
            if e.shiftKey
              command = "r"
          # w
          when 87
            # Shift+w
            if e.shiftKey
              command = "q"
          # :
          when 186
            e.preventDefault() # コマンド入力欄に:が入力されるのを防ぐため
            command = "openCommandBox"
          # /
          when 191
            # ?
            if e.shiftKey
              command = "help"
            # /
            else
              e.preventDefault()
              @$element.$(".searchbox, form.search > input[type=\"search\"]").focus()
          else
            # 数値
            if 48 <= e.which <= 57
              @_numericInput += e.which - 48

      if command?
        @execCommand(command, Math.max(1, +@_numericInput))

      # 0-9かShift以外が押された場合は数値入力を終了
      unless 48 <= e.which <= 57 or e.which is 16
        @_numericInput = ""
      return
    return

###*
@namespace app.view
@class PaneContentView
@extends app.view.IframeView
@constructor
@param {Element} element
###
class app.view.PaneContentView extends app.view.IframeView
  constructor: ($element) ->
    super($element)

    @_setupEventConverter()
    @_insertUserCSS()
    return

  ###*
  @method _setupEventConverter
  @private
  ###
  _setupEventConverter: ->
    window.on "message", (e) =>
      if e.origin is location.origin and typeof e.data is "string"
        message = JSON.parse(e.data)

        # request_reload(postMessage) -> request_reload(event) 翻訳処理
        if message.type is "request_reload"
          @$element.dispatchEvent(new CustomEvent(
            "request_reload"
            detail:
              force_update: message.force_update is true
              kind: message.kind ? null
              mes: message.mes ? null
              name: message.name ? null
              mail: message.mail ? null
              title: message.title ? null
              thread_url: message.thread_url ? null
              written_res_num: message.written_res_num ? null
              param_res_num: message.param_res_num ? null
          ))

        # tab_selected(postMessage) -> tab_selected(event) 翻訳処理
        else if message.type is "tab_selected"
          @$element.dispatchEvent(new Event("tab_selected", bubbles: true))
      return

    # request_focus送出処理
    @$element.on "mousedown", (e) ->
      message =
        type: "request_focus"
        focus: true

      if e.target.tagName in ["INPUT", "TEXTAREA"]
        message.focus = false

      parent.postMessage(JSON.stringify(message), location.origin)
      return
    # view_loaded翻訳処理
    @$element.on "view_loaded", ->
      parent.postMessage(
        JSON.stringify(type: "view_loaded"),
        location.origin
      )
      return
    return

###*
@namespace app.view
@class TabContentView
@extends app.view.PaneContentView
@constructor
@param {Element} element
###
class app.view.TabContentView extends app.view.PaneContentView
  constructor: (element) ->
    super(element)

    @_setupTitleReporter()
    @_setupReloadButton()
    @_setupNavButton()
    @_setupBookmarkButton()
    @_setupSortItemSelector()
    @_setupSchemeButton()
    @_setupAutoReload()
    @_setupToolMenu()
    return

  ###*
  @method _setupTitleReporter
  @private
  ###
  _setupTitleReporter: ->
    sendTitleUpdated = =>
      parent.postMessage(
        JSON.stringify(
          type: "title_updated"
          title: @$element.T("title")[0].textContent
        ),
        location.origin
      )
      return

    if @$element.T("title")[0].textContent
      sendTitleUpdated()

    new MutationObserver( (recs) ->
      sendTitleUpdated()
      return
    ).observe(@$element.T("title")[0], childList: true)
    return

  ###*
  @method _setupReloadButton
  @private
  ###
  _setupReloadButton: ->
    # View内リロードボタン
    @$element.C("button_reload")[0]?.on "click", (e) =>
      if not e.currentTarget.hasClass("disabled")
        @$element.dispatchEvent(new Event("request_reload"))
      return
    return

  ###*
  @method _setupNavButton
  @private
  ###
  _setupNavButton: ->
    # 戻る/進むボタン管理
    parent.postMessage(
      JSON.stringify(type: "requestTabHistory"),
      location.origin
    )

    window.on "message", (e) =>
      if e.origin is location.origin and typeof e.data is "string"
        message = JSON.parse(e.data)
        if message.type is "responseTabHistory"
          if message.history.current > 0
            @$element.C("button_back")[0].removeClass("disabled")

          if message.history.current < message.history.stack.length - 1
            @$element.C("button_forward")[0].removeClass("disabled")

          if (
            message.history.stack.length is 1 and
            app.config.get("always_new_tab") is "on"
          )
            @$element.C("button_back")[0].remove()
            @$element.C("button_forward")[0].remove()
      return

    for dom in @$element.$$(".button_back, .button_forward")
      dom.on "mousedown", (e) ->
        if e.which isnt 3
          howToOpen = app.util.get_how_to_open(e)
          newTab = howToOpen.new_tab or howToOpen.new_window
          background = howToOpen.background

          return if @hasClass("disabled")
          tmp = if @hasClass("button_back") then "Back" else "Forward"
          parent.postMessage(
            JSON.stringify(type: "requestTab#{tmp}", newTab: newTab, background: background),
            location.origin
          )
        return
    return

  ###*
  @method _setupBookmarkButton
  @private
  ###
  _setupBookmarkButton: ->
    $button = @$element.C("button_bookmark")[0]

    if $button
      url = @$element.dataset.url

      if ///^https?://\w///.test(url)
        if app.bookmark.get(url)
          $button.addClass("bookmarked")
        else
          $button.removeClass("bookmarked")

        app.message.addListener "bookmark_updated", (message) ->
          if message.bookmark.url is url
            if message.type is "added"
              $button.addClass("bookmarked")
            else if message.type is "removed"
              $button.removeClass("bookmarked")
          return

        $button.on "click", =>
          if app.bookmark.get(url)
            app.bookmark.remove(url)
          else
            title = document.title or url

            if @$element.hasClass("view_thread")
              resCount = @$element.C("content")[0].child().length

            if resCount? and resCount > 0
              app.bookmark.add(url, title, resCount)
            else
              app.bookmark.add(url, title)
          return
      else
        $button.remove()
    return

  ###*
  @method _setupSortItemSelector
  @private
  ###
  _setupSortItemSelector: ->
    $table = @$element.C("table_sort")[0]
    $selector = @$element.C("sort_item_selector")[0]

    $table?.on "table_sort_updated", ({detail}) ->
      for dom in $selector.T("option")
        dom.setAttr("selected", false)
        if String(detail.sort_attribute or detail.sort_index) is dom.textContent
          dom.setAttr("selected", true)
      return

    $selector?.on "change", ->
      selected = @child()[@selectedIndex]
      config = {}

      config.sort_order = selected.dataset.sortOrder or "desc"

      if /^\d+$/.test(@value)
        config.sort_index = +@value
      else
        config.sort_attribute = @value

      if (tmp = selected.dataset.sortType)?
        config.sort_type = tmp

      app.DOMData.get($table, "tableSorter").updateSnake(config)
      return
    return

  ###*
  @method _setupSchemeButton
  @private
  ###
  _setupSchemeButton: ->
    $button = @$element.C("button_scheme")[0]

    if $button
      url = @$element.dataset.url

      if ///^https?://\w///.test(url)
        if app.URL.getScheme(url) is "https"
          $button.addClass("https")
        else
          $button.removeClass("https")

        $button.on "click", =>
          app.message.send "open", {
            url: app.URL.changeScheme(url),
            new_tab: app.config.get("button_change_scheme_newtab") is "on"
          }
          return
      else
        $button.remove()
    return

  ###*
  @method _setupAutoReloadPauseButton
  @private
  ###
  _setupAutoReload: ->
    $button = @$element.C("button_pause")[0]

    unless (
      @$element.hasClass("view_thread") or
      @$element.hasClass("view_board") or
      @$element.hasClass("view_bookmark")
    )
      $button.remove() if $button
      return

    switch true
      when @$element.hasClass("view_thread")
        cfgName = ""
        minSeconds = 5000
      when @$element.hasClass("view_board")
        cfgName = "_board"
        minSeconds = 20000
      when @$element.hasClass("view_bookmark")
        cfgName = "_bookmark"
        minSeconds = 20000

    auto_load = =>
      second = parseInt(app.config.get("auto_load_second#{cfgName}"))
      if second >= minSeconds
        $button.removeClass("hidden")
        if @$element.hasClass("view_bookmark")
          return setInterval( =>
            @$element.dispatchEvent(new CustomEvent("request_reload", detail: true))
            return
          , second)
        else
          return setInterval( =>
            url = @$element.dataset.url
            if (
              app.config.get("auto_load_all") is "on" or
              parent.$$.$(".tab_container > iframe[data-url=\"#{url}\"]").hasClass("tab_selected")
            )
              @$element.dispatchEvent(new Event("request_reload"))
            return
          , second)
      else
        $button.addClass("hidden")
      return

    auto_load_interval = auto_load()

    app.message.addListener("config_updated", (message) ->
      if message.key is "auto_load_second#{cfgName}"
        clearInterval(auto_load_interval)
        auto_load_interval = auto_load()
      return
    )

    $button.on("click", ->
      $button.toggleClass("pause")
      if $button.hasClass("pause")
        clearInterval(auto_load_interval)
      else
        auto_load_interval = auto_load()
      return
    )

    window.on("view_unload", ->
      clearInterval(auto_load_interval)
      return
    )
    return

  ###*
  @method _setupToolMenu
  @private
  ###
  _setupToolMenu: ->
    #メニューの表示/非表示制御
    @$element.C("button_tool")[0]?.on "click", (e) =>
      $ul = e.currentTarget.T("ul")[0]
      $ul.toggleClass("hidden")
      if $ul.hasClass("hidden")
        app.defer =>
          @$element.on "click", func = (e) =>
            @$element.off("click", func)
            if not e.target.hasClass("button_tool")
              @$element.$(".button_tool > ul").addClass("hidden")
            return
          @$element.on "contextmenu", func = (e) =>
            @$element.off("contextmenu", func)
            if not e.target.hasClass("button_tool")
              @$element.$(".button_tool > ul").addClass("hidden")
            return
      return

    window.on "blur", =>
      @$element.$(".button_tool > ul")?.addClass("hidden")
      return

    # Chromeで直接開く
    do =>
      url = @$element.dataset.url

      if url is "bookmark"
        url = "chrome://bookmarks/##{app.config.get("bookmark_id")}"
      else if /^search:/.test(url)
        return
      else
        url = app.safeHref(url)

      @$element.$(".button_link > a")?.on "click", (e) ->
        e.preventDefault()

        parent.chrome.tabs.create url: url
        return
      return

    # dat落ちを表示/非表示
    @$element.C("button_toggle_dat")[0]?.on "click", =>
      for dom in @$element.C("expired")
        dom.toggleClass("hidden")
      return

    # 未読スレッドを全て開く
    @$element.C("button_open_updated")[0]?.on "click", =>
      for dom in @$element.C("updated")
        url = dom.dataset.href
        title = dom.dataset.title
        lazy = app.config.get("open_all_unread_lazy") is "on"

        app.message.send("open", {url, title, new_tab: true, lazy})
      return

    # タイトルをコピー
    @$element.C("button_copy_title")[0]?.on "click", =>
      app.clipboardWrite(document.title)
      return

    # URLをコピー
    @$element.C("button_copy_url")[0]?.on "click", =>
      app.clipboardWrite(@$element.dataset.url)
      return

    # タイトルとURLをコピー
    @$element.C("button_copy_title_and_url")[0]?.on "click", =>
      app.clipboardWrite(document.title + " " + @$element.dataset.url)
      return

    # 2ch.net/2ch.scに切り替え
    reg = /https?:\/\/\w+\.2ch\.(net|sc)\/\w+\/(.*?)/
    url = @$element.dataset.url
    mode = reg.exec(url)
    if mode
      @$element.C("button_change_netsc")[0]?.on "click", =>
        newUrl = app.URL.exchangeNetSc(url)
        if newUrl
          app.message.send "open", {
            url: newUrl,
            new_tab: app.config.get("button_change_netsc_newtab") is "on"
          }
        else
          app.URL.convertNetSc(url)
            .then( (res) ->
              app.message.send "open", {
                url: res,
                new_tab: app.config.get("button_change_netsc_newtab") is "on"
              }
              return
            )
            .catch( ->
              msg = """
              スレッドのURLが古いか新しいため、板一覧に2ch.netと2ch.scのペアが存在しません。
              板一覧が更新されるのを待つか、板一覧を更新してみてください。
              """
              new Notification(
                "現在この機能は使用できません",
                {
                  body: msg
                  icon: "../img/read.crx_128x128.png"
                }
              )
              return
            )
        return
    else
      @$element.C("button_change_netsc")[0]?.remove()

    #2ch.scでscの投稿だけ表示(スレ&レス)
    if app.URL.tsld(url) is "2ch.sc"
      @$element.C("button_only_sc")[0]?.on "click", =>
        for dom in @$element.C("net")
          dom.toggleClass("hidden")
        return
    else
      @$element.C("button_only_sc")[0]?.remove()
