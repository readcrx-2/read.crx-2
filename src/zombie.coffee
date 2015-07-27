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
      # Entitiesの構築開始
      xml = "<entities>"

    history_last_id = 0 # Sync2chへ送られるhistoryの最後のid
    #test_ids = ["1","2"] # 他のカテゴリはここで配列をつくる
    finishXML = ->
      if sync
        # Entitiesの構築を終了する
        xml += "</entities>"
        # historyのThread_group
        history_ids = "0"
        for i in [1...history_last_id]
          history_ids += "," + i
        xml += "<thread_group category=\"history\" id_list=\"#{history_ids}\" struct=\"read.crx 2\" />"
        console.log "xml : " + xml
        # 他のカテゴリのThread_group
        #xml += "<thread_group category=\"test\" id_list=\"#{test_ids.toString()}\" struct=\"read.crx 2\" /> "
        # 通信する
        #app.sync2ch.open(xml,false)
        #  .done( (sync2chResponse) ->
        #    # 同期可能残数などを取得して保存
        #    if sync2chResponse isnt ""
        #      app.sync2ch.apply(sync2chResponse,"",false)
        #    return
        #  )

    app.bookmark.promise_first_scan.done ->
      count = 0
      countdown = ->
        if --count is 0
          finishXML()
          #close()
        return

      for read_state, i in array_of_read_state
        count += 2
        app.read_state.set(read_state).always(countdown)
        app.bookmark.update_read_state(read_state).always(countdown)
        if sync
          # Entitiesの構築
          xml += app.sync2ch.makeEntities(i, read_state)
          history_last_id = i
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
