app.boot "/zombie.html", ->
  save = ->
    arrayOfReadState = JSON.parse(localStorage.zombie_read_state)

    app.bookmark = new app.Bookmark.CompatibilityLayer(
      new app.Bookmark.ChromeBookmarkEntryList(app.config.get("bookmark_id"))
    )

    app.bookmark.promise_first_scan.then( ->
      rsarray = (app.ReadState.set(rs).catch() for rs in arrayOfReadState)
      bkarray = (app.bookmark.update_read_state(rs).catch() for rs in arrayOfReadState)
      return Promise.all(rsarray.concat(bkarray))
    ).then( ->
      close()
      return
    )

    delete localStorage.zombie_read_state
    return

  if localStorage.zombie_read_state?
    $script = $__("script")
    $script.on("load", save)
    $script.src = "/app_core.js"
    document.head.addLast($script)
  else
    close()
  return
