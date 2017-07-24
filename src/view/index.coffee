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

    #iframe以外の部分がクリックされた時にフォーカスをiframe内に戻す
    @$element.on "click", =>
      target = @$element.$(".tab_content.iframe_focused")
      target or= $$.I("left_pane")
      @focus(target)
      return

    #iframeがクリックされた時にフォーカスを移動
    @$element.on "request_focus", (e) =>
      return unless e.target.matches("iframe:not(.iframe_focused)")
      @focus(e.target, e.detail.focus)
      return

    #タブが選択された時にフォーカスを移動
    @$element.on "tab_selected", (e) =>
      return unless e.target.hasClass("tab_content")
      @focus(e.target)
      return

    #.tab内の最後のタブが削除された時にフォーカスを移動
    @$element.on "tab_removed", (e) =>
      return unless e.target.hasClass("tab_content")
      for dom in e.target.parent().$$(":scope > .tab_content") when dom isnt e.target
        return
      app.defer =>
        for $tab in $$.C("tab") when $tab.C("tab_selected")?
          $tmp = $tab
          break
        if $tmp?.$(".tab_selected.tab_content")?
          @focus($tmp.$(".tab_selected.tab_content"))
        else
          #フォーカス対象のタブが無い場合、板一覧にフォーカスする
          @focus($$.I("left_pane"))
        return
      return

    #フォーカスしているコンテンツが再描画された場合、フォーカスを合わせ直す
    @$element.on "view_loaded", (e) =>
      return if e.target.matches(".tab_content.iframe_focused")
      @focus(e.target)
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

      $target = @$element.C("iframe_focused")

      for t in $target
        t.contentDocument.C("view")[0].addClass("focus_effect")
      setTimeout( ->
        for t in $target
          t.contentDocument.C("view")[0].removeClass("focus_effect")
        return
      , 200)
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
  focus: ($iframe, focus = true) ->
    if not $iframe.hasClass("iframe_focused")
      @$element.C("iframe_focused")[0]?.removeClass("iframe_focused")
      $iframe.addClass("iframe_focused")

    if focus
      setTimeout( ->
        $iframe.contentDocument?.activeElement?.blur()
        $iframe.contentDocument?.getElementsByClassName("content")[0]?.focus()
        return
      , 100)
    return

  ###*
  @method _getLeftFrame
  @private
  @param {Element} iframe
  @return {Element|null} leftFrame
  ###
  _getLeftFrame: ($iframe) ->
    # 既に#left_paneにフォーカスが当たっている場合
    return null unless $iframe.hasClass("tab_content")

    # 同一.tab内での候補探索
    tabId = $iframe.dataset.tabid
    $leftTabLi = @$element.$("li[data-tabid=\"#{tabId}\"]").prev()

    if $leftTabLi?
      leftTabId = $leftTabLi.dataset.tabid
      return @$element.$(".tab_content[data-tabid=\"#{leftTabId}\"]")

    # 同一.tab内で候補がなかった場合
    # 左に.tabが存在し、タブが存在する場合はそちらを優先する
    if (
      $$.I("body").hasClass("pane-3h") and
      $iframe.closest(".tab").id is "tab_b"
    )
      return @$element.$("#tab_a .tab_content.tab_selected")

    # そうでなければ#left_paneで確定
    $$.I("left_pane")

  ###*
  @method focusLeft
  @param {number} [repeat=1]
  ###
  focusLeft: (repeat = 1) ->
    $currentFrame = @$element.C("iframe_focused")[0]
    $targetFrame = $currentFrame

    for [0...repeat]
      $prevTargetFrame = $targetFrame
      $targetFrame = @_getLeftFrame($targetFrame) or $targetFrame

      if $targetFrame is $prevTargetFrame
        break

    if $targetFrame isnt $currentFrame
      if $targetFrame.hasClass("tab_content")
        targetTabId = $targetFrame.dataset.tabid

        app.DOMData.get($targetFrame.closest(".tab"), "tab").update(targetTabId, selected: true)
      else
        @focus($targetFrame)
    return

  ###*
  @method _getRightFrame
  @private
  @param {Element} iframe
  @return {Element|null} rightFrame
  ###
  _getRightFrame: ($iframe) ->
    # サイドメニューにフォーカスが当たっている場合
    if $iframe.id is "left_pane"
      $targetFrame = @$element.$("#tab_a .tab_content.tab_selected")

      if !$targetFrame?
        $targetFrame = @$element.$("#tab_b .tab_content.tab_selected")

      $targetFrame
    # タブ内コンテンツにフォーカスが当たっている場合
    else
      # 同一.tab内での候補探索
      tabId = $iframe.dataset.tabid
      $rightTabLi = @$element.$("li[data-tabid=\"#{tabId}\"]").next()

      if $rightTabLi?
        rightTabId = $rightTabLi.dataset.tabid
        @$element.$(".tab_content[data-tabid=\"#{rightTabId}\"]")
      # タブ内で候補が見つからなかった場合
      # 右に.tabが存在し、タブが存在する場合はそれを選択する
      else if (
        $$.I("body").hasClass("pane-3h") and
        $iframe.closest(".tab").id is "tab_a"
      )
        return @$element.$("#tab_b .tab_content.tab_selected")
      else
        null

  ###*
  @method focusRight
  @param {number} [repeat = 1]
  ###
  focusRight: (repeat = 1) ->
    $currentFrame = @$element.C("iframe_focused")[0]
    $targetFrame = $currentFrame

    for [0...repeat]
      $prevTargetFrame = $targetFrame
      $targetFrame = @_getRightFrame($targetFrame) or $targetFrame

      if $targetFrame is $prevTargetFrame
        break

    if $targetFrame isnt $currentFrame
      if $targetFrame.hasClass("tab_content")
        targetTabId = $targetFrame.dataset.tabid

        app.DOMData.get($targetFrame.closest(".tab"), "tab").update(targetTabId, selected: true)
      else
        @focus($targetFrame)

  ###*
  @method focusUp
  ###
  focusUp: ->
    if (
      $$.I("body").hasClass("pane-3") and
      @$element.C("iframe_focused")[0].closest(".tab")?.id is "tab_b"
    )
      iframe = @$element.$("#tab_a iframe.tab_selected")

    if iframe
      @focus(iframe)
    return

  ###*
  @method focusDown
  ###
  focusDown: ->
    if (
      $$.I("body").hasClass("pane-3") and
      @$element.C("iframe_focused")[0].closest(".tab")?.id is "tab_a"
    )
      iframe = @$element.$("#tab_b iframe.tab_selected")

    if iframe
      @focus(iframe)
    return

  ###*
  @method showKeyboardHelp
  ###
  showKeyboardHelp: ->
    $help = @$element.C("keyboard_help")[0]
    $help.on("click", func = =>
      $help.off("click", func)
      @hideKeyboardHelp()
      return
    )
    $help.on("keydown", func = =>
      $help.off("keydown", func)
      @hideKeyboardHelp()
      return
    )
    UI.Animate.fadeIn($help).on("finish", ->
      $help.focus()
    )
    return

  ###*
  @method hideKeyboardHelp
  ###
  hideKeyboardHelp: ->
    UI.Animate.fadeOut(@$element.C("keyboard_help")[0])
    iframe = $$.C("iframe_focused")[0]
    iframe?.contentDocument.C("content")[0].focus()
    return

