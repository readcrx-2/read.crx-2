app.boot "/view/bookmark.html", ["board"], (Board) ->
  $view = document.documentElement

  $table = $__("table")
  threadList = new UI.ThreadList($table, {
    th: ["title", "boardTitle", "res", "unread", "heat", "createdDate"]
    bookmarkAddRm: true
    searchbox: $view.C("searchbox")[0]
  })
  app.DOMData.set($view, "threadList", threadList)
  app.DOMData.set($view, "selectableItemList", threadList)
  $$.C("content")[0].addLast($table)
  for dom in $table.$$("th.res, th.unread, th.heat")
    dom.dataset.tableSortType = "num"
  $table.$("th.unread").addClass("table_sort_desc")
  tableSorter = new UI.TableSorter($table)
  app.DOMData.set($table, "tableSorter", tableSorter)

  new app.view.TabContentView($view)

  trUpdatedObserver = new MutationObserver (records) ->
    for record in records when record.target.matches("tr.updated")
      record.target.parent().addLast(record.target)
    return

  #リロード時処理
  $view.on "request_reload", (e) ->
    auto = e.detail ? false
    return if $view.hasClass("loading")
    $reload_button = $view.C("button_reload")[0]
    return if $reload_button.hasClass("disabled")

    $view.addClass("loading")
    $view.C("searchbox")[0].disabled = true
    $loading_overlay = $view.C("loading_overlay")[0]

    $reload_button.addClass("disabled")

    trUpdatedObserver.observe($view.T("tbody")[0], {
      subtree: true
      attributes: true
      attributeFilter: ["class"]
    })

    board_list = new Set()
    board_thread_table = new Map()
    for bookmark in app.bookmarkEntryList.getAllThreads()
      board_url = app.URL.threadToBoard(bookmark.url)
      board_list.add(board_url)
      if board_thread_table.has(board_url)
        board_thread_table.get(board_url).push(bookmark.url)
      else
        board_thread_table.set(board_url, [bookmark.url])

    count =
      all: board_list.size
      success: 0
      error: 0

    loadingServer = new Set()

    fn = (res) ->
      if res?
        loadingServer.delete(app.URL.getDomain(@prev))
        status = if res.status is "success" then "success" else "error"
        count[status]++
        if status is "error"
          for board in board_thread_table.get(@prev)
            app.message.send("bookmark_updated", {type: "errored", bookmark: {type: "thread", url: board}, entry: {type: "thread"}})

      if count.all is count.success + count.error
        #更新完了
        #ソート後にブックマークが更新されてしまう場合に備えて、少し待つ
        setTimeout(->
          $view.C("table_sort_desc")[0]?.removeClass("table_sort_desc")
          $view.C("table_sort_asc")[0]?.removeClass("table_sort_asc")
          for tr in $view.$$("tr:not(.updated)")
            tr.parent().addLast(tr)
          trUpdatedObserver.disconnect()
          $view.removeClass("loading")
          if app.config.get("auto_bookmark_notify") is "on" and auto
            notify()
          $view.C("searchbox")[0].disabled = false
          setTimeout(->
            $reload_button.removeClass("disabled")
          , 1000 * 10)
          return
        , 500)
      # 同一サーバーへの最大接続数: 1
      for board from board_list.values()
        server = app.URL.getDomain(board)
        continue if loadingServer.has(server)
        loadingServer.add(server)
        board_list.delete(board)
        Board.get(board).then(fn.bind(prev: board))
        fn()
        break

      #ステータス表示更新
      $loading_overlay.C("success")[0].textContent = count.success
      $loading_overlay.C("error")[0].textContent = count.error
      $loading_overlay.C("pending")[0].textContent = count.all - count.success - count.error
      return

    fn()
    return

  getPromises = app.bookmarkEntryList.getAllThreads().map( (a) ->
    boardUrl = app.URL.threadToBoard(a.url)
    return app.BoardTitleSolver.ask(boardUrl).then(fn = (boardName) ->
      threadList.addItem(
        title: a.title
        url: a.url
        resCount: a.resCount or 0
        readState: a.readState or {url: a.url, read: 0, received: 0, last: 0}
        createdAt: /\/(\d+)\/$/.exec(a.url)[1] * 1000
        expired: a.expired
        boardUrl: boardUrl
        boardTitle: boardName ? ""
        isHttps: (app.URL.getScheme(a.url) is "https")
      )
      return
    , fn)
  )

  Promise.all(getPromises).then( ->
    app.message.send("request_update_read_state", {})
    tableSorter.update()

    $view.dispatchEvent(new Event("view_loaded"))
  )

  # 通知
  notify = ->
    notifyStr = ""
    for tr in $view.$$("tr.updated")
      tds = tr.T("td")
      title = tds[0].textContent
      if title.length >= 10
        title = title.slice(0, 15-3) + "..."
      before = parseInt(tds[2].dataset.beforeres)
      after = parseInt(tds[2].textContent)
      unreadRes = tds[3].textContent
      if after > before
        notifyStr += "タイトル: #{title}  新規: #{after - before}  未読: #{unreadRes}\n"
    if notifyStr isnt ""
      new app.Notification("ブックマークの更新", notifyStr, "bookmark", "bookmark")
    return
  return
