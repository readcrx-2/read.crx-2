do ->
  return if navigator.platform.includes("Win")
  new Promise( (resolve, reject) ->
    font = localStorage.getItem("textar_font")
    if font?
      resolve(font)
    else
      reject()
    return
  ).catch( ->
    return new Promise( (resolve, reject) ->
      xhr = new XMLHttpRequest()
      xhr.open("GET", "https://readcrx-2.github.io/read.crx-2/textar-min.woff")
      xhr.responseType = "arraybuffer"
      xhr.onload = ->
        if @status is 200
          buffer = new Uint8Array(@response)
          s = ""
          for a in buffer
            s += String.fromCharCode(a)
          font = "data:application/x-font-woff;base64,#{btoa(s)}"
          localStorage.setItem("textar_font", font)
          resolve(font)
        return
      xhr.send()
      return
    )
  ).then( (font) ->
    fontface = new FontFace("Textar", "url(#{font})")
    document.fonts.add(fontface)
    return
  )
  return

app.viewThread = {}

app.boot("/view/thread.html", ->
  try
    viewUrl = app.URL.parseQuery(location.search).get("q")
  catch
    alert("不正な引数です")
    return
  viewUrl = app.URL.fix(viewUrl)

  $view = document.documentElement
  $view.dataset.url = viewUrl

  $content = $view.C("content")[0]
  threadContent = new UI.ThreadContent(viewUrl, $content)
  mediaContainer = new UI.MediaContainer($view)
  app.DOMData.set($view, "threadContent", threadContent)
  app.DOMData.set($view, "selectableItemList", threadContent)
  app.DOMData.set($view, "lazyload", new UI.LazyLoad($content))

  new app.view.TabContentView($view)

  searchNextThread = new UI.SearchNextThread(
    $view.C("next_thread_list")[0]
  )
  popupView = new UI.PopupView($view)

  if app.config.get("aa_font") is "aa"
    $content.addClass("config_use_aa_font")

  write = (param = {}) ->
    param.url = viewUrl
    param.title = document.title
    windowX = app.config.get("write_window_x")
    windowY = app.config.get("write_window_y")
    open(
      "/write/write.html?#{app.URL.buildQuery(param)}"
      undefined
      "width=600,height=300,left=#{windowX},top=#{windowY}"
    )
    return

  popupHelper = (that, e, fn) ->
    $popup = fn()
    return if $popup.child().length is 0
    for dom in $popup.T("article")
      dom.removeClass("last")
      dom.removeClass("read")
      dom.removeClass("received")
    #ポップアップ内のサムネイルの遅延ロードを解除
    for dom in $popup.$$("img[data-src], video[data-src]")
      app.DOMData.get($view, "lazyload").immediateLoad(dom)
    app.defer( ->
      # popupの表示
      popupView.show($popup, e.clientX, e.clientY, that)
      return
    )
    return

  canWriteFlg = do ->
    tsld = app.URL.tsld(viewUrl)
    if tsld in ["2ch.net", "bbspink.com", "2ch.sc", "open2ch.net"]
      return true
    # したらばの過去ログ
    if tsld is "shitaraba.net" and not viewUrl.includes("/read_archive.cgi/")
      return true
    return false

  if canWriteFlg
    $view.C("button_write")[0].on("click", ->
      write()
      return
    )
  else
    $view.C("button_write")[0].remove()

  # 現状ではしたらばはhttpsに対応していないので切り替えボタンを隠す
  if app.URL.tsld(viewUrl) is "shitaraba.net"
    $view.C("button_scheme")[0].remove()

  #リロード処理
  $view.on("request_reload", ({ detail: ex = {} }) ->
    #先にread_state更新処理を走らせるために、処理を飛ばす
    app.defer( ->
      jumpResNum = +(ex.written_res_num ? ex.param_res_num ? -1)
      if (
        $view.hasClass("loading") or
        $view.C("button_reload")[0].hasClass("disabled")
      )
        threadContent.select(jumpResNum, false, true, -60) if jumpResNum > 0
        return

      app.viewThread._draw($view, { forceUpdate: ex.force_update, jumpResNum }).then( (thread) ->
        return unless ex?.mes? and not app.config.isOn("no_writehistory")
        postMes = ex.mes.replace(/\s/g, "")
        for t, i in thread.res by -1 when postMes is app.util.decodeCharReference(app.util.stripTags(t.message)).replace(/\s/g, "")
          date = threadContent.stringToDate(t.other)
          name = app.util.decodeCharReference(t.name)
          mail = app.util.decodeCharReference(t.mail)
          app.WriteHistory.add(viewUrl, i+1, document.title, name, mail, ex.name, ex.mail, ex.mes, date.valueOf()) if date?
          threadContent.addClassWithOrg($content.child()[i], "written")
          break
        return
      )
    )
    return
  )

  #初回ロード処理
  do ->
    openedAt = Date.now()

    app.viewThread._readStateManager($view)
    $view.on("read_state_attached", ({ detail: {jumpResNum} = {} }) ->
      onScroll = false
      $content.on("scroll", ->
        onScroll = true
        return
      , once: true)

      $last = $content.C("last")[0]
      lastNum = $content.$(":scope > article:last-child").C("num")[0].textContent
      # 指定レス番号へ
      if 0 < jumpResNum <= lastNum
        threadContent.select(jumpResNum, false, true, -60)
      # 最終既読位置へ
      else if $last?
        offset = $last.attr("last-offset") ? 0
        threadContent.scrollTo($last, false, +offset)

      #スクロールされなかった場合も余所の処理を走らすためにscrollを発火
      unless onScroll
        $content.dispatchEvent(new Event("scroll"))

      #二度目以降のread_state_attached時
      $view.on("read_state_attached", ({ detail: {jumpResNum} = {} }) ->
        moveMode = "new"
        #通常時と自動更新有効時で、更新後のスクロールの動作を変更する
        moveMode = app.config.get("auto_load_move") if $view.hasClass("autoload") and not $view.hasClass("autoload_pause")
        switch moveMode
          when "new"
            lastNum = +$content.$(":scope > article:last-child")?.C("num")[0].textContent
            if 0 < jumpResNum <= lastNum
              threadContent.select(jumpResNum, false, true, -60)
            else
              offset = -100
              for dom in $content.child() when dom.matches(".last.received + article")
                $tmp = dom
                break
              # 新着が存在しない場合はスクロールを実行するためにレスを探す
              unless $tmp?
                $tmp = $content.$(":scope > article.last")
                offset = $tmp?.attr("last-offset") ? -100
              $tmp ?= $content.$(":scope > article.read")
              $tmp ?= $content.$(":scope > article:last-child")
              threadContent.scrollTo($tmp, true, +offset) if $tmp?
          when "surely_new"
            for dom in $content.child() when dom.matches(".last.received + article")
              $res = dom
              break
            threadContent.scrollTo($res, true) if $res?
          when "newest"
            $res = $content.$(":scope > article:last-child")
            threadContent.scrollTo($res, true) if $res?
        return
      )
      return
    , once: true)

    jumpResNum = -1
    iframe = parent.$$.$("iframe[data-url=\"#{viewUrl}\"]")
    if iframe
      jumpResNum = +iframe.dataset.writtenResNum
      jumpResNum = +iframe.dataset.paramResNum if jumpResNum < 1

    app.viewThread._draw($view, {jumpResNum}).catch( -> return).then( ->
      app.History.add(viewUrl, document.title, openedAt) unless app.config.isOn("no_history")
      return
    )
    return

  #レスメニュー表示(ヘッダー上)
  onHeaderMenu = (e) ->
    target = e.target.closest("article > header")
    return unless target?
    return if target.tagName is "A"

    # id/参照ポップアップの表示処理との競合回避
    if (
      e.type is "click" and
      app.config.get("popup_trigger") is "click" and
      e.target.matches(".id.link, .id.freq, .anchor_id, .slip.link, .slip.freq, .trip.link, .trip.freq, .rep.link, .rep.freq")
    )
      return

    if e.type is "contextmenu"
      e.preventDefault()

    $article = target.parent()
    $menu = $$.I("template_res_menu").content.$(".res_menu").cloneNode(true)
    $menu.addClass("hidden")
    $article.addLast($menu)

    app.defer( ->
      if getSelection().toString().length is 0
        $menu.C("copy_selection")[0].remove()
        $menu.C("search_selection")[0].remove()
      return
    )

    $toggleAaMode = $menu.C("toggle_aa_mode")[0]
    if $article.parent().hasClass("config_use_aa_font")
      $toggleAaMode.textContent = if $article.hasClass("aa") then "AA表示モードを解除" else "AA表示モードに変更"
    else
      $toggleAaMode.remove()

    unless $article.dataset.id?
      $menu.C("copy_id")[0].remove()
      $menu.C("add_id_to_ngwords")[0].remove()

    unless $article.dataset.slip?
      $menu.C("copy_slip")[0].remove()
      $menu.C("add_slip_to_ngwords")[0].remove()

    unless $article.dataset.trip?
      $menu.C("copy_trip")[0].remove()

    unless canWriteFlg
      $menu.C("res_to_this")[0].remove()
      $menu.C("res_to_this2")[0].remove()

    if $article.hasClass("written")
      $menu.C("add_writehistory")[0].remove()
    else
      $menu.C("del_writehistory")[0].remove()

    unless $article.matches(".popup > article")
      $menu.C("jump_to_this")[0].remove()

    # 画像にぼかしをかける/画像のぼかしを解除する
    unless $article.hasClass("has_image")
      $menu.C("set_image_blur")[0].remove()
      $menu.C("reset_image_blur")[0].remove()
    else
      if $article.$(".thumbnail.image_blur[media-type='image'], .thumbnail.image_blur[media-type='video']")?
        $menu.C("set_image_blur")[0].remove()
      else
        $menu.C("reset_image_blur")[0].remove()

    app.defer( ->
      $menu.removeClass("hidden")
      UI.ContextMenu($menu, e.clientX, e.clientY)
      return
    )
    return

  $view.on("click", onHeaderMenu)
  $view.on("contextmenu", onHeaderMenu)

  #レスメニュー表示(内容上)
  $view.on("contextmenu", ({target}) ->
    return unless target.matches("article > .message")
    # 選択範囲をNG登録
    app.contextMenus.update("add_selection_to_ngwords", {
      onclick: (info, tab) ->
        selectedText = getSelection().toString()
        app.NG.add(selectedText) if selectedText.length > 0
        return
    })
    return
  )

  #レスメニュー項目クリック
  $view.on("click", ({target}) ->
    return unless target.matches(".res_menu > li")
    $res = target.closest("article")

    if target.hasClass("copy_selection")
      selectedText = getSelection().toString()
      document.execCommand("copy") if selectedText.length > 0

    else if target.hasClass("search_selection")
      selectedText = getSelection().toString()
      if selectedText.length > 0
        open("https://www.google.co.jp/search?q=#{selectedText}", "_blank")

    else if target.hasClass("copy_id")
      app.clipboardWrite($res.dataset.id)

    else if target.hasClass("copy_slip")
      app.clipboardWrite($res.dataset.slip)

    else if target.hasClass("copy_trip")
      app.clipboardWrite($res.dataset.trip)

    else if target.hasClass("add_id_to_ngwords")
      app.NG.add($res.dataset.id)

    else if target.hasClass("add_slip_to_ngwords")
      app.NG.add("Slip:" + $res.dataset.slip)

    else if target.hasClass("jump_to_this")
      threadContent.scrollTo($res, true)

    else if target.hasClass("res_to_this")
      write(message: ">>#{$res.C("num")[0].textContent}\n")

    else if target.hasClass("res_to_this2")
      write(message: """
      >>#{$res.C("num")[0].textContent}
      #{$res.C("message")[0].innerText.replace(/^/gm, '>')}\n
      """)

    else if target.hasClass("add_writehistory")
      threadContent.addWriteHistory($res)
      threadContent.addClassWithOrg($res, "written")

    else if target.hasClass("del_writehistory")
      threadContent.removeWriteHistory($res)
      threadContent.removeClassWithOrg($res, "written")

    else if target.hasClass("toggle_aa_mode")
      $res.toggleClass("aa")

    else if target.hasClass("res_permalink")
      open(app.safeHref(viewUrl + $res.C("num")[0].textContent))

    # 画像をぼかす
    else if target.hasClass("set_image_blur")
      UI.MediaContainer.setImageBlur($res, true)

    # 画像のぼかしを解除する
    else if target.hasClass("reset_image_blur")
      UI.MediaContainer.setImageBlur($res, false)

    target.parent().remove()
    return
  )

  # アンカーポップアップ
  $view.on("mouseenter", (e) ->
    {target} = e
    return unless target.hasClass("anchor") or target.hasClass("name_anchor")

    anchor = target.innerHTML
    anchor = anchor.trim() unless target.hasClass("anchor")

    popupHelper(target, e, =>
      $popup = $__("div")

      if target.hasClass("disabled")
        $div = $__("div")
        $div.textContent = target.dataset.disabledReason
        $div.addClass("popup_disabled")
        $popup.addLast($div)
      else
        anchorData = app.util.Anchor.parseAnchor(anchor)

        if anchorData.targetCount >= 25
          $div = $__("div")
          $div.textContent = "指定されたレスの量が極端に多いため、ポップアップを表示しません"
          $div.addClass("popup_disabled")
          $popup.addLast($div)
        else if 0 < anchorData.targetCount
          tmp = $content.child()
          for [start, end] in anchorData.segments
            for i in [start..end]
              now = i-1
              break unless tmp[now]
              $popup.addLast(tmp[now].cloneNode(true))

      if $popup.child().length is 0
        $div = $__("div")
        $div.textContent = "対象のレスが見つかりません"
        $div.addClass("popup_disabled")
        $popup.addLast($div)

      return $popup
    )
    return
  , true)

  #アンカーリンク
  $view.on("click", (e) ->
    {target} = e
    return unless target.hasClass("anchor")
    e.preventDefault()
    return if target.hasClass("disabled")

    tmp = app.util.Anchor.parseAnchor(target.innerHTML)
    targetResNum = tmp.segments[0]?[0]
    if targetResNum?
      threadContent.scrollTo(targetResNum, true)
    return
  )

  #通常リンク
  onLink = (e) ->
    {target} = e
    return unless target.matches(".message a:not(.anchor)")
    targetUrl = target.href

    #http、httpsスキーム以外ならクリックを無効化する
    if not /// ^https?:// ///.test(targetUrl)
      e.preventDefault()
      return

    #.open_in_rcrxが付与されている場合、処理は他モジュールに任せる
    return if target.hasClass("open_in_rcrx")

    {type: srcType, bbsType} = app.URL.guessType(targetUrl)

    #read.crxで開けるURLかどうかを判定
    flg = do ->
      #スレのURLはほぼ確実に判定できるので、そのままok
      return true if srcType is "thread"
      #2chタイプ以外の板urlもほぼ確実に判定できる
      return true if srcType is "board" and bbsType isnt "2ch"
      #2chタイプの板は誤爆率が高いので、もう少し細かく判定する
      if srcType is "board" and bbsType is "2ch"
        #2ch自体の場合の判断はguess_typeを信じて板判定
        return true if app.URL.tsld(targetUrl) is "2ch.net"
        #ブックマークされている場合も板として判定
        return true if app.bookmark.get(app.URL.fix(targetUrl))
      return false

    #read.crxで開ける板だった場合は.open_in_rcrxを付与して再度クリックイベント送出
    if flg
      e.preventDefault()
      target.addClass("open_in_rcrx")
      target.dataset.href = target.href
      target.href = "javascript:undefined;"
      if srcType is "thread"
        paramResNum = app.URL.getResNumber(target.dataset.href)
        target.dataset.paramResNum = paramResNum if paramResNum
      app.defer( ->
        target.dispatchEvent(e)
        return
      )
    return

  $view.on("click", onLink)
  $view.on("mousedown", onLink)

  #リンク先情報ポップアップ
  $view.on("mouseenter", (e) ->
    {target} = e
    return unless target.matches(".message a:not(.anchor)")
    # 携帯・スマホ用URLをPC用URLに変換
    url = app.URL.convertUrlFromPhone(target.href)
    {type} = app.URL.guessType(url)
    switch type
      when "board"
        boardUrl = app.URL.fix(url)
        after = ""
      when "thread"
        boardUrl = app.URL.threadToBoard(url)
        after = "のスレ"
      else
        return

    app.BoardTitleSolver.ask(boardUrl).then( (title) =>
      popupHelper(target, e, =>
        $div = $__("div")
        $div.addClass("popup_linkinfo")
        $div2 = $__("div")
        $div2.textContent = title + after
        $div.addLast($div2)
        return $div
      )
      return
    )
    return
  , true)

  #IDポップアップ
  $view.on(app.config.get("popup_trigger"), (e) ->
    {target} = e
    return unless target.matches(".id.link, .id.freq, .anchor_id, .slip.link, .slip.freq, .trip.link, .trip.freq")
    e.preventDefault()

    popupHelper(target, e, =>
      id = ""
      slip = ""
      trip = ""
      if target.hasClass("id") or target.hasClass("anchor_id")
        id = target.textContent
          .replace(/^id:/i, "ID:")
          .replace(/\(\d+\)$/, "")
          .replace(/\u25cf$/, "") #末尾●除去
      if target.hasClass("slip")
        slip = target.textContent
          .replace(/^slip:/i, "")
          .replace(/\(\d+\)$/i, "")
      if target.hasClass("trip")
        trip = target.textContent
          .replace(/\(\d+\)$/i, "")

      $popup = $__("div")
      $popup.addClass("popup_id")
      $article = target.closest("article")

      if (
        $article.parent().hasClass("popup_id") and
        (
          $article.dataset.id is id or
          $article.dataset.slip is slip or
          $article.dataset.trip is trip
        )
      )
        $div = $__("div")
        $div.textContent = "現在ポップアップしているIP/ID/SLIP/トリップです"
        $div.addClass("popup_disabled")
        $popup.addLast($div)
      else if threadContent.idIndex.has(id)
        for resNum from threadContent.idIndex.get(id)
          $popup.addLast($content.child()[resNum - 1].cloneNode(true))
      else if threadContent.slipIndex.has(slip)
        for resNum from threadContent.slipIndex.get(slip)
          $popup.addLast($content.child()[resNum - 1].cloneNode(true))
      else if threadContent.tripIndex.has(trip)
        for resNum from threadContent.tripIndex.get(trip)
          $popup.addLast($content.child()[resNum - 1].cloneNode(true))
      else
        $div = $__("div")
        $div.textContent = "対象のレスが見つかりません"
        $div.addClass("popup_disabled")
        $popup.addLast($div)
      return $popup
    )
    return
  , true)

  #リプライポップアップ
  $view.on(app.config.get("popup_trigger"), (e) ->
    {target} = e
    return unless target.hasClass("rep")
    popupHelper(target, e, =>
      tmp = $content.child()

      frag = $_F()
      res_num = +target.closest("article").C("num")[0].textContent
      for target_res_num from threadContent.repIndex.get(res_num)
        frag.addLast(tmp[target_res_num - 1].cloneNode(true))

      $popup = $__("div")
      $popup.addLast(frag)
      return $popup
    )
    return
  , true)

  # 展開済みURLのポップアップ
  $view.on("mouseenter", (e) ->
    {target} = e
    return unless target.hasClass("has_expandedURL")
    return if app.config.get("expand_short_url") isnt "popup"
    popupHelper(target, e, =>
      targetUrl = target.href

      frag = $_F()
      sib = target
      while true
        sib = sib.next()
        if(
          sib?.hasClass("expandedURL") and
          sib?.getAttr("short-url") is targetUrl
        )
          frag.addLast(sib.cloneNode(true))
          break

      frag.$(".expandedURL").removeClass("hide_data")
      $popup = $__("div")
      $popup.addLast(frag)
      return $popup
    )
    return
  , true)

  # リンクのコンテキストメニュー
  $view.on("contextmenu", ({target}) ->
    return unless target.matches(".message > a")
    # リンクアドレスをNG登録
    enableFlg = !(target.hasClass("anchor") or target.hasClass("anchor_id"))
    app.contextMenus.update("add_link_to_ngwords", {
      enabled: enableFlg
      onclick: (info, tab) =>
        app.NG.add(target.href)
        return
    })
    # レス番号を指定してリンクを開く
    if app.config.isOn("enable_link_with_res_number")
      menuTitle = "レス番号を無視してリンクを開く"
    else
      menuTitle = "レス番号を指定してリンクを開く"
    enableFlg = (target.hasClass("open_in_rcrx") and target.dataset.paramResNum isnt undefined)
    app.contextMenus.update("open_link_with_res_number", {
      title: menuTitle
      enabled: enableFlg
      onclick: (info, tab) =>
        target.setAttr("toggle-param-res-num", "on")
        app.defer( =>
          target.dispatchEvent(new Event("mousedown", {"bubbles": true}))
          return
        )
        return
    })
    return
  )

  # 画像のコンテキストメニュー
  $view.on("contextmenu", ({target}) ->
    return unless target.matches("img, video, audio")
    switch target.tagName
      when "IMG"
        menuTitle = "画像のアドレスをNG指定"
        # リンクアドレスをNG登録
        app.contextMenus.update("add_link_to_ngwords", {
          enabled: true,
          onclick: (info, tab) =>
            app.NG.add(target.parent().href)
            return
        })
      when "VIDEO"
        menuTitle = "動画のアドレスをNG指定"
      when "AUDIO"
        menuTitle = "音声のアドレスをNG指定"
    # メディアのアドレスをNG登録
    app.contextMenus.update("add_media_to_ngwords", {
      title: menuTitle,
      onclick: (info, tab) =>
        app.NG.add(@src)
        return
    })
    return
  )

  #何もないところをダブルクリックすると更新する
  $view.on("dblclick", ({target}) ->
    return unless app.config.isOn("dblclick_reload")
    return unless target.hasClass("message")
    return if target.tagName is "A" or target.hasClass("thumbnail")
    $view.dispatchEvent(new Event("request_reload"))
    return
  )

  #クイックジャンプパネル
  do ->
    jumpArticleSelector =
      ".jump_one": "article:nth-child(1)"
      ".jump_newest": "article:last-child"
      ".jump_not_read": "article.read + article"
      ".jump_new": "article.received + article"
      ".jump_last": "article.last"

    $jumpPanel = $view.C("jump_panel")[0]

    $view.on("read_state_attached", ->
      already = {}
      for panelItemSelector, targetResSelector of jumpArticleSelector
        res = $view.$(targetResSelector)
        resNum = +res.C("num")[0].textContent if res
        if res and not already[resNum]
          $jumpPanel.$(panelItemSelector).style.display = "block"
          already[resNum] = true
        else
          $jumpPanel.$(panelItemSelector).style.display = "none"
      return
    )

    $jumpPanel.on("click", ({target}) ->
      for key, val of jumpArticleSelector when target.matches(key)
        selector = val
        offset = if key in [".jump_not_read", ".jump_new"] then -100 else 0
        break

      return unless selector
      $res = $view.$(selector)

      if $res?
        if key is ".jump_last"
          offset = $res.attr("last-offset") ? offset
        threadContent.scrollTo($res, true, +offset)
      else
        app.log("warn", "[view_thread] .jump_panel: ターゲットが存在しません")
      return
    )
    return

  #検索ボックス
  do ->
    searchStoredScrollTop = null
    _isComposing = false
    $searchbox = $view.C("searchbox")[0]
    $searchbox.on("compositionstart", ->
      _isComposing = true
      return
    )
    $searchbox.on("compositionend", ({currentTarget}) ->
      _isComposing = false
      currentTarget.dispatchEvent(new Event("input"))
      return
    )
    $searchbox.on("input", ->
      return if _isComposing
      $content.dispatchEvent(new Event("searchstart"))
      if @value isnt ""
        if typeof searchStoredScrollTop isnt "number"
          searchStoredScrollTop = $content.scrollTop

        hitCount = 0
        query = app.util.normalize(@value)

        scrollTop = $content.scrollTop

        $content.addClass("searching")
        for dom in $content.child()
          if app.util.normalize(dom.textContent).includes(query)
            dom.addClass("search_hit")
            hitCount++
          else
            dom.removeClass("search_hit")
        $content.dataset.resSearchHitCount = hitCount
        $view.C("hit_count")[0].textContent = "#{hitCount}hit"

        if scrollTop is $content.scrollTop
          $content.dispatchEvent(new Event("scroll"))
      else
        $content.removeClass("searching")
        $content.removeAttr("data-res-search-hit-count")
        $view.C("search_hit")[0].removeClass("search_hit")
        $view.C("hit_count")[0].textContent = ""

        if typeof searchStoredScrollTop is "number"
          $content.scrollTop = searchStoredScrollTop
          searchStoredScrollTop = null

      $content.dispatchEvent(new Event("searchfinish"))
      return
    )

    $searchbox.on("keyup", ({which}) ->
      if which is 27 #Esc
        if @value isnt ""
          @value = ""
          @dispatchEvent(new Event("input"))
      return
    )

  #フッター表示処理
  do ->
    canBeShown = false
    observer = new IntersectionObserver( (changes) ->
      for {boundingClientRect, rootBounds} in changes
        canBeShown = (boundingClientRect.top < rootBounds.height)
      updateThreadFooter()
    , root: $content, threshold: [0, 0.05, 0.5, 0.95, 1.0])
    setObserve = ->
      observer.disconnect()
      ele = $content.lastElementChild
      observer.observe(ele) if ele?
      return

    #未読ブックマーク数表示
    $nextUnread =
      _elm: $view.C("next_unread")[0]
      show: ->
        next = null

        bookmarks = app.bookmark.getAll().filter( (bookmark) ->
          return (bookmark.type is "thread") and (bookmark.url isnt viewUrl)
        )

        #閲覧中のスレッドに新着が有った場合は優先して扱う
        if bookmark = app.bookmark.get(viewUrl)
          bookmarks.unshift(bookmark)

        for bookmark in bookmarks when bookmark.resCount?
          read = null

          if iframe = parent.$$.$("[data-url=\"#{bookmark.url}\"]")
            read = iframe.contentWindow?.$$?(".content > article").length

          unless read
            read = bookmark.readState?.read or 0

          if bookmark.resCount > read
            next = bookmark
            break

        if next
          if next.url is viewUrl
            text = "新着レスがあります"
          else
            text = "未読ブックマーク: #{next.title}"
          if next.res_count?
            text += " (未読#{next.resCount - (next.readState?.read or 0)}件)"
          @_elm.href = app.safeHref(next.url)
          @_elm.textContent = text
          @_elm.dataset.title = next.title
          @_elm.removeClass("hidden")
        else
          @hide()
        return
      hide: ->
        @_elm.addClass("hidden")
        return

    $searchNextThread =
      _elm: $view.C("search_next_thread")[0]
      show: ->
        if $content.child().length >= 1000 or $view.C("message_bar")[0].hasClass("error")
          @_elm.removeClass("hidden")
        else
          @hide()
        return
      hide: ->
        @_elm.addClass("hidden")
        return

    updateThreadFooter = ->
      if canBeShown
        $nextUnread.show()
        $searchNextThread.show()
      else
        $nextUnread.hide()
        $searchNextThread.hide()
      return

    $view.on("tab_selected", ->
      updateThreadFooter()
      return
    )
    $view.on("view_loaded", ->
      setObserve()
      updateThreadFooter()
      return
    )
    app.message.on("bookmark_updated", ->
      if canBeShown
        $nextUnread.show()
      return
    )

    #次スレ検索
    for dom in $view.$$(".button_tool_search_next_thread, .search_next_thread")
      dom.on("click", ->
        searchNextThread.show()
        searchNextThread.search(viewUrl, document.title)
        return
      )
    return

  #パンくずリスト表示
  do ->
    boardUrl = app.URL.threadToBoard(viewUrl)
    app.BoardTitleSolver.ask(boardUrl).catch( -> return).then( (title) ->
      $a = $view.$(".breadcrumb > li > a")
      $a.href = boardUrl
      $a.textContent = if title? then "#{title.replace(/板$/, "")}板" else "板"
      $a.addClass("hidden")
      # Windows版Chromeで描画が崩れる現象を防ぐため、わざとリフローさせる。
      app.defer( ->
        $view.$(".breadcrumb > li > a").style.display = "inline-block"
        return
      )
      return
    )
    return

  return
)

