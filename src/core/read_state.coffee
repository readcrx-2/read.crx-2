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
  return

app.read_state.set = (read_state, send_sync = true) ->
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

  # Sync2chへ送信するデータとして蓄積
  #if send_sync is false
  #  ###
  #  蓄積処理
  #  ###

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

# app.read_state.set定義後に記述する必要がある
do ->
  # Sync2chからデータ取得
  # 取得するカテゴリの数だけ書く
  # <thread_group category=" -----カテゴリ---- " struct="read.crx 2" />
  ###
  app.sync2ch.open("""
                 <thread_group category="history" struct="read.crx 2" />
                 """,true)
  .done( (sync2chResponse) ->
    if sync2chResponse isnt ""
      app.sync2ch.apply(sync2chResponse, true)
    return
  )
  ###
  responseText = """
                 <?xml version="1.0" encoding="utf-8"?>
                 <sync2ch_response result="ok" account_type="無料アカウント" remain="28" sync_number="18" client_id="38974">
                 <entities>
                   <th id="0" url="http://peace.2ch.net/test/read.cgi/aasaloon/1351310358/" s="n"/>
                   <th id="1" url="http://peace.2ch.net/test/read.cgi/aasaloon/1437471489/" title="http://peace.2ch.net/test/read.cgi/aasaloon/1437471489/" s="a" read="126" now="126" count="227"/>
                 </entities>
                 <thread_group category="history" s="u">
                   <th id="0"/>
                   <th id="1"/>
                 </thread_group>
                 </sync2ch_response>
                 """
  domP = new DOMParser()
  responseXML = domP.parseFromString(responseText, "text/xml")
  app.sync2ch.apply(responseXML, true)
  #
