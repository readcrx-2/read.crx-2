do ->
  if frameElement
    modules = [
      "BoardTitleSolver"
      "History"
      "WriteHistory"
      "Thread"
      "bookmark"
      "bookmarkEntryList"
      "config"
      "ContextMenus"
      "DOMData"
      "HTTP"
      "ImageReplaceDat"
      "module"
      "ReplaceStrTxt"
      "NG"
      "Notification"
      "ReadState"
      "URL"
      "util"
    ]

    for module in modules
      app[module] = parent.app[module]

    window.on("unload", ->
      document.body.removeChildren()
      app = null
      return
    )
  return

app.view ?= {}

###*
@namespace app.view
@class View
@constructor
@param {Element} element
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
    @$element.removeClass("theme_default", "theme_dark", "theme_none")
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
    app.message.on("config_updated", ({key, val}) =>
      if key is "theme_id"
        @_changeTheme(val)
      return
    )
    return

  ###*
  @method _insertUserCSS
  @private
  ###
  _insertUserCSS: ->
    style = $__("style")
    style.id = "user_css"
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
      return if e.which is 3
      url = target.dataset.href or target.href
      title = target.dataset.title or target.textContent
      writtenResNum = if target.getAttr("ignore-res-number") is "on" then null else target.dataset.writtenResNum
      paramResFlg = (
        (app.config.isOn("enable_link_with_res_number") and
         target.getAttr("toggle-param-res-num") isnt "on") or
        (not app.config.isOn("enable_link_with_res_number") and
         target.getAttr("toggle-param-res-num") is "on")
      )
      paramResNum = if paramResFlg then target.dataset.paramResNum else null
      target.removeAttr("toggle-param-res-num")
      target.removeAttr("ignore-res-number")
      {newTab, newWindow, background} = app.util.getHowToOpen(e)
      newTab or= app.config.isOn("always_new_tab") or newWindow

      app.message.send("open", {
        url
        new_tab: newTab
        background
        title
        written_res_num: writtenResNum
        param_res_num: paramResNum
      })
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
    parent.postMessage(type: "request_killme", location.origin)
    return

  _write: (param = {}) ->
    if @$element.hasClass("view_thread")
      htmlname = "submit_res"
      height = "300"
    else if @$element.hasClass("view_board")
      htmlname = "submit_thread"
      height = "400"
    param.title = document.title
    param.url = @$element.dataset.url
    windowX = app.config.get("write_window_x")
    windowY = app.config.get("write_window_y")
    open(
      "/write/#{htmlname}.html?#{app.URL.buildQuery(param)}"
      undefined
      "width=600,height=#{height},left=#{windowX},top=#{windowY}"
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
      if (m = /^w(\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)$/.exec(command))
        message = ""
        for num in m[1].split(",")
          message += ">>#{num}\n"
        @_write({message})
      else if (m = /^w-(\d+(?:,\d+)*)$/.exec(command))
        message = ""
        for num in m[1].split(",")
          message += """
            >>#{num}
            #{@$element.C("content")[0].child()[num-1].$(".message").textContent.replace(/^/gm, '>')}\n
            """
        @_write({message})
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
        app.message.send("requestFocusMove", {command, repeatCount})
      when "r"
        @$element.emit(new Event("request_reload"))
      when "q"
        @close()
      when "openCommandBox"
        @_openCommandBox()
      when "enter"
        @$element.C("selected")[0]?.emit(
          new Event("mousedown", bubbles: true)
        )
        @$element.C("selected")[0]?.emit(
          new Event("mouseup", bubbles: true)
        )
      when "shift+enter"
        @$element.C("selected")[0]?.emit(
          new MouseEvent("mousedown", shiftKey: true, bubbles: true)
        )
        @$element.C("selected")[0]?.emit(
          new MouseEvent("mouseup", shiftKey: true, bubbles: true)
        )
      when "help"
        app.message.send("showKeyboardHelp")
    return

  ###*
  @method _setupCommandBox
  ###
  _setupCommandBox: ->
    $input = $__("input").addClass("command", "hidden")
    $input.on("keydown", ({which, target}) =>
      switch which
        # Enter
        when 13
          @execCommand(target.value.replace(/\s/g, ""))
          @_closeCommandBox()
        # Esc
        when 27
          @_closeCommandBox()
      return
    )
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
    @$element.on("keydown", (e) =>
      {target, which, shiftKey, ctrlKey, metaKey} = e
      # F5 or Ctrl+r or ⌘+r
      if which is 116 or (ctrlKey and which is 82) or (metaKey and which is 82)
        e.preventDefault()
        command = "r"
      else if ctrlKey or metaKey
        return

      # Windows版ChromeでのBackSpace誤爆対策
      if which is 8 and not (target.tagName in ["INPUT", "TEXTAREA"])
        e.preventDefault()

      # Esc (空白の入力欄に入力された場合)
      else if (
        which is 27 and
        target.tagName in ["INPUT", "TEXTAREA"] and
        target.value is "" and
        not target.hasClass("command")
      )
        @$element.C("content")[0].focus()

      # 入力欄内では発動しない系
      else if not (target.tagName in ["INPUT", "TEXTAREA"])
        switch which
          # Enter
          when 13
            if shiftKey
              command = "shift+enter"
            else
              command = "enter"
          # esc
          when 27
            command = "clearSelect"
          # h
          when 72
            if shiftKey
              command = "focusLeftFrame"
            else
              command = "left"
          # l
          when 76
            if shiftKey
              command = "focusRightFrame"
            else
              command = "right"
          # k
          when 75
            if shiftKey
              command = "focusUpFrame"
            else
              command = "up"
          # j
          when 74
            if shiftKey
              command = "focusDownFrame"
            else
              command = "down"
          # r
          when 82
            # Shift+r
            if shiftKey
              command = "r"
          # w
          when 87
            # Shift+w
            if shiftKey
              command = "q"
          # :
          when 186
            e.preventDefault() # コマンド入力欄に:が入力されるのを防ぐため
            command = "openCommandBox"
          # /
          when 191
            # ?
            if shiftKey
              command = "help"
            # /
            else
              e.preventDefault()
              @$element.$(".searchbox, form.search > input[type=\"search\"]").focus()
          else
            # 数値
            if 48 <= which <= 57
              @_numericInput += which - 48

      if command?
        @execCommand(command, Math.max(1, +@_numericInput))

      # 0-9かShift以外が押された場合は数値入力を終了
      unless 48 <= which <= 57 or which is 16
        @_numericInput = ""
      return
    )
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
    window.on("message", ({origin, data: message}) =>
      return unless origin is location.origin

      # request_reload(postMessage) -> request_reload(event) 翻訳処理
      if message.type is "request_reload"
        @$element.emit(new CustomEvent(
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
        @$element.emit(new Event("tab_selected", bubbles: true))
      return
    )

    # request_focus送出処理
    @$element.on("mousedown", ({target}) ->
      parent.postMessage({
        type: "request_focus"
        focus: !(target.tagName in ["INPUT", "TEXTAREA"])
      }, location.origin)
      return
    )

    # view_loaded翻訳処理
    @$element.on("view_loaded", ->
      parent.postMessage(type: "view_loaded", location.origin)
      return
    )
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
    @_setupRegExpButton()
    @_setupToolMenu()
    return

  ###*
  @method _setupTitleReporter
  @private
  ###
  _setupTitleReporter: ->
    sendTitleUpdated = =>
      parent.postMessage({
          type: "title_updated"
          title: @$element.T("title")[0].textContent
        }
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
    @$element.C("button_reload")[0]?.on("click", ({currentTarget}) =>
      if not currentTarget.hasClass("disabled")
        @$element.emit(new Event("request_reload"))
      return
    )
    return

  ###*
  @method _setupNavButton
  @private
  ###
  _setupNavButton: ->
    # 戻る/進むボタン管理
    parent.postMessage(type: "requestTabHistory", location.origin)

    window.on("message", ({ origin, data: {type, history: {current, stack} = {}} }) =>
      return unless origin is location.origin and type is "responseTabHistory"
      if current > 0
        @$element.C("button_back")[0].removeClass("disabled")

      if current < stack.length - 1
        @$element.C("button_forward")[0].removeClass("disabled")

      if stack.length is 1 and app.config.isOn("always_new_tab")
        @$element.C("button_back")[0].remove()
        @$element.C("button_forward")[0].remove()
      return
    )

    for dom in @$element.$$(".button_back, .button_forward")
      dom.on("mousedown", (e) ->
        if e.which isnt 3
          {newTab, newWindow, background} = app.util.getHowToOpen(e)
          newTab or= newWindow

          return if @hasClass("disabled")
          tmp = if @hasClass("button_back") then "Back" else "Forward"
          parent.postMessage(
            {type: "requestTab#{tmp}", newTab, background}
            location.origin
          )
        return
      )
    return

  ###*
  @method _setupBookmarkButton
  @private
  ###
  _setupBookmarkButton: ->
    $button = @$element.C("button_bookmark")[0]

    return unless $button
    {url} = @$element.dataset

    if ///^https?://\w///.test(url)
      if app.bookmark.get(url)
        $button.addClass("bookmarked")
      else
        $button.removeClass("bookmarked")

      app.message.on("bookmark_updated", ({type, bookmark}) ->
        if bookmark.url is url
          if type is "added"
            $button.addClass("bookmarked")
          else if type is "removed"
            $button.removeClass("bookmarked")
        return
      )

      $button.on("click", =>
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
      )
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

    $table?.on("table_sort_updated", ({detail}) ->
      for dom in $selector.T("option")
        dom.selected = false
        if String(detail.sort_attribute or detail.sort_index) is dom.dataset.sortIndex
          dom.selected = true
      return
    )

    $selector?.on("change", ->
      $selected = @child()[@selectedIndex]
      config = {}

      config.sortOrder = $selected.dataset.sortOrder or "desc"

      val = $selected.dataset.sortIndex
      if /^\d+$/.test(val)
        config.sortIndex = +val
      else
        config.sortAttribute = val

      app.DOMData.get($table, "tableSorter").update(config)
      return
    )
    return

  ###*
  @method _setupSchemeButton
  @private
  ###
  _setupSchemeButton: ->
    $button = @$element.C("button_scheme")[0]

    return unless $button
    {url} = @$element.dataset
    viewSearch = false
    if url.startsWith("search:")
      viewSearch = true
      searchParam = url.substr(7)
      searchScheme = @$element.getAttr("scheme") ? "http"

    if ///^https?://\w///.test(url) or viewSearch
      if (
        app.URL.getScheme(url) is "https" or
        (viewSearch and searchScheme is "https")
      )
        $button.addClass("https")
      else
        $button.removeClass("https")

      $button.on("click", ->
        if viewSearch
          url = "search:" + app.URL.buildQuery(query: searchParam)
          url += "&https" if searchScheme isnt "https"
        else
          url = app.URL.changeScheme(url)
        app.message.send("open",
          url: url,
          new_tab: app.config.isOn("button_change_scheme_newtab")
        )
        return
      )
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

    switch
      when @$element.hasClass("view_thread")
        cfgName = ""
        minSeconds = 5000
      when @$element.hasClass("view_board")
        cfgName = "_board"
        minSeconds = 20000
      when @$element.hasClass("view_bookmark")
        cfgName = "_bookmark"
        minSeconds = 20000

    autoLoad = =>
      second = parseInt(app.config.get("auto_load_second#{cfgName}"))
      if second >= minSeconds
        @$element.addClass("autoload")
        $button.removeClass("hidden")
        if @$element.hasClass("view_bookmark")
          return setInterval( =>
            @$element.emit(new CustomEvent("request_reload", detail: true))
            return
          , second)
        else
          return setInterval( =>
            {url} = @$element.dataset
            if (
              app.config.isOn("auto_load_all") or
              parent.$$.$(".tab_container > iframe[data-url=\"#{url}\"]").hasClass("tab_selected")
            )
              @$element.emit(new Event("request_reload"))
            return
          , second)
      else
        @$element.removeClass("autoload")
        $button.addClass("hidden")
      return

    autoLoadInterval = autoLoad()

    app.message.on("config_updated", ({key}) ->
      if key is "auto_load_second#{cfgName}"
        clearInterval(autoLoadInterval)
        autoLoadInterval = autoLoad()
      return
    )

    $button.on("click", =>
      @$element.toggleClass("autoload_pause")
      $button.toggleClass("pause")
      if $button.hasClass("pause")
        clearInterval(autoLoadInterval)
      else
        autoLoadInterval = autoLoad()
      return
    )

    window.on("view_unload", ->
      clearInterval(autoLoadInterval)
      return
    )
    return

  ###*
  @method _setupRegExpButton
  @private
  ###
  _setupRegExpButton: ->
    $button = @$element.C("button_regexp")[0]

    return unless $button
    unless @$element.hasClass("view_thread")
      $button.remove() if $button
      return

    if @$element.hasClass("search_regexp")
      $button.addClass("regexp")
    else
      $button.removeClass("regexp")

    $button.on("click", =>
      $button.toggleClass("regexp")
      @$element.emit(new Event("change_search_regexp"))
      return
    )
    return

  ###*
  @method _setupToolMenu
  @private
  ###
  _setupToolMenu: ->
    #メニューの表示/非表示制御
    @$element.C("button_tool")[0]?.on("click", ({currentTarget}) =>
      $ul = currentTarget.T("ul")[0]
      $ul.toggleClass("hidden")
      return unless $ul.hasClass("hidden")
      await app.defer()
      @$element.on("click", ({target}) =>
        if not target.hasClass("button_tool")
          @$element.$(".button_tool > ul").addClass("hidden")
        return
      , once: true)
      @$element.on("contextmenu", ({target}) =>
        if not target.hasClass("button_tool")
          @$element.$(".button_tool > ul").addClass("hidden")
        return
      , once: true)
      return
    )

    window.on("blur", =>
      @$element.$(".button_tool > ul")?.addClass("hidden")
      return
    )

    # ブラウザで直接開く
    do =>
      {url} = @$element.dataset

      if url is "bookmark"
        if "&[BROWSER]" is "chrome"
          url = "chrome://bookmarks/?id=#{app.config.get("bookmark_id")}"
        else
          @$element.$(".button_link > a")?.remove()
      else if url?.startsWith("search:")
        return
      else
        url = app.safeHref(url)

      @$element.$(".button_link > a")?.on("click", (e) ->
        e.preventDefault()

        parent.browser.tabs.create(url: url)
        return
      )
      return

    # dat落ちを表示/非表示
    @$element.C("button_toggle_dat")[0]?.on("click", =>
      for dom in @$element.C("expired")
        dom.toggleClass("hidden")
      return
    )

    # 未読スレッドを全て開く
    @$element.C("button_open_updated")[0]?.on("click", =>
      for dom in @$element.C("updated")
        {href: url, title} = dom.dataset
        title = app.util.decodeCharReference(title)
        lazy = app.config.isOn("open_all_unread_lazy")

        app.message.send("open", {url, title, new_tab: true, lazy})
      return
    )

    # タイトルをコピー
    @$element.C("button_copy_title")[0]?.on("click", =>
      app.clipboardWrite(document.title)
      return
    )

    # URLをコピー
    @$element.C("button_copy_url")[0]?.on("click", =>
      app.clipboardWrite(@$element.dataset.url)
      return
    )

    # タイトルとURLをコピー
    @$element.C("button_copy_title_and_url")[0]?.on("click", =>
      app.clipboardWrite(document.title + " " + @$element.dataset.url)
      return
    )

    # 2ch.net/2ch.scに切り替え
    url = @$element.dataset.url
    if /https?:\/\/\w+\.(5ch\.net|2ch\.sc)\/\w+\/(.*?)/.test(url)
      @$element.C("button_change_netsc")[0]?.on("click", =>
        try
          app.message.send("open",
            url: await app.URL.convertNetSc(url),
            new_tab: app.config.isOn("button_change_netsc_newtab")
          )
        catch
          msg = """
          スレッドのURLが古いか新しいため、板一覧に5ch.netと2ch.scのペアが存在しません。
          板一覧が更新されるのを待つか、板一覧を更新してみてください。
          """
          new app.Notification("現在この機能は使用できません", msg, "", "invalid")
        return
      )
    else
      @$element.C("button_change_netsc")[0]?.remove()

    #2ch.scでscの投稿だけ表示(スレ&レス)
    if app.URL.tsld(url) is "2ch.sc"
      @$element.C("button_only_sc")[0]?.on("click", =>
        for dom in @$element.C("net")
          dom.toggleClass("hidden")
        return
      )
    else
      @$element.C("button_only_sc")[0]?.remove()
