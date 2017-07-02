app.boot "/view/search.html", ["thread_search"], (ThreadSearch) ->
  try
    query = app.URL.parseQuery(location.search).get("query")
  catch
    alert("不正な引数です")
    return

  opened_at = Date.now()

  $view = document.documentElement
  $view.dataset.url = "search:#{query}"

  $message_bar = $view.C("message_bar")[0]
  $button_reload = $view.C("button_reload")[0]

  new app.view.TabContentView($view)

  document.title = "検索:#{query}"
  if app.config.get("no_history") is "off"
    app.History.add($view.dataset.url, document.title, opened_at)

  $view.$(".button_link > a").href = "http://dig.2ch.net/search?maxResult=500&keywords=#{encodeURIComponent(query)}"

  $table = $__("table")
  threadList = new UI.ThreadList($table, {
    th: ["bookmark", "title", "boardTitle", "res", "heat", "createdDate"]
    searchbox: $view.C("searchbox")[0]
  })
  app.DOMData.set($view, "threadList", threadList)
  app.DOMData.set($view, "selectableItemList", threadList)
  $$.C("content")[0].addFirst($table)

  thread_search = new ThreadSearch(query)
  $tbody = $view.T("tbody")[0]

  load = ->
    return if $view.hasClass("loading")
    $view.addClass("loading")
    $button_reload.addClass("disabled")
    $view.C("more")[0].textContent = "検索中"
    thread_search.read()
      .then (result) ->
        $message_bar.removeClass("error")
        $message_bar.removeChildren()

        threadList.addItem(result)

        if $tbody.child().length is 0
          $tbody.addClass("body_empty")
        else
          empty = false
          for dom in $tbody.child() when dom.style.display is "none"
            empty = true
            break
          if empty
            $tbody.addClass("body_empty")
          else
            $tbody.removeClass("body_empty")

        $view.removeClass("loading")
        return
      , (res) ->
        $message_bar.addClass("error")
        $message_bar.textContent = res.message
        $view.removeClass("loading")
        return
      .then ->
        $view.C("more")[0].addClass("hidden")
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
