app.boot "/zombie.html", ->
  save = ->
    array_of_read_state = JSON.parse(localStorage.zombie_read_state)

    app.bookmark = new app.Bookmark.CompatibilityLayer(
      new app.Bookmark.ChromeBookmarkEntryList(app.config.get("bookmark_id"))
    )

    # 同期するかどうか
    sync = false
    cfg_sync_id = app.config.get("sync_id")
    cfg_sync_pass = app.config.get("sync_pass")
    if cfg_sync_id? and cfg_sync_id isnt "" and cfg_sync_pass? and cfg_sync_pass isnt ""
      sync = true
      # XMLの構築開始
      xml = "<thread_group category=\"history\" struct=\"test\">"

    finishXML = ->
      if sync
        # xmlの構築を終了する
        xml += "</thread_group>"
        console.log "xml : " + xml
        # 通信する
        #app.sync2ch.open(xml,false)
        #  .done( (sync2chResponse) ->
        #    if sync2chResponse isnt ""
        #      app.sync2ch.apply(sync2chResponse,"",false)
        #    return
        #  )

    app.bookmark.promise_first_scan.done ->
      count = 0
      countdown = ->
        if --count is 0
          finishXML()
        #  close()
        return

      for read_state in array_of_read_state
        count += 2
        app.read_state.set(read_state).always(countdown)
        app.bookmark.update_read_state(read_state).always(countdown)
        if sync
          # XMLの構築
          xml += app.sync2ch.makeXML(read_state)
      return

    delete localStorage.zombie_read_state
    return

  if localStorage.zombie_read_state?
    script = document.createElement("script")
    script.addEventListener("load", save)
    script.src = "/app_core.js"
    document.head.appendChild(script)
  else
    #close()
  return