app.boot "/view/index.html", ["bbsmenu"], (BBSMenu) ->
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
        for tab in win.tabs when tab.id isnt current_tab.id and tab.url is app_path
          chrome.windows.update(win.id, focused: true)
          chrome.tabs.update(tab.id, highlighted: true)
          if query
            chrome.runtime.sendMessage({type: "open", query})
          chrome.tabs.remove(current_tab.id)
          return
      history.replaceState(null, null, "/view/index.html")
      app.main()
      return unless query
      paramResNumFlag = (app.config.get("enable_link_with_res_number") is "on")
      paramResNum = if paramResNumFlag then app.URL.getResNumber(query) else null
      # 後ほど実行するためにCallbacksに登録する
      app.BBSMenu.boardTableCallbacks = new app.Callbacks({persistent: false})
      app.BBSMenu.boardTableCallbacks.add( ->
        app.message.send("open", url: query, new_tab: true, param_res_num: paramResNum)
        return
      )

app.view_setup_resizer = ->
  MIN_TAB_HEIGHT = 100

  $body = $$.I("body")
  $tab_a = $$.I("tab_a")
  right_pane = $$.I("right_pane")

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

  $$.I("tab_resizer").on("mousedown", (e) ->
    e.preventDefault()

    update_info()

    $div = $__("div")
    $div.style.cssText = """
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      z-index: 999;
      cursor: #{if val_axis is "X" then "col-resize" else "row-resize"}
      """
    $div.on("mousemove", (e) =>
      tab_a.style[val] =
        Math.max(Math.min(e["page#{val_axis}"] - offset, max), min) + "px"
      return
    )
    $div.on("mouseup", ->
      @remove()
      app.config.set("tab_a_#{val}", parseInt(tab_a.style[val], 10))
      return
    )
    document.body.addLast($div)
    return
  )

