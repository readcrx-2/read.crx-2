app.view ?= {}

###*
@namespace app.view
@class Index
@extends app.view.View
@constructor
@param {Element} element
###
class app.view.Index extends app.view.View
  constructor: (element) ->
    super(element)

    @_insertUserCSS()

    index = @

    @$element
      #iframe以外の部分がクリックされた時にフォーカスをiframe内に戻す
      .on "click", =>
        target = index.element.querySelector(".tab_content.iframe_focused")
        target or= index.element.querySelector("#left_pane")
        index.focus(target)
        return

      #iframeがクリックされた時にフォーカスを移動
      .on "request_focus", "iframe:not(.iframe_focused)", (e, ex) ->
        index.focus(@, ex.focus)
        return

      #タブが選択された時にフォーカスを移動
      .on "tab_selected", ".tab_content", ->
        index.focus(@)
        return

      #.tab内の最後のタブが削除された時にフォーカスを移動
      .on "tab_removed", ".tab_content", ->
        if $(@).siblings(".tab_content").length is 0
          app.defer ->
            $tmp = $(".tab:has(.tab_selected):first")
            if $tmp.length is 1
              index.focus($tmp.find(".tab_selected.tab_content")[0])
            else
              #フォーカス対象のタブが無い場合、板一覧にフォーカスする
              index.focus(index.element.querySelector("#left_pane"))
            return
        return

      #フォーカスしているコンテンツが再描画された場合、フォーカスを合わせ直す
      .on "view_loaded", ".tab_content.iframe_focused", ->
        index.focus(@)
        return

    app.message.addListener "requestFocusMove", (message) =>
      switch message.command
        when "focusUpFrame"
          @focusUp()
        when "focusDownFrame"
          @focusDown()
        when "focusLeftFrame"
          @focusLeft(message.repeatCount)
        when "focusRightFrame"
          @focusRight(message.repeatCount)

      $target = @$element.find(".iframe_focused")

      $target.contents().find(".view").addClass("focus_effect")
      setTimeout(
        ->
          $target.contents().find(".view").removeClass("focus_effect")
          return
        200
      )
      return

    app.message.addListener "showKeyboardHelp", =>
      @showKeyboardHelp()
      return
    return

  ###*
  @method focus
  @param {Element} iframe
  @param {Boolean} [focus=true]
    trueだと実際にフォーカスを移動する処理が行われる。
  ###
  focus: (iframe, focus = true) ->
    $iframe = $(iframe)

    if not $iframe.hasClass("iframe_focused")
      @$element.find(".iframe_focused").removeClass("iframe_focused")
      $iframe.addClass("iframe_focused")

    if focus
      app.defer ->
        iframe.contentDocument.activeElement?.blur()
        iframe.contentDocument.querySelector(".content")?.focus()
        return
    return

  ###*
  @method _getLeftFrame
  @private
  @param {Element} iframe
  @return {Element|null} leftFrame
  ###
  _getLeftFrame: (iframe) ->
    $iframe = $(iframe)

    # 既に#left_paneにフォーカスが当たっている場合
    unless $iframe.hasClass("tab_content")
      return null

    # 同一.tab内での候補探索
    tabId = $iframe.attr("data-tabid")
    $leftTabLi = @$element.find("li[data-tabid=\"#{tabId}\"]").prev()

    if $leftTabLi.length is 1
      leftTabId = $leftTabLi.attr("data-tabid")
      return @$element.find(".tab_content[data-tabid=\"#{leftTabId}\"]")[0]

    # 同一.tab内で候補がなかった場合
    # 左に.tabが存在し、タブが存在する場合はそちらを優先する
    if (
      @$element.find("#body").hasClass("pane-3h") and
      $iframe.closest(".tab").is("#tab_b")
    )
      return @$element.find("#tab_a .tab_content.tab_selected")[0]

    # そうでなければ#left_paneで確定
    @$element.find("#left_pane")[0]

  ###*
  @method focusLeft
  @param {number} [repeat=1]
  ###
  focusLeft: (repeat = 1) ->
    currentFrame = @$element.find(".iframe_focused")[0]
    targetFrame = currentFrame

    for [0...repeat]
      prevTargetFrame = targetFrame
      targetFrame = @_getLeftFrame(targetFrame) or targetFrame

      if targetFrame is prevTargetFrame
        break

    if targetFrame isnt currentFrame
      $targetFrame = $(targetFrame)

      if $targetFrame.hasClass("tab_content")
        targetTabId = $targetFrame.attr("data-tabid")

        $targetFrame
          .closest(".tab")
            .data("tab")
              .update(targetTabId, selected: true)
      else
        @focus(targetFrame)
    return

  ###*
  @method _getRightFrame
  @private
  @param {Element} iframe
  @return {Element|null} rightFrame
  ###
  _getRightFrame: (iframe) ->
    $iframe = $(iframe)

    # サイドメニューにフォーカスが当たっている場合
    if $iframe.is("#left_pane")
      $targetFrame = @$element.find("#tab_a .tab_content.tab_selected")

      if $targetFrame.length is 0
        $targetFrame = @$element.find("#tab_b .tab_content.tab_selected")

      $targetFrame[0] or null
    # タブ内コンテンツにフォーカスが当たっている場合
    else
      # 同一.tab内での候補探索
      tabId = $iframe.attr("data-tabid")
      $rightTabLi = @$element.find("li[data-tabid=\"#{tabId}\"]").next()

      if $rightTabLi.length is 1
        rightTabId = $rightTabLi.attr("data-tabid")
        @$element.find(".tab_content[data-tabid=\"#{rightTabId}\"]")[0]
      # タブ内で候補が見つからなかった場合
      # 右に.tabが存在し、タブが存在する場合はそれを選択する
      else if (
        @$element.find("#body").hasClass("pane-3h") and
        $iframe.closest(".tab").is("#tab_a")
      )
        return @$element.find("#tab_b .tab_content.tab_selected")[0] or null
      else
        null

  ###*
  @method focusRight
  @param {number} [repeat = 1]
  ###
  focusRight: (repeat = 1) ->
    currentFrame = @$element.find(".iframe_focused")[0]
    targetFrame = currentFrame

    for [0...repeat]
      prevTargetFrame = targetFrame
      targetFrame = @_getRightFrame(targetFrame) or targetFrame

      if targetFrame is prevTargetFrame
        break

    if targetFrame isnt currentFrame
      $targetFrame = $(targetFrame)

      if $targetFrame.hasClass("tab_content")
        targetTabId = $targetFrame.attr("data-tabid")

        $targetFrame
          .closest(".tab")
            .data("tab")
              .update(targetTabId, selected: true)
      else
        @focus(targetFrame)

  ###*
  @method focusUp
  ###
  focusUp: ->
    if (
      @$element.find("#body").hasClass("pane-3") and
      @$element.find(".iframe_focused").closest(".tab").is("#tab_b")
    )
      iframe = @$element.find("#tab_a iframe.tab_selected")[0]

    if iframe
      @focus(iframe)
    return

  ###*
  @method focusDown
  ###
  focusDown: ->
    if (
      @$element.find("#body").hasClass("pane-3") and
      @$element.find(".iframe_focused").closest(".tab").is("#tab_a")
    )
      iframe = @$element.find("#tab_b iframe.tab_selected")[0]

    if iframe
      @focus(iframe)
    return

  ###*
  @method showKeyboardHelp
  ###
  showKeyboardHelp: ->
    $help = @$element.find(".keyboard_help")
    $help
      .one "click keydown", =>
        @hideKeyboardHelp()
        return
    UI.Animate.fadeIn($help[0]).on("finish", ->
      $help.focus()
    )
    return

  ###*
  @method hideKeyboardHelp
  ###
  hideKeyboardHelp: ->
    UI.Animate.fadeOut(@$element.find(".keyboard_help")[0])
    iframe = document.querySelector(".iframe_focused")
    iframe?.contentDocument.querySelector(".content").focus()
    return

