app.boot("/view/search.html", ["ThreadSearch"], (ThreadSearch) ->
  try
    queries = app.URL.parseQuery(location.search)
    query = queries.get("query")
  catch
    alert("不正な引数です")
    return
  scheme = if queries.has("https") then "https" else "http"
  openedAt = Date.now()

  $view = document.documentElement
  $view.dataset.url = "search:#{query}"
  $view.setAttr("scheme", scheme)

  $content = $$.C("content")[0]
  $messageBar = $view.C("message_bar")[0]
  $buttonReload = $view.C("button_reload")[0]

  $table = $__("table")
  threadList = new UI.ThreadList($table,
    th: ["bookmark", "title", "boardTitle", "res", "heat", "createdDate"]
    searchbox: $view.C("searchbox")[0]
  )
  app.DOMData.set($view, "threadList", threadList)
  app.DOMData.set($view, "selectableItemList", threadList)
  tableSorter = new UI.TableSorter($table)
  app.DOMData.set($table, "tableSorter", tableSorter)
  $content.addFirst($table)

  new app.view.TabContentView($view)

  document.title = "検索:#{query}"
  unless app.config.isOn("no_history")
    app.History.add($view.dataset.url, document.title, openedAt, "")

  $view.$(".button_link > a").href = "#{scheme}://dig.5ch.net/search?maxResult=500&keywords=#{encodeURIComponent(query)}"

  threadSearch = new ThreadSearch(query, scheme)
  $tbody = $view.T("tbody")[0]

  load = (add = false) ->
    return if $view.hasClass("loading") and not add
    $view.addClass("loading")
    $buttonReload.addClass("disabled")
    $view.C("more")[0].textContent = "検索中"
    try
      result = await threadSearch.read()
      $messageBar.removeClass("error")
      $messageBar.removeChildren()

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
    do ->
      await app.wait5s()
      $buttonReload.removeClass("disabled")
      return
    return

  onScroll =  ->
    {offsetHeight, scrollHeight, scrollTop} = $content
    scrollPosition = offsetHeight + scrollTop

    if scrollHeight - scrollPosition < 100
      $content.off("scroll", onScroll)
      load(true)
    return
  $content.on("scroll", onScroll, passive: true)

  $buttonReload.on("click", ->
    return if $buttonReload.hasClass("disabled")
    threadList.empty()
    threadSearch = new ThreadSearch(query)
    await load()
    onScroll() # 20件分がスクロールなしで表示できる場合
    $content.on("scroll", onScroll, passive: true)
    return
  )

  window.on("view_unload", ->
    app.config.set("thread_search_last_mode", scheme)
    return
  )

  await load()
  onScroll() # 20件分がスクロールなしで表示できる場合
  return
)
