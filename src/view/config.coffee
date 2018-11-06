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
      return unless _checkExcute(@name, "file_select")
      @$status.setClass("")
      @$fileSelectButtonHidden.click()
      _clearExcute()
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
      return unless _checkExcute(@name, "import")
      if @importFile isnt ""
        @$status.setClass("loading")
        @$status.textContent = "更新中"
        try
          await @importFunc(@importFile)
          @$status.addClass("done")
          @$status.textContent = "インポート完了"
        catch
          @$status.addClass("fail")
          @$status.textContent = "インポート失敗"
      else
        @$status.addClass("fail")
        @$status.textContent = "ファイルを選択してください"
      _clearExcute()
      return
    )
    return
  setupExportButton: ->
    @$exportButton.on("click", =>
      return unless _checkExcute(@name, "export")
      blob = new Blob([@exportFunc()], type: "text/plain")
      $a = $__("a").addClass("hidden")
      $a.href = URL.createObjectURL(blob)
      $a.setAttr("download", "read.crx-2_#{@name}.json")
      @$exportButton.addAfter($a)
      $a.click()
      $a.remove()
      _clearExcute()
      return
    )
    return

class HistoryIO extends SettingIO
  constructor: ({
    name
    countFunc: @countFunc
    importFunc
    exportFunc
    clearFunc: @clearFunc
    clearRangeFunc: @clearRangeFunc
    afterChangedFunc: @afterChangedFunc
  }) ->
    super({
      name
      importFunc
      exportFunc
    })
    @name = name
    @importFunc = importFunc
    @exportFunc = exportFunc

    @$count = $$.I("#{@name}_count")
    @$progress = $$.I("#{@name}_progress")

    @$clearButton = $$.C("#{@name}_clear")[0]
    @$clearRangeButton = $$.C("#{@name}_range_clear")[0]

    @showCount()
    @setupClearButton()
    @setupClearRangeButton()
    return
  showCount: ->
    count = await @countFunc()
    @$count.textContent = "#{count}件"
    return
  setupClearButton: ->
    @$clearButton.on("click", =>
      return unless _checkExcute(@name, "clear")
      result = await UI.Dialog("confirm",
        message: "本当に削除しますか？"
      )
      unless result
        _clearExcute()
        return
      @$status.textContent = ":削除中"

      try
        await @clearFunc()
        @$status.textContent = ":削除完了"
        parent.$$.$("iframe[src=\"/view/#{@name}.html\"]")?.contentDocument.C("view")[0].emit(new Event("request_reload"))
      catch
        @$status.textContent = ":削除失敗"

      @showCount()
      @afterChangedFunc()
      _clearExcute()
      return
    )
    return
  setupClearRangeButton: ->
    @$clearRangeButton.on("click", =>
      return unless _checkExcute(@name, "clear_range")
      result = await UI.Dialog("confirm",
        message: "本当に削除しますか？"
      )
      unless result
        _clearExcute()
        return
      @$status.textContent = ":範囲指定削除中"

      try
        await @clearRangeFunc(parseInt($$.C("#{@name}_date_range")[0].value))
        @$status.textContent = ":範囲指定削除完了"
        parent.$$.$("iframe[src=\"/view/#{@name}.html\"]")?.contentDocument.C("view")[0].emit(new Event("request_reload"))
      catch
        @$status.textContent = ":範囲指定削除失敗"

      @showCount()
      @afterChangedFunc()
      _clearExcute()
      return
    )
    return
  setupImportButton: ->
    @$importButton.on("click", =>
      return unless _checkExcute(@name, "import")
      if @importFile isnt ""
        @$status.setClass("loading")
        @$status.textContent = ":更新中"
        try
          await @importFunc(JSON.parse(@importFile), @$progress)
          count = await @countFunc()
          @$status.setClass("done")
          @$status.textContent = ":インポート完了"
        catch
          @$status.setClass("fail")
          @$status.textContent = ":インポート失敗"
        @showCount()
        @afterChangedFunc()
      else
        @$status.addClass("fail")
        @$status.textContent = ":ファイルを選択してください"
      @$progress.textContent = ""
      _clearExcute()
      return
    )
    return
  setupExportButton: ->
    @$exportButton.on("click", =>
      return unless _checkExcute(@name, "export")
      data = await @exportFunc()
      exportText = JSON.stringify(data)
      blob = new Blob([exportText], type: "text/plain")
      $a = $__("a").addClass("hidden")
      $a.href = URL.createObjectURL(blob)
      $a.setAttr("download", "read.crx-2_#{@name}.json")
      @$exportButton.addAfter($a)
      $a.click()
      $a.remove()
      _clearExcute()
      return
    )
    return

