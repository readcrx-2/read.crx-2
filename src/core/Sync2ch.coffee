app.sync2ch = {}

# Util
# 通知
notify = (beforeHtml, afterHtml, color) ->
  app.message.send "notify", {html: "Sync2ch : #{beforeHtml} データを取得するのに失敗しました #{afterHtml}", background_color: color}
  return

# 設定で日付を保存するための変換
config_date_to_date = (configDate) ->
  if configDate?
    dateYear = configDate.substr(0, 4)
    dateMonth = configDate.substr(4, 2) - 1
    dateDay = configDate.substr(6, 2)
    return new Date(dateYear, dateMonth, dateDay)
  else
    return ""

date_to_config_date = (date) ->
  year = date.getFullYear()
  month = date.getMonth() + 1
  if month < 10 then month = "0" + month
  date = date.getDate()
  return "#{year}#{month}#{date}"

# ファイル名取得
getFileName = ->
  return window.location.href.split("/").pop()

# entityオブジェクトの配列の重複比較
compareEntity = (entities1, entities2) ->
  entityUrls1 = []
  entityUrls2 = []
  for entity in entities1
    entityUrls1.push(entity.url)
  for entity in entities2
    entityUrls2.push(entity.url)
  return app.util.concat_without_duplicates(entityUrls1, entityUrls2)[1]

# 重複結果の配列を第二引数の配列の配列番号基準として並び替え
sortDuplicates = (duplicates) ->
  duplicates.sort( (a, b) ->
    x = a[2]
    y = b[2]
    if x > y then return 1
    if x < y then return -1
    return 0
  )
  return duplicates

# Sync2ch
# Sync2chにアクセスして取得する
app.sync2ch.open = (xml, notify_error) ->
  d = $.Deferred()
  console.log "do--"
  nowDate = new Date()
  remainDate = app.config.get("sync_remain_time")
  remain = app.config.get("sync_remain")
  # zombieのときは通知が必要ないので通知しないように判定
  if notify_error
    notify_it = notify
  else
    notify_it = (beforeText, afterText, color) ->
      app.log("error","Sync2ch : #{beforeHtml} データを取得するのに失敗しました #{afterHtml}")
      return

  if !remain? or remain isnt "0" or remainDate is "" or nowDate > remainDate
    console.log "do-"
    #ここのsync_passのコードに関してはS(https://github.com/S--Minecraft)まで
    `var sync_pass = eval(function(p,a,c,k,e,r){e=String;if(!''.replace(/^/,String)){while(c--)r[c]=k[c]||c;k=[function(e){return r[e]}];e=function(){return'\\w+'};c=1};while(c--)if(k[c])p=p.replace(new RegExp('\\b'+e(c)+'\\b','g'),k[c]);return p}('1.2(1.2(4.5.6("3")).7(0,-1.8("3").9));',10,10,'|Base64|decode|sync_pass|app|config|get|slice|encode|length'.split('|'),0,{}))`
    os = app.util.os_detect()
    cfg_sync_id = app.config.get("sync_id")
    sync_client_id = app.config.get("sync_client_id") || ""
    sync_number = app.config.get("sync_number") || ""
    sync_device = app.config.get("sync_device") || ""
    if sync_client_id isnt "" then client_id = sync_client_id else client_id = 0
    if sync_number isnt "" then sync_number = sync_number else sync_number = 0
    if sync_device isnt "" then deviceText = " device=\"#{sync_device}\"" else deviceText = ""

    ###
    sync_rl
      open: 開いているスレ一覧
      favorite: お気に入りスレ一覧
      history: 読み込みスレッド履歴
      post_history: 書き込みスレッド履歴
    ###
    console.log "do before ajax"
    console.log """
                <?xml version="1.0" encoding="utf-8" ?>
                <sync2ch_request sync_number="#{sync_number}" client_id="#{client_id}" client_name="#{app.manifest.name}" client_version="#{app.manifest.version}-developing" os="#{os}"#{deviceText}>
                #{xml}
                </sync2ch_request>
                """
    $.ajax(
      type: "POST",
      url: "https://sync2ch.com/api/sync3",
      dataType: "xml",
      username: cfg_sync_id,
      password: sync_pass,
      data: """
            <?xml version="1.0" encoding="utf-8" ?>
            <sync2ch_request sync_number="#{sync_number}" client_id="#{client_id}" client_name="#{app.manifest.name}" client_version="#{app.manifest.version}-developing" os="#{os}"#{deviceText}>
            #{xml}
            </sync2ch_request>
            """,
      crossDomain: true
    )
      .done( (res) ->
        console.log res
        d.resolve(res)
        return
      ).fail( (res) ->
        switch res.status
          when 400 then app.log("error","2chSync : 不正なリクエストです データを取得するのに失敗しました")
          when 401 then notify_it("認証エラーです" ,"<a href=\"https://sync2ch.com/user?show=on\">ここ</a>でIDとパスワードを確認して設定しなおしてください", "red")
          when 403 then notify_it("アクセスが拒否されました/同期可能残数がありません"," ", "orange")
          when 503 then notify_it("メンテナンス中です"," ", "orange")
          else app.log("error","2chSync : データを取得するのに失敗しました")
        d.reject(res)
        return
      )
  else
    notify_it("同期可能残数がありません","明日まで同期はお待ちください", "orange")
    d.resolve("")
  return d.promise()

