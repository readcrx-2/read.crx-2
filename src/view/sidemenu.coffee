app.boot("/view/sidemenu.html", ["bbsmenu"], (BBSMenu) ->
  $view = document.documentElement

  new app.view.PaneContentView($view)

  accordion = new UI.SelectableAccordion(document.body)
  app.DOMData.set($view, "accordion", accordion)
  app.DOMData.set($view, "selectableItemList", accordion)

  boardToLi = (board) ->
    $li = $__("li")
    $a = $__("a")
    $a.setClass("open_in_rcrx")
    $a.title = board.title
    $a.textContent = board.title
    $a.href = app.safeHref(board.url)
    $a.addClass("https") if app.URL.getScheme(board.url) is "https"
    $li.addLast($a)
    return $li

  entryToLi = (entry) ->
    $li = boardToLi(entry)
    $li.addClass("bookmark")
    return $li

  #スレタイ検索ボックス
  $view.C("search")[0].on("keydown", ({which}) ->
    if which is 27 #Esc
      @q.value = ""
    return
  )
  $view.C("search")[0].on("submit", (e) ->
    e.preventDefault()
    app.message.send("open", {url: "search:#{@q.value}", new_tab: true})
    @q.value = ""
    return
  )

  #ブックマーク関連
  do ->
    #初回ブックマーク表示構築
    app.bookmarkEntryList.ready.add( ->
      frag = $_F()

      for entry in app.bookmarkEntryList.getAllBoards()
        frag.addLast(entryToLi(entry))

      $view.$("ul:first-of-type").addLast(frag)
      accordion.update()
      return
    )

    #ブックマーク更新時処理
    app.message.on("bookmark_updated", ({type, bookmark}) ->
      return if bookmark.type isnt "board"

      $a = $view.$("li.bookmark > a[href=\"#{bookmark.url}\"]")

      switch type
        when "added"
          unless $a?
            $view.$("ul:first-of-type").addLast(entryToLi(bookmark))
        when "removed"
          $a.parent().remove()
        when "title"
          $a.textContent = bookmark.title
      return
    )

  #板覧関連
  do ->
    load = ->
      $view.addClass("loading")
      # 表示用板一覧の取得
      BBSMenu.get()
      BBSMenu.target.on("change", ({detail: {status, menu, message}}) ->
        for dom in $view.$$("h3:not(:first-of-type), ul:not(:first-of-type)")
          dom.remove()
        if status is "error"
          app.message.send("notify",
            message: message
            background_color: "red"
          )
        if menu?
          frag = $_F()
          for category in menu
            $h3 = $__("h3")
            $h3.textContent = category.title
            frag.addLast($h3)

            $ul = $__("ul")
            for board in category.board
              $ul.addLast(boardToLi(board))
            frag.addLast($ul)
        document.body.addLast(frag)
        accordion.update()
        $view.removeClass("loading")

        # 2ch.net/2ch.sc/bbspinkの板/サーバー情報の登録
        await app.URL.pushServerInfo(app.config.get("bbsmenu"), menu)
        BBSMenu.triggerCreatedServerInfo()
        return
      )
      return

    $view.on("request_reload", ->
      load()
      return
    )

    load()
    return
  return
)
