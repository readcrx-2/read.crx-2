app.boot("/view/bookmark.html", ["Board"], (Board) ->
  $view = document.documentElement

  $table = $__("table")
  tableHeaders = ["title", "boardTitle", "res", "unread", "heat", "createdDate"]
  threadList = new UI.ThreadList($table,
    th: tableHeaders
    bookmarkAddRm: true
    searchbox: $view.C("searchbox")[0]
  )
  app.DOMData.set($view, "threadList", threadList)
  app.DOMData.set($view, "selectableItemList", threadList)
  $$.C("content")[0].addLast($table)
  tableSorter = new UI.TableSorter($table)
  app.DOMData.set($table, "tableSorter", tableSorter)

  # ソート関連
  do ->
    DEFAULT_SORT = {sort_index: 3, sort_order: "desc"}
    lastSort = switch app.config.get("bookmark_sort_save_type")
      when "none" then DEFAULT_SORT
      when "board" then JSON.parse(app.config.get("last_board_sort_config"))
      when "bookmark" then JSON.parse(app.config.get("last_bookmark_sort_config"))
    if lastSort.sort_attribute is "data-thread-number"
      lastSort = DEFAULT_SORT
    tableSorter.updateSnake(lastSort)

    $table.on("table_sort_updated", ({detail}) ->
      app.config.set("last_bookmark_sort_config", JSON.stringify(detail))
      return
    )
    return

  new app.view.TabContentView($view)

  trUpdatedObserver = new MutationObserver( (records) ->
    for {target: $record} in records when $record.matches("tr.updated")
      $record.parent().addLast($record)
    return
  )

  #リロード時処理
  $view.on("request_reload", ({detail: auto = false} = {}) ->
    return if $view.hasClass("loading")
    $reloadButton = $view.C("button_reload")[0]
    return if $reloadButton.hasClass("disabled")

    $view.addClass("loading")
    $view.C("searchbox")[0].disabled = true
    $loadingOverlay = $view.C("loading_overlay")[0]

    $reloadButton.addClass("disabled")

    trUpdatedObserver.observe($view.T("tbody")[0],
      subtree: true
      attributes: true
      attributeFilter: ["class"]
    )

    boardList = new Set()
    boardThreadTable = new Map()
    for {url} in app.bookmark.getAllThreads()
      boardUrl = app.URL.threadToBoard(url)
      boardList.add(boardUrl)
      if boardThreadTable.has(boardUrl)
        boardThreadTable.get(boardUrl).push(url)
      else
        boardThreadTable.set(boardUrl, [url])

    count =
      all: boardList.size
      success: 0
      error: 0

    loadingServer = new Set()

    fn = (res) ->
      if res?
        loadingServer.delete(app.URL.getDomain(@prev))
        status = if res.status is "success" then "success" else "error"
        count[status]++
        if status is "error"
          for board in boardThreadTable.get(@prev)
            app.message.send("bookmark_updated", {type: "errored", bookmark: {type: "thread", url: board}})
        else
          for board in boardThreadTable.get(@prev)
            app.message.send("bookmark_updated", {type: "updated", bookmark: {type: "thread", url: board}})

      if count.all is count.success + count.error
        #更新完了
        #ソート後にブックマークが更新されてしまう場合に備えて、少し待つ
        do ->
          await app.wait(500)
          tableSorter.clearSortClass()
          for tr in $view.$$("tr:not(.updated)")
            tr.parent().addLast(tr)
          trUpdatedObserver.disconnect()
          $view.removeClass("loading")
          if app.config.isOn("auto_bookmark_notify") and auto
            notify()
          $view.C("searchbox")[0].disabled = false
          await app.wait(10 * 1000)
          $reloadButton.removeClass("disabled")
          return
      # 同一サーバーへの最大接続数: 1
      for board from boardList
        server = app.URL.getDomain(board)
        continue if loadingServer.has(server)
        loadingServer.add(server)
        boardList.delete(board)
        Board.get(board).then(fn.bind(prev: board))
        fn()
        break

      #ステータス表示更新
      $loadingOverlay.C("success")[0].textContent = count.success
      $loadingOverlay.C("error")[0].textContent = count.error
      $loadingOverlay.C("pending")[0].textContent = count.all - count.success - count.error
      return

    fn()
    return
  )

  getPromises = app.bookmark.getAllThreads().map( ({
    title
    url
    resCount = 0
    readState = {url: url, read: 0, received: 0, last: 0}
    expired
  }) ->
    urlObj = new app.URL.URL(url)
    boardUrlObj = urlObj.toBoard()
    try
      boardTitle = await app.BoardTitleSolver.ask(boardUrlObj)
    catch
      boardTitle = ""
    threadList.addItem({
      title
      url
      resCount
      readState
      createdAt: /\/(\d+)\/$/.exec(urlObj.pathname)[1] * 1000
      expired
      boardUrl: boardUrlObj.href
      boardTitle
      isHttps: (urlObj.protocol is "https:")
    })
    return
  )

  do ->
    await Promise.all(getPromises)
    app.message.send("request_update_read_state")
    tableSorter.update()

    $view.emit(new Event("view_loaded"))
    return

  titleIndex = tableHeaders.indexOf("title")
  resIndex = tableHeaders.indexOf("res")
  unreadIndex = tableHeaders.indexOf("unread")
  # 新着通知
  notify = ->
    notifyStr = ""
    for tr in $view.$$("tr.updated")
      tds = tr.T("td")
      title = tds[titleIndex].textContent
      if title.length >= 10
        title = title.slice(0, 15-3) + "..."
      before = parseInt(tds[resIndex].dataset.beforeres)
      after = parseInt(tds[resIndex].textContent)
      unreadRes = tds[unreadIndex].textContent
      if after > before
        notifyStr += "タイトル: #{title}  新規: #{after - before}  未読: #{unreadRes}\n"
    if notifyStr isnt ""
      new app.Notification("ブックマークの更新", notifyStr, "bookmark", "bookmark")
    return
  return
)
