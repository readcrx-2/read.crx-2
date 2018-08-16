app.boot("/zombie.html", ->
  save = ->
    arrayOfReadState = JSON.parse(localStorage.zombie_read_state)

    app.bookmark = new app.BookmarkCompatibilityLayer(
      new app.ChromeBookmarkEntryList(app.config.get("bookmark_id"))
    )

    try
      await app.bookmark.promiseFirstScan

      rsarray = (app.ReadState.set(rs).catch(->return) for rs in arrayOfReadState)
      bkarray = (app.bookmark.updateReadState(rs).catch(->return) for rs in arrayOfReadState)
      await Promise.all(rsarray.concat(bkarray))

    close()

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
)