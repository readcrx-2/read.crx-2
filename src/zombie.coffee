app.boot "/zombie.html", ->
  save = ->
    finishCallback = new app.Callbacks()
    zombieFinished = finishCallback.add.bind(finishCallback)

    array_of_read_state = JSON.parse(localStorage.zombie_read_state)

    app.bookmark = new app.Bookmark.CompatibilityLayer(
      new app.Bookmark.ChromeBookmarkEntryList(app.config.get("bookmark_id"))
    )

    app.bookmark.promise_first_scan.done ->
      count = 0
      countdown = ->
        #if --count is 0
        #  #close()
        return

      for read_state in array_of_read_state
        count += 2
        app.read_state.set(read_state).always(countdown)
        app.bookmark.update_read_state(read_state).always(countdown)
      return

    delete localStorage.zombie_read_state
    return

  cfg_sync_id = app.config.get("sync_id") || ""
  cfg_sync_pass = app.config.get("sync_pass") || ""
  if cfg_sync_id isnt "" and cfg_sync_pass isnt ""
    script = document.createElement("script")
    if localStorage.zombie_read_state?
      script.addEventListener("load", save)
    script.src = "/app_core.js"
    document.head.appendChild(script)
  else
    #close()
  return
