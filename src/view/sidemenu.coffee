app.boot "/view/sidemenu.html", ["bbsmenu"], (BBSMenu) ->
  new app.view.PaneContentView(document.documentElement)

  $view = $(document.documentElement)
  accordion = new UI.SelectableAccordion(document.body)
  $view.data("accordion", accordion)
  $view.data("selectableItemList", accordion)

  board_to_li = (board) ->
    li = document.createElement("li")
    a = document.createElement("a")
    a.className = "open_in_rcrx"
    a.title = board.title
    a.textContent = board.title
    a.href = app.safe_href(board.url)
    a.classList.add("https") if app.url.getScheme(board.url) is "https"
    li.appendChild(a)
    li

  entry_to_li = (entry) ->
    li = board_to_li(entry)
    li.classList.add("bookmark")
    li

  #スレタイ検索ボックス
  $view
    .find(".search")
      .on "keydown", (e) ->
        if e.which is 27 #Esc
          @q.value = ""
        return

      .on "submit", (e) ->
        e.preventDefault()
        app.message.send("open", {url: "search:#{@q.value}", new_tab: true})
        @q.value = ""
        return

  #ブックマーク関連
  do ->
    #初回ブックマーク表示構築
    app.bookmarkEntryList.ready.add ->
      frag = document.createDocumentFragment()

      for entry in app.bookmarkEntryList.getAllBoards()
        frag.appendChild(entry_to_li(entry))

      $view.find("ul:first-of-type").append(frag)
      accordion.update()
      return

    #ブックマーク更新時処理
    app.message.add_listener "bookmark_updated", (message) ->
      return if message.entry.type isnt "board"

      switch message.type
        when "added"
          if $view.find("li.bookmark > a[href=\"#{message.entry.url}\"]").length is 0
            $view
              .find("ul:first-of-type")
                .append(entry_to_li(message.entry))
        when "removed"
          $view
            .find("li.bookmark > a[href=\"#{message.entry.url}\"]")
              .parent()
                .remove()
        when "title"
          $view
            .find("li.bookmark > a[href=\"#{message.entry.url}\"]")
              .text(message.entry.title)

  #板覧関連
  do ->
    load = ->
      $view.addClass("loading")
      BBSMenu.get (res) ->
        $view.find("h3:not(:first-of-type), ul:not(:first-of-type)").remove()

        if res.message?
          app.message.send("notify", {
            message: res.message
            background_color: "red"
          })

        if res.data?
          frag = document.createDocumentFragment()
          for category in res.data
            h3 = document.createElement("h3")
            h3.textContent = category.title
            frag.appendChild(h3)

            ul = document.createElement("ul")
            for board in category.board
              ul.appendChild(board_to_li(board))
            frag.appendChild(ul)

        $view.find("body").append(frag)
        accordion.update()
        $view.removeClass("loading")
        return
      return

    $view.on "request_reload", ->
      load()
      return

    load()
    return
  return
