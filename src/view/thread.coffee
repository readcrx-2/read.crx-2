do ->
  return if /windows/i.test(navigator.userAgent)
  $.Deferred (d) ->
    if "textar_font" of localStorage
      d.resolve()
    else
      d.reject()
    return
  .then null, ->
    $.Deferred (d) ->
      xhr = new XMLHttpRequest()
      xhr.open("GET", "http://readcrx-2.github.io/read.crx-2/textar-min.woff")
      xhr.responseType = "arraybuffer"
      xhr.onload = ->
        if @status is 200
          buffer = new Uint8Array(@response)
          s = ""
          for a in buffer
            s += String.fromCharCode(a)
          localStorage.textar_font = "data:application/x-font-woff;base64," + btoa(s)
          d.resolve()
        return
      xhr.send()
      return
  .done ->
    $ ->
      style = document.createElement("style")
      style.textContent = """
        @font-face {
          font-family: "Textar";
          src: url(#{localStorage.textar_font});
        }
      """
      document.head.appendChild(style)
      return
    return
  return

app.view_thread = {}

app.boot "/view/thread.html", ->
  view_url = app.url.parse_query(location.href).q
  return alert("不正な引数です") unless view_url
  view_url = app.url.fix(view_url)

  $view = $(document.documentElement)
  $view.attr("data-url", view_url)

  $content = $view.find(".content")
  threadContent = new UI.ThreadContent(view_url, $content[0])
  $view.data("threadContent", threadContent)
  $view.data("selectableItemList", threadContent)
  $view.data("lazyload", new UI.LazyLoad($view.find(".content")[0]))

  new app.view.TabContentView(document.documentElement)

  searchNextThread = new UI.SearchNextThread(
    $view.find(".next_thread_list")[0]
  )
  popupView = new UI.PopupView($view[0])

  if app.config.get("aa_font") is "aa"
    $content.addClass("config_use_aa_font")

  write = (param) ->
    param or= {}
    param.url = view_url
    param.title = document.title
    open(
      "/write/write.html?#{app.url.build_param(param)}"
      undefined
      'width=600,height=300'
    )

  popup_helper = (that, e, fn) ->
    $popup = fn()
    return if $popup[0].children.length is 0
    $popup.find("article").removeClass("last read received")
    #ポップアップ内のサムネイルの遅延ロードを解除
    $popup.find("img[data-src], video[data-src]").each ->
      $view.data("lazyload").immediateLoad(@)
      return
    app.defer ->
      # マウスオーバーによるズームの設定
      $popup.find("img.image, video").each ->
        app.view_thread._setupHoverZoom(@)
      # popupの表示
      popupView.show($popup[0], e.clientX, e.clientY, that)
      return

  if app.url.tsld(view_url) in ["2ch.net", "shitaraba.net", "bbspink.com", "2ch.sc", "open2ch.net"]
    $view.find(".button_write").on "click", ->
      write()
      return
  else
    $view.find(".button_write").remove()

  #リロード処理
  $view.on "request_reload", (e, ex) ->
    #先にread_state更新処理を走らせるために、処理を飛ばす
    app.defer ->
      return if $view.hasClass("loading")
      return if $view.find(".button_reload").hasClass("disabled")

      $view
        .find(".content")
          .removeClass("searching")
          .removeAttr("data-res_search_hit_count")
        .end()
        .find(".searchbox")
          .val("")
        .end()
        .find(".hit_count")
          .addClass("hidden")
          .text("")

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
        return
      )
    return

  #初回ロード処理
  do ->
    opened_at = Date.now()

    app.view_thread._read_state_manager($view)
    $view.one "read_state_attached", ->
      on_scroll = false
      $content.one "scroll", ->
        on_scroll = true
        return

      # 可変サイズの画像が存在している場合は1ページ目の画像チェックを実行する
      if app.config.get("image_height_fix") is "off"
        threadContent.checkImageExists(true)

      $last = $content.find(".last")
      if $last.length is 1
        threadContent.scrollTo(+$last.find(".num").text())

      #スクロールされなかった場合も余所の処理を走らすためにscrollを発火
      unless on_scroll
        $content.triggerHandler("scroll")

      #二度目以降のread_state_attached時
      $view.on "read_state_attached", ->
        #通常時と自動更新有効時で、更新後のスクロールの動作を変更する
        move_mode = if parseInt(app.config.get("auto_load_second")) >= 5000 then app.config.get("auto_load_move") else "new"
        switch move_mode
          when "new"
            $tmp = $content.children(".last.received + article")
            # 新着が存在しない場合はスクロールを実行するためにレスを探す
            $tmp = $content.children("article.last") unless $tmp.length is 1
            $tmp = $content.children("article.read") unless $tmp.length is 1
            $tmp = $content.children("article:last-child") unless $tmp.length is 1
            threadContent.scrollTo(+$tmp.find(".num").text(), true, -100) if $tmp.length is 1
          when "surely_new"
            res_num = $view.find("article.received + article").index() + 1
            threadContent.scrollTo(res_num, true) if typeof res_num is "number"
          when "newest"
            res_num = $view.find("article:last-child").index() + 1
            threadContent.scrollTo(res_num, true) if typeof res_num is "number"

    app.view_thread._draw($view).always ->
      if app.config.get("no_history") is "off"
        app.History.add(view_url, document.title, opened_at)
      return

  #自動更新
  do ->
    auto_load = ->
      second = parseInt(app.config.get("auto_load_second"))
      if second >= 5000
        return setInterval( ->
          if app.config.get("auto_load_all") is "on" or $(".tab_container", parent.document).find("iframe[data-url=\"#{view_url}\"]").hasClass("tab_selected")
            $view.trigger "request_reload" unless $view.find(".content").hasClass("searching")
          return
        , second)
      return

    auto_load_interval = auto_load()

    app.message.add_listener "config_updated", (message) ->
      if message.key is "auto_load_second"
        clearInterval auto_load_interval
        auto_load_interval = auto_load()
      return

    window.addEventListener "view_unload", ->
      clearInterval(auto_load_interval)
      return

  $view
    #レスメニュー表示(ヘッダー上)
    .on "click contextmenu", "article > header", (e) ->
      if $(e.target).is("a")
        return

      # id/参照ポップアップの表示処理との競合回避
      if (
        e.type is "click" and
        app.config.get("popup_trigger") is "click" and
        $(e.target).is(".id.link, .id.freq, .anchor_id, .slip.link, .slip.freq, .trip.link, .trip.freq, .rep.link, .rep.freq")
      )
        return

      if e.type is "contextmenu"
        e.preventDefault()

      $article = $(@).parent()
      $menu = $(
        $("#template_res_menu").prop("content").querySelector(".res_menu")
      ).clone().addClass("hidden").appendTo($article)

      app.defer ->
        if getSelection().toString().length is 0
          $menu.find(".copy_selection").remove()
          $menu.find(".add_selection_to_ngwords").remove()
          $menu.find(".search_selection").remove()
        return

      if $article.parent().hasClass("config_use_aa_font")
        if $article.is(".aa")
          $menu.find(".toggle_aa_mode").text("AA表示モードを解除")
        else
          $menu.find(".toggle_aa_mode").text("AA表示モードに変更")
      else
        $menu.find(".toggle_aa_mode").remove()

      unless $article.attr("data-id")?
        $menu.find(".copy_id").remove()
        $menu.find(".add_id_to_ngwords").remove()

      unless $article.attr("data-slip")?
        $menu.find(".copy_slip").remove()
        $menu.find(".add_slip_to_ngwords").remove()

      unless $article.attr("data-trip")?
        $menu.find(".copy_trip").remove()

      unless app.url.tsld(view_url) in ["2ch.net", "bbspink.com", "shitaraba.net"]
        $menu.find(".res_to_this, .res_to_this2").remove()

      if $article.hasClass("written")
        $menu.find(".add_writehistory").remove()
      else
        $menu.find(".del_writehistory").remove()

      unless $article.is(".popup > article")
        $menu.find(".jump_to_this").remove()

      # 画像にぼかしをかける/画像のぼかしを解除する
      unless $article.hasClass("has_image")
        $menu.find(".set_image_blur").remove()
        $menu.find(".reset_image_blur").remove()
      else
        bflg = Array.from($article.find(".thumbnail[media-type='image'], .thumbnail[media-type='video']")).some((ele) ->
          return ele.classList.contains("image_blur")
        )
        if bflg
          $menu.find(".set_image_blur").remove()
        else
          $menu.find(".reset_image_blur").remove()

      app.defer ->
        $menu.removeClass("hidden")
        $.contextmenu($menu, e.clientX, e.clientY)
        return
      return

    #レスメニュー表示(内容上)
    .on "contextmenu", "article > .message", (e) ->
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
    .on "click", ".res_menu > li", (e) ->
      $this = $(@)
      $res = $this.closest("article")

      if $this.hasClass("copy_selection")
        selectedText = getSelection().toString()
        if selectedText.length > 0
          document.execCommand("copy")

      else if $this.hasClass("search_selection")
        selectedText = getSelection().toString()
        if selectedText.length > 0
          open("https://www.google.co.jp/search?q=#{selectedText}", "_blank")

      else if $this.hasClass("copy_id")
        app.clipboardWrite($res.attr("data-id"))

      else if $this.hasClass("copy_slip")
        app.clipboardWrite($res.attr("data-slip"))

      else if $this.hasClass("copy_trip")
        app.clipboardWrite($res.attr("data-trip"))

      else if $this.hasClass("add_selection_to_ngwords")
        selectedText = getSelection().toString()
        if selectedText.length > 0
          app.NG.add(selectedText)

      else if $this.hasClass("add_id_to_ngwords")
        app.NG.add($res.attr("data-id"))

      else if $this.hasClass("add_slip_to_ngwords")
        app.NG.add("Slip:" + $res.attr("data-slip"))

      else if $this.hasClass("jump_to_this")
        threadContent.scrollTo(+$res.find(".num").text(), true)

      else if $this.hasClass("res_to_this")
        write(message: ">>#{$res.find(".num").text()}\n")

      else if $this.hasClass("res_to_this2")
        write(message: """
        >>#{$res.find(".num").text()}
        #{$res.find(".message")[0].innerText.replace(/^/gm, '>')}\n
        """)

      else if $this.hasClass("add_writehistory")
        threadContent.addWriteHistory($res)
        threadContent.addClassWithOrg($res, "written")

      else if $this.hasClass("del_writehistory")
        threadContent.removeWriteHistory($res)
        threadContent.removeClassWithOrg($res, "written")

      else if $this.hasClass("toggle_aa_mode")
        $res.toggleClass("aa")

      else if $this.hasClass("res_permalink")
        open(app.safe_href(view_url + $res.find(".num").text()))

      # 画像をぼかす
      else if $this.hasClass("set_image_blur")
        for thumb in $res.find(".thumbnail[media-type='image'], .thumbnail[media-type='video']")
          threadContent.setImageBlur(thumb, true)

      # 画像のぼかしを解除する
      else if $this.hasClass("reset_image_blur")
        for thumb in $res.find(".thumbnail[media-type='image'], .thumbnail[media-type='video']")
          threadContent.setImageBlur(thumb, false)

      $this.parent().remove()
      return
    .on "mousedown", ".res_menu > li", (e) ->
      e.preventDefault()
      return

    # アンカーポップアップ
    .on "mouseenter", ".anchor, .name_anchor", (e) ->
      if @classList.contains("anchor")
        anchor = @innerHTML
      else
        anchor = @innerHTML.trim()

      popup_helper @, e, =>
        $popup = $("<div>")

        if @classList.contains("disabled")
          $("<div>", {
            text: @getAttribute("data-disabled_reason")
            class: "popup_disabled"
          })
          .appendTo($popup)
        else
          anchorData = app.util.Anchor.parseAnchor(anchor)

          if anchorData.targetCount >= 25
            $("<div>", {
              text: "指定されたレスの量が極端に多いため、ポップアップを表示しません"
              class: "popup_disabled"
            })
            .appendTo($popup)
          else if 0 < anchorData.targetCount
            tmp = $content[0].children
            for segment in anchorData.segments
              now = segment[0] - 1
              end = segment[1] - 1
              while now <= end
                if tmp[now]
                  $popup.append(tmp[now].cloneNode(true))
                else
                  break
                now++

        if $popup[0].children.length is 0
          $("<div>", {
            text: "対象のレスが見つかりません"
            class: "popup_disabled"
          })
          .appendTo($popup)

        $popup
      return

    #アンカーリンク
    .on "click", ".anchor", (e) ->
      e.preventDefault()
      return if @classList.contains("disabled")

      tmp = app.util.Anchor.parseAnchor(@innerHTML)
      target_res_num = tmp.segments[0]?[0]
      if target_res_num?
        threadContent.scrollTo(target_res_num, true)
      return

    #通常リンク
    .on "click mousedown", ".message a:not(.anchor)", (e) ->
      target_url = @href

      #http、httpsスキーム以外ならクリックを無効化する
      if not /// ^https?:// ///.test(target_url)
        e.preventDefault()
        return

      #.open_in_rcrxが付与されている場合、処理は他モジュールに任せる
      return if @classList.contains("open_in_rcrx")

      #read.crxで開けるURLかどうかを判定
      flg = false
      tmp = app.url.guess_type(target_url)
      #スレのURLはほぼ確実に判定できるので、そのままok
      if tmp.type is "thread"
        flg = true
      #2chタイプ以外の板urlもほぼ確実に判定できる
      else if tmp.type is "board" and tmp.bbs_type isnt "2ch"
        flg = true
      #2chタイプの板は誤爆率が高いので、もう少し細かく判定する
      else if tmp.type is "board" and tmp.bbs_type is "2ch"
        #2ch自体の場合の判断はguess_typeを信じて板判定
        if app.url.tsld(target_url) is "2ch.net"
          flg = true
        #ブックマークされている場合も板として判定
        else if app.bookmark.get(app.url.fix(target_url))
          flg = true
      #read.crxで開ける板だった場合は.open_in_rcrxを付与して再度クリックイベント送出
      if flg
        e.preventDefault()
        @classList.add("open_in_rcrx")
        app.defer =>
          $(@).trigger(e)
      return

    #リンク先情報ポップアップ
    .on "mouseenter", ".message a:not(.anchor)", (e) ->
      tmp = app.url.guess_type(@href)
      if tmp.type is "board"
        board_url = app.url.fix(@href)
        after = ""
      else if tmp.type is "thread"
        board_url = app.url.thread_to_board(@href)
        after = "のスレ"
      else
        return

      app.BoardTitleSolver.ask(board_url).done (title) =>
        popup_helper @, e, =>
          $("<div>", {class: "popup_linkinfo"})
            .append($("<div>", text: title + after))
        return
      return

    #IDポップアップ
    .on app.config.get("popup_trigger"), ".id.link, .id.freq, .anchor_id, .slip.link, .slip.freq, .trip.link, .trip.freq", (e) ->
      e.preventDefault()

      popup_helper @, e, =>
        id = ""
        slip = ""
        trip = ""
        if @classList.contains("id") or @classList.contains("anchor_id")
          id = @textContent
            .replace(/^id:/i, "ID:")
            .replace(/\(\d+\)$/, "")
            .replace(/\u25cf$/, "") #末尾●除去
        if @classList.contains("slip")
          slip = @textContent
            .replace(/^slip:/i, "")
            .replace(/\(\d+\)$/i, "")
        if @classList.contains("trip")
          trip = @textContent
            .replace(/\(\d+\)$/i, "")

        $popup = $("<div>", class: "popup_id")
        $article = $(@).closest("article")

        if $article.parent().is(".popup_id") and ($article.attr("data-id") is id or $article.attr("data-slip") is slip or $article.attr("data-trip") is trip)
          $("<div>", {
            text: "現在ポップアップしているIP/ID/SLIP/トリップです"
            class: "popup_disabled"
          })
          .appendTo($popup)
        else if threadContent.idIndex[id]
          for resNum in threadContent.idIndex[id]
            $popup.append($content[0].children[resNum - 1].cloneNode(true))
        else if threadContent.slipIndex[slip]
          for resNum in threadContent.slipIndex[slip]
            $popup.append($content[0].children[resNum - 1].cloneNode(true))
        else if threadContent.tripIndex[trip]
          for resNum in threadContent.tripIndex[trip]
            $popup.append($content[0].children[resNum - 1].cloneNode(true))
        else
          $("<div>", {
            text: "対象のレスが見つかりません"
            class: "popup_disabled"
          })
          .appendTo($popup)
        $popup
      return

    #リプライポップアップ
    .on app.config.get("popup_trigger"), ".rep", (e) ->
      popup_helper this, e, =>
        tmp = $content[0].children

        frag = document.createDocumentFragment()
        res_num = +$(@).closest("article").find(".num").text()
        for target_res_num in $view.data("threadContent").repIndex[res_num]
          frag.appendChild(tmp[target_res_num - 1].cloneNode(true))

        $popup = $("<div>").append(frag)
      return

    #何もないところをダブルクリックすると更新する
    .on "dblclick",".message", (e) ->
      if app.config.get("dblclick_reload") is "on" and !$(e.target).is("a, .thumbnail")
        $view.trigger "request_reload"
      return

    # VIDEOの再生/一時停止
    .on "click", ".thumbnail > video", (e) ->
      @preload = "auto" if @preload is "metadata"
      if @paused
        @play()
      else
        @pause()
      return

    # VIDEO再生中はマウスポインタを消す
    .on "mouseenter", ".thumbnail > video", (e) ->
      @addEventListener("play", (evt) ->
        app.view_thread._controlVideoCursor(@, evt.type)
        return
      , false)
      @addEventListener("timeupdate", (evt) ->
        app.view_thread._controlVideoCursor(@, evt.type)
        return
      , false)
      @addEventListener("pause", (evt) ->
        app.view_thread._controlVideoCursor(@, evt.type)
        return
      , false)
      @addEventListener("ended", (evt) ->
        app.view_thread._controlVideoCursor(@, evt.type)
        return
      , false)
      return

    # マウスポインタのリセット
    .on "mousemove", ".thumbnail > video", (e) ->
      app.view_thread._controlVideoCursor(@, e.type)
      return

    # 展開済みURLのポップアップ
    .on "mouseenter", ".has_expandedURL", (e) ->
      return if app.config.get("expand_short_url") isnt "popup"
      popup_helper this, e, =>
        targetUrl = this.href

        frag = document.createDocumentFragment()
        sib = this
        while true
          sib = sib.nextSibling
          if sib?.classList?.contains("expandedURL") and
             sib?.getAttribute("short-url") is targetUrl
            frag.appendChild(sib.cloneNode(true))
            break

        frag.querySelector(".expandedURL").classList.remove("hide_data")
        $popup = $("<div>").append(frag)
      return

    # リンクのコンテキストメニュー
    .on "contextmenu", ".message > a", (e) ->
      enableFlg = !(@classList.contains("anchor") or @classList.contains("anchor_id"))
      # リンクアドレスをNG登録
      app.contextMenus.update("add_link_to_ngwords", {
        enabled: enableFlg,
        onclick: (info, tab) =>
          app.NG.add(@href)
          return
      })
      return

    # 画像のコンテキストメニュー
    .on "contextmenu", "img, video, audio", (e) ->
      switch @tagName
        when "IMG"
          menuTitle = "画像のアドレスをNG指定"
          # リンクアドレスをNG登録
          app.contextMenus.update("add_link_to_ngwords", {
            enabled: true,
            onclick: (info, tab) =>
              app.NG.add(@parentNode.href)
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

    $jump_panel = $view.find(".jump_panel")

    $view.on "read_state_attached", ->
      already = {}
      for panel_item_selector, target_res_selector of jump_hoge
        res = $view[0].querySelector(target_res_selector)
        res_num = +res.querySelector(".num").textContent if res
        if res and not already[res_num]
          $jump_panel[0]
            .querySelector(panel_item_selector)
              .style.display = "block"
          already[res_num] = true
        else
          $jump_panel[0]
            .querySelector(panel_item_selector)
              .style.display = "none"
      return

    $jump_panel.on "click", (e) ->
      $target = $(e.target)

      for key, val of jump_hoge
        if $target.is(key)
          selector = val
          offset = if key in [".jump_not_read", "jump_new"] then -100 else 0
          break

      if selector
        res_num = $view.find(selector).index() + 1

        if typeof res_num is "number"
          threadContent.scrollTo(res_num, true, offset)
        else
          app.log("warn", "[view_thread] .jump_panel: ターゲットが存在しません")
      return
    return

  #検索ボックス
  do ->
    search_stored_scrollTop = null
    _isComposing = false
    $view
      .find(".searchbox")
        .on "compositionstart", ->
          _isComposing = true
          return
        .on "compositionend", ->
          _isComposing = false
          $(@).triggerHandler("input")
          return
        .on "input", ->
          return if _isComposing
          $content.triggerHandler("searchstart")
          if @value isnt ""
            if typeof search_stored_scrollTop isnt "number"
              search_stored_scrollTop = $content.scrollTop()

            hit_count = 0
            query = app.util.normalize(@value)

            scrollTop = $content.scrollTop()

            $view
              .find(".content")
                .addClass("searching")
                .children()
                  .each ->
                    if app.util.normalize(@textContent).includes(query)
                      @classList.add("search_hit")
                      hit_count++
                    else
                      @classList.remove("search_hit")
                    return
                .end()
                .attr("data-res_search_hit_count", hit_count)
              .end()
              .find(".hit_count")
                .text(hit_count + "hit")
                .removeClass("hidden")

            if scrollTop is $content.scrollTop()
              $content.triggerHandler("scroll")
          else
            $view
              .find(".content")
                .removeClass("searching")
                .removeAttr("data-res_search_hit_count")
                .find(".search_hit")
                  .removeClass("search_hit")
                .end()
              .end()
              .find(".hit_count")
                .addClass("hidden")
                .text("")

            if typeof search_stored_scrollTop is "number"
              $content.scrollTop(search_stored_scrollTop)
              search_stored_scrollTop = null

          $content.triggerHandler("searchfinish")
          return

        .on "keyup", (e) ->
          if e.which is 27 #Esc
            if @value isnt ""
              @value = ""
              $(@).triggerHandler("input")
          return

  #フッター表示処理
  do ->
    content = $content[0]

    scroll_left = 0
    update_scroll_left = ->
      scroll_left = content.scrollHeight - (content.offsetHeight + content.scrollTop)
      return

    #未読ブックマーク数表示
    next_unread =
      _elm: $view.find(".next_unread")[0]
      show: ->
        next = null

        bookmarks = app.bookmark.get_all().filter((bookmark) -> bookmark.type is "thread" and bookmark.url isnt view_url)

        #閲覧中のスレッドに新着が有った場合は優先して扱う
        if bookmark = app.bookmark.get(view_url)
          bookmarks.unshift(bookmark)

        for bookmark in bookmarks when bookmark.res_count?
          read = null

          if iframe = parent.document.querySelector("[data-url=\"#{bookmark.url}\"]")
            read = iframe.contentDocument.querySelectorAll(".content > article").length

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
          @_elm.href = app.safe_href(next.url)
          @_elm.textContent = text
          @_elm.setAttribute("data-title", next.title)
          @_elm.classList.remove("hidden")
        else
          @hide()
        return
      hide: ->
        @_elm.classList.add("hidden")
        return

    search_next_thread =
      _elm: $view.find(".search_next_thread")[0]
      show: ->
        if content.children.length >= 1000 or $view.find(".message_bar").hasClass("error")
          @_elm.classList.remove("hidden")
        else
          @hide()
        return
      hide: ->
        @_elm.classList.add("hidden")
        return

    update_thread_footer = ->
      if scroll_left <= 1
        next_unread.show()
        search_next_thread.show()
      else
        next_unread.hide()
        search_next_thread.hide()
      return

    $view
      .on "tab_selected view_loaded", ->
        update_thread_footer()
        return

      .find(".content").on "scroll", ->
        update_scroll_left()
        update_thread_footer()
        return
      .end()

      #次スレ検索
      .find(".button_tool_search_next_thread, .search_next_thread").on "click", (e) ->
        searchNextThread.show()
        searchNextThread.search(view_url, document.title)
        return

    app.message.add_listener "bookmark_updated", (message) ->
      if scroll_left is 0
        next_unread.show()
      return

    return

  # サムネイルロード時の追加処理
  $view.on "lazyload-load", ".thumbnail > a > img.image, .thumbnail > video", ->
    # Lazyloadを実行させるためにスクロールを発火
    if app.config.get("image_height_fix") is "off"
      $content.triggerHandler("scroll")
    # マウスオーバーによるズームの設定
    app.view_thread._setupHoverZoom(@)
    return

  # 逆スクロール時の位置合わせ
  $view.on "lazyload-load-reverse", ".thumbnail > a > img.image, .thumbnail > video", ->
    if app.config.get("image_height_fix") is "off"
      content = $content[0]
      mediaHeight = @offsetHeight
      switch @tagName
        when "IMG"
          mediaHeight -= 50   # loading.webp
        when "VIDEO"
          mediaHeight -= 150  # default Height
      content.scrollTop += mediaHeight
    # マウスオーバーによるズームの設定
    app.view_thread._setupHoverZoom(@)
    return

  #パンくずリスト表示
  do ->
    board_url = app.url.thread_to_board(view_url)
    app.BoardTitleSolver.ask(board_url).always (title) ->
      $view
        .find(".breadcrumb > li > a")
          .attr("href", board_url)
          .text(if title? then "#{title.replace(/板$/, "")}板" else "板")
          .addClass("hidden")
      # Windows版Chromeで描画が崩れる現象を防ぐため、わざとリフローさせる。
      app.defer ->
        $view.find(".breadcrumb > li > a").css("display", "inline-block")
        return
      return
    return

  return

readStateAttached = false

app.view_thread._draw = ($view, force_update, beforeAdd) ->
  deferred = $.Deferred()

  $view.addClass("loading")
  $reload_button = $view.find(".button_reload")
  $reload_button.addClass("disabled")
  content = $view.find(".content")[0]

  fn = (thread, error) ->
    d = $.Deferred()
    if error
      $view.find(".message_bar").addClass("error").html(thread.message)
    else
      $view.find(".message_bar").removeClass("error").empty()

    (d.reject(); return d.promise()) unless thread.res?

    document.title = thread.title

    $view.data("threadContent").addItem(thread.res.slice(content.children.length)).done( ->
      $view.data("lazyload").scan()

      $view.trigger("view_loaded")

      d.resolve(thread)
    )
    return d.promise()

  thread = new app.Thread($view.attr("data-url"))
  threadGetDeferred = null
  promiseThreadGet = thread.get(force_update)
  readStateAttached = false
  promiseThreadGet
    .progress ->
      threadGetDeferred = fn(thread, false)
      return
    .always ->
      threadGetDeferred = $.Deferred().resolve() unless threadGetDeferred
      threadGetDeferred.always ->
        promiseThreadGetState = promiseThreadGet.state() is "resolved"
        beforeAdd?(thread) if promiseThreadGetState
        threadGetDeferred = fn(thread, not promiseThreadGetState)
        .always ->
          $view.removeClass("loading")
          setTimeout((-> $reload_button.removeClass("disabled")), 1000 * 5)
          if threadGetDeferred.state() is "resolved" then deferred.resolve() else deferred.reject()
          return
        return
      return

  return deferred.promise()

app.view_thread._read_state_manager = ($view) ->
  view_url = $view.attr("data-url")
  board_url = app.url.thread_to_board(view_url)
  $content = $($view.find(".content"))
  content = $content[0]
  readStateAttached = false
  attachedReadState = {last: 0, read: 0, received: 0}

  #read_stateの取得
  get_read_state = $.Deferred (deferred) ->
    read_state_updated = false
    if (bookmark = app.bookmark.get(view_url))?.read_state?
      read_state = bookmark.read_state
      deferred.resolve({read_state, read_state_updated})
    else
      app.read_state.get(view_url).always (_read_state) ->
        read_state = _read_state or {received: 0, read: 0, last: 0, url: view_url}
        deferred.resolve({read_state, read_state_updated})
  .promise()

  #スレの描画時に、read_state関連のクラスを付与する
  $view.on "view_loaded", ->
    # 2回目の処理
    # 画像のロードにより位置がずれることがあるので初回処理時の内容を使用する
    if readStateAttached
      if attachedReadState.last > 0
        content.querySelector(".last")?.classList.remove("last")
        content.children[attachedReadState.last - 1]?.classList.add("last")
      if attachedReadState.read > 0
        content.querySelector(".read")?.classList.remove("read")
        content.children[attachedReadState.read - 1]?.classList.add("read")
      if attachedReadState.received > 0
        content.querySelector(".received")?.classList.remove("received")
        content.children[attachedReadState.received - 1]?.classList.add("received")
      readStateAttached = false
      $view.triggerHandler("read_state_attached")
      return
    # 初回の処理
    get_read_state.done ({read_state, read_state_updated}) ->
      content.querySelector(".last")?.classList.remove("last")
      content.querySelector(".read")?.classList.remove("read")
      content.querySelector(".received")?.classList.remove("received")

      # キャッシュの内容が古い場合にread_stateの内容の方が大きくなることがあるので
      # その場合は次回の処理に委ねる
      contentLength = content.children.length
      if read_state.last <= contentLength
        content.children[read_state.last - 1]?.classList.add("last")
        attachedReadState.last = -999
      else
        attachedReadState.last = read_state.last
      if read_state.read <= contentLength
        content.children[read_state.read - 1]?.classList.add("read")
        attachedReadState.read = -999
      else
        attachedReadState.read = read_state.read
      if read_state.received <= contentLength
        content.children[read_state.received - 1]?.classList.add("received")
        attachedReadState.received = -999
      else
        attachedReadState.received = read_state.received
      readStateAttached = true

      $view.triggerHandler("read_state_attached")
    return

  get_read_state.done ({read_state, read_state_updated}) ->
    scan = ->
      received = content.children.length
      #onbeforeunload内で呼び出された時に、この値が0になる場合が有る
      return if received is 0

      last = $view.data("threadContent").getRead()

      if read_state.received isnt received
        read_state.received = received
        read_state_updated = true

      if read_state.last isnt last
        read_state.last = last
        read_state_updated = true

      if read_state.read < read_state.last
        read_state.read = read_state.last
        read_state_updated = true
      return

    #アンロード時は非同期系の処理をzombie.htmlに渡す
    #そのためにlocalStorageに更新するread_stateの情報を渡す
    on_beforeunload = ->
      scan()
      if read_state_updated
        if localStorage.zombie_read_state?
          data = JSON.parse(localStorage["zombie_read_state"])
        else
          data = []
        data.push(read_state)
        localStorage["zombie_read_state"] = JSON.stringify(data)
      return

    window.addEventListener("beforeunload", on_beforeunload)

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
        app.read_state.set(read_state)
        app.bookmark.update_read_state(read_state)
        read_state_updated = false

    app.message.add_listener "request_update_read_state", (message) ->
      if not message.board_url? or message.board_url is board_url
        scan_and_save()
      return

    $view
      .find(".content")
        .on "scroll", ->
          scroll_flg = true
          return
      .end()

      .on "request_reload", ->
        scan_and_save()
        return

    window.addEventListener "view_unload", ->
      clearInterval(scroll_watcher)
      window.removeEventListener("beforeunload", on_beforeunload)
      #ロード中に閉じられた場合、スキャンは行わない
      return if $view.hasClass("loading")
      scan_and_save()
      return

# マウスオーバーによるズームの設定
app.view_thread._setupHoverZoom = (media) ->
  zoomFlg = false
  if app.config.get("hover_zoom_image") is "on" and media.tagName is "IMG"
    zoomRatio = app.config.get("zoom_ratio_image") + "%"
    zoomFlg = true
  else if app.config.get("hover_zoom_video") is "on" and media.tagName is "VIDEO"
    zoomRatio = app.config.get("zoom_ratio_video") + "%"
    zoomFlg = true
  if zoomFlg
    $(media).hover ->
      $(media.closest(".thumbnail")).addClass("zoom")
      $(media).css("zoom", zoomRatio)
    , ->
      $(media.closest(".thumbnail")).removeClass("zoom")
      $(media).css("zoom", "normal")
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
