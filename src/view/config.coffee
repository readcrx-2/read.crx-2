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
      result = await UI.Dialog("confirm",
        message: "本当に削除しますか？"
      )
      return unless result
      @$clearButton.addClass("hidden")
      @$status.textContent = ":削除中"

      try
        await @clearFunc()
        @$status.textContent = ":削除完了"
        parent.$$.$("iframe[src=\"/view/#{@name}.html\"]")?.contentWindow.C("view")[0].dispatchEvent(new Event("request_reload"))
      catch
        @$status.textContent = ":削除失敗"

      @showCount()
      @afterChangedFunc()
      @$clearButton.removeClass("hidden")
      return
    )
    return
  setupClearRangeButton: ->
    @$clearRangeButton.on("click", =>
      result = await UI.Dialog("confirm",
        message: "本当に削除しますか？"
      )
      return unless result
      @$clearRangeButton.addClass("hidden")
      @$status.textContent = ":範囲指定削除中"

      try
        await @clearRangeFunc(parseInt($$.C("#{@name}_date_range")[0].value))
        @$status.textContent = ":範囲指定削除完了"
        parent.$$.$("iframe[src=\"/view/#{@name}.html\"]")?.contentWindow.C("view")[0].dispatchEvent(new Event("request_reload"))
      catch
        @$status.textContent = ":範囲指定削除失敗"

      @showCount()
      @afterChangedFunc()
      @$clearRangeButton.removeClass("hidden")
      return
    )
    return
  setupImportButton: ->
    @$importButton.on("click", =>
      if @importFile isnt ""
        @$status.setClass("loading")
        @$status.textContent = ":更新中"
        await @importFunc(JSON.parse(@importFile))
        try
          count = await @countFunc()
          @$status.setClass("done")
          @$status.textContent = ":インポート完了"
          @$clearButton.removeClass("hidden")
        catch
          @$status.setClass("fail")
          @$status.textContent = ":インポート失敗"
        @showCount()
        @afterChangedFunc()
      else
        @$status.addClass("fail")
        @$status.textContent = ":ファイルを選択してください"
      return
    )
    return
  setupExportButton: ->
    @$exportButton.on("click", =>
      data = await @exportFunc()
      exportText = JSON.stringify(data)
      blob = new Blob([exportText], type: "text/plain")
      $a = $__("a")
      $a.href = URL.createObjectURL(blob)
      $a.setAttr("target", "_blank")
      $a.setAttr("download", "read.crx-2_#{@name}.json")
      $a.click()
      return
    )
    return

app.boot("/view/config.html", ["cache", "bbsmenu"], (Cache, BBSMenu) ->
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
    app.NG.set($view.$("textarea[name=\"ngwords\"]").value)
    #ImageReplaceDat設定
    app.ImageReplaceDat.set($view.$("textarea[name=\"image_replace_dat\"]").value)
    #ReplaceStrTxt設定
    app.ReplaceStrTxt.set($view.$("textarea[name=\"replace_str_txt\"]").value)
    return

  #閉じるボタン
  $view.C("button_close")[0].on("click", ->
    if frameElement
      tmp = type: "request_killme"
      parent.postMessage(JSON.stringify(tmp), location.origin)
    whenClose()
    return
  )

  window.on("unload", ->
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
    $view.C("#{dom.name}_text")[0].textContent = dom.value
    dom.on("input", ->
      $view.C("#{@name}_text")[0].textContent = @value
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
    importFunc: ({history, read_state: readState, historyVersion = 1}) ->
      return Promise.all(
        if historyVersion > 1
          historyData = history.map( ({url, title, date, boardTitle}) ->
            return app.History.add(url, title, date, boardTitle)
          )
        else
          historyData = history.map( ({url, title, date}) ->
            return app.History.add(url, title, date, "")
          )
        historyData.concat(readState.map( (rs) ->
          return app.ReadState.set(rs)
        ))
      )
    exportFunc: ->
      [readState, history] = await Promise.all([
        app.ReadState.getAll()
        app.History.getAll()
      ])
      return {"read_state": readState, "history": history, "historyVersion": app.History.DB_VERSION}
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
    importFunc: ({writehistory = null, dbVersion = 1}) ->
      if writehistory
        return Promise.all(writehistory.map( (whis) ->
          whis.inputName = whis.input_name
          whis.inputMail = whis.input_mail
          if dbVersion < 2
            date = new Date(+whis.date)
            year = date.getFullYear()
            month = date.getMonth()
            if (year > 2017 or (year is 2017 and month > 9)) and whis.res > 1
              month--
              if month < 0
                date.setFullYear(date.getFullYear() - 1)
                month = 11
              date.setMonth(month)
              whis.date = date.valueOf()
          return app.WriteHistory.add(whis)
        ))
      else
        return Promise.resolve()
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
      $status.textContent = ":削除中"

      try
        await Cache.delete()
        $status.textContent = ":削除完了"
      catch
        $status.textContent = ":削除失敗"

      setCount()
      updateIndexedDBUsage()
      return
    )
    #キャッシュ範囲削除ボタン
    $clearRangeButton = $view.C("cache_range_clear")[0]
    $clearRangeButton.on("click", ->
      $status.textContent = ":範囲指定削除中"

      try
        await Cache.clearRange(parseInt($view.C("cache_date_range")[0].value))
        $status.textContent = ":削除完了"
      catch
        $status.textContent = ":削除失敗"

      setCount()
      updateIndexedDBUsage()
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
      chrome.bookmarks.get(app.config.get("bookmark_id"), ([folder]) ->
        $$.I("bookmark_source_name").textContent = folder.title
        return
      )
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
    $view.$(".direct.bbsmenu").value = app.config.get("bbsmenu")
    $$.C("bbsmenu_reload")[0].click()
    return

  if $view.$(".direct.bbsmenu").value is ""
    resetBBSMenu()

  $view.$(".direct.bbsmenu").on("change", ->
    if $view.$(".direct.bbsmenu").value isnt ""
      $$.C("bbsmenu_reload")[0].click()
    else
      resetBBSMenu()
    return
  )

  $view.C("bbsmenu_reset")[0].on("click", ->
    resetBBSMenu()
    return
  )

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
                $key.dispatchEvent(new Event("input"))
              when "checkbox"
                $key.checked = (value is "on")
                $key.dispatchEvent(new Event("change"))
              when "radio"
                for dom in $view.$$("input.direct[name=\"#{key}\"]")
                  if dom.value is value
                    dom.checked = true
                $key.dispatchEvent(new Event("change"))
          else
            $keyTextArea = $view.$("textarea[name=\"#{key}\"]")
            if $keyTextArea?
              $keyTextArea.value = value
              $keyTextArea.dispatchEvent(new Event("input"))
            $keySelect = $view.$("select[name=\"#{key}\"]")
            if $keySelect?
              $keySelect.value = value
              $keySelect.dispatchEvent(new Event("change"))
         #config_theme_idは「テーマなし」の場合があるので特例化
         else
           if value is "none"
             $themeNone = $view.C("theme_none")[0]
             $themeNone.click() unless $themeNone.checked
           else
             $view.$("input[name=\"theme_id\"]").value = value
             $view.$("input[name=\"theme_id\"]").dispatchEvent(new Event("change"))
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
    return

  # localstorageの使用状況
  do ->
    chrome.storage.local.getBytesInUse( (usage) ->
      $view.C("localstorage_using")[0].textContent = formatBytes(usage)
      return
    )
    return
)