app.boot "/view/index.html", ->
  query = app.URL.parseQuery(location.search).get("q")

  get_current = new Promise( (resolve, reject) ->
    chrome.tabs.getCurrent (current_tab) ->
      resolve(current_tab)
      return
    return
  )
  get_all = new Promise( (resolve, reject) ->
    chrome.windows.getAll {populate: true}, (windows) ->
      resolve(windows)
      return
    return
  )

  Promise.all([get_current, get_all])
    .then ([current_tab, windows]) ->
      app_path = chrome.extension.getURL("/view/index.html")
      for win in windows
        for tab in win.tabs
          if tab.id isnt current_tab.id and tab.url is app_path
            chrome.windows.update(win.id, focused: true)
            chrome.tabs.update(tab.id, highlighted: true)
            if query
              chrome.runtime.sendMessage({type: "open", query})
            chrome.tabs.remove(current_tab.id)
            return
      history.replaceState(null, null, "/view/index.html")
      app.main()
      if query
        paramResNumFlag = (app.config.get("enable_link_with_res_number") is "on")
        paramResNum = if paramResNumFlag then app.URL.getResNumber(query) else null
        app.message.send("open", url: query, new_tab: true, param_res_num: paramResNum)

app.view_setup_resizer = ->
  MIN_TAB_HEIGHT = 100

  $body = $("#body")

  $tab_a = $("#tab_a")
  tab_a = $tab_a[0]

  right_pane = document.getElementById("right_pane")

  val = null
  val_c = null
  val_axis = null
  min = null
  max = null
  offset = null

  update_info = ->
    if $body.hasClass("pane-3")
      val = "height"
      val_c = "Height"
      val_axis = "Y"
      offset = right_pane.offsetTop
    else if $body.hasClass("pane-3h")
      val = "width"
      val_c = "Width"
      val_axis = "X"
      offset = right_pane.offsetLeft
    min = MIN_TAB_HEIGHT
    max = right_pane["offset#{val_c}"] - MIN_TAB_HEIGHT
    return

  update_info()

  tmp = app.config.get("tab_a_#{val}")
  if tmp
    tab_a.style[val] = Math.max(Math.min(tmp, max), min) + "px"

  $("#tab_resizer")
    .on "mousedown", (e) ->
      e.preventDefault()

      update_info()

      $("<div>", {css: {
        position: "absolute"
        left: 0
        top: 0
        width: "100%"
        height: "100%"
        "z-index": 999
        cursor: if val_axis is "X" then "col-resize" else "row-resize"
      }})
        .on "mousemove", (e) =>
          tab_a.style[val] =
            Math.max(Math.min(e["page#{val_axis}"] - offset, max), min) + "px"
          return

        .on "mouseup", ->
          $(@).remove()
          app.config.set("tab_a_#{val}", parseInt(tab_a.style[val], 10))
          return

        .appendTo("body")
      return

