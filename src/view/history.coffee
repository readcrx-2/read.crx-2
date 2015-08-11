app.boot "/view/history.html", ->
  $view = $(document.documentElement)

  new app.view.TabContentView(document.documentElement)

  $table = $("<table>")
  threadList = new UI.ThreadList($table[0], {
    th: ["title", "viewedDate"]
    searchbox: $view.find(".searchbox")[0]
  })
  $view.data("threadList", threadList)
  $view.data("selectableItemList", threadList)
  $table.appendTo(".content")

  load = ->
    return if $view.hasClass("loading")
    return if $view.find(".button_reload").hasClass("disabled")

    $view.addClass("loading")

    app.History.get(undefined, 500).done (data) ->
      threadList.empty()
      threadList.addItem(data)
      $view.removeClass("loading")
      $view.trigger("view_loaded")
      $view.find(".button_reload").addClass("disabled")
      setTimeout(->
        $view.find(".button_reload").removeClass("disabled")
        return
      , 5000)
      return
    return

  $view.on("request_reload", load)
  load()

  $view.find(".button_history_clear").on "click", ->
    $.dialog("confirm", {
      message: "履歴を削除しますか？"
      label_ok: "はい"
      label_no: "いいえ"
    }).done (res) ->
      if res
        app.History.clear().done(load)
        app.sync2ch.last_history_id = -1
      return
    return
  return
