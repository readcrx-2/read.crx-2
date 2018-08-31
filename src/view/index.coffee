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
    @$element.on("click", =>
      target = @$element.$(".tab_content.iframe_focused")
      target or= $$.I("left_pane")
      @focus(target)
      return
    )

    #iframeがクリックされた時にフォーカスを移動
    @$element.on("request_focus", ({ target, detail: {focus} }) =>
      return unless target.matches("iframe:not(.iframe_focused)")
      @focus(target, focus)
      return
    )

    #タブが選択された時にフォーカスを移動
    @$element.on("tab_selected", ({target}) =>
      return unless target.hasClass("tab_content")
      @focus(target)
      return
    )

    #.tab内の最後のタブが削除された時にフォーカスを移動
    @$element.on("tab_removed", ({target}) =>
      return unless target.hasClass("tab_content")
      for dom in target.parent().$$(":scope > .tab_content") when dom isnt target
        return
      await app.defer()
      for $tab in $$.C("tab") when $tab.C("tab_selected")?
        $tmp = $tab
        break
      if $tmp?.$(".tab_selected.tab_content")?
        @focus($tmp.$(".tab_selected.tab_content"))
      else
        #フォーカス対象のタブが無い場合、板一覧にフォーカスする
        @focus($$.I("left_pane"))
      return
    )

    #フォーカスしているコンテンツが再描画された場合、フォーカスを合わせ直す
    @$element.on("view_loaded", ({target}) =>
      return if target.matches(".tab_content.iframe_focused")
      @focus(target)
      return
    )

    app.message.on("requestFocusMove", ({command, repeatCount}) =>
      switch command
        when "focusUpFrame"
          @focusUp()
        when "focusDownFrame"
          @focusDown()
        when "focusLeftFrame"
          @focusLeft(repeatCount)
        when "focusRightFrame"
          @focusRight(repeatCount)

      $target = @$element.C("iframe_focused")

      # shortQueryがまだ読み込まれていないことがあるので標準APIで
      for t in $target
        t.contentDocument.getElementsByClassName("view")[0].classList.add("focus_effect")
      await app.wait(200)
      for t in $target
        t.contentDocument.getElementsByClassName("view")[0].classList.remove("focus_effect")
      return
    )

    app.message.on("showKeyboardHelp", =>
      @showKeyboardHelp()
      return
    )
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

    focusIframe = ($iframe) ->
      $iframe.contentDocument?.activeElement?.blur()
      $iframe.contentDocument?.getElementsByClassName("content")[0]?.focus()
      return

    if focus
      if not $iframe.src.endsWith("empty.html") and $iframe.contentDocument?.getElementsByClassName("content")?[0]?
        focusIframe($iframe)
      else
        $iframe.on("load", fn = ->
          return if $iframe.src.endsWith("empty.html")
          $iframe.off("load", fn)
          focusIframe($iframe)
          return
        )
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
    return $$.I("left_pane")

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

      return $targetFrame
    # タブ内コンテンツにフォーカスが当たっている場合
    # 同一.tab内での候補探索
    tabId = $iframe.dataset.tabid
    $rightTabLi = @$element.$("li[data-tabid=\"#{tabId}\"]").next()

    if $rightTabLi?
      rightTabId = $rightTabLi.dataset.tabid
      return @$element.$(".tab_content[data-tabid=\"#{rightTabId}\"]")
    # タブ内で候補が見つからなかった場合
    # 右に.tabが存在し、タブが存在する場合はそれを選択する
    if (
      $$.I("body").hasClass("pane-3h") and
      $iframe.closest(".tab").id is "tab_a"
    )
      return @$element.$("#tab_b .tab_content.tab_selected")
    return null

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
    return

  ###*
  @method focusUp
  ###
  focusUp: ->
    if (
      $$.I("body").hasClass("pane-3") and
      @$element.C("iframe_focused")[0].closest(".tab")?.id is "tab_b"
    )
      iframe = @$element.$("#tab_a iframe.tab_selected")

    @focus(iframe) if iframe
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

    @focus(iframe) if iframe
    return

  ###*
  @method showKeyboardHelp
  ###
  showKeyboardHelp: ->
    $help = @$element.C("keyboard_help")[0]
    $help.on("click", =>
      @hideKeyboardHelp()
      return
    , once: true)
    $help.on("keydown", =>
      @hideKeyboardHelp()
      return
    , once: true)
    ani = await UI.Animate.fadeIn($help)
    ani.on("finish", ->
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

app.boot("/view/index.html", ["BBSMenu"], (BBSMenu) ->
  query = app.URL.parseQuery(location.search).get("q")

  [currentTab, windows] = await Promise.all([
    browser.tabs.getCurrent()
    browser.windows.getAll(populate: true)
  ])
  appPath = browser.runtime.getURL("/view/index.html")
  for win in windows
    for tab in win.tabs when tab.id isnt currentTab.id and tab.url is appPath
      browser.windows.update(win.id, focused: true)
      browser.tabs.update(tab.id, active: true)
      if query
        browser.runtime.sendMessage({type: "open", query})
      browser.tabs.remove(currentTab.id)
      return
  history.replaceState(null, null, "/view/index.html")
  app.main()
  return unless query
  paramResNumFlag = app.config.isOn("enable_link_with_res_number")
  paramResNum = if paramResNumFlag then app.URL.getResNumber(query) else null

  {menu} = await BBSMenu.get()
  await app.URL.pushServerInfo(app.config.get("bbsmenu"), menu)
  BBSMenu.target.on("change", ({detail: {menu}}) ->
    app.URL.pushServerInfo(app.config.get("bbsmenu"), menu)
  )
  app.message.send("open", url: query, new_tab: true, param_res_num: paramResNum)
  return
)

app.view_setup_resizer = ->
  MIN_TAB_HEIGHT = 100

  $body = $$.I("body")
  $tabA = $$.I("tab_a")
  $rightPane = $$.I("right_pane")

  val = null
  valC = null
  valAxis = null
  min = null
  max = null
  offset = null

  updateInfo = ->
    if $body.hasClass("pane-3")
      val = "height"
      valC = "Height"
      valAxis = "Y"
      offset = $rightPane.offsetTop
    else if $body.hasClass("pane-3h")
      val = "width"
      valC = "Width"
      valAxis = "X"
      offset = $rightPane.offsetLeft
    min = MIN_TAB_HEIGHT
    max = $rightPane["offset#{valC}"] - MIN_TAB_HEIGHT
    return

  updateInfo()

  tmp = app.config.get("tab_a_#{val}")
  if tmp
    $tabA.style[val] = Math.max(Math.min(tmp, max), min) + "px"

  $$.I("tab_resizer").on("mousedown", (e) ->
    e.preventDefault()

    updateInfo()

    $div = $__("div")
    $div.style.cssText = """
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      z-index: 999;
      cursor: #{if valAxis is "X" then "col-resize" else "row-resize"}
      """
    $div.on("mousemove", (e) =>
      $tabA.style[val] =
        Math.max(Math.min(e["page#{valAxis}"] - offset, max), min) + "px"
      return
    )
    $div.on("mouseup", ->
      @remove()
      app.config.set("tab_a_#{val}", ""+parseInt($tabA.style[val], 10))
      return
    )
    document.body.addLast($div)
    return
  )
  return

app.main = ->
  urlToIframeInfo = (url) ->
    url = app.URL.fix(url)
    url = app.URL.convertUrlFromPhone(url)
    guessResult = app.URL.guessType(url)
    switch url
      when "config"
        return
          src: "/view/config.html"
          url: "config"
          modal: true
      when "history"
        return
          src: "/view/history.html"
          url: "history"
      when "writehistory"
        return
          src: "/view/writehistory.html"
          url: "writehistory"
      when "bookmark"
        return
          src: "/view/bookmark.html"
          url: "bookmark"
      when "inputurl"
        return
          src: "/view/inputurl.html"
          url: "inputurl"
      when "bookmark_source_selector"
        return
          src: "/view/bookmark_source_selector.html"
          url: "bookmark_source_selector"
          modal: true
    if res = /^search:(.+)$/.exec(url)
      return
        src: "/view/search.html?#{res[1]}"
        url: url
    if guessResult.type is "board"
      return
        src: "/view/board.html?#{app.URL.buildQuery(q: url)}"
        url: url
    if guessResult.type is "thread"
      return
        src: "/view/thread.html?#{app.URL.buildQuery(q: url)}"
        url: url
    return null

  iframeSrcToUrl = (src) ->
    if res = ///^/view/(\w+)\.html$///.exec(src)
      return res[1]
    if res = ///^/view/search\.html(\?.+)$///.exec(src)
      return app.URL.parseQuery(res[1], true).get("query")
    if res = ///^/view/(?:thread|board)\.html(\?.+)$///.exec(src)
      return app.URL.parseQuery(res[1], true).get("q")
    return null

  $view = document.documentElement
  new app.view.Index($view)

  do ->
    # bookmark_idが未設定の場合、わざと無効な値を渡してneedReconfigureRootNodeId
    # をcallさせる。
    cbel = new app.BrowserBookmarkEntryList(
      app.config.get("bookmark_id") or "dummy"
    )
    cbel.needReconfigureRootNodeId.add( ->
      app.message.send("open", url: "bookmark_source_selector")
      return
    )

    app.bookmarkEntryList = cbel
    app.bookmark = new app.BookmarkCompatibilityLayer(cbel)
    return

  app.bookmarkEntryList.ready.add( ->
    $$.I("left_pane").src = "/view/sidemenu.html"
    return
  )

  do ->
    document.title = (await app.manifest).name
    return

  app.message.on("notify", ({message: text, html, background_color = "#777"}) ->
    $div = $__("div")
    $div.style.backgroundColor = background_color
    $div2 = $__("div")
    if html?
      $div2.innerHTML = html
    else
      $div2.textContent = text
    $div.addLast($div2, $__("div"))
    $div.on("click", func = ({target, currentTarget: cTarget}) ->
      return unless target.matches("a, div:last-child")
      $div.off("click", func)
      ani = await UI.Animate.fadeOut(cTarget)
      ani.on("finish", =>
        cTarget.remove()
        return
      )
      return
    )
    $$.I("app_notice_container").addLast($div)
    UI.Animate.fadeIn($div)
    return
  )

  #前回起動時のバージョンと違うバージョンだった場合、アップデート通知を送出
  do ->
    lastVersion = app.config.get("last_version")
    {name, version} = await app.manifest
    if lastVersion?
      if version isnt lastVersion
        app.message.send("notify",
          html: """
            #{name} が #{lastVersion} から
            #{version} にアップデートされました。
             <a href="https://readcrx-2.github.io/read.crx-2/changelog.html#v#{version}" target="_blank">更新履歴</a>
          """
          background_color: "green"
        )
      else
        return
    app.config.set("last_version", version)
    return

  #更新通知
  browser.runtime.onUpdateAvailable.addListener( ({version: newVer}) ->
    {name, version: oldVer} = await app.manifest
    return if newVer is oldVer
    app.message.send("notify",
      message: """
        #{name} の #{newVer} が利用可能です
      """
      background_color: "green"
    )
    return
  )

  # ウィンドウサイズ関連処理
  adjustWindowSize = new app.Callbacks()
  do ->
    resizeTo = (width, height, callback) ->
      win = await browser.windows.getCurrent()
      browser.windows.update(win.id, {width, height}, callback)
      return

    saveWindowSize = ->
      win = await browser.windows.getCurrent()
      app.config.set("window_width", win.width.toString(10))
      app.config.set("window_height", win.height.toString(10))
      return

    startAutoSave = ->
      isResized = false

      saveWindowSize()

      window.on("resize", ->
        isResized = true
        return
      )

      setInterval( ->
        return unless isResized
        isResized = false
        saveWindowSize()
        return
      , 1000)
      return

    # 起動時にウィンドウサイズが極端に小さかった場合、前回終了時のサイズに復元
    do ->
      win = await browser.windows.getCurrent(populate: true)
      if win.tabs.length is 1 and win.width < 300 or win.height < 300
        resizeTo(
          +app.config.get("window_width")
          +app.config.get("window_height")
          ->
            await app.defer()
            adjustWindowSize.call()
            return
        )
      else
        adjustWindowSize.call()
      return

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

  $view.on("tab_urlupdated", ({target}) ->
    return unless target.tagName is "IFRAME"
    target.dataset.url = iframeSrcToUrl(target.getAttr("src"))
    return
  )

  app.message.on("config_updated", ({key, val}) ->
    return unless key is "layout"
    $body = $$.I("body")
    $body.removeClass("pane-3", "pane-3h", "pane-2")
    $body.addClass(val)
    $tabA = $$.I("tab_a")
    $tabB = $$.I("tab_b")
    $tabA.style.width = ""
    $tabA.style.height = ""
    $tabB.style.width = ""
    $tabB.style.height = ""
    #タブ移動
    #2->3
    if val in ["pane-3", "pane-3h"]
      for tmp in tabA.getAll()
        iframe = $$.$("iframe[data-tabid=\"#{tmp.tabId}\"]")
        tmpURL = iframe.dataset.url

        if app.URL.guessType(tmpURL).type is "thread"
          app.message.send("open",
            new_tab: true
            lazy: true
            url: tmpURL
            title: tmp.title
          )
          tabA.remove(tmp.tabId)
    #3->2
    if val is "pane-2"
      for tmp in tabB.getAll()
        iframe = $$.$("iframe[data-tabid=\"#{tmp.tabId}\"]")
        tmpURL = iframe.dataset.url

        app.message.send("open",
          new_tab: true
          lazy: true
          url: tmpURL
          title: tmp.title
        )
        tabB.remove(tmp.tabId)
    return
  )

  app.bookmarkEntryList.ready.add( ->
    #タブ復元
    if localStorage.tab_state?
      for tab in JSON.parse(localStorage.tab_state)
        isRestored = true
        app.message.send("open",
          url: tab.url
          title: tab.title
          lazy: not tab.selected
          locked: tab.locked
          new_tab: true
          restore: true
        )

    #もし、タブが一つも復元されなかったらブックマークタブを開く
    unless isRestored
      app.message.send("open", url: "bookmark")
    return
  )

  # コンテキストメニューの作成
  app.ContextMenus.createAll()
  # NGデータの有効期限設定
  app.NG.execExpire()

  window.on("unload", ->
    #コンテキストメニューの削除
    app.ContextMenus.removeAll()
    # 終了通知の送信
    browser.runtime.sendMessage(type: "exit_rcrx")
    return
  )

  #openメッセージ受信部
  app.message.on("open", ({
    url
    title
    background
    lazy
    locked
    restore
    new_tab
    written_res_num = null
    param_res_num = null
  }) ->
    iframeInfo = urlToIframeInfo(url)
    return unless iframeInfo

    if iframeInfo.modal
      unless $view.$("iframe[src=\"#{iframeInfo.src}\"]")?
        $iframeEle = $__("iframe").addClass("fade")
        $iframeEle.src = iframeInfo.src
        $iframeEle.dataset.url = iframeInfo.url
        $iframeEle.dataset.title = title or iframeInfo.url
        $$.I("modal").addLast($iframeEle)
        UI.Animate.fadeIn($iframeEle)
    else
      $li = $view.$(".tab_tabbar > li[data-tabsrc=\"#{iframeInfo.src}\"]")
      if $li?
        app.DOMData.get($li.closest(".tab"), "tab").update($li.dataset.tabid, selected: true)
        if url isnt "bookmark" #ブックマーク更新は時間がかかるので例外扱い
          $iframe = $view.$("iframe[data-tabid=\"#{$li.dataset.tabid}\"]")
          $iframe.contentWindow.postMessage({
            type: "request_reload"
            written_res_num
            param_res_num
          }, location.origin)
      else
        target = tabA
        if(
          iframeInfo.src[0..16] is "/view/thread.html" and
          not $$.I("body").hasClass("pane-2")
        )
          target = tabB

        if new_tab or not (selectedTab = target.getSelected())
          tabId = target.add(iframeInfo.src, {
            title: title or iframeInfo.url
            selected: not (background or lazy)
            locked
            lazy
            restore
          })
        else
          tabId = selectedTab.tabId
          target.update(tabId, {
            url: iframeInfo.src
            title: title or iframeInfo.url
            selected: true
            locked
          })
        $tab = $view.$("iframe[data-tabid=\"#{tabId}\"]")
        $tab.dataset.url = iframeInfo.url
        $tab.dataset.writtenResNum = written_res_num ? ""
        $tab.dataset.paramResNum = param_res_num ? ""
    return
  )

  #openリクエストの監視
  browser.runtime.onMessage.addListener( ({type, query}) ->
    return unless type is "open"
    paramResNumFlag = app.config.isOn("enable_link_with_res_number")
    paramResNum = if paramResNumFlag then app.URL.getResNumber(query) else null
    app.message.send("open", url: query, new_tab: true, param_res_num: paramResNum)
    return
  )

  #書き込み完了メッセージの監視
  browser.runtime.onMessage.addListener( ({
    type
    kind
    url
    mes
    name
    mail
    title
    thread_url
  }) ->
    return unless type in ["written", "written?"]
    iframe = document.$("iframe[data-url=\"#{url}\"]")
    if iframe
      iframe.contentWindow.postMessage({
        type: "request_reload"
        force_update: true
        kind
        mes
        name
        mail
        title
        thread_url
      }, location.origin)
    return
  )

  #書き込みウィンドウサイズ保存メッセージの監視
  browser.runtime.onMessage.addListener( ({type, x, y}) ->
    return unless type is "writesize"
    app.config.set("write_window_x", ""+x)
    app.config.set("write_window_y", ""+y)
  )

  # リクエスト・ヘッダーの監視
  browser.webRequest.onBeforeSendHeaders.addListener( ({method, url, requestHeaders}) ->
    replaceHeader = (name, value) ->
      for header in requestHeaders
        if header.name.toLowerCase() is name
          header.value = value
          break
      return

    # 短縮URLの展開でのt.coに対する例外
    if method is "HEAD" and app.URL.getDomain(url) is "t.co"
      replaceHeader("user-agent", "")

    return {requestHeaders}
  ,{
    urls: ["*://t.co/*"],
    types: ["xmlhttprequest"]
  }
  ,["blocking", "requestHeaders"]
  )

  #viewからのメッセージを監視
  window.on("message", ({origin, source, data: message}) ->
    return if origin isnt location.origin

    $iframe = source?.frameElement
    return unless $iframe?

    {type, title} = message

    switch type
      #タブ内コンテンツがtitle_updatedを送出した場合、タブのタイトルを更新
      when "title_updated"
        if $iframe.hasClass("tab_content")
          app.DOMData.get($iframe.closest(".tab"), "tab").update($iframe.dataset.tabid, {title})

      #request_killmeの処理
      when "request_killme"
        #タブ内のviewが送ってきた場合
        if $iframe.hasClass("tab_content")
          app.DOMData.get($iframe.closest(".tab"), "tab").remove($iframe.dataset.tabid)
        #モーダルのviewが送ってきた場合
        else if $iframe.matches("#modal > iframe")
          ani = await UI.Animate.fadeOut($iframe)
          ani.on("finish", ->
            $iframe.contentWindow.___e = new Event("view_unload", bubbles: true)
            $iframe.contentWindow.emit($iframe.contentWindow.___e)

            $iframe.remove()
            return
          )

      #view_loadedの翻訳
      when "view_loaded"
        $iframe.emit(new Event("view_loaded"))

      #request_focusの翻訳
      when "request_focus"
        $iframe.emit(new CustomEvent("request_focus", detail: message, bubbles: true))
    return
  )

  #データ保存等の後片付けを行なってくれるzombie.html起動
  window.on("beforeunload", ->
    window.emit(new Event("beforezombie"))
    if localStorage.zombie_read_state?
      open("/zombie.html", undefined, "left=1,top=1,width=250,height=50")
    return
  )

  onRemove = ({target}) ->
    target = target.closest("iframe")
    return unless target?
    target.contentWindow.___e = new Event("view_unload", bubbles: true)
    # shortQuery.jsが読み込まれていないこともあるためdispatchEventで
    target.contentWindow.dispatchEvent(target.contentWindow.___e)
    return
  $view.on("tab_removed", onRemove)
  $view.on("tab_beforeurlupdate", onRemove)

  #tab_selected(event) -> tab_selected(postMessage) 翻訳処理
  $view.on("tab_selected", ({target}) ->
    target = target.closest("iframe.tab_content")
    return unless target?
    target.contentWindow.postMessage(type: "tab_selected", location.origin)
    return
  )

  #タブコンテキストメニュー
  for dom in $view.C("tab_tabbar")
    dom.on("contextmenu", (e) ->
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
        return null

      if not getLatestRestorableTabID()
        $menu.C("restore")[0].remove()

      if tab.isLocked(sourceTabId)
        $menu.C("lock")[0].remove()
        $menu.C("close")[0].remove()
      else
        $menu.C("unlock")[0]?.remove()

      if $menu.child().length is 0
        return

      $menu.on("click", func = ({target}) ->
        return unless target.tagName is "LI"
        $menu.off("click", func)

        switch
          #閉じたタブを開く
          when target.hasClass("restore")
            if tmp = getLatestRestorableTabID()
              tab.restoreClosed(tmp)
          #再読み込み
          when target.hasClass("reload")
            $view.$("iframe[data-tabid=\"#{sourceTabId}\"]")
              .contentWindow.postMessage(
                type: "request_reload"
                location.origin
              )
          #タブを固定
          when target.hasClass("lock")
            tab.update(sourceTabId, locked: true)
          #タブの固定を解除
          when target.hasClass("unlock")
            tab.update(sourceTabId, locked: false)
          #タブを閉じる
          when target.hasClass("close")
            tab.remove(sourceTabId)
          #タブを全て閉じる
          when target.hasClass("close_all")
            for dom in $source.parent().child() by -1
              tabid = dom.dataset.tabid
              tab.remove(tabid) unless tab.isLocked(tabid)
          #他のタブを全て閉じる
          when target.hasClass("close_all_other")
            for dom in $source.parent().child() by -1 when dom isnt $source
              tabid = dom.dataset.tabid
              tab.remove(tabid) unless tab.isLocked(tabid)
          #右側のタブを全て閉じる
          when target.hasClass("close_right")
            while dom = $source.next()
              tabid = dom.dataset.tabid
              tab.remove(tabid) unless tab.isLocked(tabid)
        $menu.remove()
        return
      )
      await app.defer()
      document.body.addLast($menu)
      UI.ContextMenu($menu, e.clientX, e.clientY)
      return
    )

  # タブダブルクリックで更新
  for dom in $view.C("tab_tabbar")
    dom.on("dblclick", ({target}) ->
      if target.matches("li")
        $source = target
      else if target.closest(".tab_tabbar > li")?
        $source = target.closest(".tab_tabbar > li")
      return unless $source?

      sourceTabId = $source.dataset.tabid

      $view.$("iframe[data-tabid=\"#{sourceTabId}\"]").contentWindow.postMessage(
        type: "request_reload"
        location.origin
      )
      return
    )
  return
