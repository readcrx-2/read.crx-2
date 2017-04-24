app.boot "/view/inputurl.html", ->
  new app.view.TabContentView(document.documentElement)

  $view = $(document.documentElement)

  $view.find("form").on "submit", (e) ->
    e.preventDefault()

    url = @url.value
    url = url.replace(/// ^(ttps?):// ///, "h$1://")
    unless /// ^h?ttps?:// ///.test(url)
      url = "http://" + url
    guess_res = app.url.guess_type(url)
    if guess_res.type is "thread" or guess_res.type is "board"
      app.message.send("open", {url, new_tab: true})
      parent.postMessage(JSON.stringify(type: "request_killme"), location.origin)
    else
      ele = $view
        .find(".notice")
          .text("未対応形式のURLです")
      UI.Animate.fadeIn(ele[0])
    return