# Sync2chのデータを適応する
app.sync2ch.apply = (sync2chData, apply_read_state) ->
  console.log "apply"
  $xml = $(sync2chData)
  $response = $xml.find("sync2ch_response")
  if $response.attr("result") is "ok"
    # sync2ch_responseの変数
    account_type = $response.attr("account_type") # アカウントの種類(無料|プレミアム)
    remain = $response.attr("remain")             # 同期可能残数 (一日ごとリセット)
    sync_number = $response.attr("sync_number")   # 同期番号
    client_id = $response.attr("client_id")       # クライアントID
    # 設定に保存
    app.config.set("sync_client_id", client_id)
    app.config.set("sync_number", sync_number)
    app.config.set("sync_remain", remain)
    app.config.set("sync_remain_time", date_to_config_date(new Date))

    # 既読情報管理システム/履歴管理システムに適応
    if apply_read_state
      app.sync2ch.apply_data($xml)
  else
    app.critical_error("2chSync : データを取得するのに失敗しました")
  console.log "apply finish"
  return

# 実際に適応する
app.sync2ch.apply_data = ($xml) ->
  console.log "apply_data"
  d = $.Deferred()
  ###
  返ってくるデータ
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
  ###
  ###
  TODO: データ適応処理
  他のも対応する
  ###
  $entities = $xml.find("entities")            # 板・スレすべての一覧
  $.when(
    # history
    app.sync2ch.apply_history($xml, $entities),
    # open
    app.sync2ch.apply_open($xml, $entities)
  )
  .done(
    d.resolve()
  )
  return d.promise()

app.sync2ch.apply_history = ($xml, $entities) ->
  console.log "apply_history"
  d = new $.Deferred
  $history_group = $xml.find("thread_group[category=\"history\"]")
  if $history_group.attr("s") isnt "n"
    $history_threads = $history_group.children() # 読み込みスレッド履歴
    history_threads_length = $history_threads.length
    if history_threads_length > 0
      for i in [history_threads_length - 1..0]
        id = $history_threads.eq(i).attr("id")
        $thread = $entities.find("th[id=\"#{id}\"]")
        if $thread.attr("s") isnt "n"
          thread_url = $thread.attr("url")
          readtime = $thread.attr("rt")
          if readtime?
            unix_time = new Date(readtime * 1000)
            thread_time = unix_time.getTime()
          else
            thread_time = Date.now()
          #書き込み履歴
          #$thread.attr("pt")

          # 既読情報管理システムへ送る
          read_state =
            url: thread_url
            last: parseInt($thread.attr("read"), 10) + 1 # Sync2chではレス数を0から開始するため
            read: parseInt($thread.attr("now"), 10) + 1
            received: parseInt($thread.attr("count"), 10) + 1
          app.read_state.set(read_state)
          # 履歴ページにもデータを送る
          app.util.url_to_title(thread_url)
            .done( (title_from_url) ->
              thread_title = title_from_url
              app.History.add(thread_url, thread_title, thread_time)
            )
            .fail( ->
              thread_title = url
              app.History.add(thread_url, thread_title, thread_time)
            )
          if i is $history_threads.length - 1
            app.History.get_newest_id(thread_url)
              .done((id)->
                app.sync2ch.last_history_id = id
                d.resolve()
              )
  return d.promise()

app.sync2ch.apply_open = ($xml, $entities) ->
  console.log "apply_open"
  d = new $.Deferred
  data = []
  $open_group = $xml.find("thread_group[category=\"open\"]")
  th_select = false
  bd_select = false
  if $open_group.attr("s") isnt "n"
    $open_tabs = $open_group.children()
    open_tabs_length = $open_tabs.length
    if open_tabs_length > 0
      if app.config.get("layout") is "pane-2"
        layout = 2
      else
        layout = 3
      for i in [open_tabs_length - 1..0]
        id = $open_tabs.eq(i).attr("id")
        $tab = $entities.find("[id=\"#{id}\"]")
        if $tab.attr("s") isnt "n"
          tab_url = $tab.attr("url")
          tab_title = $tab.attr("title")
          if layout = 2
            tab_selected = (i is 1)
          else
            if $tab.prop("tagName") is "th" and th_select is false
              th_select = true
              tab_selected = true
            else if $tab.prop("tagName") is "bd" and bd_select is false
              bd_select = true
              tab_selected = true
            else
              tab_selected = false
          data.push({
            url: tab_url,
            title: tab_title,
            selected: tab_selected
          })
      # タブを置き換え
      console.log tabs
      for tab in data
        console.log tab
        is_restored = true
        app.message.send("open", {
          url: tab.url
          title: tab.title
          lazy: not tab.selected
          new_tab: true
        })
  d.resolve()
  return d.promise()


