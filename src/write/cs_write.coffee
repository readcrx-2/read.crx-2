do ->
  origin = chrome.extension.getURL("").slice(0, -1)

  exec = (javascript) ->
    script = document.createElement("script")
    script.innerHTML = javascript
    document.body.appendChild(script)

  send_message_ping = ->
    exec """
      parent.postMessage(JSON.stringify({type : "ping"}), "#{origin}");
    """

  send_message_success = ->
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
    if ///^http://\w+\.(2ch\.net|bbspink\.com|2ch\.sc|open2ch\.net)/test/bbs\.cgi///.test(location.href)
      if /書きこみました/.test(document.title)
        send_message_success()
      else if /確認/.test(document.title)
        setTimeout(send_message_confirm , 1000 * 6)
      else if /ＥＲＲＯＲ/.test(document.title)
        send_message_error()

    #したらば投稿確認
    else if ///^http://jbbs\.shitaraba\.net/bbs/write.cgi/\w+/\d+/\d+/$///.test(location.href)
      if /書きこみました/.test(document.title)
        send_message_success()
      else if /ERROR/.test(document.title)
        send_message_error()

  boot = ->
    window.addEventListener "message", (e) ->
      if e.origin is origin and e.data is "write_iframe_pong"
        main()
      return

    send_message_ping()

  setTimeout(boot, 0)
