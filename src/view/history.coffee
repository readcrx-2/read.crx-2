app.boot "/view/history.html", ->
  $view = document.documentElement
  $content = $$.C("content")[0]

  new app.view.TabContentView($view)

  $table = $__("table")
  threadList = new UI.ThreadList($table, {
    th: ["title", "viewedDate"]
    searchbox: $view.C("searchbox")[0]
  })
  app.DOMData.set($view, "threadList", threadList)
  app.DOMData.set($view, "selectableItemList", threadList)
  $content.addLast($table)

  NUMBER_OF_DATA_IN_ONCE = 500
  loadAddCount = 0
  contentHeight = 0
  isLoadedEnd = false

  load = (add = false) ->
    return if $view.hasClass("loading")
    return if $view.C("button_reload")[0].hasClass("disabled") and not add
    return if add and isLoadedEnd

    $view.addClass("loading")
    if add
      offset = loadAddCount*NUMBER_OF_DATA_IN_ONCE
    else
      offset = null

    app.History.get(offset, NUMBER_OF_DATA_IN_ONCE).then (data) ->
      if add
        loadAddCount++
      else
        threadList.empty()
        loadAddCount = 1

      if data.length < NUMBER_OF_DATA_IN_ONCE
        isLoadedEnd = true

      threadList.addItem(data)
      $view.removeClass("loading")
      return if add and data.length is 0
      contentHeight = $content.offsetHeight
      $view.dispatchEvent(new Event("view_loaded"))
      $view.C("button_reload")[0].addClass("disabled")
      setTimeout(->
        $view.C("button_reload")[0].removeClass("disabled")
        return
      , 5000)
      return
    return

  $view.on("request_reload", load)
  load()

  isInLoadArea = false
  $content.on("scroll", ->
    {scrollHeight, scrollTop} = $content
    scrollPosition = contentHeight + scrollTop

    if scrollHeight - scrollPosition < 100
      return if isInLoadArea
      isInLoadArea = true
      load(true)
    else
      isInLoadArea = false
  , passive: true)

  $view.C("button_history_clear")[0].on "click", ->
    UI.dialog("confirm", {
      message: "履歴を削除しますか？"
      label_ok: "はい"
      label_no: "いいえ"
    }).then (res) ->
      if res
        app.History.clear().then(load)
      return
    return
  return
