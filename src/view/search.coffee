app.boot "/view/search.html", ["euc_jp_escape", "thread_search"], (euc_jp_escape, ThreadSearch) ->
  query = app.url.parse_query(location.href).query

  unless query?
    alert("不正な引数です")
    return

  opened_at = Date.now()

  $view = $(document.documentElement)
  $view.attr("data-url", "search:#{query}")

  $message_bar = $view.find(".message_bar")
  $button_reload = $view.find(".button_reload")

  new app.view.TabContentView(document.documentElement)

  document.title = "検索:#{query}"
  if app.config.get("no_history") is "off"
    app.History.add($view.attr("data-url"), document.title, opened_at)

  $view.find(".button_link > a").attr("href", "http://search.2ch.net/search?q=" + encodeURIComponent(query))

  $table = $("<table>")
  threadList = new UI.ThreadList($table[0], {
    th: ["bookmark", "title", "boardTitle", "res", "heat", "createdDate"]
    searchbox: $view.find(".searchbox")[0]
  })
  $view.data("threadList", threadList)
  $view.data("selectableItemList", threadList)
  $table.prependTo(".content")

  thread_search = new ThreadSearch(query)
  $tbody = $view.find("tbody")

  load = ->
    return if $view.hasClass("loading")
    $view.addClass("loading")
    $button_reload.addClass("disabled")
    $view.find(".more").text("検索中")
    thread_search.read()
      .done (result) ->
        $message_bar.removeClass("error").empty()

        threadList.addItem(result)

        $needlessThread = $view.find(".needlessThread")
        if app.config.get("hide_needless_thread") is "on"
          $needlessThread.addClass("needless_thread_hide")
        else
          $needlessThread.removeClass("needless_thread_hide")

        if $tbody.children().size() is 0 || $tbody.children().css("display") is "none"
          $tbody.addClass("body_empty")
        else
          $tbody.removeClass("body_empty")

        $view.removeClass("loading")
        return
      .fail (res) ->
        $message_bar.addClass("error").text(res.message)
        $view.removeClass("loading")
        return
      .always ->
        $view.find(".more").hide()
        setTimeout((-> $button_reload.removeClass("disabled"); return), 5000)
        return
    return

  $button_reload.on "click", ->
    return if $button_reload.hasClass("disabled")
    threadList.empty()
    thread_search = new ThreadSearch(query)
    load()
    return

  load()
  return
