app.boot("/view/history.html", ->
  $view = document.documentElement
  $content = $$.C("content")[0]

  new app.view.TabContentView($view)

  $table = $__("table")
  threadList = new UI.ThreadList($table,
    th: ["title", "viewedDate"]
    searchbox: $view.C("searchbox")[0]
  )
  app.DOMData.set($view, "threadList", threadList)
  app.DOMData.set($view, "selectableItemList", threadList)
  $content.addLast($table)

  isOnlyUnique = true
  NUMBER_OF_DATA_IN_ONCE = 500
  loadAddCount = 0
  isLoadedEnd = false

  load = ({ignoreLoading = false, add = false} = {}) ->
    return if $view.hasClass("loading")
    return if $view.C("button_reload")[0].hasClass("disabled") and not (ignoreLoading or add)
    return if add and isLoadedEnd

    $view.addClass("loading")
    if add
      offset = loadAddCount*NUMBER_OF_DATA_IN_ONCE
    else
      offset = null

    if isOnlyUnique
      promise = app.History.getUnique(offset, NUMBER_OF_DATA_IN_ONCE)
    else
      promise = app.History.get(offset, NUMBER_OF_DATA_IN_ONCE)
    promise.then( (data) ->
      if add
        loadAddCount++
      else
        threadList.empty()
        loadAddCount = 1
        isLoadedEnd = false

      if data.length < NUMBER_OF_DATA_IN_ONCE
        isLoadedEnd = true

      threadList.addItem(data)
      $view.removeClass("loading")
      return if add and data.length is 0
      $view.dispatchEvent(new Event("view_loaded"))
      $view.C("button_reload")[0].addClass("disabled")
      app.defer5(->
        $view.C("button_reload")[0].removeClass("disabled")
        return
      )
      return
    )
    return

  $view.on("request_reload", load)
  load()

  isInLoadArea = false
  $content.on("scroll", ->
    {offsetHeight, scrollHeight, scrollTop} = $content
    scrollPosition = offsetHeight + scrollTop

    if scrollHeight - scrollPosition < 100
      return if isInLoadArea
      isInLoadArea = true
      load(add: true)
    else
      isInLoadArea = false
  , passive: true)

  $view.C("button_history_clear")[0].on("click", ->
    UI.Dialog("confirm",
      message: "履歴を削除しますか？"
    ).then( (res) ->
      app.History.clear().then(load) if res
      return
    )
    return
  )

  onClickUnique = ->
    isOnlyUnique = !isOnlyUnique
    $view.C("button_show_unique")[0].toggleClass("hidden")
    $view.C("button_show_all")[0].toggleClass("hidden")
    load(ignoreLoading: true)
    return
  $view.C("button_show_unique")[0].on("click", onClickUnique)
  $view.C("button_show_all")[0].on("click", onClickUnique)
  return
)
