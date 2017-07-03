do ->
  return if /windows/i.test(navigator.userAgent)
  new Promise( (resolve, reject) ->
    if "textar_font" of localStorage
      resolve()
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
          localStorage.textar_font = "data:application/x-font-woff;base64," + btoa(s)
          resolve()
        return
      xhr.send()
      return
    )
  ).then( ->
    document.on("DOMContentLoaded", ->
      style = $__("style")
      style.textContent = """
        @font-face {
          font-family: "Textar";
          src: url(#{localStorage.textar_font});
        }
      """
      document.head.appendChild(style)
      return
    )
    return
  )
  return

app.view_thread = {}

app.boot "/view/thread.html", ->
  try
    view_url = app.URL.parseQuery(location.search).get("q")
  catch
    alert("不正な引数です")
    return
  view_url = app.URL.fix(view_url)
  jumpResNum = -1
  iframe = parent.$$.$("iframe[data-url=\"#{view_url}\"]")
  if iframe
    jumpResNum = +iframe.dataset.writtenResNum
    if jumpResNum < 1
      jumpResNum = +iframe.dataset.paramResNum

  $view = document.documentElement
  $view.dataset.url = view_url

  $content = $view.C("content")[0]
  threadContent = new UI.ThreadContent(view_url, $content)
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

  write = (param) ->
    param or= {}
    param.url = view_url
    param.title = document.title
    open(
      "/write/write.html?#{app.URL.buildQuery(param)}"
      undefined
      'width=600,height=300'
    )

  popup_helper = (that, e, fn) ->
    $popup = fn()
    return if $popup.child().length is 0
    for dom in $popup.T("article")
      dom.removeClass("last")
      dom.removeClass("read")
      dom.removeClass("received")
    #ポップアップ内のサムネイルの遅延ロードを解除
    for dom in $popup.$$("img[data-src], video[data-src]")
      app.DOMData.get($view, "lazyload").immediateLoad(dom)
    app.defer ->
      # マウスオーバーによるズームの設定
      for dom in $popup.$$("img.image, video")
        app.view_thread._setupHoverZoom(dom)
      # popupの表示
      popupView.show($popup, e.clientX, e.clientY, that)
      return
    return

  canWriteFlg = do ->
    tsld = app.URL.tsld(view_url)
    if tsld in ["2ch.net", "bbspink.com", "2ch.sc", "open2ch.net"]
      return true
    # したらばの過去ログ
    if tsld is "shitaraba.net" and not view_url.includes("/read_archive.cgi/")
      return true
    return false

  if canWriteFlg
    $view.C("button_write")[0].on "click", ->
      write()
      return
  else
    $view.C("button_write")[0].remove()

  # 現状ではしたらばはhttpsに対応していないので切り替えボタンを隠す
  if app.URL.tsld(view_url) is "shitaraba.net"
    $view.C("button_scheme")[0].remove()

  #リロード処理
  $view.on "request_reload", (e) ->
    ex = e.detail
    #先にread_state更新処理を走らせるために、処理を飛ばす
    app.defer ->
      if ex?.written_res_num?
        jumpResNum = +ex.written_res_num
      if ex?.param_res_num? and jumpResNum < 1
        jumpResNum = +ex.param_res_num
      if (
        $view.hasClass("loading") or
        $view.C("button_reload")[0].hasClass("disabled")
      )
        if jumpResNum > 0
          threadContent.scrollTo(jumpResNum, true, -60)
          threadContent.select(jumpResNum, true)
          jumpResNum = -1
        return

      app.view_thread._draw($view, ex?.force_update, (thread) ->
        if ex?.mes? and app.config.get("no_writehistory") is "off"
          i = thread.res.length - 1
          while i >= 0
            if ex.mes.replace(/\s/g, "") is app.util.decode_char_reference(app.util.stripTags(thread.res[i].message)).replace(/\s/g, "")
              date = threadContent.stringToDate(thread.res[i].other)
              name = app.util.decode_char_reference(thread.res[i].name)
              mail = app.util.decode_char_reference(thread.res[i].mail)
              if date?
                app.WriteHistory.add(view_url, i+1, document.title, name, mail, ex.name, ex.mail, ex.mes, date.valueOf())
              break
            i--
          jumpResNum = -1
        return
      )
    return

  #初回ロード処理
  do ->
    opened_at = Date.now()

    app.view_thread._read_state_manager($view)
    $view.on "read_state_attached", func = ->
      $view.off("read_state_attached", func)
      on_scroll = false
      $content.on "scroll", f = ->
        $content.off("scroll", f)
        on_scroll = true
        return

      $last = $content.C("last")[0]
      lastNum = 0
      for dom in $content.$$(":scope > article:last-child")
        lastNum = +dom.C("num")[0].textContent
        break
      # 指定レス番号へ
      if jumpResNum > 0 and jumpResNum <= lastNum
        threadContent.scrollTo(jumpResNum, true, -60)
        threadContent.select(jumpResNum, true)
      # 最終既読位置へ
      else if $last?
        offset = $last.attr("last-offset") ? 0
        threadContent.scrollTo(+$last.C("num")[0].textContent, false, +offset)

      #スクロールされなかった場合も余所の処理を走らすためにscrollを発火
      unless on_scroll
        $content.dispatchEvent(new Event("scroll"))

      #二度目以降のread_state_attached時
      $view.on "read_state_attached", ->
        #通常時と自動更新有効時で、更新後のスクロールの動作を変更する
        move_mode = if parseInt(app.config.get("auto_load_second")) >= 5000 then app.config.get("auto_load_move") else "new"
        switch move_mode
          when "new"
            lastNum = +$content.$(":scope > article:last-child")?.C("num")[0].textContent
            if jumpResNum > 0 and jumpResNum <= lastNum
              threadContent.scrollTo(jumpResNum, true, -60)
              threadContent.select(jumpResNum, true)
            else
              offset = -100
              for dom in $content.child() when dom.matches(".last.received + article")
                $tmp = dom
                break
              # 新着が存在しない場合はスクロールを実行するためにレスを探す
              unless $tmp?
                $tmp = $content.$(":scope > article.last")
                offset = $tmp.attr("last-offset") ? -100
              $tmp ?= $content.$(":scope > article.read")
              $tmp ?= $content.$(":scope > article:last-child")
              threadContent.scrollTo(+$tmp.C("num")[0].textContent, true, +offset) if $tmp?
          when "surely_new"
            for dom, i in $content.child() when dom.matches(".last.received + article")
              res_num = i+1
              break
            threadContent.scrollTo(res_num, true) if typeof res_num is "number"
          when "newest"
            for dom, i in $content.child() when dom.matches("article:last-child")
              res_num = i+1
              break
            threadContent.scrollTo(res_num, true) if typeof res_num is "number"

    app.view_thread._draw($view).catch ->
      jumpResNum = -1
      return
    .then ->
      if app.config.get("no_history") is "off"
        app.History.add(view_url, document.title, opened_at)
      jumpResNum = -1
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

    app.defer ->
      if getSelection().toString().length is 0
        $menu.C("copy_selection")[0].remove()
        $menu.C("search_selection")[0].remove()
      return

    if $article.parent().hasClass("config_use_aa_font")
      if $article.hasClass("aa")
        $menu.C("toggle_aa_mode")[0].textContent = "AA表示モードを解除"
      else
        $menu.C("toggle_aa_mode")[0].textContent = "AA表示モードに変更"
    else
      $menu.C("toggle_aa_mode")[0].remove()

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

    app.defer ->
      $menu.removeClass("hidden")
      UI.contextmenu($menu, e.clientX, e.clientY)
      return
    return

  $view.on("click", onHeaderMenu)
  $view.on("contextmenu", onHeaderMenu)

  #レスメニュー表示(内容上)
  $view.on "contextmenu", (e) ->
    return unless e.target.matches("article > .message")
    # 選択範囲をNG登録
    app.contextMenus.update("add_selection_to_ngwords", {
      onclick: (info, tab) ->
        selectedText = getSelection().toString()
        if selectedText.length > 0
          app.NG.add(selectedText)
        return
    })
    return

  #レスメニュー項目クリック
  $view.on "click", (e) ->
    target = e.target
    return unless target.matches(".res_menu > li")
    $res = target.closest("article")

    if target.hasClass("copy_selection")
      selectedText = getSelection().toString()
      if selectedText.length > 0
        document.execCommand("copy")

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
      threadContent.scrollTo(+$res.C("num")[0].textContent, true)

    else if target.hasClass("res_to_this")
      write(message: ">>#{$res.C("num")[0].textContent}\n")

    else if target.hasClass("res_to_this2")
      write(message: """
      >>#{$res.C("num")[0].textContent}
      #{$res.C("message")[0].textContent.replace(/^/gm, '>')}\n
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
      open(app.safeHref(view_url + $res.C("num")[0].textContent))

    # 画像をぼかす
    else if target.hasClass("set_image_blur")
      for thumb in $res.$$(".thumbnail[media-type='image'], .thumbnail[media-type='video']")
        threadContent.setImageBlur(thumb, true)

    # 画像のぼかしを解除する
    else if target.hasClass("reset_image_blur")
      for thumb in $res.$$(".thumbnail[media-type='image'], .thumbnail[media-type='video']")
        threadContent.setImageBlur(thumb, false)

    target.parent().remove()
    return

  $view.on "mousedown", ".res_menu > li", (e) ->
    e.preventDefault()
    return

  # アンカーポップアップ
  $view.on("mouseenter", (e) ->
    target = e.target
    return unless target.hasClass("anchor") or target.hasClass("name_anchor")

    if target.hasClass("anchor")
      anchor = target.innerHTML
    else
      anchor = target.innerHTML.trim()

    popup_helper target, e, =>
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
    return
  , true)

  #アンカーリンク
  $view.on "click", (e) ->
    target = e.target
    return unless target.hasClass("anchor")
    e.preventDefault()
    return if target.hasClass("disabled")

    tmp = app.util.Anchor.parseAnchor(target.innerHTML)
    target_res_num = tmp.segments[0]?[0]
    if target_res_num?
      threadContent.scrollTo(target_res_num, true)
    return

  #通常リンク
  onLink = (e) ->
    target = e.target
    return unless target.matches(".message a:not(.anchor)")
    target_url = target.href

    #http、httpsスキーム以外ならクリックを無効化する
    if not /// ^https?:// ///.test(target_url)
      e.preventDefault()
      return

    #.open_in_rcrxが付与されている場合、処理は他モジュールに任せる
    return if target.hasClass("open_in_rcrx")

    #read.crxで開けるURLかどうかを判定
    flg = false
    tmp = app.URL.guessType(target_url)
    #スレのURLはほぼ確実に判定できるので、そのままok
    if tmp.type is "thread"
      flg = true
    #2chタイプ以外の板urlもほぼ確実に判定できる
    else if tmp.type is "board" and tmp.bbsType isnt "2ch"
      flg = true
    #2chタイプの板は誤爆率が高いので、もう少し細かく判定する
    else if tmp.type is "board" and tmp.bbsType is "2ch"
      #2ch自体の場合の判断はguess_typeを信じて板判定
      if app.URL.tsld(target_url) is "2ch.net"
        flg = true
      #ブックマークされている場合も板として判定
      else if app.bookmark.get(app.URL.fix(target_url))
        flg = true
    #read.crxで開ける板だった場合は.open_in_rcrxを付与して再度クリックイベント送出
    if flg
      e.preventDefault()
      target.addClass("open_in_rcrx")
      target.dataset.href = target.href
      target.href = "javascript:undefined;"
      if tmp.type is "thread"
        paramResNum = app.URL.getResNumber(target.dataset.href)
        target.dataset.paramResNum = paramResNum if paramResNum
      app.defer ->
        target.dispatchEvent(e)
    return

  $view.on "click", onLink
  $view.on "mousedown", onLink

  #リンク先情報ポップアップ
  $view.on("mouseenter", (e) ->
    target = e.target
    return unless target.matches(".message a:not(.anchor)")
    # 携帯・スマホ用URLをPC用URLに変換
    url = app.URL.convertUrlFromPhone(target.href)
    tmp = app.URL.guessType(url)
    if tmp.type is "board"
      board_url = app.URL.fix(url)
      after = ""
    else if tmp.type is "thread"
      board_url = app.URL.threadToBoard(url)
      after = "のスレ"
    else
      return

    app.BoardTitleSolver.ask(board_url).then (title) =>
      popup_helper target, e, =>
        $div = $__("div")
        $div.addClass("popup_linkinfo")
        $div2 = $__("div")
        $div2.textContent = title + after
        $div.addLast($div2)
        return $div
      return
    return
  , true)

  #IDポップアップ
  $view.on(app.config.get("popup_trigger"), (e) ->
    target = e.target
    return unless target.matches(".id.link, .id.freq, .anchor_id, .slip.link, .slip.freq, .trip.link, .trip.freq")
    e.preventDefault()

    popup_helper target, e, =>
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

      if $article.parent().hasClass("popup_id") and ($article.dataset.id is id or $article.dataset.slip is slip or $article.dataset.trip is trip)
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
    return
  , true)

  #リプライポップアップ
  $view.on(app.config.get("popup_trigger"), (e) ->
    target = e.target
    return unless target.hasClass("rep")
    popup_helper target, e, =>
      tmp = $content.child()

      frag = $_F()
      res_num = +target.closest("article").C("num")[0].textContent
      for target_res_num from app.DOMData.get($view, "threadContent").repIndex.get(res_num)
        frag.addLast(tmp[target_res_num - 1].cloneNode(true))

      $popup = $__("div")
      $popup.addLast(frag)
      return $popup
    return
  , true)

  #何もないところをダブルクリックすると更新する
  $view.on "dblclick", (e) ->
    return if app.config.get("dblclick_reload") is "off"
    return unless e.target.hasClass("message")
    return if e.target.tagName is "A" or e.target.hasClass("thumbnail")
    $view.dispatchEvent(new Event("request_reload"))
    return

  # VIDEOの再生/一時停止
  $view.on "click", (e) ->
    target = e.target
    return unless target.matches(".thumbnail > video")
    target.preload = "auto" if target.preload is "metadata"
    if target.paused
      target.play()
    else
      target.pause()
    return

  # VIDEO再生中はマウスポインタを消す
  $view.on("mouseenter", (e) ->
    target = e.target
    return unless target.matches(".thumbnail > video")
    target.on("play", (evt) ->
      app.view_thread._controlVideoCursor(target, evt.type)
      return
    )
    target.on("timeupdate", (evt) ->
      app.view_thread._controlVideoCursor(target, evt.type)
      return
    )
    target.on("pause", (evt) ->
      app.view_thread._controlVideoCursor(target, evt.type)
      return
    )
    target.on("ended", (evt) ->
      app.view_thread._controlVideoCursor(target, evt.type)
      return
    )
    return
  , true)

  # マウスポインタのリセット
  $view.on "mousemove", (e) ->
    target = e.target
    return unless target.matches(".thumbnail > video")
    app.view_thread._controlVideoCursor(target, e.type)
    return

  # 展開済みURLのポップアップ
  $view.on("mouseenter", (e) ->
    target = e.target
    return unless target.hasClass("has_expandedURL")
    return if app.config.get("expand_short_url") isnt "popup"
    popup_helper target, e, =>
      targetUrl = target.href

      frag = $_F()
      sib = target
      while true
        sib = sib.nextSibling
        if sib?.hasClass("expandedURL") and
           sib?.getAttr("short-url") is targetUrl
          frag.addLast(sib.cloneNode(true))
          break

      frag.querySelector(".expandedURL").removeClass("hide_data")
      $popup = $__("div")
      $popup.addLast(frag)
      return $popup
    return
  , true)

  # リンクのコンテキストメニュー
  $view.on "contextmenu", (e) ->
    target = e.target
    return unless target.matches(".message > a")
    # リンクアドレスをNG登録
    enableFlg = !(target.hasClass("anchor") or target.hasClass("anchor_id"))
    app.contextMenus.update("add_link_to_ngwords", {
      enabled: enableFlg,
      onclick: (info, tab) =>
        app.NG.add(target.href)
        return
    })
    # レス番号を指定してリンクを開く
    if app.config.get("enable_link_with_res_number") is "on"
      menuTitle = "レス番号を無視してリンクを開く"
    else
      menuTitle = "レス番号を指定してリンクを開く"
    enableFlg = (target.hasClass("open_in_rcrx") and target.dataset.paramResNum isnt undefined)
    app.contextMenus.update("open_link_with_res_number", {
      title: menuTitle,
      enabled: enableFlg,
      onclick: (info, tab) =>
        target.setAttr("toggle_param_res_num", "on")
        app.defer =>
          target.dispatchEvent(new Event("mousedown", {"bubbles": true}))
        return
    })
    return

  # 画像のコンテキストメニュー
  $view.on "contextmenu", (e) ->
    target = e.target
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

  #クイックジャンプパネル
  do ->
    jump_hoge =
      ".jump_one": "article:nth-child(1)"
      ".jump_newest": "article:last-child"
      ".jump_not_read": "article.read + article"
      ".jump_new": "article.received + article"
      ".jump_last": "article.last"

    $jump_panel = $view.C("jump_panel")[0]

    $view.on "read_state_attached", ->
      already = {}
      for panel_item_selector, target_res_selector of jump_hoge
        res = $view.$(target_res_selector)
        res_num = +res.C("num")[0].textContent if res
        if res and not already[res_num]
          $jump_panel.$(panel_item_selector).style.display = "block"
          already[res_num] = true
        else
          $jump_panel.$(panel_item_selector).style.display = "none"
      return

    $jump_panel.on "click", (e) ->
      $target = e.target

      for key, val of jump_hoge
        if $target.matches(key)
          selector = val
          offset = if key in [".jump_not_read", ".jump_new"] then -100 else 0
          break

      if selector
        res_num = 1
        for dom, i in $view.T("article") when dom.matches(selector)
          res_num = i + 1
          break
        if key is ".jump_last"
          offset = dom.attr("last-offset") ? offset

        if typeof res_num is "number"
          threadContent.scrollTo(res_num, true, +offset)
        else
          app.log("warn", "[view_thread] .jump_panel: ターゲットが存在しません")
      return
    return

  #検索ボックス
  do ->
    search_stored_scrollTop = null
    _isComposing = false
    $searchbox = $view.C("searchbox")[0]
    $searchbox.on "compositionstart", ->
      _isComposing = true
      return
    $searchbox.on "compositionend", (e) ->
      _isComposing = false
      e.currentTarget.dispatchEvent(new Event("input"))
      return
    $searchbox.on "input", ->
      return if _isComposing
      $content.dispatchEvent(new Event("searchstart"))
      if @value isnt ""
        if typeof search_stored_scrollTop isnt "number"
          search_stored_scrollTop = $content.scrollTop

        hit_count = 0
        query = app.util.normalize(@value)

        scrollTop = $content.scrollTop

        $content.addClass("searching")
        for dom in $content.child()
          if app.util.normalize(dom.textContent).includes(query)
            dom.addClass("search_hit")
            hit_count++
          else
            dom.removeClass("search_hit")
        $content.dataset.resSearchHitCount = hit_count
        $view.C("hit_count")[0].textContent = "#{hit_count}hit"

        if scrollTop is $content.scrollTop
          $content.dispatchEvent(new Event("scroll"))
      else
        $content.removeClass("searching")
        $content.removeAttr("data-res-search-hit-count")
        $view.C("search_hit")[0].removeClass("search_hit")
        $view.C("hit_count")[0].textContent = ""

        if typeof search_stored_scrollTop is "number"
          $content.scrollTop = search_stored_scrollTop
          search_stored_scrollTop = null

      $content.dispatchEvent(new Event("searchfinish"))
      return

    $searchbox.on "keyup", (e) ->
      if e.which is 27 #Esc
        if @value isnt ""
          @value = ""
          @dispatchEvent(new Event("input"))
      return

  #フッター表示処理
  do ->
    scroll_left = 0
    update_scroll_left = ->
      scroll_left = $content.scrollHeight - ($content.offsetHeight + $content.scrollTop)
      return

    #未読ブックマーク数表示
    next_unread =
      _elm: $view.C("next_unread")[0]
      show: ->
        next = null

        bookmarks = app.bookmark.get_all().filter((bookmark) -> bookmark.type is "thread" and bookmark.url isnt view_url)

        #閲覧中のスレッドに新着が有った場合は優先して扱う
        if bookmark = app.bookmark.get(view_url)
          bookmarks.unshift(bookmark)

        for bookmark in bookmarks when bookmark.res_count?
          read = null

          if iframe = parent.$$.$("[data-url=\"#{bookmark.url}\"]")
            read = iframe.contentWindow?.$$?(".content > article").length

          unless read
            read = bookmark.read_state?.read or 0

          if bookmark.res_count > read
            next = bookmark
            break

        if next
          if next.url is view_url
            text = "新着レスがあります"
          else
            text = "未読ブックマーク: #{next.title}"
          if next.res_count?
            text += " (未読#{next.res_count - (next.read_state?.read or 0)}件)"
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

    search_next_thread =
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

    update_thread_footer = ->
      if scroll_left <= 1
        next_unread.show()
        search_next_thread.show()
      else
        next_unread.hide()
        search_next_thread.hide()
      return

    $view.on("tab_selected", ->
      update_thread_footer()
      return
    )
    $view.on("view_loaded", ->
      update_thread_footer()
      return
    )
    $view.C("content")[0].on("scroll", ->
      update_scroll_left()
      update_thread_footer()
      return
    , passive: true)
    #次スレ検索
    for dom in $view.$$(".button_tool_search_next_thread, .search_next_thread")
      dom.on "click", ->
        searchNextThread.show()
        searchNextThread.search(view_url, document.title)
        return

    app.message.addListener "bookmark_updated", (message) ->
      if scroll_left is 0
        next_unread.show()
      return

    return

  # サムネイルロード時の追加処理
  $view.on "lazyload-load", (e) ->
    target = e.target.closest(".thumbnail > a > img.image, .thumbnail > video")
    return unless target?
    # マウスオーバーによるズームの設定
    app.view_thread._setupHoverZoom(target)
    return

  # 逆スクロール時の処理
  $view.on "lazyload-load-reverse", (e) ->
    target = e.target.closest(".thumbnail > a > img.image, .thumbnail > video")
    return unless target?
    # マウスオーバーによるズームの設定
    app.view_thread._setupHoverZoom(target)
    return

  #パンくずリスト表示
  do ->
    board_url = app.URL.threadToBoard(view_url)
    app.BoardTitleSolver.ask(board_url).catch ->
      return
    .then (title) ->
      $a = $view.$(".breadcrumb > li > a")
      $a.href = board_url
      $a.textContent = if title? then "#{title.replace(/板$/, "")}板" else "板"
      $a.addClass("hidden")
      # Windows版Chromeで描画が崩れる現象を防ぐため、わざとリフローさせる。
      app.defer ->
        $view.$(".breadcrumb > li > a").style.display = "inline-block"
        return
      return
    return

  return

readStateAttached = false

app.view_thread._draw = ($view, force_update, beforeAdd) ->
  $view.addClass("loading")
  $view.style.cursor = "wait"
  $reload_button = $view.C("button_reload")[0]
  $reload_button.addClass("disabled")

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
        app.DOMData.get($view, "lazyload").scan()

        if $view.C("content")[0].hasClass("searching")
          $view.C(".searchbox")[0].dispatchEvent(new Event("input"))

        $view.dispatchEvent(new Event("view_loaded"))

        resolve(thread)
        return
      )
      return
    )

  return new Promise( (resolve, reject) ->
    readStateAttached = false
    thread = new app.Thread($view.dataset.url)
    threadSetPromise = null
    threadGetPromise = app.util.promiseWithState(thread.get(force_update, ->
      unless threadGetPromise.isResolved()
        threadSetPromise = app.util.promiseWithState(fn(thread, false))
      return
    ))
    threadGetPromise.promise
      .catch ->
        return
      .then ->
        threadSetPromise = app.util.promiseWithState(Promise.resolve()) unless threadSetPromise
        threadSetPromise.promise.catch(->
          return
        ).then( ->
          threadGetPromiseState = threadGetPromise.isResolved()
          beforeAdd?(thread) if threadGetPromiseState
          threadSetPromise = app.util.promiseWithState(fn(thread, not threadGetPromiseState))
          threadSetPromise.promise.catch( ->
            return
          ).then( ->
            $view.removeClass("loading")
            $view.style.cursor = "auto"
            setTimeout((-> $reload_button.removeClass("disabled")), 1000 * 5)
            if threadSetPromise.isResolved() then resolve() else reject()
            return
          )
          return
        )
        return
      return
    return
  )

app.view_thread._read_state_manager = ($view) ->
  $content = $view.C("content")[0]
  view_url = $view.dataset.url
  board_url = app.URL.threadToBoard(view_url)
  readStateAttached = false
  requestReloadFlag = false
  scanCountByReloaded = 0
  attachedReadState = {last: 0, read: 0, received: 0, offset: null}

  #read_stateの取得
  get_read_state = new Promise( (resolve, reject) ->
    read_state_updated = false
    if (bookmark = app.bookmark.get(view_url))?.read_state?
      read_state = bookmark.read_state
      resolve({read_state, read_state_updated})
    else
      app.ReadState.get(view_url).then (_read_state) ->
        read_state = _read_state or {received: 0, read: 0, last: 0, url: view_url, offset: null}
        resolve({read_state, read_state_updated})
    return
  )

  #スレの描画時に、read_state関連のクラスを付与する
  $view.on "view_loaded", ->
    # 2回目の処理
    # 画像のロードにより位置がずれることがあるので初回処理時の内容を使用する
    if readStateAttached
      if attachedReadState.last > 0
        $content.C("last")[0]?.removeClass("last")
        $content.child()[attachedReadState.last - 1]?.addClass("last")
        $content.child()[attachedReadState.last - 1]?.attr("last-offset", attachedReadState.offset)
      if attachedReadState.read > 0
        $content.C("read")[0]?.removeClass("read")
        $content.child()[attachedReadState.read - 1]?.addClass("read")
      if attachedReadState.received > 0
        $content.C("received")[0]?.removeClass("received")
        $content.child()[attachedReadState.received - 1]?.addClass("received")
      readStateAttached = false
      requestReloadFlag = false
      $view.dispatchEvent(new Event("read_state_attached"))
      return
    # 初回の処理
    get_read_state.then ({read_state, read_state_updated}) ->
      $content.C("last")[0]?.removeClass("last")
      $content.C("read")[0]?.removeClass("read")
      $content.C("received")[0]?.removeClass("received")

      # キャッシュの内容が古い場合にread_stateの内容の方が大きくなることがあるので
      # その場合は次回の処理に委ねる
      contentLength = $content.child().length
      if read_state.last <= contentLength
        $content.child()[read_state.last - 1]?.addClass("last")
        $content.child()[read_state.last - 1]?.attr("last-offset", read_state.offset)
        attachedReadState.last = -999
      else
        attachedReadState.last = read_state.last
        attachedReadState.offset = read_state.offset
      if read_state.read <= contentLength
        $content.child()[read_state.read - 1]?.addClass("read")
        attachedReadState.read = -999
      else
        attachedReadState.read = read_state.read
      if read_state.received <= contentLength
        $content.child()[read_state.received - 1]?.addClass("received")
        attachedReadState.received = -999
      else
        attachedReadState.received = read_state.received
      readStateAttached = true
      requestReloadFlag = false

      $view.dispatchEvent(new Event("read_state_attached"))
    return

  get_read_state.then ({read_state, read_state_updated}) ->
    scan = ->
      received = $content.child().length
      #onbeforeunload内で呼び出された時に、この値が0になる場合が有る
      return if received is 0

      last = app.DOMData.get($view, "threadContent").getRead()
      scanCountByReloaded++ if requestReloadFlag

      if read_state.received isnt received
        read_state.received = received
        read_state_updated = true

      lastDisplay = app.DOMData.get($view, "threadContent").getDisplay()
      if (
        (!requestReloadFlag or scanCountByReloaded is 1) and
        (!lastDisplay.bottom or lastDisplay.resNum is last)
      )
        if (
          read_state.last isnt lastDisplay.resNum or
          read_state.offset isnt lastDisplay.offset
        )
          read_state.last = lastDisplay.resNum
          read_state.offset = lastDisplay.offset
          read_state_updated = true
      else if read_state.last isnt last
        read_state.last = last
        read_state.offset = null
        read_state_updated = true

      if read_state.read < last
        read_state.read = last
        read_state_updated = true

      return

    #アンロード時は非同期系の処理をzombie.htmlに渡す
    #そのためにlocalStorageに更新するread_stateの情報を渡す
    doneBeforezombie = false
    on_beforezombie = ->
      return if doneBeforezombie
      doneBeforezombie = true
      scan()
      if read_state_updated
        if localStorage.zombie_read_state?
          data = JSON.parse(localStorage["zombie_read_state"])
        else
          data = []
        data.push(read_state)
        localStorage["zombie_read_state"] = JSON.stringify(data)
      return

    parent.window.on("beforezombie", on_beforezombie)
    window.on("beforeunload", on_beforezombie)

    #スクロールされたら定期的にスキャンを実行する
    scroll_flg = false
    scroll_watcher = setInterval ->
      if scroll_flg
        scroll_flg = false
        scan()
        if read_state_updated
          app.message.send("read_state_updated", {board_url, read_state})
    , 250

    scan_and_save = ->
      scan()
      if read_state_updated
        app.ReadState.set(read_state)
        app.bookmark.update_read_state(read_state)
        read_state_updated = false

    app.message.addListener "request_update_read_state", (message) ->
      if not message.board_url? or message.board_url is board_url
        scan_and_save()
      return

    $content.on("scroll", ->
      scroll_flg = true
      return
    , passive: true)
    $view.on("request_reload", ->
      requestReloadFlag = true
      scanCountByReloaded = 0
      scan_and_save()
      return
    )

    window.on "view_unload", ->
      clearInterval(scroll_watcher)
      parent.window.off("beforezombie", on_beforezombie)
      window.off("beforeunload", on_beforezombie)
      #ロード中に閉じられた場合、スキャンは行わない
      return if $view.hasClass("loading")
      scan_and_save()
      return

# マウスオーバーによるズームの設定
app.view_thread._setupHoverZoom = ($media) ->
  zoomFlg = false
  if app.config.get("hover_zoom_image") is "on" and $media.tagName is "IMG"
    zoomRatio = app.config.get("zoom_ratio_image") + "%"
    zoomFlg = true
  else if app.config.get("hover_zoom_video") is "on" and $media.tagName is "VIDEO"
    zoomRatio = app.config.get("zoom_ratio_video") + "%"
    zoomFlg = true
  if zoomFlg
    $media.on("mouseenter", ->
      $media.closest(".thumbnail").addClass("zoom")
      $media.style.zoom = zoomRatio
      return
    )
    $media.on("mouseleave", ->
      $media.closest(".thumbnail").removeClass("zoom")
      $media.style.zoom = "normal"
      return
    )
  return

# VIDEO再生中のマウスポインタ制御
app.view_thread._videoPlayTime = 0
app.view_thread._controlVideoCursor = (v, act) ->
  switch act
    when "play"
      app.view_thread._videoPlayTime = Date.now()
    when "timeupdate"
      return if v.style.cursor is "none"
      if Date.now() - app.view_thread._videoPlayTime > 2000
        v.style.cursor = "none"
    when "pause", "ended"
      v.style.cursor = "auto"
      app.view_thread._videoPlayTime = 0
    when "mousemove"
      return if app.view_thread._videoPlayTime is 0
      v.style.cursor = "auto"
      app.view_thread._videoPlayTime = Date.now()
  return
