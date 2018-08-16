do ->
  origin = chrome.runtime.getURL("")[...-1]

  submitThreadFlag = false

  exec = (javascript) ->
    script = document.createElement("script")
    script.innerHTML = javascript
    document.body.appendChild(script)
    return

  sendMessagePing = ->
    exec("""
      parent.postMessage({type: "ping"}, "#{origin}");
    """)
    return

  sendMessageSuccess = (moveMs) ->
    if submitThreadFlag
      jumpUrl = getJumpUrl()
      exec("""
        parent.postMessage({
          type : "success",
          key: "#{jumpUrl}",
          message: #{moveMs}
        }, "#{origin}");
      """)
    else
      exec("""
        parent.postMessage({type: "success", message: #{moveMs}}, "#{origin}");
      """)
    return

  sendMessageConfirm = ->
    exec("""
      parent.postMessage({type: "confirm"}, "#{origin}");
    """)
    return

  sendMessageError = (message) ->
    if typeof message is "string"
      exec("""
        parent.postMessage({
          type: "error",
          message: "#{message.replace(/\"/g, "&quot;")}"
        }, "#{origin}");
      """)
    else
      exec("""
        parent.postMessage({type: "error"}, "#{origin}");
      """)
    return

  getRefreshMeta = ->
    $heads = document.head.children
    for $head from $heads when $head.getAttribute("http-equiv") is "refresh"
      return $head
    return null

  getMoveSec = ->
    sec = 3
    $refreshMeta = getRefreshMeta()
    content = $refreshMeta?.getAttribute("content")
    return sec if not content? or content is ""
    m = content.match(/^(\d+);/)
    return m?[1] ? sec

  getJumpUrl = ->
    url = location.href
    if url.includes("5ch.net") or url.includes("bbspink.com") or url.includes("open2ch.net")
      $meta = getRefreshMeta()
      return $meta?.getAttribute("content") ? ""
    if url.includes("2ch.sc")
      as = document.getElementsByTagName("a")
      return as?[0]?.href ? ""
    return ""

  main = ->
    {title} = document
    url = location.href

    #したらば投稿確認
    if ///^https?://jbbs\.shitaraba\.net/bbs/write.cgi/\w+/\d+/(?:\d+|new)/$///.test(url)
      if title.includes("書きこみました")
        sendMessageSuccess(3 * 1000)
      else if title.includes("ERROR") or title.includes("スレッド作成規制中")
        sendMessageError()

    #open2ch投稿確認
    else if ///^https?://\w+\.open2ch\.net/test/bbs\.cgi///.test(url)
      font = document.getElementsByTagName("font")
      text = title
      if font.length > 0 then text += font[0].innerText
      if text.includes("書きこみました")
        sendMessageSuccess(getMoveSec() * 1000)
      else if text.includes("確認")
        setTimeout(sendMessageConfirm , 1000 * 6)
      else if text.includes("ＥＲＲＯＲ")
        sendMessageError()

    #2ch型投稿確認
    else if ///^https?://\w+\.\w+\.\w+/test/bbs\.cgi///.test(url)
      if title.includes("書きこみました")
        sendMessageSuccess(getMoveSec() * 1000)
      else if title.includes("確認")
        setTimeout(sendMessageConfirm , 1000 * 6)
      else if title.includes("ＥＲＲＯＲ")
        sendMessageError()
    return

  boot = ->
    window.addEventListener("message", (e) ->
      if e.origin is origin
        if e.data is "write_iframe_pong"
          main()
        else if e.data is "write_iframe_pong:thread"
          submitThreadFlag = true
          main()
      return
    )

    sendMessagePing()
    return

  setTimeout(boot, 0)
  return