class BookmarkIO extends SettingIO
  constructor: ({
    name
    countFunc: @countFunc
    importFunc
    exportFunc
    clearFunc: @clearFunc
    clearExpiredFunc: @clearExpiredFunc
    afterChangedFunc: @afterChangedFunc
  }) ->
    super({
      name
      importFunc
      exportFunc
    })
    @name = name
    @importFunc = importFunc
    @exportFunc = exportFunc

    @$count = $$.I("#{@name}_count")
    @$progress = $$.I("#{@name}_progress")

    @$clearButton = $$.C("#{@name}_clear")[0]
    @$clearExpiredButton = $$.C("#{@name}_expired_clear")[0]

    @showCount()
    @setupClearButton()
    @setupClearExpiredButton()
    return
  showCount: ->
    count = await @countFunc()
    @$count.textContent = "#{count}件"
    return
  setupClearButton: ->
    @$clearButton.on("click", =>
      return unless _checkExcute(@name, "clear")
      result = await UI.Dialog("confirm",
        message: "本当に削除しますか？"
      )
      unless result
        _clearExcute()
        return
      @$status.textContent = ":削除中"

      try
        await @clearFunc()
        @$status.textContent = ":削除完了"
      catch
        @$status.textContent = ":削除失敗"

      @showCount()
      @afterChangedFunc()
      _clearExcute()
      return
    )
    return
  setupClearExpiredButton: ->
    @$clearExpiredButton.on("click", =>
      return unless _checkExcute(@name, "clear_expired")
      result = await UI.Dialog("confirm",
        message: "本当に削除しますか？"
      )
      unless result
        _clearExcute()
        return
      @$status.textContent = ":dat落ち削除中"

      try
        await @clearExpiredFunc()
        @$status.textContent = ":dat落ち削除完了"
      catch
        @$status.textContent = ":dat落ち削除失敗"

      @showCount()
      @afterChangedFunc()
      _clearExcute()
      return
    )
    return
  setupImportButton: ->
    @$importButton.on("click", =>
      return unless _checkExcute(@name, "import")
      if @importFile isnt ""
        @$status.setClass("loading")
        @$status.textContent = ":更新中"
        try
          await @importFunc(JSON.parse(@importFile), @$progress)
          count = await @countFunc()
          @$status.setClass("done")
          @$status.textContent = ":インポート完了"
        catch
          @$status.setClass("fail")
          @$status.textContent = ":インポート失敗"
        @showCount()
        @afterChangedFunc()
      else
        @$status.addClass("fail")
        @$status.textContent = ":ファイルを選択してください"
      @$progress.textContent = ""
      _clearExcute()
      return
    )
    return
  setupExportButton: ->
    @$exportButton.on("click", =>
      return unless _checkExcute(@name, "export")
      data = await @exportFunc()
      exportText = JSON.stringify(data)
      blob = new Blob([exportText], type: "text/plain")
      $a = $__("a").addClass("hidden")
      $a.href = URL.createObjectURL(blob)
      $a.setAttr("download", "read.crx-2_#{@name}.json")
      @$exportButton.addAfter($a)
      $a.click()
      $a.remove()
      _clearExcute()
      return
    )
    return

# 処理の排他制御用
_excuteProcess = null
_excuteFunction = null

