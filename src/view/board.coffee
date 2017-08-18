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
  for dom in $table.$$("th.res, th.unread, th.heat")
    dom.dataset.tableSortType = "num"
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
  if app.URL.tsld(url) in ["2ch.net", "shitaraba.net", "bbspink.com", "2ch.sc", "open2ch.net"]
    $writeButton.on("click", ->
      write()
      return
    )
  else
    $writeButton.remove()

  # 現状ではしたらばはhttpsに対応していないので切り替えボタンを隠す
  if app.URL.tsld(url) is "shitaraba.net"
    $view.C("button_scheme")[0].remove()

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
      $table.on("table_sort_before_update", func = (e) ->
        $table.off("table_sort_before_update", func)
        e.preventDefault()
        tableSorter.update(
          sortAttribute: "data-thread-number"
          sortOrder: "asc"
          sortType: "num"
        )
        return
      )
      return
    )
    return

  new app.view.TabContentView($view)

  app.BoardTitleSolver.ask(url).then( (title) ->
    document.title = title if title
    if app.config.get("no_history") is "off"
      app.History.add(url, title or url, openedAt)
    return
  )

  load = (ex) ->
    $view.addClass("loading")
    app.message.send("request_update_read_state", {board_url: url})

    getReadStatePromise = ->
      return new Promise( (resolve, reject) ->
        # request_update_read_stateを待つ
        setTimeout(resolve, 150)
        return
      ).then( ->
        return app.ReadState.getByBoard(url)
      )
    getBoardPromise = Board.get(url).then( ({status, message, data}) ->
      $messageBar = $view.C("message_bar")[0]
      if status is "error"
        $messageBar.addClass("error")
        $messageBar.innerHTML = message
      else
        $messageBar.removeClass("error")
        $messageBar.removeChildren()

      if data?
        return data
      return Promise.reject()
    )

    Promise.all([getReadStatePromise, getBoardPromise]).then( ([readStateArray, board]) ->
      readStateIndex = {}
      for readState, key in readStateArray
        readStateIndex[readState.url] = key

      threadList.empty()
      item = []
      for thread, threadNumber in board
        readState = readStateArray[readStateIndex[thread.url]]
        if (bookmark = app.bookmark.get(thread.url))?.read_state?
          readState = bookmark.read_state
        thread.readState = readState
        thread.threadNumber = threadNumber
        item.push(thread)
      threadList.addItem(item)

      # スレ建て後の処理
      if ex?
        writeFlag = app.config.get("no_writehistory") is "off"
        if ex.kind is "own"
          if writeFlag
            app.WriteHistory.add(ex.thread_url, 1, ex.title, ex.name, ex.mail, ex.name, ex.mail, ex.mes, Date.now().valueOf())
          app.message.send("open", url: ex.thread_url, new_tab: true)
        else
          for thread in board when thread.title.includes(ex.title)
            if writeFlag
              app.WriteHistory.add(thread.url, 1, ex.title, ex.name, ex.mail, ex.name, ex.mail, ex.mes, thread.created_at)
            app.message.send("open", url: thread.url, new_tab: true)
            break

      tableSorter.update()
      return
    ).catch( -> return).then( ->
      $view.removeClass("loading")

      if $table.hasClass("table_search")
        $view.C("searchbox")[0].dispatchEvent(new Event("input"))

      $view.dispatchEvent(new Event("view_loaded"))

      $button = $view.C("button_reload")[0]
      $button.addClass("disabled")
      setTimeout( ->
        $button.removeClass("disabled")
        return
      , 1000 * 5)
      return
    )
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
