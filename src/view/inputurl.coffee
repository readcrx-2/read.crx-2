app.boot("/view/inputurl.html", ->
  $view = document.documentElement

  new app.view.TabContentView($view)

  $view.T("form")[0].on("submit", (e) ->
    e.preventDefault()

    urlStr = @url.value
    urlStr = urlStr.replace(/// ^(ttps?):// ///, "h$1://")
    unless /// ^https?:// ///.test(urlStr)
      urlStr = "http://#{urlStr}"
    url = new app.URL.URL(urlStr)
    {type: guessType} = url.guessType()
    if guessType is "thread" or guessType is "board"
      paramResNumFlag = app.config.isOn("enable_link_with_res_number")
      paramResNum = if paramResNumFlag then url.getResNumber() else null
      app.message.send("open", {
        url: url.href
        new_tab: true
        param_res_num: paramResNum
      })
      parent.postMessage(type: "request_killme", location.origin)
    else
      ele = $view.C("notice")[0]
      ele.textContent = "未対応形式のURLです"
      UI.Animate.fadeIn(ele)
    return
  )
  return
)
