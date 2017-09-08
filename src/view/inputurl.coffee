app.boot("/view/inputurl.html", ->
  $view = document.documentElement

  new app.view.TabContentView($view)

  $view.T("form")[0].on("submit", (e) ->
    e.preventDefault()

    url = @url.value
    url = url.replace(/// ^(ttps?):// ///, "h$1://")
    unless /// ^https?:// ///.test(url)
      url = "http://" + url
    {type: guessType} = app.URL.guessType(url)
    if guessType is "thread" or guessType is "board"
      paramResNumFlag = app.config.isOn("enable_link_with_res_number")
      paramResNum = if paramResNumFlag then app.URL.getResNumber(url) else null
      app.message.send("open", {
        url
        new_tab: true
        param_res_num: paramResNum
      })
      parent.postMessage(JSON.stringify({type: "request_killme"}), location.origin)
    else
      ele = $view.C("notice")[0]
      ele.textContent = "未対応形式のURLです"
      UI.Animate.fadeIn(ele)
    return
  )
  return
)
