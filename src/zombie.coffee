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

    # historyの構築
    makeHistory = ->
      d = new $.Deferred
      app.History.get_with_id(undefined, 40)
        .done((data) ->
          synced_last_id = app.sync2ch.last_history_id
          for history, i in data
            if !synced_last_id? or history.rowid > synced_last_id
              history_ids.push(i)
              app.sync2ch.makeEntities(i, history)
                .done( (made, j, id) ->
                  xml += made
                  if j is data.length - 1 or id is synced_last_id + 1
                    d.resolve()
                    console.log j + ":" + id + ":resolve"
                  return
                )
        )
      return d.promise()

    history_ids = [] # Sync2chへ送られるhistoryに入っているentityのid
    #test_ids = [] # 他のカテゴリはここで配列をつくる
    finishXML = ->
      if sync
        # Entitiesの構築を終了する
        xml += "</entities>"
        # Thread_group history
        xml += "<thread_group category=\"history\" id_list=\"#{history_ids.toString()}\" struct=\"read.crx 2\" />"
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
        #if --count is 0
        #  #close()
        return

      for read_state, i in array_of_read_state
        count += 2
        app.read_state.set(read_state).always(countdown)
        app.bookmark.update_read_state(read_state).always(countdown)
      return

    delete localStorage.zombie_read_state

    # sync2ch
    if sync
      makeHistory()
        .done( ->
           finishXML()
           return
        )

    return

  if localStorage.zombie_read_state?
    script = document.createElement("script")
    script.addEventListener("load", save)
    script.src = "/app_core.js"
    document.head.appendChild(script)
  else
    #close()
  return
