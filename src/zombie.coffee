app.boot "/zombie.html", ->
  save = ->
    array_of_read_state = JSON.parse(localStorage.zombie_read_state)

    app.bookmark = new app.Bookmark.CompatibilityLayer(
      new app.Bookmark.ChromeBookmarkEntryList(app.config.get("bookmark_id"))
    )

    app.bookmark.promise_first_scan.then ->
      count = 0
      countdown = ->
        if --count is 0
          close()
        return

      for read_state in array_of_read_state
        count += 2
        app.ReadState.set(read_state).then(countdown)
        app.bookmark.update_read_state(read_state).then(countdown)

      return

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
