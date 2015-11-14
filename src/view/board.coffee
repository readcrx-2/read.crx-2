app.boot "/view/board.html", ["board_title_solver"], (BoardTitleSolver) ->
  url = app.url.parse_query(location.href).q
  (alert("不正な引数です"); return) unless url?
  url = app.url.fix(url)
  opened_at = Date.now()

  $view = $(document.documentElement)
  $view.attr("data-url", url)

  $table = $("<table>")
  threadList = new UI.ThreadList($table[0], {
    th: ["bookmark", "title", "res", "unread", "heat", "createdDate"]
    searchbox: $view.find(".searchbox")[0]
  })
  $view.data("threadList", threadList)
  $view.data("selectableItemList", threadList)
  $table.table_sort()
  $table.find("th.res, th.unread, th.heat").attr("data-table_sort_type", "num")
  $table.appendTo(".content")

  $view
    .find("table")
      .each ->
        tmp = app.config.get("last_board_sort_config")
        if tmp?
          $(@).table_sort("update", JSON.parse(tmp))
        return
      .on "table_sort_updated", (e, ex) ->
        app.config.set("last_board_sort_config", JSON.stringify(ex))
        return
      #.sort_item_selectorが非表示の時、各種項目のソート切り替えを
      #降順ソート→昇順ソート→標準ソートとする
      .on "click", "th.table_sort_asc", ->
        return if $view.find(".sort_item_selector").is(":visible")
        $(@).closest("table").one "table_sort_before_update", (e) ->
          e.preventDefault()
          $(@).table_sort("update", {
            sort_attribute: "data-thread_number"
            sort_order: "asc"
            sort_type: "num"
          })
          return
        return

  new app.view.TabContentView(document.documentElement)

  BoardTitleSolver.ask({url}).always (title) ->
    if title
      document.title = title
    if app.config.get("no_history") is "off"
      app.History.add(url, title or url, opened_at)
    return

  load = ->
    $view.addClass("loading")

    deferred_get_read_state = app.read_state.get_by_board(url)

    deferred_board_get = $.Deferred (deferred) ->
      app.board.get url, (res) ->
        $message_bar = $view.find(".message_bar")
        if res.status is "error"
          $message_bar.addClass("error").html(res.message)
        else
          $message_bar.removeClass("error").empty()

        if res.data?
          deferred.resolve(res.data)
        else
          deferred.reject()
        return
      return

    $.when(deferred_get_read_state, deferred_board_get)
      .done (array_of_read_state, board) ->
        read_state_index = {}
        for read_state, key in array_of_read_state
          read_state_index[read_state.url] = key

        threadList.empty()
        threadList.addItem(
          for thread, thread_number in board
            title: thread.title
            url: thread.url
            res_count: thread.res_count
            created_at: thread.created_at
            read_state: array_of_read_state[read_state_index[thread.url]]
            thread_number: thread_number
            ng: thread.ng
        )

        $view.find("table").table_sort("update")
        return

      .always ->
        $view.removeClass("loading")
        $view.trigger("view_loaded")

        $needlessThread = $view.find(".needlessThread")
        if app.config.get("hide_needless_thread") is "on"
          $needlessThread.addClass("needless_thread_hide")
        else
          $needlessThread.removeClass("needless_thread_hide")

        $button = $view.find(".button_reload")
        $button.addClass("disabled")
        setTimeout((-> $button.removeClass("disabled")), 1000 * 5)
        app.message.send("request_update_read_state", {board_url: url})
        return
    return

  $view.on "request_reload", ->
    return if $view.hasClass("loading")
    return if $view.find(".button_reload").hasClass("disabled")
    load()
    return
  load()
  return
