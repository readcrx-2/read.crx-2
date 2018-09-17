do ->
  return if navigator.platform.includes("Win")
  try
    font = localStorage.getItem("textar_font")
    unless font?
      throw new Error("localstorageからのフォントの取得に失敗しました")
  catch
    response = await fetch("https://readcrx-2.github.io/read.crx-2/textar-min.woff2")
    blob = await response.blob()
    font = await new Promise( (resolve) ->
      fr = new FileReader()
      fr.onload = ->
        resolve(fr.result)
        return
      fr.readAsDataURL(blob)
      return
    )
    localStorage.setItem("textar_font", font)
  fontface = new FontFace("Textar", "url(#{font})")
  document.fonts.add(fontface)
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
    AANoOverflow = new UI.AANoOverflow($view, {minRatio: app.config.get("aa_min_ratio")})

  write = (param = {}) ->
    param.url = viewUrl
    param.title = document.title
    windowX = app.config.get("write_window_x")
    windowY = app.config.get("write_window_y")
    openUrl = "/write/submit_res.html?#{app.URL.buildQuery(param)}"
    if "&[BROWSER]" is "chrome"
      parent.browser.windows.create(
        type: "popup"
        url: openUrl
        width: 600
        height: 300
        left: parseInt(windowX)
        top: parseInt(windowY)
      )
    else if "&[BROWSER]" is "firefox"
      open(
        openUrl
        undefined
        "width=600,height=300,left=#{windowX},top=#{windowY}"
      )
    return

  popupHelper = (that, e, fn) ->
    $popup = fn()
    return if $popup.child().length is 0
    for dom in $popup.T("article")
      dom.removeClass("last", "read", "received")
    #ポップアップ内のサムネイルの遅延ロードを解除
    for dom in $popup.$$("img[data-src], video[data-src]")
      app.DOMData.get($view, "lazyload").immediateLoad(dom)
    await app.defer()
    # popupの表示
    popupView.show($popup, e.clientX, e.clientY, that)
    return

  # したらばの過去ログ
  canWriteFlg = !(app.URL.tsld(viewUrl) is "shitaraba.net" and viewUrl.includes("/read_archive.cgi/"))

  if canWriteFlg
    $view.C("button_write")[0].on("click", ->
      write()
      return
    )
  else
    $view.C("button_write")[0].remove()

  #リロード処理
  $view.on("request_reload", ({ detail: ex = {} }) ->
    threadContent.refreshNG()
    #先にread_state更新処理を走らせるために、処理を飛ばす
    await app.defer()
    jumpResNum = +(ex.written_res_num ? ex.param_res_num ? -1)
    if (
      !ex.force_update and
      (
        $view.hasClass("loading") or
        $view.C("button_reload")[0].hasClass("disabled")
      )
    )
      threadContent.select(jumpResNum, false, true, -60) if jumpResNum > 0
      return

    thread = await app.viewThread._draw($view, { forceUpdate: ex.force_update, jumpResNum })
    return unless ex.mes? and not app.config.isOn("no_writehistory")
    postMes = ex.mes.replace(/\s/g, "")
    for t, i in thread.res by -1 when postMes is app.util.decodeCharReference(app.util.stripTags(t.message)).replace(/\s/g, "")
      date = app.util.stringToDate(t.other).valueOf()
      if date?
        app.WriteHistory.add({
          url: viewUrl
          res: i+1
          title: document.title
          name: app.util.decodeCharReference(t.name)
          mail: app.util.decodeCharReference(t.mail)
          inputName: ex.name
          inputMail: ex.mail
          message: ex.mes
          date
        })
      threadContent.addClassWithOrg($content.child()[i], "written")
      break
    return
  )

  #初回ロード処理
  do ->
    openedAt = Date.now()

    app.viewThread._readStateManager($view)
    $view.on("read_state_attached", ({ detail: {jumpResNum, requestReloadFlag, loadCount} = {} }) ->
      onScroll = false
      $content.on("scroll", ->
        onScroll = true
        return
      , once: true)

      do defaultScroll = ->
        $last = $content.C("last")[0]
        lastNum = $content.$(":scope > article:last-child").C("num")[0].textContent
        # 指定レス番号へ
        if 0 < jumpResNum <= lastNum
          threadContent.select(jumpResNum, false, true, -60)
        # 最終既読位置へ
        else if $last?
          offset = $last.attr("last-offset") ? 0
          threadContent.scrollTo($last, false, +offset)
        return

      #スクロールされなかった場合も余所の処理を走らすためにscrollを発火
      unless onScroll
        $content.emit(new Event("scroll"))

      #二度目以降のread_state_attached時
      $view.on("read_state_attached", ({ detail: {jumpResNum, requestReloadFlag, loadCount} = {} }) ->
        # リロード時の一回目の処理
        if requestReloadFlag and loadCount is 1
          defaultScroll()
          return

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


    try
      await app.viewThread._draw($view, {jumpResNum})
    boardUrl = app.URL.threadToBoard(viewUrl)
    try
      boardTitle = await app.BoardTitleSolver.ask(boardUrl)
    catch
      boardTitle = ""
    app.History.add(viewUrl, document.title, openedAt, boardTitle) unless app.config.isOn("no_history")
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
    altParent = null
    if $article.parent().hasClass("popup")
      altParent = $view.C("popup_area")[0]
      altParent.addLast($menu)
      $menu.setAttr("resnum", $article.C("num")[0].textContent)
      $article.parent().addClass("has_contextmenu")
    else
      $article.addLast($menu)

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

    await app.defer()
    if getSelection().toString().length is 0
      $menu.C("copy_selection")[0].remove()
      $menu.C("search_selection")[0].remove()

    $menu.removeClass("hidden")
    UI.ContextMenu($menu, e.clientX, e.clientY, altParent)
    return

  $view.on("click", onHeaderMenu)
  $view.on("contextmenu", onHeaderMenu)

  #レスメニュー表示(内容上)
  $view.on("contextmenu", ({target}) ->
    return unless target.matches("article > .message")
    # 選択範囲をNG登録
    app.ContextMenus.update("add_selection_to_ngwords", {
      onclick: (info, tab) ->
        selectedText = getSelection().toString()
        if selectedText.length > 0
          app.NG.add(selectedText)
          threadContent.refreshNG()
        return
    })
    return
  )

  #レスメニュー項目クリック
  $view.on("click", ({target}) ->
    return unless target.matches(".res_menu > li")
    $res = target.closest("article")
    unless $res
      rn = target.closest(".res_menu").getAttr("resnum")
      for res in $view.$$(".popup.has_contextmenu > article")
        if res.C("num")[0].textContent is rn
          $res = res
          break

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
      addString = $res.dataset.id
      exDate = _getExpireDateString("id")
      addString = "expireDate:#{exDate},#{addString}" if exDate
      app.NG.add(addString)
      threadContent.refreshNG()

    else if target.hasClass("add_slip_to_ngwords")
      addString = "Slip:" + $res.dataset.slip
      exDate = _getExpireDateString("slip")
      addString = "expireDate:#{exDate},#{addString}" if exDate
      app.NG.add(addString)
      threadContent.refreshNG()

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
      if $res.hasClass("aa")
        AANoOverflow.unsetMiniAA($res)
      else
        AANoOverflow.setMiniAA($res)

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
      resCount = 0

      if target.hasClass("disabled")
        $div = $__("div").addClass("popup_disabled")
        $div.textContent = target.dataset.disabledReason
        $popup.addLast($div)
      else
        anchorData = app.util.Anchor.parseAnchor(anchor)

        if anchorData.targetCount >= 25
          $div = $__("div").addClass("popup_disabled")
          $div.textContent = "指定されたレスの量が極端に多いため、ポップアップを表示しません"
          $popup.addLast($div)
        else if 0 < anchorData.targetCount
          resCount = anchorData.targetCount
          tmp = $content.child()
          for [start, end] in anchorData.segments
            for i in [start..end]
              now = i-1
              break unless res = tmp[now]
              continue if res.hasClass("ng") and !res.hasClass("disp_ng")
              $popup.addLast(res.cloneNode(true))

      popupCount = $popup.child().length
      if popupCount is 0
        $div = $__("div").addClass("popup_disabled")
        $div.textContent = "対象のレスが見つかりません"
        $popup.addLast($div)
      else if popupCount < resCount
        $div = $__("div").addClass("ng_count")
        $div.setAttr("ng-count", resCount - popupCount)
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
        return true if app.URL.tsld(targetUrl) is "5ch.net"
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
      await app.defer()
      target.emit(e)
    return

  $view.on("click", onLink)
  $view.on("mousedown", onLink)

  #リンク先情報ポップアップ
  $view.on("mouseenter", (e) ->
    {target} = e
    return unless target.matches(".message a:not(.anchor)")
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

    try
      title = await app.BoardTitleSolver.ask(boardUrl)
      popupHelper(target, e, =>
        $div = $__("div").addClass("popup_linkinfo")
        $div2 = $__("div")
        $div2.textContent = title + after
        $div.addLast($div2)
        return $div
      )
    return
  , true)

  #IDポップアップ
  $view.on(app.config.get("popup_trigger"), (e) ->
    {target} = e
    return unless target.matches(".id.link, .id.freq, .anchor_id, .slip.link, .slip.freq, .trip.link, .trip.freq")
    e.preventDefault()

    popupHelper(target, e, =>
      $article = target.closest("article")
      $popup = $__("div")

      id = ""
      slip = ""
      trip = ""
      if target.hasClass("anchor_id")
        id = target.textContent
          .replace(/^id:/i, "ID:")
          .replace(/\(\d+\)$/, "")
          .replace(/\u25cf$/, "") #末尾●除去
        $popup.addClass("popup_id")
      else if target.hasClass("id")
        id = $article.dataset.id
        $popup.addClass("popup_id")
      else if target.hasClass("slip")
        slip = $article.dataset.slip
        $popup.addClass("popup_slip")
      else if target.hasClass("trip")
        trip = $article.dataset.trip
        $popup.addClass("popup_trip")

      nowPopuping = ""
      $parentArticle = $article.parent()
      if (
        $parentArticle.hasClass("popup_id") and
        $article.dataset.id is id
      )
        nowPopuping = "IP/ID"
      else if (
        $parentArticle.hasClass("popup_slip") and
        $article.dataset.slip is slip
      )
        nowPopuping = "SLIP"
      else if (
        $parentArticle.hasClass("popup_trip") and
        $article.dataset.trip is trip
      )
        nowPopuping = "トリップ"

      resCount = 0
      if nowPopuping isnt ""
        $div = $__("div").addClass("popup_disabled")
        $div.textContent = "現在ポップアップしている#{nowPopuping}です"
        $popup.addLast($div)
      else if threadContent.idIndex.has(id)
        resCount = threadContent.idIndex.get(id).size
        for resNum from threadContent.idIndex.get(id)
          targetRes = $content.child()[resNum - 1]
          continue if targetRes.hasClass("ng") and !targetRes.hasClass("disp_ng")
          $popup.addLast(targetRes.cloneNode(true))
      else if threadContent.slipIndex.has(slip)
        resCount = threadContent.slipIndex.get(slip).size
        for resNum from threadContent.slipIndex.get(slip)
          targetRes = $content.child()[resNum - 1]
          continue if targetRes.hasClass("ng") and !targetRes.hasClass("disp_ng")
          $popup.addLast(targetRes.cloneNode(true))
      else if threadContent.tripIndex.has(trip)
        resCount = threadContent.tripIndex.get(trip).size
        for resNum from threadContent.tripIndex.get(trip)
          targetRes = $content.child()[resNum - 1]
          continue if targetRes.hasClass("ng") and !targetRes.hasClass("disp_ng")
          $popup.addLast(targetRes.cloneNode(true))

      popupCount = $popup.child().length
      if popupCount is 0
        $div = $__("div").addClass("popup_disabled")
        $div.textContent = "対象のレスが見つかりません"
        $popup.addLast($div)
      else if popupCount < resCount
        $div = $__("div").addClass("ng_count")
        $div.setAttr("ng-count", resCount - popupCount)
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
      resNum = +target.closest("article").C("num")[0].textContent
      for targetResNum from threadContent.repIndex.get(resNum)
        targetRes = tmp[targetResNum - 1]
        continue if targetRes.hasClass("ng") and (!targetRes.hasClass("disp_ng") or app.config.isOn("reject_ng_rep"))
        frag.addLast(targetRes.cloneNode(true))

      $popup = $__("div")
      $popup.addLast(frag)
      resCount = threadContent.repIndex.get(resNum).size
      popupCount = $popup.child().length
      if popupCount is 0
        $div = $__("div").addClass("popup_disabled")
        $div.textContent = "対象のレスが見つかりません"
        $popup.addLast($div)
      else if popupCount < resCount and !app.config.isOn("reject_ng_rep")
        $div = $__("div").addClass("ng_count")
        $div.setAttr("ng-count", resCount - popupCount)
        $popup.addLast($div)
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
      loop
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
    app.ContextMenus.update("add_link_to_ngwords", {
      enabled: enableFlg
      onclick: (info, tab) =>
        app.NG.add(target.href)
        threadContent.refreshNG()
        return
    })
    # レス番号を指定してリンクを開く
    if app.config.isOn("enable_link_with_res_number")
      menuTitle = "レス番号を無視してリンクを開く"
    else
      menuTitle = "レス番号を指定してリンクを開く"
    enableFlg = (target.hasClass("open_in_rcrx") and target.dataset.paramResNum isnt undefined)
    app.ContextMenus.update("open_link_with_res_number", {
      title: menuTitle
      enabled: enableFlg
      onclick: (info, tab) =>
        target.setAttr("toggle-param-res-num", "on")
        await app.defer()
        target.emit(new Event("mousedown", {"bubbles": true}))
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
        app.ContextMenus.update("add_link_to_ngwords", {
          enabled: true,
          onclick: (info, tab) =>
            app.NG.add(target.parent().href)
            threadContent.refreshNG()
            return
        })
      when "VIDEO"
        menuTitle = "動画のアドレスをNG指定"
      when "AUDIO"
        menuTitle = "音声のアドレスをNG指定"
    # メディアのアドレスをNG登録
    app.ContextMenus.update("add_media_to_ngwords", {
      title: menuTitle,
      onclick: (info, tab) =>
        app.NG.add(target.src)
        threadContent.refreshNG()
        return
    })
    return
  )

  #何もないところをダブルクリックすると更新する
  $view.on("dblclick", ({target}) ->
    return unless app.config.isOn("dblclick_reload")
    return unless target.hasClass("message")
    return if target.tagName is "A" or target.hasClass("thumbnail")
    $view.emit(new Event("request_reload"))
    return
  )

  _getExpireDateString = (type) ->
    dStr = null
    exDate = null
    if type in ["id", "slip"]
      switch app.config.get("ng_#{type}_expire")
        when "date"
          d = Date.now() + +app.config.get("ng_#{type}_expire_date") * 86400 * 1000
          exDate = new Date(d)
        when "day"
          t = new Date()
          dDay = +app.config.get("ng_#{type}_expire_day") - t.getDay()
          dDay += 7 if dDay < 1
          d = Date.now() + dDay * 86400 * 1000
          exDate = new Date(d)
    if exDate
      dStr = exDate.getFullYear() + "/" + (exDate.getMonth() + 1) + "/" + exDate.getDate()
    return dStr

  #クイックジャンプパネル
  do ->
    jumpArticleSelector =
      ".jump_one": "article:first-child"
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
    $searchbox = $view.C("searchbox")[0]

    $searchbox.on("compositionend", ->
      @emit(new Event("input"))
      return
    )
    $searchbox.on("input", ({ isComposing, detail: {isEnter = false} = {} }) ->
      return if isComposing
      searchRegExpMode = $content.hasClass("search_regexp")
      return if searchRegExpMode and !isEnter
      searchRegExp = null
      if searchRegExpMode and @value isnt ""
        try
          searchRegExp = new RegExp(@value, "i")
        catch e
          app.message.send("notify",
            message: "正規表現が正しくありません。"
            background_color: "red"
          )
          return

      $content.emit(new Event("searchstart"))
      if @value isnt ""
        if typeof searchStoredScrollTop isnt "number"
          searchStoredScrollTop = $content.scrollTop

        hitCount = 0
        query = app.util.normalize(@value)

        scrollTop = $content.scrollTop

        $content.addClass("searching")
        for dom in $content.child()
          if (
            ((searchRegExp and searchRegExp.test(dom.textContent)) or
             app.util.normalize(dom.textContent).includes(query)) and
            (!dom.hasClass("ng") or dom.hasClass("disp_ng"))
          )
            dom.addClass("search_hit")
            hitCount++
          else
            dom.removeClass("search_hit")
        $content.dataset.resSearchHitCount = hitCount
        $view.C("hit_count")[0].textContent = "#{hitCount}hit"

        if scrollTop is $content.scrollTop
          $content.emit(new Event("scroll"))
      else
        $content.removeClass("searching")
        $content.removeAttr("data-res-search-hit-count")
        for dom in $view.C("search_hit") by -1
          dom.removeClass("search_hit")
        $view.C("hit_count")[0].textContent = ""

        if typeof searchStoredScrollTop is "number"
          $content.scrollTop = searchStoredScrollTop
          searchStoredScrollTop = null

      $content.emit(new Event("searchfinish"))
      return
    )

    $searchbox.on("keydown", ({key}) ->
      if $content.hasClass("search_regexp")
        if key in ["Enter", "Escape"]
          @value = "" if key is "Escape"
          @emit(new CustomEvent("input", detail: {isEnter: true}))
        return
      if key is "Escape"
        if @value isnt ""
          @value = ""
          @emit(new Event("input"))
      return
    )

    # 検索モードの切り替え
    $view.on("change_search_regexp", ->
      $content.toggleClass("search_regexp")
      $searchbox.emit(new CustomEvent("input", detail: {isEnter: true}))
      return
    )
    return

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
      $ele = $content.last()
      while threadContent.isHidden($ele)
        $pEle = $ele.prev()
        break unless $pEle?
        $ele = $pEle
      observer.observe($ele) if $ele?
      return

    #未読ブックマーク数表示
    $nextUnread =
      _ele: $view.C("next_unread")[0]
      show: ->
        next = null

        bookmarks = app.bookmark.getAll().filter( ({type, url}) ->
          return (type is "thread") and (url isnt viewUrl)
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
          if next.resCount?
            text += " (未読#{next.resCount - (next.readState?.read or 0)}件)"
          @_ele.href = app.safeHref(next.url)
          @_ele.textContent = text
          @_ele.dataset.title = next.title
          @_ele.removeClass("hidden")
        else
          @hide()
        return
      hide: ->
        @_ele.addClass("hidden")
        return

    $searchNextThread =
      _ele: $view.C("search_next_thread")[0]
      show: ->
        if $content.child().length >= 1000 or $view.C("message_bar")[0].hasClass("error")
          @_ele.removeClass("hidden")
        else
          @hide()
        return
      hide: ->
        @_ele.addClass("hidden")
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
    $view.on("view_refreshed", ->
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
        searchNextThread.search(viewUrl, document.title, $content.textContent)
        return
      )
    return

  #パンくずリスト表示
  do ->
    boardUrl = app.URL.threadToBoard(viewUrl)
    try
      title = (await app.BoardTitleSolver.ask(boardUrl)).replace(/板$/, "")
    catch
      title = ""
    $a = $view.$(".breadcrumb > li > a")
    $a.href = app.URL.threadToBoard(viewUrl)
    $a.textContent = "#{title}板"
    $a.addClass("hidden")
    # Windows版Chromeで描画が崩れる現象を防ぐため、わざとリフローさせる。
    await app.defer()
    $view.$(".breadcrumb > li > a").style.display = "inline-block"
    return

  return
)

app.viewThread._draw = ($view, {forceUpdate = false, jumpResNum = -1} = {}) ->
  threadContent = app.DOMData.get($view, "threadContent")
  $view.addClass("loading")
  $view.style.cursor = "wait"
  $reloadButton = $view.C("button_reload")[0]
  $reloadButton.addClass("disabled")
  loadCount = 0

  fn = (thread, error) ->
    $messageBar = $view.C("message_bar")[0]
    if error
      $messageBar.addClass("error")
      $messageBar.innerHTML = thread.message
    else
      $messageBar.removeClass("error")
      $messageBar.removeChildren()

    unless thread.res?
      throw new Error("スレの取得に失敗しました")

    document.title = thread.title

    await threadContent.addItem(thread.res.slice($view.C("content")[0].child().length), thread.title)
    loadCount++
    app.DOMData.get($view, "lazyload").scan()

    if not $view.hasClass("expired") and thread.expired
      $view.addClass("expired")
      parent.postMessage({type: "became_expired"}, location.origin)
      $view.C("button_write")[0]?.remove()

    if not $view.hasClass("over1000") and threadContent.over1000ResNum?
      $view.addClass("over1000")
      parent.postMessage({type: "became_over1000"}, location.origin)
      $view.C("button_write")[0]?.remove()

    if $view.C("content")[0].hasClass("searching")
      $view.C("searchbox")[0].emit(new Event("input"))

    $view.emit(new CustomEvent("view_loaded", detail: {jumpResNum, loadCount}))
    return thread

  thread = new app.Thread($view.dataset.url)
  threadSetFromCacheBeforeHTTPPromise = Promise.resolve()
  threadGetPromise = app.util.promiseWithState(thread.get(forceUpdate, ->
    # 通信する前にキャッシュを取得して一旦表示する
    unless threadGetPromise.isResolved()
      threadSetFromCacheBeforeHTTPPromise = fn(thread, false)
    return
  ))
  try
    await threadGetPromise.promise
  try
    await threadSetFromCacheBeforeHTTPPromise
  try
    await fn(thread, not threadGetPromise.isResolved())
    ok = true
  catch
    ok = false
  $view.removeClass("loading")
  $view.style.cursor = "auto"
  unless ok
    throw new Error("スレの表示に失敗しました")
  do ->
    await app.wait5s()
    $reloadButton.removeClass("disabled")
    return
  return thread

app.viewThread._readStateManager = ($view) ->
  threadContent = app.DOMData.get($view, "threadContent")
  $content = $view.C("content")[0]
  viewUrl = $view.dataset.url
  boardUrl = app.URL.threadToBoard(viewUrl)
  requestReloadFlag = false
  scanCountByReloaded = 0
  attachedReadState = {last: 0, read: 0, received: 0, offset: null}

  #read_stateの取得
  getReadState = do ->
    readStateUpdated = false
    if (bookmark = app.bookmark.get(viewUrl))?.readState?
      {readState} = bookmark
      return {readState, readStateUpdated}
    _readState = await app.ReadState.get(viewUrl)
    readState = _readState or {received: 0, read: 0, last: 0, url: viewUrl, offset: null}
    return {readState, readStateUpdated}

  #スレの描画時に、read_state関連のクラスを付与する
  $view.on("view_loaded", ({ detail: {jumpResNum, loadCount} }) ->
    if loadCount is 1
      # 初回の処理
      {readState, readStateUpdated} = await getReadState
      $content.C("last")[0]?.removeClass("last")
      $content.C("read")[0]?.removeClass("read")
      $content.C("received")[0]?.removeClass("received")

      attachedReadState.last = readState.last
      attachedReadState.offset = readState.offset
      attachedReadState.read = readState.read
      attachedReadState.received = readState.received

      $view.emit(new CustomEvent("read_state_attached", detail: {jumpResNum, requestReloadFlag, loadCount}))
      if attachedReadState.read > 0 and attachedReadState.received > 0
        app.message.send("read_state_updated", {board_url: boardUrl, read_state: readState})
      return
    # 2回目の処理
    # 画像のロードにより位置がずれることがあるので初回処理時の内容を使用する
    tmpReadState = {read: null, received: null, url: viewUrl}
    $content.C("last")[0]?.removeClass("last")
    $content.child()[attachedReadState.last - 1]?.addClass("last")
    $content.child()[attachedReadState.last - 1]?.attr("last-offset", attachedReadState.offset)
    $content.C("read")[0]?.removeClass("read")
    $content.child()[attachedReadState.read - 1]?.addClass("read")
    tmpReadState.read = attachedReadState.read
    $content.C("received")[0]?.removeClass("received")
    $content.child()[attachedReadState.received - 1]?.addClass("received")
    tmpReadState.received = attachedReadState.received

    $view.emit(new CustomEvent("read_state_attached", detail: {jumpResNum, requestReloadFlag, loadCount}))
    if tmpReadState.read and tmpReadState.received
      app.message.send("read_state_updated", {board_url: boardUrl, read_state: tmpReadState})
    requestReloadFlag = false
    return
  )

  {readState, readStateUpdated} = await getReadState
  scan = (byScroll = false) ->
    received = $content.child().length
    #onbeforeunload内で呼び出された時に、この値が0になる場合が有る
    return if received is 0

    # 既読情報が存在しない場合readState.lastは0
    if readState.last is 0
      last = threadContent.getRead(1)
    else
      last = threadContent.getRead(readState.last)

    scanCountByReloaded++ if requestReloadFlag and !byScroll

    if readState.received < received
      readState.received = received
      readStateUpdated = true

    lastDisplay = threadContent.getDisplay(last)
    if lastDisplay
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
  onBeforezombie = ->
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

  #スクロールされたら定期的にスキャンを実行する
  doneScroll = false
  isScaning = false
  scrollWatcher = setInterval( ->
    return if not doneScroll or isScaning
    isScaning = true
    do ->
      await app.waitAF()
      scan(true)
      if readStateUpdated
        app.message.send("read_state_updated", {board_url: boardUrl, read_state: readState})
      isScaning = false
      return
    doneScroll = false
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
    doneScroll = true
    return
  , passive: true)
  $view.on("request_reload", ->
    requestReloadFlag = true
    scanCountByReloaded = 0
    scanAndSave()
    return
  )
  $view.on("view_refreshed", ->
    scanAndSave()
    return
  )

  window.on("view_unload", ->
    clearInterval(scrollWatcher)
    parent.window.off("beforezombie", onBeforezombie)
    #ロード中に閉じられた場合、スキャンは行わない
    return if $view.hasClass("loading")
    scanAndSave()
    return
  )
  return