app.main = ->
  urlToIframeInfo = (url) ->
    url = app.URL.fix(url)
    guessResult = app.URL.guessType(url)
    if url is "config"
      src: "/view/config.html"
      url: "config"
      modal: true
    else if url is "history"
      src: "/view/history.html"
      url: "history"
    else if url is "writehistory"
      src: "/view/writehistory.html"
      url: "writehistory"
    else if url is "bookmark"
      src: "/view/bookmark.html"
      url: "bookmark"
    else if url is "inputurl"
      src: "/view/inputurl.html"
      url: "inputurl"
    else if url is "bookmark_source_selector"
      src: "/view/bookmark_source_selector.html"
      url: "bookmark_source_selector"
      modal: true
    else if res = /^search:(.+)$/.exec(url)
      src: "/view/search.html?#{app.URL.buildQuery(query: res[1])}"
      url: url
    else if guessResult.type is "board"
      src: "/view/board.html?#{app.URL.buildQuery(q: url)}"
      url: url
    else if guessResult.type is "thread"
      src: "/view/thread.html?#{app.URL.buildQuery(q: url)}"
      url: url
    else
      null

  iframeSrcToUrl = (src) ->
    if res = ///^/view/(\w+)\.html$///.exec(src)
      res[1]
    else if res = ///^/view/search\.html(\?.+)$///.exec(src)
      app.URL.parseQuery(res[1], true).get("query")
    else if res = ///^/view/(?:thread|board)\.html(\?.+)$///.exec(src)
      app.URL.parseQuery(res[1], true).get("q")
    else
      null

  $view = $(document.documentElement)
  new app.view.Index($view[0])

  do ->
    # bookmark_idが未設定の場合、わざと無効な値を渡してneedReconfigureRootNodeId
    # をcallさせる。
    cbel = new app.Bookmark.ChromeBookmarkEntryList(
      app.config.get("bookmark_id") or "dummy"
    )
    cbel.needReconfigureRootNodeId.add ->
      app.message.send("open", url: "bookmark_source_selector")
      return

    app.bookmarkEntryList = cbel
    app.bookmark = new app.Bookmark.CompatibilityLayer(cbel)
    return

  app.bookmarkEntryList.ready.add ->
    document.querySelector("#left_pane").src = "/view/sidemenu.html"
    return

  document.title = app.manifest.name

  app.Ninja.enableAutoBackup()

  app.message.addListener "notify", (message) ->
    text = message.message
    html = message.html
    background_color = message.background_color or "#777"
    div = $("<div>")
      .css("background-color", background_color)
      .append(
        (if html? then $("<div>", {html}) else $("<div>", {text}))
        $("<div>")
      )
      .one "click", "a, div:last-child", (e) ->
        UI.Animate.fadeOut(e.delegateTarget).on("finish", =>
          t = e.delegateTarget
          t.parentElement.removeChild(t)
        )
        return
      .appendTo("#app_notice_container")
    UI.Animate.fadeIn(div[0])

  #前回起動時のバージョンと違うバージョンだった場合、アップデート通知を送出
  do ->
    last_version = app.config.get("last_version")
    if last_version?
      if app.manifest.version isnt last_version
        app.message.send "notify", {
          html: """
            #{app.manifest.name} が #{last_version} から
            #{app.manifest.version} にアップデートされました。
             <a href="https://readcrx-2.github.io/read.crx-2/changelog.html#v#{app.manifest.version}" target="_blank">更新履歴</a>
          """
          background_color: "green"
        }
      else
        return
    app.config.set("last_version", app.manifest.version)
    return

  # アップデート告知をを送出
  do ->
    lastInformation = parseInt(app.config.get("last_information"))
    informationCount = parseInt(app.config.get("information_count"))
    if (
      app.util.compareVersion("2.0.0") < 0 and
      Date.now() - lastInformation > 86400000 * 3 and
      informationCount < 3
    )
      app.message.send "notify", {
        html: """
          バージョンアップに関する注意事項があります。
          詳しくは
           <a href="https://readcrx-2.github.io/read.crx-2/changelog.html#v1.17.0" target="_blank">注意事項</a>
          をご覧ください。
        """
        background_color: "blue"
      }
      app.config.set("last_information", Date.now())
      app.config.set("information_count", informationCount + 1)
    return

  #更新通知
  chrome.runtime.onUpdateAvailable.addListener( ({version}) ->
    return if version is app.manifest.version
    app.message.send "notify", {
      html: """
        #{app.manifest.name} の #{version} が利用可能です
      """
      background_color: "green"
    }
    return
  )

  # ウィンドウサイズ関連処理
  adjustWindowSize = new app.Callbacks()
  do ->
    resizeTo = (width, height, callback) ->
      chrome.windows.getCurrent (win) ->
        chrome.windows.update(win.id, {width, height}, callback)
        return
      return

    saveWindowSize = ->
      chrome.windows.getCurrent (win) ->
        app.config.set("window_width", win.width.toString(10))
        app.config.set("window_height", win.height.toString(10))
        return
      return

    startAutoSave = ->
      isResized = false

      saveWindowSize()

      $(window).on "resize", ->
        isResized = true
        return

      setInterval(
        ->
          if isResized
            isResized = false
            saveWindowSize()
          return
        1000
      )
      return

    # 起動時にウィンドウサイズが極端に小さかった場合、前回終了時のサイズに復元
    chrome.windows.getCurrent(
      {populate: true}
      (win) ->
        if win.tabs.length is 1 and win.width < 300 or win.height < 300
          resizeTo(
            +app.config.get("window_width")
            +app.config.get("window_height")
            ->
              app.defer ->
                adjustWindowSize.call()
                return
              return
          )
        else
          adjustWindowSize.call()
        return
    )

    adjustWindowSize.add(startAutoSave)
    return

  #タブ・ペインセットアップ
  $("#body").addClass(app.config.get("layout"))
  tabA = new UI.Tab(document.querySelector("#tab_a"))
  $("#tab_a").data("tab", tabA)
  tabB = new UI.Tab(document.querySelector("#tab_b"))
  $("#tab_b").data("tab", tabB)
  for dom in $(".tab .tab_tabbar")
    new UI.Sortable(dom, exclude: "img")
  adjustWindowSize.add(app.view_setup_resizer)

  $view.on "tab_urlupdated", "iframe", ->
    @setAttribute("data-url", iframeSrcToUrl(@getAttribute("src")))
    return

  app.message.addListener "config_updated", (message) ->
    if message.key is "layout"
      $("#body")
        .removeClass("pane-3 pane-3h pane-2")
        .addClass(message.val)
      $("#tab_a, #tab_b").css(width: "", height: "")
      #タブ移動
      #2->3
      if message.val is "pane-3" or message.val is "pane-3h"
        for tmp in tabA.getAll()
          iframe = document.querySelector("iframe[data-tabid=\"#{tmp.tabId}\"]")
          tmpURL = iframe.getAttribute("data-url")

          if app.URL.guessType(tmpURL).type is "thread"
            app.message.send "open", {
              new_tab: true
              lazy: true
              url: tmpURL
              title: tmp.title
            }
            tabA.remove(tmp.tabId)
      #3->2
      if message.val is "pane-2"
        for tmp in tabB.getAll()
          iframe = document.querySelector("iframe[data-tabid=\"#{tmp.tabId}\"]")
          tmpURL = iframe.getAttribute("data-url")

          app.message.send "open", {
            new_tab: true
            lazy: true
            url: tmpURL
            title: tmp.title
          }
          tabB.remove(tmp.tabId)
    return

  app.bookmarkEntryList.ready.add ->
    #タブ復元
    if localStorage.tab_state?
      for tab in JSON.parse(localStorage.tab_state)
        is_restored = true
        app.message.send("open", {
          url: tab.url
          title: tab.title
          lazy: not tab.selected
          locked: tab.locked
          new_tab: true
        })

    #もし、タブが一つも復元されなかったらブックマークタブを開く
    unless is_restored
      app.message.send("open", url: "bookmark")
    delete localStorage.tab_state
    return

  # コンテキストメニューの作成
  app.contextMenus.createAll()

  #終了時にタブの状態を保存する
  window.addEventListener "unload", ->
    unless localStorage.tab_state?
      data = for tab in tabA.getAll().concat(tabB.getAll())
        url: document.querySelector("iframe[data-tabid=\"#{tab.tabId}\"]").getAttribute("data-url")
        title: tab.title
        selected: tab.selected
        locked: tab.locked
      localStorage.tab_state = JSON.stringify(data)
    #コンテキストメニューの削除
    app.contextMenus.removeAll()
    return

  #openメッセージ受信部
  app.message.addListener "open", (message) ->
    iframe_info = urlToIframeInfo(message.url)
    return unless iframe_info

    if iframe_info.modal
      unless $view.find("iframe[src=\"#{iframe_info.src}\"]").length
        iframeEle = $("<iframe>")
          .attr("src", iframe_info.src)
          .attr("data-url", iframe_info.url)
          .attr("data-title", message.title or iframe_info.url)
          .addClass("fade")
          .appendTo("#modal")
        UI.Animate.fadeIn(iframeEle[0])
    else
      $li = $view.find(".tab_tabbar > li[data-tabsrc=\"#{iframe_info.src}\"]")
      if $li.length
        $li.closest(".tab").data("tab").update($li.attr("data-tabid"), selected: true)
        if message.url isnt "bookmark" #ブックマーク更新は時間がかかるので例外扱い
          tmp = JSON.stringify({
            type: "request_reload",
            written_res_num: if message.written_res_num? then message.written_res_num else null,
            param_res_num: if message.param_res_num? then message.param_res_num else null
          })
          $iframe = $view.find("iframe[data-tabid=\"#{$li.attr("data-tabid")}\"]")
          $iframe[0].contentWindow.postMessage(tmp, location.origin)
      else
        target = tabA
        if iframe_info.src[0..16] is "/view/thread.html" and
            not $("#body").hasClass("pane-2")
          target = tabB

        if message.new_tab or not (selectedTab = target.getSelected())
          tabId = target.add(iframe_info.src, {
            title: message.title or iframe_info.url
            selected: not (message.background or message.lazy)
            locked: message.locked
            lazy: message.lazy
          })
        else
          tabId = selectedTab.tabId
          target.update(tabId, {
            url: iframe_info.src
            title: message.title or iframe_info.url
            selected: true
            locked: message.locked
          })
        writtenResNum = if message.written_res_num? then message.written_res_num else ""
        paramResNum = if message.param_res_num? then message.param_res_num else ""
        $view
          .find("iframe[data-tabid=\"#{tabId}\"]")
            .attr("data-url", iframe_info.url)
            .attr("data-written_res_num", writtenResNum)
            .attr("data-param_res_num", paramResNum)
    return

  #openリクエストの監視
  chrome.runtime.onMessage.addListener (request) ->
    if request.type is "open"
      paramResNumFlag = (app.config.get("enable_link_with_res_number") is "on")
      paramResNum = if paramResNumFlag then app.URL.getResNumber(request.query) else null
      app.message.send("open", url: request.query, new_tab: true, param_res_num: paramResNum)

  #書き込み完了メッセージの監視
  chrome.runtime.onMessage.addListener (request) ->
    if request.type in ["written", "written?"]
      iframe = document.querySelector("iframe[data-url=\"#{request.url}\"]")
      if iframe
        tmp = JSON.stringify(type: "request_reload", force_update: true, kind: request.kind, mes: request.mes, name: request.name, mail: request.mail, title: request.title, thread_url: request.thread_url)
        iframe.contentWindow.postMessage(tmp, location.origin)

  # リクエスト・ヘッダーの監視
  chrome.webRequest.onBeforeSendHeaders.addListener (details) ->
    replaceHeader = (name, value) ->
      for header in details.requestHeaders
        if header.name.toLowerCase() is name
          header.value = value
          break
      return

    # 短縮URLの展開でのt.coに対する例外
    if details.method is "HEAD" and app.URL.getDomain(details.url) is "t.co"
      replaceHeader("user-agent", "")

    return {requestHeaders: details.requestHeaders}
  ,{
    urls: ["*://t.co/*"],
    types: ["xmlhttprequest"]
  }
  ,["blocking", "requestHeaders"]

  #viewからのメッセージを監視
  window.addEventListener "message", (e) ->
    return if e.origin isnt location.origin or typeof e.data isnt "string"

    $iframe = $(e.source.frameElement)
    return if $iframe.length isnt 1

    message = JSON.parse(e.data)

    switch message.type
      #タブ内コンテンツがtitle_updatedを送出した場合、タブのタイトルを更新
      when "title_updated"
        if $iframe.hasClass("tab_content")
          $iframe
            .closest(".tab")
              .data("tab")
                .update($iframe.attr("data-tabid"), title: message.title)

      #request_killmeの処理
      when "request_killme"
        #タブ内のviewが送ってきた場合
        if $iframe.hasClass("tab_content")
          $iframe
            .closest(".tab")
              .data("tab")
                .remove($iframe.attr("data-tabid"))
        #モーダルのviewが送ってきた場合
        else if $iframe.is("#modal > iframe")
          UI.Animate.fadeOut($iframe[0]).on("finish", ->
            $iframe.remove()
            return
          )

      #view_loadedの翻訳
      when "view_loaded"
        $iframe.trigger("view_loaded")

      #request_focusの翻訳
      when "request_focus"
        $iframe.trigger("request_focus", message)
    return

  $(window)
    #データ保存等の後片付けを行なってくれるzombie.html起動
    .on "beforeunload", ->
      window.dispatchEvent(new Event("beforezombie"))
      if localStorage.zombie_read_state?
        open("/zombie.html", undefined, "left=1,top=1,width=250,height=50")
      return

  $(document.documentElement)
    .on "tab_removed tab_beforeurlupdate", "iframe", ->
      @contentWindow.___e = new Event("view_unload", {bubbles: true})
      @contentWindow.dispatchEvent(@contentWindow.___e)
      return

    #tab_selected(event) -> tab_selected(postMessage) 翻訳処理
    .on "tab_selected", "iframe.tab_content", ->
      tmp = JSON.stringify(type: "tab_selected")
      @contentWindow.postMessage(tmp, location.origin)
      return

  #タブコンテキストメニュー
  $view.find(".tab_tabbar").on "contextmenu", (e) ->
    e.preventDefault()

    $source = $(e.target).closest(".tab_tabbar, li")
    $menu = $(
      $("#template_tab_contextmenu")
        .prop("content")
          .querySelector(".tab_contextmenu")
    ).clone()

    if $source.is("li")
      sourceTabId = $source.attr("data-tabid")
    else
      $menu.children().not(".restore").remove()

    tab = $source.closest(".tab").data("tab")

    getLatestRestorableTabID = ->
      tabURLList = (a.url for a in tab.getAll())
      list = tab.getRecentClosed()
      list.reverse()
      for tmpTab in list
        if not (tmpTab.url in tabURLList)
          return tmpTab.tabId
      null

    if not getLatestRestorableTabID()
      $menu.find(".restore").remove()

    if tab.isLocked(sourceTabId)
      $menu.find(".lock").remove()
      $menu.find(".close").remove()
    else
      $menu.find(".unlock").remove()

    if $menu[0].children.length is 0
      return

    $menu.one "click", "li", ->
      $this = $(@)

      #閉じたタブを開く
      if $this.is(".restore")
        if tmp = getLatestRestorableTabID()
          tab.restoreClosed(tmp)
      #再読み込み
      else if $this.is(".reload")
        $view.find("iframe[data-tabid=\"#{sourceTabId}\"]")[0]
          .contentWindow.postMessage(
            JSON.stringify(type: "request_reload")
            location.origin
          )
      #タブを固定
      else if $this.is(".lock")
        tab.update(sourceTabId, locked: true)
      #タブの固定を解除
      else if $this.is(".unlock")
        tab.update(sourceTabId, locked: false)
      #タブを閉じる
      else if $this.is(".close")
        tab.remove(sourceTabId)
      #タブを全て閉じる
      else if $this.is(".close_all")
        $source.siblings().addBack().each ->
          tabid = $(@).attr("data-tabid")
          tab.remove(tabid) unless tab.isLocked(tabid)
          return
      #他のタブを全て閉じる
      else if $this.is(".close_all_other")
        $source.siblings().each ->
          tab.remove($(@).attr("data-tabid"))
          return
      #右側のタブを全て閉じる
      else if $this.is(".close_right")
        $source.nextAll().each ->
          tab.remove($(@).attr("data-tabid"))
          return
      $menu.remove()
      return
    app.defer ->
      $menu.appendTo(document.body)
      UI.contextmenu($menu[0], e.clientX, e.clientY)
      return
    return

  # タブダブルクリックで更新
  $view.find(".tab_tabbar").on "dblclick", "li", (e) ->
    $source = $(e.target).closest(".tab_tabbar, li")

    if $source.is("li")
      sourceTabId = $source.attr("data-tabid")

    tab = $source.closest(".tab").data("tab")

    $view.find("iframe[data-tabid=\"#{sourceTabId}\"]")[0]
      .contentWindow.postMessage(
        JSON.stringify(type: "request_reload")
        location.origin
      )
    return
  return