app.viewThread._draw = ($view, {forceUpdate = false, jumpResNum = -1} = {}) ->
  $view.addClass("loading")
  $view.style.cursor = "wait"
  $reloadButton = $view.C("button_reload")[0]
  $reloadButton.addClass("disabled")
  loadCount = 0

  fn = (thread, error) ->
    return new Promise( (resolve, reject) ->
      if error
        $view.C("message_bar")[0].addClass("error")
        $view.C("message_bar")[0].innerHTML = thread.message
      else
        $view.C("message_bar")[0].removeClass("error")
        $view.C("message_bar")[0].removeChildren()

      unless thread.res?
        reject()
        return

      document.title = thread.title

      app.DOMData.get($view, "threadContent").addItem(thread.res.slice($view.C("content")[0].child().length)).then( ->
        loadCount++
        app.DOMData.get($view, "lazyload").scan()

        if $view.C("content")[0].hasClass("searching")
          $view.C("searchbox")[0].dispatchEvent(new Event("input"))

        $view.dispatchEvent(new CustomEvent("view_loaded", detail: {jumpResNum, loadCount}))

        resolve(thread)
        return
      )
      return
    )

  return new Promise( (resolve, reject) ->
    thread = new app.Thread($view.dataset.url)
    threadSetFromCacheBeforeHTTPPromise = Promise.resolve()
    threadGetPromise = app.util.promiseWithState(thread.get(forceUpdate, ->
      # 通信する前にキャッシュを取得して一旦表示する
      unless threadGetPromise.isResolved()
        threadSetFromCacheBeforeHTTPPromise = fn(thread, false)
      return
    ))
    threadGetPromise.promise.catch( -> return).then( ->
      return threadSetFromCacheBeforeHTTPPromise
    ).catch( -> return).then( ->
      return fn(thread, not threadGetPromise.isResolved())
    ).then( ->
      return true
    , ->
      return false
    ).then( (successedSet) ->
      $view.removeClass("loading")
      $view.style.cursor = "auto"
      app.defer5( ->
        $reloadButton.removeClass("disabled")
        return
      )
      if successedSet then resolve(thread) else reject()
      return
    )
    return
  )