# XML作成
# History用に履歴をentityオブジェクトに変換
app.sync2ch.historyToEntity = (history) ->
  d = new $.Deferred
  url = history.url
  title = history.title
  type = app.URL.guessType(url).type
  if type is "thread"
    rt = Math.round((new Date(history.date)).getTime() / 1000)
    app.read_state.get(url)
      .done( (read_state) ->
        # Sync2chではレス番号が0からのため
        last = read_state.last - 1
        read = read_state.read - 1
        count = read_state.received - 1
        entity = {
          type: "th"
          url: url
          title: title
          last: last
          read: read
          count: count
          rt: rt
        }
        d.resolve(entity)
        return
      )
      .fail( ->
        entity = {
          type: "th"
          url: url
          title: title
          rt: rt
        }
        d.resolve(entity)
        return
      )
  else
    d.resolve(null)
  return d.promise()

# History用にentityオブジェクトの配列を生成する
app.sync2ch.historyToEntities = ->
  d = new $.Deferred
  app.History.get_with_id(undefined, 40)
    .done( (data) ->
      synced_last_id = app.sync2ch.last_history_id
      deferredConvertFuncArray = []
      for history in data
        if !synced_last_id? or history.rowid > synced_last_id
          deferredConvertFuncArray.push(app.sync2ch.historyToEntity(history))
      $.when.apply(null, deferredConvertFuncArray)
        .then( ->
          historyEntities = []
          # arguments[i][j]がi個目の関数のresolve内のj番目の引数(引数1のときは[j]がない)
          for argument in arguments
            if argument?
              historyEntities.push(argument)
          d.resolve(historyEntities)
          return
        )
      return
    )
    .fail( ->
      d.reject()
      return
    )
  return d.promise()

# open用の開いているタブをtempEntityオブジェクトに変換
app.sync2ch.openToTempEntities = ->
  d = new $.Deferred
  openTempEntities = []
  if localStorage.tab_state?
    for tab in JSON.parse(localStorage.tab_state)
      if app.URL.guessType(tab.url).type is ("thread" or "board")
        openTempEntity = {
          url: tab.url
          title: tab.title
        }
        openTempEntities.push(openTempEntity)
  d.resolve(openTempEntities)
  return d.promise()

# openTempEntityをopenEntityへ変換
app.sync2ch.openTempEntityToOpenEntity = (openTempEntity) ->
  d = new $.Deferred
  if openTempEntity?
    url = openTempEntity.url
    title = openTempEntity.title
    type = app.URL.guessType(url).type
    if type is "thread"
      $.when(
        app.History.get_from_url(url),
        app.read_state.get(url)
      )
      .done( (history, read_state) ->
        rt = Math.round((new Date(history.date)).getTime() / 1000)
        # Sync2chではレス番号が0からのため
        last = read_state.last - 1
        read = read_state.read - 1
        count = read_state.received - 1
        entity = {
          type: "th"
          url: url
          title: title
          last: last
          read: read
          count: count
          rt: rt
        }
        d.resolve(entity)
        return
      )
      .fail( ->
        entity = {
          type: "th"
          url: url
          title: title
        }
        d.resolve(entity)
        return
      )
    else if type is "board"
      entity = {
        type: "bd"
        url: url
        title: title
      }
      d.resolve(entity)
    else
      d.resolve()
  else
    d.resolve()
  return d.promise()

# openTempEntitiesをopenEntitiesへ変換
app.sync2ch.openTempEntitiesToOpenEntities = (openTempEntities) ->
  d = new $.Deferred
  deferredConvertFuncArray = []
  for openTempEntity in openTempEntities
    deferredConvertFuncArray.push(app.sync2ch.openTempEntityToOpenEntity(openTempEntity))
  openEntities = []
  $.when.apply(null, deferredConvertFuncArray)
    .done(  ->
      # arguments[i][j]がi個目の関数のresolve内のj番目の引数(引数1のときは[j]がない)
      for argument in arguments
        if argument?
          openEntities.push(argument)
      d.resolve(openEntities)
      return
    )
  return d.promise()

