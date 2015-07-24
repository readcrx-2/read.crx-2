app.read_state = {}

app.read_state._url_filter = (original_url) ->
  original_url = app.url.fix(original_url)

  original: original_url
  replaced: original_url
    .replace(/// ^http://\w+\.2ch\.net/ ///, "http://*.2ch.net/")
  original_origin: original_url
    .replace(/// ^(http://\w+\.2ch\.net)/.* ///, "$1")
  replaced_origin: "http://*.2ch.net"

do ->
  app.read_state._db_open = $.Deferred (deferred) ->
    db = openDatabase("ReadState", "", "Read State", 0)
    db.transaction(
      (transaction) ->
        transaction.executeSql """
          CREATE TABLE IF NOT EXISTS ReadState(
            url TEXT NOT NULL PRIMARY KEY,
            board_url TEXT NOT NULL,
            last INTEGER NOT NULL,
            read INTEGER NOT NULL,
            received INTEGER NOT NULL
          )
        """
      -> deferred.reject()
      -> deferred.resolve(db)
    )
  .promise()
  .fail ->
    app.critical_error("既読情報管理システムの起動に失敗しました")
    return

  #Sync2chからデータ取得
  app.read_state.sync2ch_open = ->
    d = $.Deferred()
    cfg_sync_id = app.config.get("sync_id")
    cfg_sync_pass = app.config.get("sync_pass")
    if cfg_sync_id? and cfg_sync_id isnt "" and cfg_sync_pass? and cfg_sync_pass isnt ""
      #ここのsync_passのコードに関してはS(https://github.com/S--Minecraft)まで
      `var sync_pass = eval(function(p,a,c,k,e,r){e=String;if(!''.replace(/^/,String)){while(c--)r[c]=k[c]||c;k=[function(e){return r[e]}];e=function(){return'\\w+'};c=1};while(c--)if(k[c])p=p.replace(new RegExp('\\b'+e(c)+'\\b','g'),k[c]);return p}('1.2(1.2(4.5.6("3")).7(0,-1.8("3").9));',10,10,'|Base64|decode|sync_pass|app|config|get|slice|encode|length'.split('|'),0,{}))`
      os = app.util.os_detect()

      #TODO: 仮実装で、本来はしっかりしたxmlを送らないといけない
      $.ajax(
        type: "POST",
        url: "https://sync2ch.com/api/sync3",
        dataType: "xml",
        username: cfg_sync_id,
        password: sync_pass,
        data: """
              <?xml version=\"1.0\" encoding=\"utf-8\" ?>
              <sync2ch_request sync_number=\"0\" client_id=\"0\" client_name=\"#{app.manifest.name}\" client_version=\"#{app.manifest.version}a\" sync_rl=\"test\" os=\"#{os}\" >
              <thread_group category=\"open\" struct=\"test\">
              <dir name=\"test\"><th url=\"http://anago.2ch.net/test/read.cgi/software/1339477664/\" title=\"read.crx 2\" read=\"1\" now=\"1\" count=\"1\" /></dir>
              </thread_group>
              </sync2ch_request>
              """,
        crossDomain: true
      )
        .done((res) ->
          d.resolve(res)
          console.log("res(stringed) : " + (new XMLSerializer()).serializeToString(res))
          return
        ).fail((res) ->
          d.reject(res)
          app.critical_error("Sync2chのデータを取得するのに失敗しました")
          return
        )
    else
      d.resolve("")
    return d.promise()

  #Sync2chのデータを適応する
  app.read_state.apply_sync2ch = (sync2chData, db) ->
    console.log "sync2chData : " + sync2chData
    return

  app.read_state._db_open
  .done( (database) ->
    ###
    app.read_state.sync2ch_open()
    .done( (sync2chResponse) ->
      if sync2chResponse isnt "" and database?
        app.read_state.apply_sync2ch(sync2chResponse, database)
      return
    )
    ###
    return
  )

  app.read_state.sync2ch_open()
  return

app.read_state.set = (read_state) ->
  if not read_state? or
      typeof read_state isnt "object" or
      typeof read_state.url isnt "string" or
      typeof read_state.last isnt "number" or
      isNaN(read_state.last) or
      typeof read_state.read isnt "number" or
      isNaN(read_state.read) or
      typeof read_state.received isnt "number" or
      isNaN(read_state.received)
    app.log("error", "app.read_state.set: 引数が不正です", arguments)
    return $.Deferred().reject().promise()

  read_state = app.deep_copy(read_state)

  url = app.read_state._url_filter(read_state.url)
  read_state.url = url.replaced
  board_url = app.url.thread_to_board(url.original)
  read_state.board_url = app.read_state._url_filter(board_url).replaced

  app.read_state._db_open

    .pipe (db) ->
      $.Deferred (deferred) ->
        db.transaction(
          (transaction) ->
            transaction.executeSql(
              "INSERT OR REPLACE INTO ReadState values(?, ?, ?, ?, ?)"
              [
                read_state.url
                read_state.board_url
                read_state.last
                read_state.read
                read_state.received
              ]
            )
          -> deferred.reject()
          -> deferred.resolve()
        )

    .always ->
      delete read_state.board_url
      read_state.url = read_state.url.replace(url.replaced, url.original)
      app.message.send("read_state_updated", {board_url, read_state})

    .promise()

app.read_state.get = (url) ->
  if app.assert_arg("app.read_state.get", ["string"], arguments)
    return $.Deferred().reject().promise()

  url = app.read_state._url_filter(url)

  app.read_state._db_open

    .pipe (db) ->
      $.Deferred (deferred) ->
        db.transaction (transaction) ->
          transaction.executeSql("""
              SELECT url, last, read, received FROM ReadState
                WHERE url = ?
            """
            [url.replaced]
            (transaction, result) ->
              if result.rows.length is 1
                data = app.deep_copy(result.rows.item(0))
                data.url = url.original
                deferred.resolve(data)
              else
                deferred.reject()
          )
        , ->
          app.log("error", "app.read_state.get: トランザクション中断")
          deferred.reject()

    .promise()

app.read_state.get_by_board = (url) ->
  if app.assert_arg("app.read_state.get_by_board", ["string"], arguments)
    return $.Deferred().reject().promise()

  url = app.read_state._url_filter(url)

  app.read_state._db_open

    .pipe (db) ->
      $.Deferred (deferred) ->
        db.transaction (transaction) ->
          transaction.executeSql("""
              SELECT url, last, read, received FROM ReadState
                WHERE board_url = ?
            """
            [url.replaced]
            (transaction, result) ->
              data = []
              key = 0
              length = result.rows.length
              while key < length
                tmp = app.deep_copy(result.rows.item(key))
                tmp.url =
                  tmp.url.replace(url.replaced_origin, url.original_origin)
                data.push(tmp)
                key++
              deferred.resolve(data)
          )
        , ->
          app.log("error", "app.read_state.get: トランザクション中断")
          deferred.reject()

    .promise()

app.read_state.remove = (url) ->
  if app.assert_arg("app.read_state.remove", ["string"], arguments)
    return $.Deferred().reject().promise()

  url = app.read_state._url_filter(url)

  app.read_state._db_open

    .pipe (db) ->
      $.Deferred (deferred) ->
        db.transaction (transaction) ->
          transaction.executeSql("""
            DELETE FROM ReadState
              WHERE url = ?
          """, [url.replaced])
        , ->
          app.log("error", "app.read_state.remove: トランザクション失敗")
          deferred.reject()
        , ->
          deferred.resolve()

    .done ->
      app.message.send("read_state_removed", url: url.original)
      return

    .promise()

app.read_state.clear = ->
  app.read_state._db_open

    .pipe (db) ->
      $.Deferred (deferred) ->
        db.transaction (transaction) ->
          transaction.executeSql("DELETE FROM ReadState")
        , ->
          app.log("error", "app.read_state.clear: トランザクション中断")
          deferred.reject()
        , ->
          deferred.resolve()

    .promise()
