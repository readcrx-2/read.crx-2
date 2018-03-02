app.boot("/view/search.html", ["thread_search"], (ThreadSearch) ->
  try
    query = app.URL.parseQuery(location.search).get("query")
  catch
    alert("不正な引数です")
    return
  if app.URL.parseQuery(location.search).has("https")
    scheme = "https"
  else
    scheme = "http"

  openedAt = Date.now()

  $view = document.documentElement
  $view.dataset.url = "search:#{query}"
  $view.setAttr("scheme", scheme)

  $messageBar = $view.C("message_bar")[0]
  $buttonReload = $view.C("button_reload")[0]

  new app.view.TabContentView($view)

  document.title = "検索:#{query}"
  unless app.config.isOn("no_history")
    app.History.add($view.dataset.url, document.title, openedAt, "")

  $view.$(".button_link > a").href = "#{scheme}://dig.5ch.net/search?maxResult=500&keywords=#{encodeURIComponent(query)}"

  $table = $__("table")
  threadList = new UI.ThreadList($table,
    th: ["bookmark", "title", "boardTitle", "res", "heat", "createdDate"]
    searchbox: $view.C("searchbox")[0]
  )
  app.DOMData.set($view, "threadList", threadList)
  app.DOMData.set($view, "selectableItemList", threadList)
  tableSorter = new UI.TableSorter($table)
  app.DOMData.set($table, "tableSorter", tableSorter)
  for dom in $table.$$("th.res, th.heat")
    dom.dataset.tableSortType = "num"
  $$.C("content")[0].addFirst($table)

  threadSearch = new ThreadSearch(query)
  $tbody = $view.T("tbody")[0]

  load = ->
    return if $view.hasClass("loading")
    $view.addClass("loading")
    $buttonReload.addClass("disabled")
    $view.C("more")[0].textContent = "検索中"
    try
      result = await threadSearch.read()
      $messageBar.removeClass("error")
      $messageBar.removeChildren()

      for r in result
        r.url = app.URL.setScheme(r.url, scheme)
        r.isHttps = (scheme is "https")
      threadList.addItem(result)

      if $tbody.child().length is 0
        $tbody.addClass("body_empty")
      else
        empty = true
        for dom in $tbody.child() when dom.offsetHeight isnt 0
          empty = false
          break
        if empty
          $tbody.addClass("body_empty")
        else
          $tbody.removeClass("body_empty")

      $view.removeClass("loading")
    catch {message}
      $messageBar.addClass("error")
      $messageBar.textContent = message
      $view.removeClass("loading")

    $view.C("more")[0].addClass("hidden")
    app.defer5( ->
      $buttonReload.removeClass("disabled")
      return
    )
    return

  $buttonReload.on("click", ->
    return if $buttonReload.hasClass("disabled")
    threadList.empty()
    threadSearch = new ThreadSearch(query)
    load()
    return
  )

  window.on("view_unload", ->
    app.config.set("thread_search_last_mode", scheme)
    return
  )

  load()
  return
)
