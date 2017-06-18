app.boot "/view/sidemenu.html", ["bbsmenu"], (BBSMenu) ->
  $view = document.documentElement

  new app.view.PaneContentView($view)

  accordion = new UI.SelectableAccordion(document.body)
  app.DOMData.set($view, "accordion", accordion)
  app.DOMData.set($view, "selectableItemList", accordion)

  board_to_li = (board) ->
    $li = $__("li")
    $a = $__("a")
    $a.setClass("open_in_rcrx")
    $a.title = board.title
    $a.textContent = board.title
    $a.href = app.safeHref(board.url)
    $a.classList.add("https") if app.URL.getScheme(board.url) is "https"
    $li.addLast($a)
    $li

  entry_to_li = (entry) ->
    $li = board_to_li(entry)
    $li.addClass("bookmark")
    $li

  #スレタイ検索ボックス
  $view.C("search")[0].on "keydown", (e) ->
    if e.which is 27 #Esc
      @q.value = ""
    return
  $view.C("search")[0].on "submit", (e) ->
    e.preventDefault()
    app.message.send("open", {url: "search:#{@q.value}", new_tab: true})
    @q.value = ""
    return

  #ブックマーク関連
  do ->
    #初回ブックマーク表示構築
    app.bookmarkEntryList.ready.add ->
      frag = $_F()

      for entry in app.bookmarkEntryList.getAllBoards()
        frag.addLast(entry_to_li(entry))

      $view.$("ul:first-of-type").addLast(frag)
      accordion.update()
      return

    #ブックマーク更新時処理
    app.message.addListener "bookmark_updated", (message) ->
      return if message.entry.type isnt "board"

      $a = $view.$("li.bookmark > a[href=\"#{message.entry.url}\"]")

      switch message.type
        when "added"
          unless $a?
            $view.$("ul:first-of-type").addLast(entry_to_li(message.entry))
        when "removed"
          $a.parent().remove()
        when "title"
          $a.textContent = message.entry.title

  checkBbsmenuParam = (url) ->
    res = {net: false, sc: false, bbspink: false}
    tmp = ///http://kita.jikkyo.org/cbm/cbm.cgi/([\w\d\.]+)(?:/-all|-live2324)?(?:/=[\d\w=!&$()[\]{}]+)?/bbsmenuk?2?.html///.exec(url)
    if tmp
      param = tmp[1].split(".")
      for mode in param
        if mode in ["20","2r"]
          res.net = true
        else if mode is "sc"
          res.sc = true
        else if mode in ["p0", "p1"]
          res.bbspink = true
    return res

  #板覧関連
  do ->
    load = ->
      $view.addClass("loading")
      # 表示用板一覧の取得
      BBSMenu.get (res) ->
        # bbsmenuパラメータの確認
        modeFlag = checkBbsmenuParam(res.url)
        menuUpdate = (res.url is app.config.get("bbsmenu"))
        boardNet = []
        boardSc = []
        boardBbspink = []

        if menuUpdate
          for dom in $view.$$("h3:not(:first-of-type), ul:not(:first-of-type)")
            dom.remove()

        if res.message?
          app.message.send("notify", {
            message: res.message
            background_color: "red"
          })

        if res.data?
          frag = $_F()
          for category in res.data
            $h3 = $__("h3")
            $h3.textContent = category.title
            frag.addLast($h3)

            $ul = $__("ul")
            for board in category.board
              $ul.addLast(board_to_li(board))
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
          res.url is app.config.get("bbsmenu") and
          !(modeFlag.net and modeFlag.sc and modeFlag.bbspink)
        )
          loopCount = 0
          intervalID = setInterval( ->
            # 一旦待機させるため1回目をスキップ
            return if loopCount++ is 1
            # メニューの更新が終了するまで待機
            unless $view.hasClass("loading")
              clearInterval(intervalID)
              # bbsmenuパラメータの編集
              param = ""
              param += "20." unless modeFlag.net
              param += "sc." unless modeFlag.sc
              param += "p0." unless modeFlag.bbspink
              param += "99"
              otherUrl = "http://kita.jikkyo.org/cbm/cbm.cgi/#{param}/-all/bbsmenu.html"
              BBSMenu.get((res) ->
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
      return

    $view.on "request_reload", ->
      load()
      return

    load()
    return
  return
