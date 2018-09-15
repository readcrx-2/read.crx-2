app.boot("/zombie.html", ->
  close = ->
    {id} = await browser.windows.getCurrent()
    await browser.runtime.sendMessage(type: "zombie_done")
    await browser.windows.remove(id)
    return

  save = ->
    arrayOfReadState = JSON.parse(localStorage.zombie_read_state)

    app.bookmark = new app.BookmarkCompatibilityLayer(
      new app.BrowserBookmarkEntryList(app.config.get("bookmark_id"))
    )

    try
      await app.bookmark.promiseFirstScan

      rsarray = (app.ReadState.set(rs).catch(->return) for rs in arrayOfReadState)
      bkarray = (app.bookmark.updateReadState(rs).catch(->return) for rs in arrayOfReadState)
      await Promise.all(rsarray.concat(bkarray))

    close()

    delete localStorage.zombie_read_state
    return

  browser.runtime.sendMessage(type: "zombie_ping")

  alreadyRun = false
  browser.runtime.onMessage.addListener( ({type}) ->
    return if alreadyRun or type isnt "rcrx_exit"
    alreadyRun = true
    if localStorage.zombie_read_state?
      $script = $__("script")
      $script.on("load", save)
      $script.src = "/app_core.js"
      document.head.addLast($script)
    else
      close()
    return
  )
  return
)