app.main = ->
  urlToIframeInfo = (url) ->
    url = app.URL.fix(url)
    # 携帯・スマホ用URLの変換
    url = app.URL.convertUrlFromPhone(url)
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

  $view = document.documentElement
  new app.view.Index($view)

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
    $$.I("left_pane").src = "/view/sidemenu.html"
    return

  document.title = app.manifest.name

  app.Ninja.enableAutoBackup()

  app.message.addListener "notify", (message) ->
    text = message.message
    html = message.html
    background_color = message.background_color or "#777"
    $div = $__("div")
    $div.style["background-color"] = background_color
    $div2 = $__("div")
    if html?
      $div2.innerHTML = html
    else
      $div2.textContent = text
    $div.addLast($div2)
    $div.addLast($__("div"))
    $div.on("click", func = (e) ->
      return unless e.target.matches("a, div:last-child")
      $div.off("click", func)
      cTarget = e.currentTarget
      UI.Animate.fadeOut(cTarget).on("finish", =>
        cTarget.remove()
      )
    )
    $$.I("app_notice_container").addLast($div)
    UI.Animate.fadeIn($div)

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

      window.on "resize", ->
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
  $$.I("body").addClass(app.config.get("layout"))
  tabA = new UI.Tab($$.I("tab_a"))
  app.DOMData.set($$.I("tab_a"), "tab", tabA)
  UI.Tab.tabA = tabA
  tabB = new UI.Tab($$.I("tab_b"))
  app.DOMData.set($$.I("tab_b"), "tab", tabB)
  UI.Tab.tabB = tabB
  for dom in $$(".tab .tab_tabbar")
    new UI.Sortable(dom, exclude: "img")
  adjustWindowSize.add(app.view_setup_resizer)

  $view.on("tab_urlupdated", (e) ->
    target = e.target
    return unless target.tagName is "IFRAME"
    target.dataset.url = iframeSrcToUrl(target.getAttr("src"))
    return
  )

  app.message.addListener "config_updated", (message) ->
    if message.key is "layout"
      $body = $$.I("body")
      $body.removeClass("pane-3")
      $body.removeClass("pane-3h")
      $body.removeClass("pane-2")
      $body.addClass(message.val)
      $$.I("tab_a").style.width = ""
      $$.I("tab_a").style.height = ""
      $$.I("tab_b").style.width = ""
      $$.I("tab_b").style.height = ""
      #タブ移動
      #2->3
      if message.val is "pane-3" or message.val is "pane-3h"
        for tmp in tabA.getAll()
          iframe = $$.$("iframe[data-tabid=\"#{tmp.tabId}\"]")
          tmpURL = iframe.dataset.url

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
          iframe = $$.$("iframe[data-tabid=\"#{tmp.tabId}\"]")
          tmpURL = iframe.dataset.url

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
          restore: true
        })

    #もし、タブが一つも復元されなかったらブックマークタブを開く
    unless is_restored
      app.message.send("open", url: "bookmark")
    delete localStorage.tab_state
    return

  # コンテキストメニューの作成
  app.contextMenus.createAll()

  window.on "unload", ->
    #コンテキストメニューの削除
    app.contextMenus.removeAll()
    # 終了通知の送信
    chrome.runtime.sendMessage({type: "exit_rcrx"})
    return

  #openメッセージ受信部
  app.message.addListener "open", (message) ->
    iframe_info = urlToIframeInfo(message.url)
    return unless iframe_info

    if iframe_info.modal
      unless $view.$("iframe[src=\"#{iframe_info.src}\"]")?
        $iframeEle = $__("iframe")
        $iframeEle.src = iframe_info.src
        $iframeEle.dataset.url = iframe_info.url
        $iframeEle.dataset.title = message.title or iframe_info.url
        $iframeEle.addClass("fade")
        $$.I("modal").addLast($iframeEle)
        UI.Animate.fadeIn($iframeEle)
    else
      $li = $view.$(".tab_tabbar > li[data-tabsrc=\"#{iframe_info.src}\"]")
      if $li?
        app.DOMData.get($li.closest(".tab"), "tab").update($li.dataset.tabid, selected: true)
        if message.url isnt "bookmark" #ブックマーク更新は時間がかかるので例外扱い
          tmp = JSON.stringify({
            type: "request_reload",
            written_res_num: message.written_res_num ? null,
            param_res_num: message.param_res_num ? null
          })
          $iframe = $view.$("iframe[data-tabid=\"#{$li.dataset.tabid}\"]")
          $iframe.contentWindow.postMessage(tmp, location.origin)
      else
        target = tabA
        if iframe_info.src[0..16] is "/view/thread.html" and
            not $$.I("body").hasClass("pane-2")
          target = tabB

        if message.new_tab or not (selectedTab = target.getSelected())
          tabId = target.add(iframe_info.src, {
            title: message.title or iframe_info.url
            selected: not (message.background or message.lazy)
            locked: message.locked
            lazy: message.lazy
            restore: message.restore
          })
        else
          tabId = selectedTab.tabId
          target.update(tabId, {
            url: iframe_info.src
            title: message.title or iframe_info.url
            selected: true
            locked: message.locked
          })
        $tab = $view.$("iframe[data-tabid=\"#{tabId}\"]")
        $tab.dataset.url = iframe_info.url
        $tab.dataset.writtenResNum = message.written_res_num ? ""
        $tab.dataset.paramResNum = message.param_res_num ? ""
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
      iframe = document.$("iframe[data-url=\"#{request.url}\"]")
      if iframe
        tmp = JSON.stringify(type: "request_reload", force_update: true, kind: request.kind, mes: request.mes, name: request.name, mail: request.mail, title: request.title, thread_url: request.thread_url)
        iframe.contentWindow.postMessage(tmp, location.origin)

  #書き込みウィンドウサイズ保存メッセージの監視
  chrome.runtime.onMessage.addListener (request) ->
    if request.type is "writesize"
      app.config.set("write_window_x", ""+request.x)
      app.config.set("write_window_y", ""+request.y)

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
  window.on "message", (e) ->
    return if e.origin isnt location.origin or typeof e.data isnt "string"

    $iframe = e.source?.frameElement
    return unless $iframe?

    message = JSON.parse(e.data)

    switch message.type
      #タブ内コンテンツがtitle_updatedを送出した場合、タブのタイトルを更新
      when "title_updated"
        if $iframe.hasClass("tab_content")
          app.DOMData.get($iframe.closest(".tab"), "tab").update($iframe.dataset.tabid, title: message.title)

      #request_killmeの処理
      when "request_killme"
        #タブ内のviewが送ってきた場合
        if $iframe.hasClass("tab_content")
          app.DOMData.get($iframe.closest(".tab"), "tab").remove($iframe.dataset.tabid)
        #モーダルのviewが送ってきた場合
        else if $iframe.matches("#modal > iframe")
          UI.Animate.fadeOut($iframe).on("finish", ->
            $iframe.remove()
            return
          )

      #view_loadedの翻訳
      when "view_loaded"
        $iframe.dispatchEvent(new Event("view_loaded"))

      #request_focusの翻訳
      when "request_focus"
        $iframe.dispatchEvent(new CustomEvent("request_focus", detail: message, bubbles: true))
    return

  #データ保存等の後片付けを行なってくれるzombie.html起動
  window.on "beforeunload", ->
    window.dispatchEvent(new Event("beforezombie"))
    if localStorage.zombie_read_state?
      open("/zombie.html", undefined, "left=1,top=1,width=250,height=50")
    return

  onRemove = (e) ->
    target = e.target.closest("iframe")
    return unless target?
    target.contentWindow.___e = new Event("view_unload", bubbles: true)
    target.contentWindow.dispatchEvent(target.contentWindow.___e)
    return
  $view.on "tab_removed", onRemove
  $view.on "tab_beforeurlupdate", onRemove

  #tab_selected(event) -> tab_selected(postMessage) 翻訳処理
  $view.on "tab_selected", (e) ->
    target = e.target.closest("iframe.tab_content")
    return unless target?
    tmp = JSON.stringify(type: "tab_selected")
    target.contentWindow.postMessage(tmp, location.origin)
    return

  #タブコンテキストメニュー
  for dom in $view.C("tab_tabbar")
    dom.on "contextmenu", (e) ->
      e.preventDefault()

      $source = e.target.closest(".tab_tabbar, li")
      $menu = $$.I("template_tab_contextmenu").content.$(".tab_contextmenu").cloneNode(true)

      if $source.tagName is "LI"
        sourceTabId = $source.dataset.tabid
      else
        for dom in $menu.$$(":scope > :not(.restore)")
          dom.remove()

      tab = app.DOMData.get($source.closest(".tab"), "tab")

      getLatestRestorableTabID = ->
        tabURLList = (a.url for a in tab.getAll())
        list = tab.getRecentClosed()
        list.reverse()
        for tmpTab in list when not (tmpTab.url in tabURLList)
          return tmpTab.tabId
        null

      if not getLatestRestorableTabID()
        $menu.C("restore")[0].remove()

      if tab.isLocked(sourceTabId)
        $menu.C("lock")[0].remove()
        $menu.C("close")[0].remove()
      else
        $menu.C("unlock")[0]?.remove()

      if $menu.child().length is 0
        return

      $menu.on "click", func = (e) ->
        return unless e.target.tagName is "LI"
        $menu.off("click", func)

        target = e.target

        #閉じたタブを開く
        if target.hasClass("restore")
          if tmp = getLatestRestorableTabID()
            tab.restoreClosed(tmp)
        #再読み込み
        else if target.hasClass("reload")
          $view.$("iframe[data-tabid=\"#{sourceTabId}\"]")
            .contentWindow.postMessage(
              JSON.stringify(type: "request_reload")
              location.origin
            )
        #タブを固定
        else if target.hasClass("lock")
          tab.update(sourceTabId, locked: true)
        #タブの固定を解除
        else if target.hasClass("unlock")
          tab.update(sourceTabId, locked: false)
        #タブを閉じる
        else if target.hasClass("close")
          tab.remove(sourceTabId)
        #タブを全て閉じる
        else if target.hasClass("close_all")
          for dom in $source.parent().child() by -1
            tabid = dom.dataset.tabid
            tab.remove(tabid) unless tab.isLocked(tabid)
        #他のタブを全て閉じる
        else if target.hasClass("close_all_other")
          for dom in $source.parent().child() by -1 when dom isnt $source
            tabid = dom.dataset.tabid
            tab.remove(tabid) unless tab.isLocked(tabid)
        #右側のタブを全て閉じる
        else if target.hasClass("close_right")
          while dom = $source.next()
            tabid = dom.dataset.tabid
            tab.remove(tabid) unless tab.isLocked(tabid)
        $menu.remove()
        return
      app.defer ->
        document.body.addLast($menu)
        UI.contextmenu($menu, e.clientX, e.clientY)
        return
      return

  # タブダブルクリックで更新
  for dom in $view.C("tab_tabbar")
    dom.on("dblclick", (e) ->
      if e.target.matches("li")
        $source = e.target
      else if e.target.closest(".tab_tabbar, li")?
        $source = e.target.closest(".tab_tabbar, li")
      return unless $source?

      sourceTabId = $source.dataset.tabid

      $view.$("iframe[data-tabid=\"#{sourceTabId}\"]").contentWindow.postMessage(
        JSON.stringify(type: "request_reload")
        location.origin
      )
      return
    )
  return
