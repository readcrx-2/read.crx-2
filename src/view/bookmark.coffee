app.boot "/view/bookmark.html", ->
  $view = $(document.documentElement)

  $table = $("<table>")
  threadList = new UI.ThreadList($table[0], {
    th: ["title", "res", "unread", "heat", "createdDate"]
    bookmarkAddRm: true
    searchbox: $view.find(".searchbox")[0]
  })
  $view.data("threadList", threadList)
  $view.data("selectableItemList", threadList)
  $table.appendTo(".content")
  $table.find("th.res, th.unread, th.heat").attr("data-table_sort_type", "num")
  $table.find("th.unread").addClass("table_sort_desc")
  $table.table_sort()

  new app.view.TabContentView(document.documentElement)

  trUpdatedObserver = new MutationObserver (records) ->
    for record in records
      if record.target.webkitMatchesSelector("tr.updated")
        record.target.parentNode.appendChild(record.target)
    return

  #リロード時処理
  $view.on "request_reload", ->
    return if $view.hasClass("loading")
    $reload_button = $view.find(".button_reload")
    return if $reload_button.hasClass("disabled")

    $view.addClass("loading")
    $view.find(".searchbox").prop("disabled", true)
    $loading_overlay = $view.find(".loading_overlay")

    $reload_button.addClass("disabled")

    trUpdatedObserver.observe($view[0].querySelector("tbody"), {
      subtree: true
      attributes: true
      attributeFilter: ["class"]
    })

    board_list = new Set()
    board_thread_table = new Map()
    for bookmark in app.bookmarkEntryList.getAllThreads()
      board_url = app.url.thread_to_board(bookmark.url)
      board_list.add(board_url)
      if board_thread_table.has(board_url)
        board_thread_table.get(board_url).push(bookmark.url)
      else
        board_thread_table.set(board_url, [bookmark.url])

    count =
      all: board_list.size
      loading: 0
      success: 0
      error: 0

    loadingServer = {}

    fn = (res) ->
      if res?
        delete loadingServer[app.url.getDomain(@prev)]
        count.loading--
        status = if res.status is "success" then "success" else "error"
        count[status]++
        if status is "error"
          for board in board_thread_table.get(@prev)
            app.message.send("bookmark_updated", {type: "errored", bookmark: {type: "thread", url: board}, entry: {type: "thread"}})

      if count.all is count.success + count.error
        #更新完了
        #ソート後にブックマークが更新されてしまう場合に備えて、少し待つ
        setTimeout(->
          $view
            .find(".table_sort_desc, .table_sort_asc")
              .removeClass("table_sort_desc table_sort_asc")
          for tr in $view[0].querySelectorAll("tr:not(.updated)")
            tr.parentNode.appendChild(tr)
          trUpdatedObserver.disconnect()
          $view.removeClass("loading")
          $view.find(".searchbox").prop("disabled", false)
          setTimeout(->
            $reload_button.removeClass("disabled")
          , 1000 * 10)
          return
        , 500)
      # 合計最大同時接続数: 2
      # 同一サーバーへの最大接続数: 1
      else if count.loading < 2
        keys = board_list.values()
        while !keys.done
          current = keys.next().value
          server = app.url.getDomain(current)
          continue if loadingServer[server]
          loadingServer[server] = true
          board_list.delete(current)
          count.loading++
          app.board.get(current, fn.bind(prev: current))
          fn()
          break

      #ステータス表示更新
      $loading_overlay.find(".success").text(count.success)
      $loading_overlay.find(".error").text(count.error)
      $loading_overlay.find(".loading").text(count.loading)
      $loading_overlay.find(".pending").text(count.all - count.success - count.error - count.loading)
      return

    fn()
    return

  threadList.addItem(
    for a in app.bookmarkEntryList.getAllThreads()
      title: a.title
      url: a.url
      res_count: a.resCount or 0
      read_state: a.readState or {url: a.url, read: 0, received: 0, last: 0}
      created_at: /\/(\d+)\/$/.exec(a.url)[1] * 1000
      expired: a.expired
  )

  app.message.send("request_update_read_state", {})
  $table.table_sort("update")

  $view.trigger("view_loaded")

  #自動更新
  do ->
    auto_load = ->
      if parseInt(app.config.get("auto_load_second_board")) >= 20000
        return setInterval ->
          if app.config.get("auto_load_all") is "on" or $(".tab_container", parent.document).find("iframe[data-url=\"bookmark\"]").hasClass("tab_selected")
            $view.trigger "request_reload" unless $view.find(".content").hasClass("searching")
          return
        , parseInt(app.config.get("auto_load_second_board"))
      return

    auto_load_interval = auto_load()

    app.message.add_listener "config_updated", (message) ->
      if message.key is "auto_load_second_board"
        clearInterval auto_load_interval
        auto_load_interval = auto_load()
      return

    window.addEventListener "view_unload", ->
      clearInterval(auto_load_interval)
      return
  return
