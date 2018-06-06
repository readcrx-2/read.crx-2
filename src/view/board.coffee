app.boot("/view/board.html", ["board"], (Board) ->
  try
    url = app.URL.parseQuery(location.search).get("q")
  catch
    alert("不正な引数です")
    return
  url = app.URL.fix(url)
  openedAt = Date.now()

  $view = document.documentElement
  $view.dataset.url = url

  $table = $__("table")
  threadList = new UI.ThreadList($table,
    th: ["bookmark", "title", "res", "unread", "heat", "createdDate"]
    searchbox: $view.C("searchbox")[0]
  )
  app.DOMData.set($view, "threadList", threadList)
  app.DOMData.set($view, "selectableItemList", threadList)
  tableSorter = new UI.TableSorter($table)
  app.DOMData.set($table, "tableSorter", tableSorter)
  $$.C("content")[0].addLast($table)

  write = (param = {}) ->
    param.title = document.title
    param.url = url
    windowX = app.config.get("write_window_x")
    windowY = app.config.get("write_window_y")
    open(
      "/write/submit_thread.html?#{app.URL.buildQuery(param)}"
      undefined
      "width=600,height=300,left=#{windowX},top=#{windowY}"
    )
    return

  $writeButton = $view.C("button_write")[0]
  if app.URL.tsld(url) in ["5ch.net", "shitaraba.net", "bbspink.com", "2ch.sc", "open2ch.net"]
    $writeButton.on("click", ->
      write()
      return
    )
  else
    $writeButton.remove()

  # ソート関連
  do ->
    lastBoardSort = app.config.get("last_board_sort_config")
    tableSorter.updateSnake(JSON.parse(lastBoardSort)) if lastBoardSort?

    $table.on("table_sort_updated", ({detail}) ->
      app.config.set("last_board_sort_config", JSON.stringify(detail))
      return
    )
    #.sort_item_selectorが非表示の時、各種項目のソート切り替えを
    #降順ソート→昇順ソート→標準ソートとする
    $table.on("click", ({target}) ->
      return unless target.tagName is "TH" and target.hasClass("table_sort_asc")
      return unless $view.C("sort_item_selector")[0].offsetWidth is 0
      $table.on("table_sort_before_update", (e) ->
        e.preventDefault()
        tableSorter.update(
          sortAttribute: "data-thread-number"
          sortOrder: "asc"
        )
        return
      , once: true)
      return
    )
    return

  new app.view.TabContentView($view)

  do ->
    title = await app.BoardTitleSolver.ask(url)
    document.title = title if title
    unless app.config.isOn("no_history")
      app.History.add(url, title or url, openedAt, title or url)
    return

  load = (ex) ->
    $view.addClass("loading")
    app.message.send("request_update_read_state", {board_url: url})

    getReadStatePromise = do ->
      # request_update_read_stateを待つ
      await new Promise( (resolve) ->
        setTimeout(resolve, 150)
        return
      )
      return await app.ReadState.getByBoard(url)
    getBoardPromise = do ->
      {status, message, data} = await Board.get(url)
      $messageBar = $view.C("message_bar")[0]
      if status is "error"
        $messageBar.addClass("error")
        $messageBar.innerHTML = message
      else
        $messageBar.removeClass("error")
        $messageBar.removeChildren()
      return data if data?
      throw new Error("板の取得に失敗しました")
      return

    try
      [readStateArray, board] = await Promise.all([getReadStatePromise, getBoardPromise])
      readStateIndex = {}
      for readState, key in readStateArray
        readStateIndex[readState.url] = key

      threadList.empty()
      item = []
      for thread, threadNumber in board
        readState = readStateArray[readStateIndex[thread.url]]
        if (bookmark = app.bookmark.get(thread.url))?.readState?
          {readState} = bookmark
        thread.readState = readState
        thread.threadNumber = threadNumber
        item.push(thread)
      threadList.addItem(item)

      # スレ建て後の処理
      if ex?
        writeFlag = (not app.config.isOn("no_writehistory"))
        if ex.kind is "own"
          if writeFlag
            app.WriteHistory.add(
              url: ex.thread_url
              res: 1
              title: ex.title
              name: ex.name
              mail: ex.mail
              message: ex.mes
              date: Date.now().valueOf()
            )
          app.message.send("open", url: ex.thread_url, new_tab: true)
        else
          for thread in board when thread.title.includes(ex.title)
            if writeFlag
              app.WriteHistory.add(
                url: thread.url
                res: 1
                title: ex.title
                name: ex.name
                mail: ex.mail
                message: ex.mes
                date: thread.createdAt
              )
            app.message.send("open", url: thread.url, new_tab: true)
            break

      tableSorter.update()

    $view.removeClass("loading")

    if $table.hasClass("table_search")
      $view.C("searchbox")[0].dispatchEvent(new Event("input"))

    $view.dispatchEvent(new Event("view_loaded"))

    $button = $view.C("button_reload")[0]
    $button.addClass("disabled")
    await app.defer5()
    $button.removeClass("disabled")
    return

  $view.on("request_reload", ({detail}) ->
    return if $view.hasClass("loading")
    return if $view.C("button_reload")[0].hasClass("disabled")
    load(detail)
    return
  )
  load()
  return
)
