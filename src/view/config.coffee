class SettingIO
  importFile: ""
  constructor: ({
    name: @name
    importFunc: @importFunc
    exportFunc: @exportFunc
  }) ->
    @$status = $$.I("#{@name}_status")
    if @importFunc?
      @$fileSelectButton = $$.C("#{@name}_file_show")[0]
      @$fileSelectButtonHidden = $$.C("#{@name}_file_hide")[0]
      @$importButton = $$.C("#{@name}_import_button")[0]
      @setupFileSelectButton()
      @setupImportButton()
    if @exportFunc?
      @$exportButton = $$.C("#{@name}_export_button")[0]
      @setupExportButton()
    return
  setupFileSelectButton: ->
    @$fileSelectButton.on("click", =>
      @$status.setClass("")
      @$fileSelectButtonHidden.click()
      return
    )
    @$fileSelectButtonHidden.on("change", (e) =>
      file = e.target.files
      reader = new FileReader()
      reader.readAsText(file[0])
      reader.onload = =>
        @importFile = reader.result
        @$status.addClass("select")
        @$status.textContent = "ファイル選択完了"
        return
      return
    )
    return
  setupImportButton: ->
    @$importButton.on("click", =>
      if @importFile isnt ""
        @$status.setClass("loading")
        @$status.textContent = "更新中"
        new Promise( (resolve, reject) =>
          @importFunc(@importFile)
          resolve()
          return
        ).then( =>
          @$status.addClass("done")
          @$status.textContent = "インポート完了"
          return
        , ->
          @$status.addClass("fail")
          @$status.textContent = "インポート失敗"
          return
        )
      else
        @$status.addClass("fail")
        @$status.textContent = "ファイルを選択してください"
      return
    )
    return
  setupExportButton: ->
    @$exportButton.on("click", =>
      blob = new Blob([@exportFunc()],{type:"text/plain"})
      $a = $__("a")
      $a.href = URL.createObjectURL(blob)
      $a.setAttr("target", "_blank")
      $a.setAttr("download", "read.crx-2_#{@name}.json")
      $a.click()
      return
    )
    return

class HistoryIO extends SettingIO
  constructor: ({
    name: @name
    countFunc: @countFunc
    importFunc: @importFunc
    exportFunc: @exportFunc
    clearFunc: @clearFunc
    clearRangeFunc: @clearRangeFunc
  }) ->
    super(
      name: @name
      importFunc: @importFunc
      exportFunc: @exportFunc
    )
    @$clearButton = $$.C("#{@name}_clear")[0]
    @$clearRangeButton = $$.C("#{@name}_range_clear")[0]

    @showCount()
    @setupClearButton()
    @setupClearRangeButton()
    return
  showCount: ->
    @countFunc().then( (count) =>
      @$status.textContent = "#{count}件"
      return
    )
    return
  setupClearButton: ->
    @$clearButton.on("click", =>
      @$clearButton.addClass("hidden")
      @$status.textContent = "削除中"

      @clearFunc()
        .then( =>
          @$status.textContent = "削除完了"
          parent.$$.$("iframe[src=\"/view/#{@name}.html\"]")?.contentWindow.C("view")[0].dispatchEvent(new Event("request_reload"))
        , =>
          @$status.textContent = "削除失敗"
        ).then( =>
          @$clearButton.removeClass("hidden")
        )
      return
    )
    return
  setupClearRangeButton: ->
    @$clearRangeButton.on("click", =>
      @$clearRangeButton.addClass("hidden")
      @$status.textContent = "範囲指定削除中"

      @clearRangeFunc(parseInt($$.C("#{@name}_date_range")[0].value))
        .then( =>
          @$status.textContent = "範囲指定削除完了"
          parent.$$.$("iframe[src=\"/view/#{@name}.html\"]")?.contentWindow.C("view")[0].dispatchEvent(new Event("request_reload"))
        , =>
          @$status.textContent = "範囲指定削除失敗"
        ).then( =>
          @$clearRangeButton.removeClass("hidden")
        )
      return
    )
    return
  setupImportButton: ->
    @$importButton.on("click", =>
      if @importFile isnt ""
        @$status.setClass("loading")
        @$status.textContent = "更新中"
        @importFunc(JSON.parse(@importFile))
        .then( =>
          return @countFunc()
        ).then( (count) =>
          @$status.setClass("done")
          @$status.textContent = "#{count}件 インポート完了"
          @$clearButton.removeClass("hidden")
          return
        , =>
          @$status.setClass("fail")
          @$status.textContent = "インポート失敗"
          return
        )
      else
        @$status.addClass("fail")
        @$status.textContent = "ファイルを選択してください"
      return
    )
    return
  setupExportButton: ->
    @$exportButton.on("click", =>
      @exportFunc().then( (data) =>
        exportText = JSON.stringify(data)
        blob = new Blob([exportText], type: "text/plain")
        $a = $__("a")
        $a.href = URL.createObjectURL(blob)
        $a.setAttr("target", "_blank")
        $a.setAttr("download", "read.crx-2_#{@name}.json")
        $a.click()
      )
      return
    )
    return

