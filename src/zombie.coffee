app.boot "/zombie.html", ->
  save = ->
    array_of_read_state = JSON.parse(localStorage.zombie_read_state)

    app.bookmark = new app.Bookmark.CompatibilityLayer(
      new app.Bookmark.ChromeBookmarkEntryList(app.config.get("bookmark_id"))
    )

    app.bookmark.promise_first_scan.done ->
      count = 0
      countdown = ->
        if --count is 0
          closeStack("read_state")
        return

      for read_state in array_of_read_state
        count += 2
        app.read_state.set(read_state).always(countdown)
        app.bookmark.update_read_state(read_state).always(countdown)
      return

    delete localStorage.zombie_read_state
    return

  # それぞれの処理終了で発火
  close1 = false
  close2 = false
  closeStack = (type) ->
    if type is "read_state"
      close1 = true
    else if type is "sync2ch"
      close2 = true
    tryClose()
    return

  # 閉じていいかどうか判定して閉じる
  tryClose = ->
    if close1 and close2
      close()
    return

  # Sync2ch.coffeeから処理終了を受け取る
  chrome.runtime.onMessage.addListener( (req, sender, sendRes) ->
    if req.done is "sync2ch"
      closeStack("sync2ch")
    return
  )

  cfg_sync_id = app.config.get("sync_id") || ""
  cfg_sync_pass = app.config.get("sync_pass") || ""
  if cfg_sync_id isnt "" and cfg_sync_pass isnt ""
    script = document.createElement("script")
    if localStorage.zombie_read_state?
      script.addEventListener("load", save)
    else
      closeStack("read_state")
    script.src = "/app_core.js"
    document.head.appendChild(script)
  else
    close()
  return
