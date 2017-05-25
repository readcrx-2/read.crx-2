do ->
  origin = chrome.extension.getURL("").slice(0, -1)

  submitThreadFlag = false

  exec = (javascript) ->
    script = document.createElement("script")
    script.innerHTML = javascript
    document.body.appendChild(script)

  send_message_ping = ->
    exec """
      parent.postMessage(JSON.stringify({type : "ping"}), "#{origin}");
    """

  send_message_success = ->
    if submitThreadFlag
      exec """
        var url = location.href;
        if(url.includes("2ch.net") || url.includes("bbspink.com") || url.includes("open2ch.net")) {
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
        parent.postMessage(JSON.stringify({
          type : "success",
          key: jumpurl
        }), "#{origin}");
      """
    else
      exec """
        parent.postMessage(JSON.stringify({type : "success"}), "#{origin}");
      """

  send_message_confirm = ->
    exec """
      parent.postMessage(JSON.stringify({type : "confirm"}), "#{origin}");
    """

  send_message_error = (message) ->
    if typeof message is "string"
      exec """
        parent.postMessage(JSON.stringify({
          type: "error",
          message: "#{message.replace(/\"/g, "&quot;")}"
        }), "#{origin}");
      """
    else
      exec """
        parent.postMessage(JSON.stringify({type : "error"}), "#{origin}");
      """

  main = ->
    #2ch投稿確認
    if ///^https?://\w+\.(2ch\.net|bbspink\.com|2ch\.sc)/test/bbs\.cgi///.test(location.href)
      if document.title.includes("書きこみました")
        send_message_success()
      else if document.title.includes("確認")
        setTimeout(send_message_confirm , 1000 * 6)
      else if document.title.includes("ＥＲＲＯＲ")
        send_message_error()

    #したらば投稿確認
    else if ///^https?://jbbs\.shitaraba\.net/bbs/write.cgi/\w+/\d+/(?:\d+|new)/$///.test(location.href)
      if document.title.includes("書きこみました")
        send_message_success()
      else if document.title.includes("ERROR") or document.title.includes("スレッド作成規制中")
        send_message_error()

    #open2ch投稿確認
    if ///^https?://\w+\.open2ch\.net/test/bbs\.cgi///.test(location.href)
      font = document.getElementsByTagName("font")
      text = document.title
      if font.length > 0 then text += font[0].innerText
      if text.includes("書きこみました")
        send_message_success()
      else if text.includes("確認")
        setTimeout(send_message_confirm , 1000 * 6)
      else if text.includes("ＥＲＲＯＲ")
        send_message_error()

  boot = ->
    window.addEventListener "message", (e) ->
      if e.origin is origin
        if e.data is "write_iframe_pong"
          main()
        else if e.data is "write_iframe_pong:thread"
          submitThreadFlag = true
          main()
      return

    send_message_ping()

  setTimeout(boot, 0)