app.boot "/view/config.html", ["cache", "bbsmenu"], (Cache, BBSMenu) ->
  $view = document.documentElement

  new app.view.IframeView($view)

  whenClose = ->
    #NG設定
    app.NG.set($view.$("textarea[name=\"ngwords\"]").value)
    #ImageReplaceDat設定
    app.ImageReplaceDat.set($view.$("textarea[name=\"image_replace_dat\"]").value)
    #ReplaceStrTxt設定
    app.ReplaceStrTxt.set($view.$("textarea[name=\"replace_str_txt\"]").value)
    return

  #閉じるボタン
  $view.C("button_close")[0].on "click", ->
    if frameElement
      tmp = type: "request_killme"
      parent.postMessage(JSON.stringify(tmp), location.origin)
    whenClose()
    return

  window.on "unload", ->
    whenClose()
    return

  #掲示板を開いたときに閉じる
  for dom in $view.C("open_in_rcrx")
    dom.on "click", ->
      $view.C("button_close")[0].click()
      return

  #汎用設定項目
  for dom in $view.$$("input.direct[type=\"text\"], textarea.direct")
    dom.value = app.config.get(dom.name) or ""
    dom.on "input", ->
      app.config.set(@name, @value)
      return

  for dom in $view.$$("input.direct[type=\"number\"]")
    dom.value = app.config.get(dom.name) or "0"
    dom.on "input", ->
      app.config.set(@name, if Number.isInteger(+@value) then @value else "0")
      return

  for dom in $view.$$("input.direct[type=\"checkbox\"]")
    dom.checked = app.config.get(dom.name) is "on"
    dom.on "change", ->
      app.config.set(@name, if @checked then "on" else "off")
      return

  for dom in $view.$$("input.direct[type=\"radio\"]")
    if dom.value is app.config.get(dom.name)
      dom.checked = true
    dom.on "change", ->
      val = $view.$("""input[name="#{@name}"]:checked""").value
      app.config.set(@name, val)
      return

  for dom in $view.$$("input.direct[type=\"range\"]")
    dom.value = app.config.get(dom.name) or "0"
    $view.C("#{dom.name}_text")[0].textContent = dom.value
    dom.on "input", ->
      $view.C("#{@name}_text")[0].textContent = @value
      app.config.set(@name, @value)
      return

  #バージョン情報表示
  $view.C("version_text")[0].textContent = "#{app.manifest.name} v#{app.manifest.version} + #{navigator.userAgent}"

  $view.C("version_copy")[0].on "click", ->
    app.clipboardWrite($$.C("version_text")[0].textContent)
    return

  $view.C("keyboard_help")[0].on "click", (e) ->
    e.preventDefault()

    app.message.send("showKeyboardHelp", null, parent)
    return

  #忍法帖関連機能
  do ->
    $ninjaInfo = $view.C("ninja_info")[0]

    updateNinjaInfo = ->
      app.Ninja.getCookie (cookies) ->
        $ninjaInfo.removeChildren()

        backup = app.Ninja.getBackup()

        data = {}

        for item in cookies
          data[item.site.siteId] =
            site: item.site
            hasCookie: true
            hasBackup: false

        for item in backup
          if data[item.site.siteId]?
            data[item.site.siteId].hasBackup = true
          else
            data[item.site.siteId] =
              site: item.site
              hasCookie: false
              hasBackup: true

        for siteId, item of data
          $div = $$.I("template_ninja_item").content.$(".ninja_item").cloneNode(true)

          $div.dataset.siteid = item.site.siteId
          $div.C("site_name")[0].textContent = item.site.siteName

          if item.hasCookie
            $div.addClass("ninja_item_cookie_found")

          if item.hasBackup
            $div.addClass("ninja_item_backup_available")

          $ninjaInfo.addLast($div)
        return
      return

    updateNinjaInfo()

    # 「Cookieを削除」ボタン
    $ninjaInfo.on "click", (e) ->
      return unless e.target.matches(".ninja_item_cookie_found > button")
      siteId = e.target.closest(".ninja_item").dataset.siteid
      app.Ninja.deleteCookie(siteId, updateNinjaInfo)
      return

    # 「バックアップから復元」ボタン
    $ninjaInfo.on "click", (e) ->
      return unless e.target.matches(".ninja_item_cookie_notfound > button")
      siteId = e.target.closest(".ninja_item").dataset.siteid
      app.Ninja.restore(siteId, updateNinjaInfo)
      return

    # 「バックアップを削除」ボタン
    $ninjaInfo.on "click", (e) ->
      return unless e.target.matches(".ninja_item_backup_available > button")
      siteId = e.target.closest(".ninja_item").dataset.siteid
      UI.dialog("confirm", {
        message: "本当に削除しますか？"
        label_ok: "はい"
        label_no: "いいえ"
      }).then (result) ->
        if result
          app.Ninja.deleteBackup(siteId)
          updateNinjaInfo()
        return
      return
    return

  #板覧更新ボタン
  $view.C("bbsmenu_reload")[0].on "click", (e) ->
    $button = e.currentTarget
    $status = $$.I("bbsmenu_reload_status")

    $button.disabled = true
    $status.setClass("loading")
    $status.textContent = "更新中"

    BBSMenu.get( (res) ->
      $button.removeAttr("disabled")
      if res.status is "success"
        $status.setClass("done")
        $status.textContent = "更新完了"

        # sidemenuの表示時に設定されたコールバックが実行されるので、特別なことはしない

        #TODO [board_title_solver]も更新するよう変更
      else
        $status.setClass("fail")
        $status.textContent = "更新失敗"
      return
    , true)
    return

  #履歴
  new HistoryIO(
    name: "history"
    countFunc: ->
      return app.History.count()
    importFunc: (inputObj) ->
      return Promise.all(
        inputObj.history.map( (his) ->
          return app.History.add(his.url, his.title, his.date)
        ).concat(inputObj.read_state.map( (rs) ->
          return app.ReadState.set(rs)
        ))
      )
    exportFunc: ->
      return new Promise( (resolve, reject) ->
        Promise.all([
          app.ReadState.getAll(),
          app.History.getAll()
        ]).then( ([read_state_res, history_res]) ->
          resolve({"read_state": read_state_res, "history": history_res})
          return
        )
      )
    clearFunc: ->
      return Promise.all([app.History.clear(), app.ReadState.clear()])
    clearRangeFunc: (day) ->
      return app.History.clearRange(day)
  )

  new HistoryIO(
    name: "writehistory"
    countFunc: ->
      return app.WriteHistory.count()
    importFunc: (inputObj) ->
      if inputObj.writehistory
        return Promise.all(inputObj.writehistory.map( (whis) ->
          return app.WriteHistory.add(whis.url, whis.res, whis.title, whis.name, whis.mail, whis.input_name, whis.input_mail, whis.message, whis.date)
        ))
      else
        return Promise.resolve()
    exportFunc: ->
      return new Promise( (resolve, reject) ->
        app.WriteHistory.getAll().then( (data) ->
          resolve({"writehistory": data})
          return
        )
        return
      )
    clearFunc: ->
      return app.WriteHistory.clear()
    clearRangeFunc: (day) ->
      return app.WriteHistory.clearRange(day)
  )

  do ->
    #キャッシュ削除ボタン
    $clear_button = $view.C("cache_clear")[0]
    $status = $$.I("cache_status")

    Cache.count().then (count) ->
      $status.textContent = "#{count}件"
      return

    $clear_button.on "click", ->
      $clear_button.remove()
      $status.textContent = "削除中"

      Cache.delete()
        .then ->
          $status.textContent = "削除完了"
          return
        .catch ->
          $status.textContent = "削除失敗"
          return
      return
    #キャッシュ範囲削除ボタン
    $clear_range_button = $view.C("cache_range_clear")[0]
    $clear_range_button.on "click", ->
      $status.textContent = "範囲指定削除中"

      Cache.clearRange(parseInt($view.C("cache_date_range")[0].value))
        .then ->
          $status.textContent = "削除完了"
          return
        .catch ->
          $status.textContent = "削除失敗"
          return
      return
    return

  #ブックマークフォルダ変更ボタン
  $view.C("bookmark_source_change")[0].on "click", ->
    app.message.send("open", url: "bookmark_source_selector")
    return

  #ブックマークインポートボタン
  $view.C("import_bookmark")[0].on "click", (e) ->
    rcrx_webstore = "hhjpdicibjffnpggdiecaimdgdghainl"
    rcrx_debug = "bhffdiookpgmjkaeiagoecflopbnphhi"
    req = "export_bookmark"

    $button = e.currentTarget
    $status = $$.I("import_bookmark_status")

    $button.disabled = true
    $status.textContent = "インポート中"

    new Promise( (resolve, reject) ->
      parent.chrome.runtime.sendMessage rcrx_webstore, req, (res) ->
        if res
          resolve(res)
        else
          reject()
      return
    ).catch( ->
      return new Promise( (resolve, reject) ->
        parent.chrome.runtime.sendMessage rcrx_debug, req, (res) ->
          if res
            resolve(res)
          else
            reject()
        return
      )
    ).then( (res) ->
      for url, bookmark of res.bookmark when typeof(url) is typeof(bookmark.title) is "string"
        app.bookmark.add(url, bookmark.title)
      for url, bookmark of res.bookmark_board when typeof(url) is typeof(bookmark.title) is "string"
        app.bookmark.add(url, bookmark.title)
      $status.textContent = "インポート完了"
      return
    , ->
      $status.textContent = "インポートに失敗しました。read.crx v0.73以降がインストールされている事を確認して下さい。"
      return
    ).then( ->
      $button.disabled = false
      return
    )

  #「テーマなし」設定
  if app.config.get("theme_id") is "none"
    $view.C("theme_none")[0].checked = true

  app.message.addListener "config_updated", (message) ->
    if message.key is "theme_id"
      $view.C("theme_none")[0].checked = (message.val is "none")
    return

  $view.C("theme_none")[0].on "click", ->
    app.config.set("theme_id", if @checked then "none" else "default")
    return

  #bbsmenu設定
  resetBBSMenu = ->
    app.config.del("bbsmenu").then ->
      $view.C("direct.bbsmenu")[0].val(app.config.get("bbsmenu"))
      $$.C("bbsmenu_reload")[0].click()

  if $view.$(".direct.bbsmenu").value is ""
    resetBBSMenu()

  $view.$(".direct.bbsmenu").on "change", ->
    if $view.$(".direct.bbsmenu").value isnt ""
      $$.C("bbsmenu_reload")[0].click()
    else
      resetBBSMenu()
    return

  $view.C("bbsmenu_reset")[0].on "click", ->
    resetBBSMenu()
    return

  # 設定をインポート/エクスポート
  new SettingIO(
    name: "config"
    importFunc: (file) ->
      json = JSON.parse(file)
      for key, value of json
        key_before = key
        key = key.slice(7)
        if key isnt "theme_id"
          $key = $view.$("input[name=\"#{key}\"]")
          if $key?
            switch $key.getAttr("type")
              when "text", "range", "number"
                $key.value = value
                $key.dispatchEvent(new Event("input"))
              when "checkbox"
                $key.checked = (value is "on")
                $key.dispatchEvent(new Event("change"))
              when "radio"
                $key.value = value
                $key.dispatchEvent(new Event("change"))
              else
                $keyTextArea = $view.$("textarea[name=\"#{key}\"]")
                if $keyTextArea?
                  $keyTextArea.value = value
                  $key.dispatchEvent(new Event("input"))
         #config_theme_idは「テーマなし」の場合があるので特例化
         else
           if value is "none"
             $theme_none = $view.C("theme_none")[0]
             $theme_none.click() unless $theme_none.checked
           else
             $view.$("input[name=\"theme_id\"]").value = value
             $view.$("input[name=\"theme_id\"]").dispatchEvent(new Event("change"))
      return
    exportFunc: ->
      content = app.config.getAll()
      content = content.replace(/"config_last_board_sort_config":".*?","/,"\"")
      content = content.replace(/"config_last_version":".*?","/,"\"")
      return content
  )

  # ImageReplaceDatをインポート
  new SettingIO(
    name: "dat"
    importFunc: (file) ->
      datDom = $view.$("textarea[name=\"image_replace_dat\"]")
      datDom.value = file
      datDom.dispatchEvent(new Event("input"))
      return
  )

  # ReplaceStrTxtをインポート
  new SettingIO(
    name: "replacestr"
    importFunc: (file) ->
      replacestrDom = $view.$("textarea[name=\"replace_str_txt\"]")
      replacestrDom.value = file
      replacestrDom.dispatchEvent(new Event("input"))
      return
  )

  #過去の履歴をインポート
  $view.C("history_from_1151")[0].on "click", ->
    $replacestr_status.setClass("loading")
    $replacestr_status.textContent = "インポート中"
    hisPro = new Promise( (resolve, reject) ->
      openDatabase("History", "", "History", 0).transaction( (tx) ->
        tx.executeSql("SELECT * FROM History", [], (t, his) ->
          h = Array.from(his.rows)
          h.map( (a) ->
            return app.History.add(a.url, a.title, a.date)
          )
          Promise.all(h).then( ->
            t.executeSql("drop table History", [])
            resolve()
            return
          , (e) ->
            reject(e)
            return
          )
          return
        , (e) ->
          if e.code?
            reject(e)
          else
            resolve()
          return
        )
      )
    )
    whisPro = new Promise( (resolve, reject) ->
      openDatabase("WriteHistory", "", "WriteHistory", 0).transaction( (tx) ->
        tx.executeSql("SELECT * FROM WriteHistory", [], (t, whis) ->
          w = Array.from(whis.rows)
          w.map( (a) ->
            return app.WriteHistory.add(a.url, a.res, a.title, a.name, a.mail, a.input_name, a.mail, a.message, a.date)
          )
          Promise.all(w).then( ->
            t.executeSql("drop table WriteHistory", [])
            resolve()
            return
          , (e) ->
            reject(e)
            return
          )
          return
        , (e) ->
          if e.code?
            reject(e)
          else
            resolve()
          return
        )
      )
    )
    rsPro = new Promise( (resolve, reject) ->
      openDatabase("ReadState", "", "Read State", 0).transaction( (tx) ->
        tx.executeSql("SELECT * FROM ReadState", [], (t, rs) ->
          r = Array.from(rs.rows)
          r.map( (a) ->
            return app.ReadState.set(a)
          )
          Promise.all(r).then( ->
            t.executeSql("drop table ReadState", [])
            resolve()
            return
          , (e) ->
            reject(e)
            return
          )
          return
        , (e) ->
          if e.code?
            reject(e)
          else
            resolve()
          return
        )
      )
    )
    Promise.all([hisPro, whisPro, rsPro]).then( ->
      $replacestr_status.addClass("done")
      $replacestr_status.textContent = "インポート完了"
    , (e) ->
      $replacestr_status.addClass("fail")
      $replacestr_status.textContent = "インポート失敗 - #{e}"
    )
    return

  return
