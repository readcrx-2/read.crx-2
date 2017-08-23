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
    app.message.addListener("bookmark_updated", ({entry, type}) ->
      return if entry.type isnt "board"

      $a = $view.$("li.bookmark > a[href=\"#{entry.url}\"]")

      switch type
        when "added"
          unless $a?
            $view.$("ul:first-of-type").addLast(entryToLi(entry))
        when "removed"
          $a.parent().remove()
        when "title"
          $a.textContent = entry.title
      return
    )

  checkBbsmenuParam = (url) ->
    res = {net: false, sc: false, bbspink: false}
    tmp = ///http://kita.jikkyo.org/cbm/cbm.cgi/([\w\d\.]+)(?:/-all|-live2324)?(?:/=[\d\w=!&$()[\]{}]+)?/bbsmenuk?2?.html///.exec(url)
    return res unless tmp
    param = tmp[1].split(".")
    for mode in param
      switch mode
        when "20", "2r" then res.net = true
        when "sc" then res.sc = true
        when "p0", "p1" then res.bbspink = true
      break if res.net and res.sc and res.bbspink
    return res

  #板覧関連
  do ->
    load = ->
      $view.addClass("loading")
      # 表示用板一覧の取得
      BBSMenu.get( ({url, message, data}) ->
        # bbsmenuパラメータの確認
        modeFlag = checkBbsmenuParam(url)
        menuUpdate = (url is app.config.get("bbsmenu"))
        boardNet = []
        boardSc = []
        boardBbspink = []

        if menuUpdate
          for dom in $view.$$("h3:not(:first-of-type), ul:not(:first-of-type)")
            dom.remove()

        if message?
          app.message.send("notify",
            message: message
            background_color: "red"
          )

        if data?
          frag = $_F()
          for category in data
            $h3 = $__("h3")
            $h3.textContent = category.title
            frag.addLast($h3)

            $ul = $__("ul")
            for board in category.board
              $ul.addLast(boardToLi(board))
              if modeFlag.net and /// https?://\w+\.2ch\.net/\w+/.*? ///.test(board.url)
                boardNet.push(board)
              if modeFlag.sc and /// https?://\w+\.2ch\.sc/\w+/.*? ///.test(board.url)
                boardSc.push(board)
              if modeFlag.bbspink and /// https?://\w+\.bbspink\.com/\w+/.*? ///.test(board.url)
                boardBbspink.push(board)
            frag.addLast($ul)

        # 2ch.netと2ch.sc及びbbspinkの板・サーバー情報の登録
        app.URL.pushBoardToServerInfo(boardNet, boardSc, boardBbspink)
        boardNet = []     # メモリ解放用
        boardSc = []      # 　　〃
        boardBbspink = [] # 　　〃

        if menuUpdate
          document.body.addLast(frag)
          accordion.update()

        # 2ch.netと2ch.sc及びbbspinkのサーバー情報の取得
        if (
          url is app.config.get("bbsmenu") and
          !(modeFlag.net and modeFlag.sc and modeFlag.bbspink)
        )
          loopCount = 0
          intervalID = setInterval( ->
            # 一旦待機させるため1回目をスキップ
            return if loopCount++ is 1
            # メニューの更新が終了するまで待機
            return if $view.hasClass("loading")
            clearInterval(intervalID)
            # bbsmenuパラメータの編集
            param = ""
            param += "20." unless modeFlag.net
            param += "sc." unless modeFlag.sc
            param += "p0." unless modeFlag.bbspink
            param += "99"
            otherUrl = "http://kita.jikkyo.org/cbm/cbm.cgi/#{param}/-all/bbsmenu.html"
            BBSMenu.get( ->
              # 表示用一覧取得時のコールバックが実行されるので何もしない
              return
            , false, otherUrl)
            return
          , 1000)
        else if BBSMenu.boardTableCallbacks
          BBSMenu.boardTableCallbacks.call()
          BBSMenu.boardTableCallbacks = null

        $view.removeClass("loading")
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
