do ->
  if frameElement
    modules = [
      "History"
      "WriteHistory"
      "Thread"
      "board"
      "bookmark"
      "bookmarkEntryList"
      "config"
      "module"
      "Ninja"
      "NG"
      "read_state"
      "url"
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
  constructor: (@element) ->
    @$element = $(@element)

    @_disableAutoScroll()
    @_setupTheme()
    @_setupOpenInRcrx()
    return

  _disableAutoScroll: ->
    @$element.on "mousedown", (e) ->
      if e.button is 1
        e.preventDefault()
      return
    return

  ###*
  @method _changeTheme
  @private
  @param {String} themeId
  ###
  _changeTheme: (themeId) ->
    # テーマ適用
    @$element.removeClass("theme_default theme_dark theme_none")
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
    style = document.createElement("style")
    style.textContent = app.config.get("user_css")
    document.head.appendChild(style)
    return

  ###*
  @method _setupOpenInRcrx
  @private
  ###
  _setupOpenInRcrx: ->
    # .open_in_rcrxリンクの処理
    @$element
      .on "mousedown", ".open_in_rcrx", (e) ->
        if e.which isnt 3
          url = @href or @getAttribute("data-href")
          title = @getAttribute("data-title") or @textContent
          howToOpen = app.util.get_how_to_open(e)
          newTab = app.config.get("always_new_tab") is "on"
          newTab or= howToOpen.new_tab or howToOpen.new_window
          background = howToOpen.background

          app.message.send("open", {url, new_tab: newTab, background, title})
        return

      .on "click", ".open_in_rcrx", (e) ->
        e.preventDefault()
        return

    # Windowsのオートスクロール対策
    @$element[0].addEventListener "click", (e) ->
      if e.target? and Array.from(e.target.classList).includes("open_in_rcrx")
        e.preventDefault()
      return
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

  ###*
  @method execCommand
  @param {String} command
  @param {Number} [repeatCount]
  ###
  execCommand: (command, repeatCount = 1) ->
    # 数値コマンド
    if /^\d+$/.test(command)
      @$element.data("selectableItemList")?.select(+command)

    switch command
      when "up"
        @$element.data("selectableItemList")?.selectPrev(repeatCount)
      when "down"
        @$element.data("selectableItemList")?.selectNext(repeatCount)
      when "left"
        if @$element.hasClass("view_sidemenu")
          $a = @$element.find("li > a.selected")
          if $a.length is 1
            @$element.data("accordion").select($a.closest("ul").prev()[0])
      when "right"
        if @$element.hasClass("view_sidemenu")
          $a = @$element.find("h3.selected + ul a")
          if $a.length > 0
            @$element.data("accordion").select($a[0])
      when "clearSelect"
        @$element.data("selectableItemList")?.clearSelect()
      when "focusUpFrame", "focusDownFrame", "focusLeftFrame", "focusRightFrame"
        app.message.send("requestFocusMove", {command, repeatCount}, parent)
      when "r"
        @$element.trigger("request_reload")
      when "q"
        @close()
      when "openCommandBox"
        @_openCommandBox()
      when "enter"
        @$element.find(".selected").trigger("click")
      when "shift+enter"
        @$element.find(".selected").trigger(
          $.Event("click", shiftKey: true, which: 1)
        )
      when "help"
        app.message.send("showKeyboardHelp", null, parent)
    return

  ###*
  @method _setupCommandBox
  ###
  _setupCommandBox: ->
    that = @

    $("<input>", class: "command")
      .on "keydown", (e) ->
        # Enter
        if e.which is 13
          that.execCommand(e.target.value.replace(/[\s]/g, ""))
          that._closeCommandBox()
        # Esc
        else if e.which is 27
          that._closeCommandBox()
        return
      .hide()
      .appendTo(@$element)
    return

  ###*
  @method _openCommandBox
  ###
  _openCommandBox: ->
    @$element
      .find(".command")
        .data("lastActiveElement", document.activeElement)
        .show()
        .focus()
    return

  ###*
  @method _closeCommandBox
  ###
  _closeCommandBox: ->
    @$element
      .find(".command")
        .val("")
        .hide()
        .data("lastActiveElement")?.focus()
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
      if e.which is 8 and not (e.target.nodeName in ["INPUT", "TEXTAREA"])
        e.preventDefault()

      # Esc (空白の入力欄に入力された場合)
      else if (
        e.which is 27 and
        e.target.nodeName in ["INPUT", "TEXTAREA"] and
        e.target.value is "" and
        not e.target.classList.contains("command")
      )
        @$element.find(".content").focus()

      # 入力欄内では発動しない系
      else if not (e.target.nodeName in ["INPUT", "TEXTAREA"])
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
              $(".searchbox, form.search > input[type=\"text\"]").focus()
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
  constructor: (element) ->
    super(element)
    $element = @$element

    @_setupEventConverter()
    @_insertUserCSS()
    return

  ###*
  @method _setupEventConverter
  @private
  ###
  _setupEventConverter: ->
    window.addEventListener "message", (e) =>
      if e.origin is location.origin and typeof e.data is "string"
        message = JSON.parse(e.data)

        # request_reload(postMessage) -> request_reload(event) 翻訳処理
        if message.type is "request_reload"
          @$element.trigger(
            "request_reload",
            force_update: message.force_update is true,
            kind: if message.kind? then message.kind else null,
            mes: if message.mes? then message.mes else null,
            name: if message.name? then message.name else null,
            mail: if message.mail? then message.mail else null,
            title: if message.title? then message.title else null
          )

        # tab_selected(postMessage) -> tab_selected(event) 翻訳処理
        else if message.type is "tab_selected"
          @$element.trigger("tab_selected")
      return

    @$element
      # request_focus送出処理
      .on "mousedown", (e) ->
        message =
          type: "request_focus"
          focus: true

        if e.target.nodeName in ["INPUT", "TEXTAREA"]
          message.focus = false

        parent.postMessage(JSON.stringify(message), location.origin)
        return

      # view_loaded翻訳処理
      .on "view_loaded", ->
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
          title: @$element.find("title").text()
        ),
        location.origin
      )
      return

    if @$element.find("title").text()
      sendTitleUpdated()

    @$element.find("title").on("DOMSubtreeModified", sendTitleUpdated)
    return

  ###*
  @method _setupReloadButton
  @private
  ###
  _setupReloadButton: ->
    that = @

    # View内リロードボタン
    @$element.find(".button_reload").on "click", ->
      if not $(this).hasClass("disabled")
        that.$element.trigger("request_reload")
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

    window.addEventListener "message", (e) =>
      if e.origin is location.origin and typeof e.data is "string"
        message = JSON.parse(e.data)
        if message.type is "responseTabHistory"
          if message.history.current > 0
            @$element.find(".button_back").removeClass("disabled")

          if message.history.current < message.history.stack.length - 1
            @$element.find(".button_forward").removeClass("disabled")

          if (
            message.history.stack.length is 1 and
            app.config.get("always_new_tab") is "on"
          )
            @$element.find(".button_back, .button_forward").remove()
      return

    @$element.find(".button_back, .button_forward").on "click", ->
      $this = $(@)

      if not $this.is(".disabled")
        tmp = if $this.is(".button_back") then "Back" else "Forward"
        parent.postMessage(
          JSON.stringify(type: "requestTab#{tmp}"),
          location.origin
        )
      return
    return

  ###*
  @method _setupBookmarkButton
  @private
  ###
  _setupBookmarkButton: ->
    $button = @$element.find(".button_bookmark")

    if $button.length is 1
      url = @$element.attr("data-url")

      if ///^http://\w///.test(url)
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
            title = @$element.find("title").text() or url

            if @$element.hasClass("view_thread")
              resCount = @$element.find(".content").children().length

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
    $table = @$element.find(".table_sort")
    $selector = @$element.find(".sort_item_selector")

    $table.on "table_sort_updated", (e, ex) ->
      $selector
        .find("option")
          .filter(->
            String(ex.sort_attribute or ex.sort_index) is @textContent
          )
            .attr("selected", true)
      return

    $selector.on "change", ->
      selected = @children[@selectedIndex]
      config = {}

      config.sort_order = selected.getAttribute("data-sort_order") or "desc"

      if /^\d+$/.test(@value)
        config.sort_index = +@value
      else
        config.sort_attribute = @value

      if (tmp = selected.getAttribute("data-sort_type"))?
        config.sort_type = tmp

      $table.table_sort("update", config)
      return
    return

  ###*
  @method _setupToolMenu
  @private
  ###
  _setupToolMenu: ->
    that = @

    #メニューの表示/非表示制御
    @$element.find(".button_tool").on "click", ->
      if $(@).find("ul").toggle().is(":visible")
        app.defer ->
          that.$element.one "click contextmenu", (e) ->
            if not $(e.target).is(".button_tool")
              that.$element.find(".button_tool > ul").hide()
            return
          return
      return

    $(window).on "blur", =>
      @$element.find(".button_tool > ul").hide()
      return

    # Chromeで直接開く
    do =>
      url = @$element.attr("data-url")

      if url is "bookmark"
        url = "chrome://bookmarks/##{app.config.get("bookmark_id")}"
      else if /^search:/.test(url)
        return
      else
        url = app.safe_href(url)

      @$element
        .find(".button_link > a")
          .on "click", (e) ->
            e.preventDefault()

            window.open(url, "_blank")
            return

      return

    # dat落ちを表示/非表示
    @$element.find(".button_toggle_dat").on "click", =>
      @$element.find(".expired").toggleClass("expired_hide")
      return

    # 未読スレッドを全て開く
    @$element.find(".button_open_updated").on "click", =>
      @$element.find(".updated").each ->
        url = @getAttribute("data-href")
        title = @getAttribute("data-title")
        lazy = app.config.get("open_all_unread_lazy") is "on"

        app.message.send("open", {url, title, new_tab: true, lazy})
      return

    # タイトルをコピー
    @$element.find(".button_copy_title").on "click", =>
      app.clipboardWrite(@$element.find("title").text())
      return

    # URLをコピー
    @$element.find(".button_copy_url").on "click", =>
      app.clipboardWrite(@$element.attr("data-url"))
      return

    # タイトルとURLをコピー
    @$element.find(".button_copy_title_and_url").on "click", =>
      app.clipboardWrite(document.title + " " + @$element.attr("data-url"))
      return

    # 2ch.net/2ch.scに切り替え
    reg = /http:\/\/\w+\.2ch\.(net|sc)\/\w+\/(.*?)/
    url = @$element.attr("data-url")
    mode = reg.exec(url)
    if mode
      @$element.find(".button_change_netsc").on "click", =>
        from = ".2ch." + mode[1] + "/"
        to = ".2ch." + (if mode[1] is 'net' then 'sc' else 'net') + "/"
        app.message.send "open", {
          url: url.replace(from, to),
          new_tab: app.config.get("button_change_netsc_newtab") is "on"
        }
        return
    else
      @$element.find(".button_change_netsc").remove()

    #2ch.scでscの投稿だけ表示(スレ&レス)
    if app.url.tsld(url) is "2ch.sc"
      @$element.find(".button_only_sc").on "click", =>
        @$element.find(".net").toggleClass("net_hide")
        return
    else
      @$element.find(".button_only_sc").remove()