# entities生成
app.sync2ch.makeEntities = (historyEntities, openTempEntities) ->
  d = new $.Deferred
  console.log "makeEntities"
  console.log historyEntities
  console.log openTempEntities
  hisELength = historyEntities.length
  # entities内のhistoryのもののid
  historyIds = [0...hisELength]
  # openをhistoryと比較してentitiesを出力
  duplicates = compareEntity(historyEntities, openTempEntities)
  duplicates = sortDuplicates(duplicates)
  # entities内のopenのもののid
  openLastId = hisELength + openTempEntities.length - 1 - duplicates.length
  if hisELength > openLastId
    openIds = []
  else
    openIds = [hisELength..openLastId]
  for duplicate, i in duplicates
    openTempEntities.splice(duplicate[2] - i, 1)
    openIds.push(duplicate[1])
  if openTempEntities?
    app.sync2ch.openTempEntitiesToOpenEntities(openTempEntities)
      .done( (openEntities) ->
        entities = historyEntities.concat(openEntities)
        d.resolve(entities, historyIds, openIds)
        return
      )
  else
    entities = historyEntities
    d.resolve(entities, historyIds, openIds)
  return d.promise()

# entityオブジェクトの配列からentitiesのXMLを生成
app.sync2ch.makeEntitiesXML = (entities) ->
  xml = ""
  for entity, i in entities
    xml += """
           <#{entity.type} id="#{i}"
            url="#{entity.url}"
            title="#{entity.title}"
           """
    if entity.last? then xml += " read=\"#{entity.last}\""
    if entity.read? then xml += " now=\"#{entity.read}\""
    if entity.count? then xml += " count=\"#{entity.count}\""
    if entity.rt? then xml += " rt=\"#{entity.rt}\""
    xml += " />"
  return xml

# XMLの終端部を生成
app.sync2ch.finishXML = (historyIds, openIds) ->
  # Entitiesの構築を終了する
  xml = "</entities>"
  # Thread_group
  if historyIds.length > 0
    xml += "<thread_group category=\"history\" id_list=\"#{historyIds.toString()}\" struct=\"read.crx 2\" />"
  if openIds.length > 0
    xml += "<thread_group category=\"open\" id_list=\"#{openIds.toString()}\" struct=\"read.crx 2\" />"
  return xml


# 実行
#
console.log "do----"
app.config.ready( ->
  # 同期するかどうか
  cfg_sync_id = app.config.get("sync_id") || ""
  cfg_sync_pass = app.config.get("sync_pass") || ""
  if cfg_sync_id isnt "" and cfg_sync_pass isnt ""
    # 起動時の同期
    if getFileName() is "index.html"
      # Sync2chからデータ取得
      # 取得するカテゴリの数だけ書く
      # <thread_group category=" -----カテゴリ---- " struct="read.crx 2" />
      console.log "do--- config ready"
      ###
      app.sync2ch.open("""
                       <thread_group category="history" struct="read.crx 2" />
                       <thread_group category="open" struct="read.crx 2" />
                       """
                       ,true)
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
      console.log "finished"
    # 終了時同期
    else if getFileName() is "zombie.html"
      console.log "zombie"
      historyE = []
      app.sync2ch.historyToEntities()
        .then( (historyEntities) ->
          # historyからのentitiesとの被りのために
          # まずは処理が少ない分だけ取得
          historyE = historyEntities
          console.log "history entities"
          console.log historyE
          return $.when(app.sync2ch.openToTempEntities())
        )
        .then( (openTempEntities) ->
          # entities構築
          console.log "open temp entities"
          console.log openTempEntities
          return app.sync2ch.makeEntities(historyE, openTempEntities)
        )
        .then( (entities, historyIds, openIds) ->
          console.log "entities"
          console.log entities
          console.log historyIds
          console.log openIds
          # XML生成
          startXML = "<entities>"
          entitiesXML = app.sync2ch.makeEntitiesXML(entities)
          finishXML = app.sync2ch.finishXML(historyIds, openIds)
          XML = startXML + entitiesXML + finishXML
          console.log XML
          #
          # zombie.coffeeへ処理終了を送信
          chrome.runtime.sendMessage({done: "sync2ch"})
          return
          ###
          # 通信
          return app.sync2ch.open(XML, false)
        ).then( (sync2chRes) ->
          # 同期可能残数などを取得して保存
          if sync2chRes isnt ""
            app.sync2ch.apply(sync2chRes,"",false)
          # zombie.coffeeへ処理終了を送信
          chrome.runtime.sendMessage({done: "sync2ch"})
          return
          ###
        )
      console.log "finish"
  return
)
