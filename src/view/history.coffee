app.boot "/view/history.html", ->
  $view = document.documentElement

  new app.view.TabContentView($view)

  $table = $__("table")
  threadList = new UI.ThreadList($table, {
    th: ["title", "viewedDate"]
    searchbox: $view.C("searchbox")[0]
  })
  app.DOMData.set($view, "threadList", threadList)
  app.DOMData.set($view, "selectableItemList", threadList)
  $$.C("content")[0].addLast($table)

  load = ->
    return if $view.hasClass("loading")
    return if $view.C("button_reload")[0].hasClass("disabled")

    $view.addClass("loading")

    app.History.get(undefined, 500).then (data) ->
      threadList.empty()
      threadList.addItem(data)
      $view.removeClass("loading")
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
