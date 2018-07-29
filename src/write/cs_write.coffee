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

  sendMessageSuccess = ->
    if submitThreadFlag
      exec("""
        var url = location.href;
        if(url.includes("5ch.net") || url.includes("bbspink.com") || url.includes("open2ch.net")) {
          metas = document.getElementsByTagName("meta");
          for(var i = 0; i < metas.length; i++) {
            if(metas[i].getAttribute("http-equiv") === "refresh") {
              jumpurl = metas[i].getAttribute("content");
              break;
            }
          }
        } else if (url.includes("2ch.sc")) {
          as = document.getElementsByTagName("a");
          jumpurl = as[0].href;
        } else {
          jumpurl = ""
        }
        parent.postMessage({
          type : "success",
          key: jumpurl
        }, "#{origin}");
      """)
    else
      exec("""
        parent.postMessage({type: "success"}, "#{origin}");
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

  main = ->
    #したらば投稿確認
    if ///^https?://jbbs\.shitaraba\.net/bbs/write.cgi/\w+/\d+/(?:\d+|new)/$///.test(location.href)
      if document.title.includes("書きこみました")
        sendMessageSuccess()
      else if document.title.includes("ERROR") or document.title.includes("スレッド作成規制中")
        sendMessageError()

    #open2ch投稿確認
    else if ///^https?://\w+\.open2ch\.net/test/bbs\.cgi///.test(location.href)
      font = document.getElementsByTagName("font")
      text = document.title
      if font.length > 0 then text += font[0].innerText
      if text.includes("書きこみました")
        sendMessageSuccess()
      else if text.includes("確認")
        setTimeout(sendMessageConfirm , 1000 * 6)
      else if text.includes("ＥＲＲＯＲ")
        sendMessageError()

    #2ch型投稿確認
    else if ///^https?://\w+\.\w+\.\w+/test/bbs\.cgi///.test(location.href)
      if document.title.includes("書きこみました")
        sendMessageSuccess()
      else if document.title.includes("確認")
        setTimeout(sendMessageConfirm , 1000 * 6)
      else if document.title.includes("ＥＲＲＯＲ")
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
