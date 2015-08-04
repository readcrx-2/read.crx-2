app.sync2ch = {}

# Util
# 通知
notify = (beforeHtml, afterHtml, color) ->
  app.message.send "notify", {html: "Sync2ch : #{beforeHtml} データを取得するのに失敗しました #{afterHtml}", background_color: color}

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
  return window.location.href.split('/').pop()


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
    console.log "do before ajax #{sync_number} #{client_id} #{app.manifest.name} #{app.manifest.version} #{os} #{cfg_sync_id} #{sync_pass}"
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
      .done((res) ->
        console.log res
        d.resolve(res)
        return
      ).fail((res) ->
        d.reject(res)
        switch res.status
          when 400 then app.log("error","2chSync : 不正なリクエストです データを取得するのに失敗しました")
          when 401 then notify_it("認証エラーです" ,"<a href=\"https://sync2ch.com/user?show=on\">ここ</a>でIDとパスワードを確認して設定しなおしてください", "red")
          when 403 then notify_it("アクセスが拒否されました/同期可能残数がありません"," ", "orange")
          when 503 then notify_it("メンテナンス中です"," ", "orange")
          else app.log("error","2chSync : データを取得するのに失敗しました")
        return
      )
  else
    notify_it("同期可能残数がありません","明日まで同期はお待ちください", "orange")
    d.resolve("")
  return d.promise()

# Sync2chのデータを適応する
app.sync2ch.apply = (sync2chData, apply_read_state) ->
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
  return

# 実際に適応する
app.sync2ch.apply_data = ($xml) ->
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
  現在はhistoryのみ同期するため、他のも対応する
  ###
  $history_group = $xml.find("thread_group[category=\"history\"]")
  if $history_group.attr("s") isnt "n"
    $entities = $xml.find("entities")            # 板・スレすべての一覧
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

          # 既読情報管理システムへ送る
          read_state =
            url: thread_url
            last: $thread.attr("read") - 1 # Sync2chではレス数を0から開始するため
            read: $thread.attr("now") - 1
            received: $thread.attr("count") - 1
          app.read_state.set(read_state, false)
          # 履歴ページにもデータを送る
          app.util.url_to_title(thread_url)
            .done((title_from_url) ->
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
              )
    ###
    $post_threads
    else if
    書き込み履歴
    ###
  return d.promise()


# XML作成
# History用のEntitiesを構築する（中間）
app.sync2ch.makeHistoryEntities = (i, history) ->
  d = new $.Deferred
  url = history.url
  guessRes = app.URL.guessType(url)
  if guessRes.type is thread
    title = history.title
    app.read_state.get(url)
      .done( (read_state) ->
        last = read_state.last + 1
        read = read_state.read + 1
        count = read_state.received + 1
        # xmlのファイルを継ぎ足して書いていく
        xml = """
              <th id="#{i}"
              url="#{url}"
              title="#{title}"
              """
        if last?
          xml += "read=\"#{last}\""
        if read?
          xml += "now=\"#{read}\""
        if count?
          xml += "count=\"#{count}\""
        xml += " />"
        d.resolve(xml, i, history.rowid)
        return
      )
  else
    d.reject("", i, history.rowid)
  return d.promise()

# historyの構築
app.sync2ch.makeHistory = (xml) ->
  history_ids = [] # Sync2chへ送られるhistoryに入っているentityのid
  d = new $.Deferred
  app.History.get_with_id(undefined, 40)
    .done((data) ->
      synced_last_id = app.sync2ch.last_history_id
      for history, i in data
        if !synced_last_id? or history.rowid > synced_last_id
          app.sync2ch.makeHistoryEntities(i, history)
            .done((made, j, id) ->
              history_ids.push(i)
              xml += made
            )
            .always((made, j, id) ->
              if j is data.length - 1 or id is synced_last_id + 1
                d.resolve(xml, history_ids)
                console.log j + ":" + id + ":always"
              return
            )
    )
  return d.promise()

# 他カテゴリの構築
#test_ids = []

# XMLの構築を終了する
app.sync2ch.finishXML = (xml, history_ids) ->
  # Entitiesの構築を終了する
  xml += "</entities>"
  # Thread_group history
  xml += """
         <thread_group category="history" id_list="#{history_ids.toString()}" struct="read.crx 2" />
         """
  # 他のカテゴリのThread_group
  #xml += "<thread_group category=\"test\" id_list=\"#{test_ids.toString()}\" struct=\"read.crx 2\" /> "
  return xml


# 実行
#
console.log "do----"
app.config.ready( ->
  # 同期するかどうか
  cfg_sync_id = app.config.get("sync_id") || ""
  cfg_sync_pass = app.config.get("sync_pass") || ""
  if cfg_sync_id isnt "" or cfg_sync_pass isnt ""
    # 起動時の同期
    if getFileName() is "index.html"
      # Sync2chからデータ取得
      # 取得するカテゴリの数だけ書く
      # <thread_group category=" -----カテゴリ---- " struct="read.crx 2" />
      console.log "do--- config ready"
      app.sync2ch.open("""
                       <thread_group category="history" struct="read.crx 2" />
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
      ###
      console.log "finished"
    # 終了時同期
    else if getFileName() is "zombie.html"
      # Entitiesの構築開始
      xml = "<entities>"
      app.sync2ch.makeHistory(xml)
        .done((xml, history_ids) ->
           xml = app.sync2ch.finishXML(xml, history_ids)
           # 通信
           app.sync2ch.open(xml,false)
             .done( (sync2chResponse) ->
               # 同期可能残数などを取得して保存
               if sync2chResponse isnt ""
                 app.sync2ch.apply(sync2chResponse,"",false)
               return
             )
           return
        )
  return
)
