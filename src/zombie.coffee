app.boot("/zombie.html", ->
  close = ->
    {id} = await browser.tabs.getCurrent()
    await browser.runtime.sendMessage(type: "zombie_done")
    await browser.tabs.remove(id)
    # Vivaldiで閉じないことがあるため遅延してもう一度閉じる
    setTimeout( ->
      await browser.tabs.remove(id)
      return
    , 1000)
    return

  save = ->
    arrayOfReadState = await app.LocalStorage.get("zombie_read_state", true)

    app.bookmark = new app.Bookmark(app.config.get("bookmark_id"))

    try
      await app.bookmark.promiseFirstScan

      rsarray = (app.ReadState.set(rs).catch(->return) for rs in arrayOfReadState)
      bkarray = (app.bookmark.updateReadState(rs) for rs in arrayOfReadState)
      await Promise.all(rsarray.concat(bkarray))

    await app.LocalStorage.del("zombie_read_state")

    close()
    return

  browser.runtime.sendMessage(type: "zombie_ping")

  alreadyRun = false
  browser.runtime.onMessage.addListener( ({type}) ->
    return if alreadyRun or type isnt "rcrx_exit"
    alreadyRun = true
    if (await app.LocalStorage.get("zombie_read_state"))?
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