app.viewThread._readStateManager = ($view) ->
  threadContent = app.DOMData.get($view, "threadContent")
  $content = $view.C("content")[0]
  viewUrl = $view.dataset.url
  boardUrl = app.URL.threadToBoard(viewUrl)
  requestReloadFlag = false
  scanCountByReloaded = 0
  attachedReadState = {last: 0, read: 0, received: 0, offset: null}

  #read_stateの取得
  getReadState = new Promise( (resolve, reject) ->
    readStateUpdated = false
    if (bookmark = app.bookmark.get(viewUrl))?.readState?
      {readState} = bookmark
      resolve({readState, readStateUpdated})
    else
      app.ReadState.get(viewUrl).then( (_readState) ->
        readState = _readState or {received: 0, read: 0, last: 0, url: viewUrl, offset: null}
        resolve({readState, readStateUpdated})
        return
      )
    return
  )

  #スレの描画時に、read_state関連のクラスを付与する
  $view.on("view_loaded", ({ detail: {jumpResNum, loadCount} }) ->
    if loadCount is 1
      # 初回の処理
      getReadState.then( ({readState, readStateUpdated}) ->
        $content.C("last")[0]?.removeClass("last")
        $content.C("read")[0]?.removeClass("read")
        $content.C("received")[0]?.removeClass("received")

        # キャッシュの内容が古い場合にreadStateの内容の方が大きくなることがあるので
        # その場合は次回の処理に委ねる
        contentLength = $content.child().length
        if readState.last <= contentLength
          $content.child()[readState.last - 1]?.addClass("last")
          $content.child()[readState.last - 1]?.attr("last-offset", readState.offset)
          attachedReadState.last = -999
        else
          attachedReadState.last = readState.last
          attachedReadState.offset = readState.offset
        if readState.read <= contentLength
          $content.child()[readState.read - 1]?.addClass("read")
          attachedReadState.read = -999
        else
          attachedReadState.read = readState.read
        if readState.received <= contentLength
          $content.child()[readState.received - 1]?.addClass("received")
          attachedReadState.received = -999
        else
          attachedReadState.received = readState.received
        requestReloadFlag = false

        $view.dispatchEvent(new CustomEvent("read_state_attached", detail: {jumpResNum}))
        if attachedReadState.read > 0 and attachedReadState.received > 0
          app.message.send("read_state_updated", {board_url: boardUrl, read_state: readState})
        return
      )
      return
    # 2回目の処理
    # 画像のロードにより位置がずれることがあるので初回処理時の内容を使用する
    tmpReadState = {read: null, received: null, url: viewUrl}
    if attachedReadState.last > 0
      $content.C("last")[0]?.removeClass("last")
      $content.child()[attachedReadState.last - 1]?.addClass("last")
      $content.child()[attachedReadState.last - 1]?.attr("last-offset", attachedReadState.offset)
    if attachedReadState.read > 0
      $content.C("read")[0]?.removeClass("read")
      $content.child()[attachedReadState.read - 1]?.addClass("read")
      tmpReadState.read = attachedReadState.read
    if attachedReadState.received > 0
      $content.C("received")[0]?.removeClass("received")
      $content.child()[attachedReadState.received - 1]?.addClass("received")
      tmpReadState.received = attachedReadState.received
    requestReloadFlag = false
    $view.dispatchEvent(new CustomEvent("read_state_attached", detail: {jumpResNum}))
    if tmpReadState.read and tmpReadState.received
      app.message.send("read_state_updated", {board_url: boardUrl, read_state: tmpReadState})
    return
  )

  getReadState.then( ({readState, readStateUpdated}) ->
    scan = ->
      received = $content.child().length
      #onbeforeunload内で呼び出された時に、この値が0になる場合が有る
      return if received is 0

      last = threadContent.getRead()

      scanCountByReloaded++ if requestReloadFlag

      if readState.received isnt received
        readState.received = received
        readStateUpdated = true

      lastDisplay = threadContent.getDisplay()
      if (
        (!requestReloadFlag or scanCountByReloaded is 1) and
        (!lastDisplay.bottom or lastDisplay.resNum is last)
      )
        if (
          readState.last isnt lastDisplay.resNum or
          readState.offset isnt lastDisplay.offset
        )
          readState.last = lastDisplay.resNum
          readState.offset = lastDisplay.offset
          readStateUpdated = true
      else if readState.last isnt last
        readState.last = last
        readState.offset = null
        readStateUpdated = true

      if readState.read < last
        readState.read = last
        readStateUpdated = true

      return

    #アンロード時は非同期系の処理をzombie.htmlに渡す
    #そのためにlocalStorageに更新するread_stateの情報を渡す
    doneBeforezombie = false
    onBeforezombie = ->
      return if doneBeforezombie
      doneBeforezombie = true
      scan()
      if readStateUpdated
        if localStorage.zombie_read_state?
          data = JSON.parse(localStorage["zombie_read_state"])
        else
          data = []
        data.push(readState)
        localStorage["zombie_read_state"] = JSON.stringify(data)
      return

    parent.window.on("beforezombie", onBeforezombie)
    window.on("beforeunload", onBeforezombie)

    #スクロールされたら定期的にスキャンを実行する
    scrollFlg = false
    scrollWatcher = setInterval( ->
      if scrollFlg
        scrollFlg = false
        scan()
        if readStateUpdated
          app.message.send("read_state_updated", {board_url: boardUrl, read_state: readState})
      return
    , 250)

    scanAndSave = ->
      scan()
      if readStateUpdated
        app.ReadState.set(readState)
        app.bookmark.updateReadState(readState)
        readStateUpdated = false
      return

    app.message.on("request_update_read_state", ({board_url} = {}) ->
      if not board_url? or board_url is boardUrl
        scanAndSave()
      return
    )

    $content.on("scroll", ->
      scrollFlg = true
      return
    , passive: true)
    $view.on("request_reload", ->
      requestReloadFlag = true
      scanCountByReloaded = 0
      scanAndSave()
      return
    )

    window.on("view_unload", ->
      clearInterval(scrollWatcher)
      parent.window.off("beforezombie", onBeforezombie)
      window.off("beforeunload", onBeforezombie)
      #ロード中に閉じられた場合、スキャンは行わない
      return if $view.hasClass("loading")
      scanAndSave()
      return
    )
    return
  )
  return
