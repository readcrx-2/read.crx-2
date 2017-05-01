app.boot "/view/board.html", ->
  try
    url = app.url.parseQuery(location.search).get("q")
  catch
    alert("不正な引数です")
    return
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

  write = (param) ->
    param or= {}
    param.title = document.title
    param.url = url
    open(
      "/write/submit_thread.html?#{app.url.buildQuery(param)}"
      undefined
      'width=600,height=400'
    )

  if app.url.tsld(url) in ["2ch.net", "shitaraba.net", "bbspink.com", "2ch.sc", "open2ch.net"]
    $view.find(".button_write").on "click", ->
      write()
      return
  else
    $view.find(".button_write").remove()

  # 現状ではしたらばはhttpsに対応していないので切り替えボタンを隠す
  if app.url.tsld(url) is "shitaraba.net"
    $view.find(".button_scheme").remove()

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

  app.BoardTitleSolver.ask(url).then (title) ->
    if title
      document.title = title
    if app.config.get("no_history") is "off"
      app.History.add(url, title or url, opened_at)
    return

  load = (ex) ->
    $view.addClass("loading")

    get_read_state_promise = app.ReadState.getByBoard(url)

    board_get_promise = new Promise( (resolve, reject) ->
      app.board.get url, (res) ->
        $message_bar = $view.find(".message_bar")
        if res.status is "error"
          $message_bar.addClass("error").html(res.message)
        else
          $message_bar.removeClass("error").empty()

        if res.data?
          resolve(res.data)
        else
          reject()
        return
      return
    )

    Promise.all([get_read_state_promise, board_get_promise])
      .then ([array_of_read_state, board]) ->
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
            need_less: thread.need_less
            is_net: thread.is_net
        )

        if ex?
          writeFlag = app.config.get("no_writehistory") is "off"
          if ex.kind is "own"
            if writeFlag
              app.WriteHistory.add(ex.thread_url, 1, ex.title, ex.name, ex.mail, ex.name, ex.mail, ex.mes, Date.now().valueOf())
            app.message.send("open", url: ex.thread_url, new_tab: true)
          else
            for thread in board
              if thread.title.includes(ex.title)
                if writeFlag
                  app.WriteHistory.add(thread.url, 1, ex.title, ex.name, ex.mail, ex.name, ex.mail, ex.mes, thread.created_at)
                app.message.send("open", url: thread.url, new_tab: true)
                break

        $view.find("table").table_sort("update")
        return

      .catch ->
        return
      .then ->
        $view.removeClass("loading")
        $view.trigger("view_loaded")

        $button = $view.find(".button_reload")
        $button.addClass("disabled")
        setTimeout((-> $button.removeClass("disabled")), 1000 * 5)
        app.message.send("request_update_read_state", {board_url: url})
        return
    return

  $view.on "request_reload", (e, ex) ->
    return if $view.hasClass("loading")
    return if $view.find(".button_reload").hasClass("disabled")
    load(ex)
    return
  load()

  #自動更新
  do ->
    auto_load = ->
      second = parseInt(app.config.get("auto_load_second_board"))
      if second >= 20000
        return setInterval( ->
          if app.config.get("auto_load_all") is "on" or $(".tab_container", parent.document).find("iframe[data-url=\"#{url}\"]").hasClass("tab_selected")
            $view.trigger "request_reload" unless $view.find(".content").hasClass("searching")
          return
        , second)
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