_procName = {
  "history":      "閲覧履歴"
  "writehistory": "書込履歴"
  "bookmark":     "ブックマーク"
  "cache":        "キャッシュ"
  "config":       "設定"
}
_funcName = {
  "import":       "インポート"
  "export":       "エクスポート"
  "clear":        "削除"
  "clear_range":  "範囲指定削除"
  "clear_expired":"dat落ち削除"
  "file_select":  "ファイル読み込み"
}

_checkExcute = (procId, funcId) ->
  unless _excuteProcess
    _excuteProcess = procId
    _excuteFunction = funcId
    return true

  message = null
  if _excuteProcess is procId
    if _excuteFunction is funcId
      message = "既に実行中です。"
    else
      message = "#{_funcName[_excuteFunction]}の実行中です。"
  else
    message = "#{_procName[_excuteProcess]}の処理中です。"

  if message
    new app.Notification("現在この機能は使用できません", message, "", "invalid")

  return false

_clearExcute = ->
  _excuteProcess = null
  _excuteFunction = null
  return

app.boot("/view/config.html", ["Cache", "BBSMenu"], (Cache, BBSMenu) ->
  $view = document.documentElement

  new app.view.IframeView($view)

  # タブ
  $tabbar = $view.C("tabbar")[0]
  $tabs = $view.C("container")[0]
  $tabbar.on("click", ({target}) ->
    if target.tagName isnt "LI"
      target = target.closest("li")
    return unless target?
    return if target.hasClass("selected")

    $tabbar.C("selected")[0].removeClass("selected")
    target.addClass("selected")

    $tabs.C("selected")[0].removeClass("selected")
    $tabs.$("[name=\"#{target.dataset.name}\"]").addClass("selected")
    return
  )

  whenClose = ->
    #NG設定
    dom = $view.$("textarea[name=\"ngwords\"]")
    if dom.getAttr("changed")?
      dom.removeAttr("changed")
      app.NG.set(dom.value)
    #ImageReplaceDat設定
    dom = $view.$("textarea[name=\"image_replace_dat\"]")
    if dom.getAttr("changed")?
      dom.removeAttr("changed")
      app.ImageReplaceDat.set(dom.value)
    #ReplaceStrTxt設定
    dom = $view.$("textarea[name=\"replace_str_txt\"]")
    if dom.getAttr("changed")?
      dom.removeAttr("changed")
      app.ReplaceStrTxt.set(dom.value)
    #bbsmenu設定
    dom = $view.$("textarea[name=\"bbsmenu\"]")
    if dom.getAttr("changed")?
      dom.removeAttr("changed")
      app.config.set("bbsmenu", dom.value)
      $view.C("bbsmenu_reload")[0].click()
    return

  #閉じるボタン
  $view.C("button_close")[0].on("click", ->
    if frameElement
      parent.postMessage(type: "request_killme", location.origin)
    whenClose()
    return
  )

  window.on("beforeunload", ->
    whenClose()
    return
  )

  #掲示板を開いたときに閉じる
  for dom in $view.C("open_in_rcrx")
    dom.on("click", ->
      $view.C("button_close")[0].click()
      return
    )

  #汎用設定項目
  for dom in $view.$$("input.direct[type=\"text\"], textarea.direct")
    dom.value = app.config.get(dom.name) or ""
    dom.on("input", ->
      app.config.set(@name, @value)
      @setAttr("changed", "true")
      return
    )

  for dom in $view.$$("input.direct[type=\"number\"]")
    dom.value = app.config.get(dom.name) or "0"
    dom.on("input", ->
      app.config.set(@name, if Number.isNaN(@valueAsNumber) then "0" else @value)
      return
    )

  for dom in $view.$$("input.direct[type=\"checkbox\"]")
    dom.checked = app.config.get(dom.name) is "on"
    dom.on("change", ->
      app.config.set(@name, if @checked then "on" else "off")
      return
    )

  for dom in $view.$$("input.direct[type=\"radio\"]")
    if dom.value is app.config.get(dom.name)
      dom.checked = true
    dom.on("change", ->
      val = $view.$("""input[name="#{@name}"]:checked""").value
      app.config.set(@name, val)
      return
    )

  for dom in $view.$$("input.direct[type=\"range\"]")
    dom.value = app.config.get(dom.name) or "0"
    $$.I("#{dom.name}_text").textContent = dom.value
    dom.on("input", ->
      $$.I("#{@name}_text").textContent = @value
      app.config.set(@name, @value)
      return
    )

  for dom in $view.$$("select.direct")
    dom.value = app.config.get(dom.name) or ""
    dom.on("change", ->
      app.config.set(@name, @value)
      return
    )

  #バージョン情報表示
  do ->
    {name, version} = await app.manifest
    $view.C("version_text")[0].textContent = "#{name} v#{version} + #{navigator.userAgent}"
    return

  $view.C("version_copy")[0].on("click", ->
    app.clipboardWrite($$.C("version_text")[0].textContent)
    return
  )

  $view.C("keyboard_help")[0].on("click", (e) ->
    e.preventDefault()

    app.message.send("showKeyboardHelp")
    return
  )

  #板覧更新ボタン
  $view.C("bbsmenu_reload")[0].on("click", ({currentTarget: $button}) ->
    $status = $$.I("bbsmenu_reload_status")

    $button.disabled = true
    $status.setClass("loading")
    $status.textContent = "更新中"
    dom = $view.$("textarea[name=\"bbsmenu\"]")
    dom.removeAttr("changed")
    app.config.set("bbsmenu", dom.value)

    try
      await BBSMenu.get(true)
      $status.setClass("done")
      $status.textContent = "更新完了"
    catch
      $status.setClass("fail")
      $status.textContent = "更新失敗"
    $button.disabled = false
    return
  )

  #履歴
  new HistoryIO(
    name: "history"
    countFunc: ->
      return app.History.count()
    importFunc: ({history, read_state: readState, historyVersion = 1, readstateVersion = 1}, $progress) ->
      total = history.length + readState.length
      count = 0
      for hs in history
        hs.boardTitle = "" if historyVersion is 1
        await app.History.add(hs.url, hs.title, hs.date, hs.boardTitle)
        $progress.textContent = ":#{Math.floor((count++ / total) * 100)}%"
      for rs in readState
        rs.date = null if readstateVersion is 1
        _rs = await app.ReadState.get(rs.url)
        if app.util.isNewerReadState(_rs, rs)
          await app.ReadState.set(rs)
        $progress.textContent = ":#{Math.floor((count++ / total) * 100)}%"
      return
    exportFunc: ->
      [readState, history] = await Promise.all([
        app.ReadState.getAll()
        app.History.getAll()
      ])
      return {"read_state": readState, "history": history, "historyVersion": app.History.DB_VERSION, "readstateVersion": app.ReadState.DB_VERSION}
    clearFunc: ->
      return Promise.all([app.History.clear(), app.ReadState.clear()])
    clearRangeFunc: (day) ->
      return app.History.clearRange(day)
    afterChangedFunc: ->
      updateIndexedDBUsage()
      return
  )

  new HistoryIO(
    name: "writehistory"
    countFunc: ->
      return app.WriteHistory.count()
    importFunc: ({writehistory = null, dbVersion = 1}, $progress) ->
      return Promise.resolve() unless writehistory
      total = writehistory.length
      count = 0

      unixTime201710 = 1506783600 # 2017/10/01 0:00:00
      for whis in writehistory
        whis.inputName = whis.input_name
        whis.inputMail = whis.input_mail
        if dbVersion < 2
          if +whis.date <= unixTime201710 and whis.res > 1
            date = new Date(+whis.date)
            date.setMonth(date.getMonth()-1)
            whis.date = date.valueOf()
        await app.WriteHistory.add(whis)
        $progress.textContent = ":#{Math.floor((count++ / total) * 100)}%"
      return
    exportFunc: ->
      return {"writehistory": await app.WriteHistory.getAll(), "dbVersion": app.WriteHistory.DB_VERSION}
    clearFunc: ->
      return app.WriteHistory.clear()
    clearRangeFunc: (day) ->
      return app.WriteHistory.clearRange(day)
    afterChangedFunc: ->
      updateIndexedDBUsage()
      return
  )

  # ブックマーク
  new BookmarkIO(
    name: "bookmark"
    countFunc: ->
      return app.bookmark.getAll().length
    importFunc: ({bookmark, readState, readstateVersion = 1}, $progress) ->
      total = bookmark.length + readState.length
      count = 0
      for bm in bookmark
        await app.bookmark.import(bm)
        $progress.textContent = ":#{Math.floor((count++ / total) * 100)}%"
      for rs in readState
        rs.date = null if readstateVersion is 1
        _rs = await app.ReadState.get(rs.url)
        if app.util.isNewerReadState(_rs, rs)
          await app.ReadState.set(rs)
        $progress.textContent = ":#{Math.floor((count++ / total) * 100)}%"
      return
    exportFunc: ->
      [bookmark, readState] = await Promise.all([
        app.bookmark.getAll()
        app.ReadState.getAll()
      ])
      return {"bookmark": bookmark, "readState": readState, "readstateVersion": app.ReadState.DB_VERSION}
    clearFunc: ->
      return app.bookmark.removeAll()
    clearExpiredFunc: ->
      return app.bookmark.removeAllExpired()
    afterChangedFunc: ->
      updateIndexedDBUsage()
      return
  )

  do ->
    #キャッシュ削除ボタン
    $clearButton = $view.C("cache_clear")[0]
    $status = $$.I("cache_status")
    $count = $$.I("cache_count")

    do setCount = ->
      count = await Cache.count()
      $count.textContent = "#{count}件"
      return

    $clearButton.on("click", ->
      return unless _checkExcute("cache", "clear")
      $status.textContent = ":削除中"

      try
        await Cache.delete()
        $status.textContent = ":削除完了"
      catch
        $status.textContent = ":削除失敗"

      setCount()
      updateIndexedDBUsage()
      _clearExcute()
      return
    )
    #キャッシュ範囲削除ボタン
    $clearRangeButton = $view.C("cache_range_clear")[0]
    $clearRangeButton.on("click", ->
      return unless _checkExcute("cache", "clear_range")
      $status.textContent = ":範囲指定削除中"

      try
        await Cache.clearRange(parseInt($view.C("cache_date_range")[0].value))
        $status.textContent = ":削除完了"
      catch
        $status.textContent = ":削除失敗"

      setCount()
      updateIndexedDBUsage()
      _clearExcute()
      return
    )
    return

  do ->
    #ブックマークフォルダ変更ボタン
    $view.C("bookmark_source_change")[0].on("click", ->
      app.message.send("open", url: "bookmark_source_selector")
      return
    )

    #ブックマークフォルダ表示
    do updateName = ->
      [folder] = await parent.browser.bookmarks.get(app.config.get("bookmark_id"))
      $$.I("bookmark_source_name").textContent = folder.title
      return
    app.message.on("config_updated", ({key}) ->
      updateName() if key is "bookmark_id"
      return
    )
    return

  #「テーマなし」設定
  if app.config.get("theme_id") is "none"
    $view.C("theme_none")[0].checked = true

  app.message.on("config_updated", ({key, val}) ->
    if key is "theme_id"
      $view.C("theme_none")[0].checked = (val is "none")
    return
  )

  $view.C("theme_none")[0].on("click", ->
    app.config.set("theme_id", if @checked then "none" else "default")
    return
  )

  #bbsmenu設定
  resetBBSMenu = ->
    await app.config.del("bbsmenu")
    $view.$("textarea[name=\"bbsmenu\"]").value = app.config.get("bbsmenu")
    $$.C("bbsmenu_reload")[0].click()
    return

  if $view.$("textarea[name=\"bbsmenu\"]").value is ""
    resetBBSMenu()

  $view.C("bbsmenu_reset")[0].on("click", ->
    resetBBSMenu()
    return
  )

  for $dom in $view.$$("input[type=\"radio\"]") when $dom.name in ["ng_id_expire", "ng_slip_expire"]
    $dom.on("change", ->
      $$.I(@name).dataset.value = @value if @checked
      return
    )
    $dom.emit(new Event("change"))

  # 設定をインポート/エクスポート
  new SettingIO(
    name: "config"
    importFunc: (file) ->
      json = JSON.parse(file)
      for key, value of json
        key = key.slice(7)
        if key isnt "theme_id"
          $key = $view.$("input[name=\"#{key}\"]")
          if $key?
            switch $key.getAttr("type")
              when "text", "range", "number"
                $key.value = value
                $key.emit(new Event("input"))
              when "checkbox"
                $key.checked = (value is "on")
                $key.emit(new Event("change"))
              when "radio"
                for dom in $view.$$("input.direct[name=\"#{key}\"]")
                  if dom.value is value
                    dom.checked = true
                $key.emit(new Event("change"))
          else
            $keyTextArea = $view.$("textarea[name=\"#{key}\"]")
            if $keyTextArea?
              $keyTextArea.value = value
              $keyTextArea.emit(new Event("input"))
            $keySelect = $view.$("select[name=\"#{key}\"]")
            if $keySelect?
              $keySelect.value = value
              $keySelect.emit(new Event("change"))
         #config_theme_idは「テーマなし」の場合があるので特例化
         else
           if value is "none"
             $themeNone = $view.C("theme_none")[0]
             $themeNone.click() unless $themeNone.checked
           else
             $view.$("input[name=\"theme_id\"]").value = value
             $view.$("input[name=\"theme_id\"]").emit(new Event("change"))
      return
    exportFunc: ->
      content = app.config.getAll()
        .replace(/"config_last_board_sort_config":".*?","/,"\"")
        .replace(/"config_last_version":".*?","/,"\"")
      return content
  )

  # ImageReplaceDatをインポート
  new SettingIO(
    name: "dat"
    importFunc: (file) ->
      datDom = $view.$("textarea[name=\"image_replace_dat\"]")
      datDom.value = file
      datDom.emit(new Event("input"))
      return
  )

  # ReplaceStrTxtをインポート
  new SettingIO(
    name: "replacestr"
    importFunc: (file) ->
      replacestrDom = $view.$("textarea[name=\"replace_str_txt\"]")
      replacestrDom.value = file
      replacestrDom.emit(new Event("input"))
      return
  )

  formatBytes = (bytes) ->
    if bytes < 1048576
      return (bytes/1024).toFixed(2) + "KB"
    if bytes < 1073741824
      return (bytes/1048576).toFixed(2) + "MB"
    return (bytes/1073741824).toFixed(2) + "GB"

  # indexeddbの使用状況
  do updateIndexedDBUsage = ->
    {quota, usage} = await navigator.storage.estimate()
    $view.C("indexeddb_max")[0].textContent = formatBytes(quota)
    $view.C("indexeddb_using")[0].textContent = formatBytes(usage)
    $meter = $view.C("indexeddb_meter")[0]
    $meter.max = quota
    $meter.high = quota*0.9
    $meter.low = quota*0.8
    $meter.value = usage
    return

  # localstorageの使用状況
  do ->
    if parent.browser.storage.local.getBytesInUse?
      # 無制限なのでindexeddbの最大と一致する
      {quota} = await navigator.storage.estimate()
      $view.C("localstorage_max")[0].textContent = formatBytes(quota)
      $meter = $view.C("localstorage_meter")[0]
      $meter.max = quota
      $meter.high = quota*0.9
      $meter.low = quota*0.8
      usage = await parent.browser.storage.local.getBytesInUse()
      $view.C("localstorage_using")[0].textContent = formatBytes(usage)
      $meter.value = usage
    else
      $meter = $view.C("localstorage_meter")[0].remove()
      $view.C("localstorage_max")[0].textContent = ""
      $view.C("localstorage_using")[0].textContent = "このブラウザでは取得できません"
    return
)
