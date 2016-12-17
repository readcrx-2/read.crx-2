app.boot "/view/config.html", ["cache", "bbsmenu"], (Cache, BBSMenu) ->
  new app.view.IframeView(document.documentElement)

  $view = $(document.documentElement)

  whenClose = ->
    #NG設定
    app.NG.set($view.find("textarea[name=\"ngwords\"]")[0].value)
    #ImageReplaceDat設定
    app.ImageReplaceDat.set($view.find("textarea[name=\"image_replace_dat\"]")[0].value)
    return

  #閉じるボタン
  $view.find(".button_close").on "click", ->
    if frameElement
      tmp = type: "request_killme"
      parent.postMessage(JSON.stringify(tmp), location.origin)
    whenClose()
    return

  window.addEventListener "unload", ->
    whenClose()
    return

  #掲示板を開いたときに閉じる
  $view.find(".open_in_rcrx").on "click", ->
    $view.find(".button_close").click()
    return

  #汎用設定項目
  $view
    .find("input.direct[type=\"text\"], textarea.direct")
      .each ->
        @value = app.config.get(@name) or ""
        null
      .on "input", ->
        app.config.set(@name, @value)
        return

  $view
    .find("input.direct[type=\"number\"]")
      .each ->
        @value = app.config.get(@name) or "0"
        null
      .on "input", ->
        app.config.set(@name, if not Number.isInteger(@value) then @value else "0")
        return

  $view
    .find("input.direct[type=\"checkbox\"]")
      .each ->
        @checked = app.config.get(@name) is "on"
        null
      .on "change", ->
        app.config.set(@name, if @checked then "on" else "off")
        return

  $view
    .find("input.direct[type=\"radio\"]")
      .each ->
        if @value is app.config.get(@name)
          @checked = true
        return
      .on "change", ->
        val = $view.find("""input[name="#{@name}"]:checked""").val()
        app.config.set(@name, val)
        return

  $view
    .find("input.direct[type=\"range\"]")
      .each ->
        @value = app.config.get(@name) or "0"
        $view.find(".#{@name}_text").text(@value)
        null
      .on "input", ->
        $view.find(".#{@name}_text").text(@value)
        app.config.set(@name, @value)
        return

  #バージョン情報表示
  $view.find(".version_text")
    .text("#{app.manifest.name} v#{app.manifest.version} + #{navigator.userAgent}")

  $view.find(".version_copy").on "click", ->
    app.clipboardWrite($(".version_text").text())
    return

  $view.find(".keyboard_help").on "click", (e) ->
    e.preventDefault()

    app.message.send("showKeyboardHelp", null, parent)
    return

  #忍法帖関連機能
  do ->
    $ninjaInfo = $view.find(".ninja_info")

    updateNinjaInfo = ->
      app.Ninja.getCookie (cookies) ->
        $ninjaInfo.empty()

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
          $div = $(
            $("#template_ninja_item")
              .prop("content")
                .querySelector(".ninja_item")
          ).clone()

          $div.attr("data-siteid", item.site.siteId)
          $div.find(".site_name").text(item.site.siteName)

          if item.hasCookie
            $div.addClass("ninja_item_cookie_found")

          if item.hasBackup
            $div.addClass("ninja_item_backup_available")

          $div.appendTo($ninjaInfo)
        return
      return

    updateNinjaInfo()

    # 「Cookieを削除」ボタン
    $ninjaInfo.on "click", ".ninja_item_cookie_found > button", ->
      siteId = $(@).closest(".ninja_item").attr("data-siteid")
      app.Ninja.deleteCookie(siteId, updateNinjaInfo)
      return

    # 「バックアップから復元」ボタン
    $ninjaInfo.on "click", ".ninja_item_cookie_notfound > button", ->
      siteId = $(@).closest(".ninja_item").attr("data-siteid")
      app.Ninja.restore(siteId, updateNinjaInfo)
      return

    # 「バックアップを削除」ボタン
    $ninjaInfo.on "click", ".ninja_item_backup_available > button", ->
      siteId = $(@).closest(".ninja_item").attr("data-siteid")

      $.dialog("confirm", {
        message: "本当に削除しますか？"
        label_ok: "はい"
        label_no: "いいえ"
      }).done (result) ->
        if result
          app.Ninja.deleteBackup(siteId)
          updateNinjaInfo()
        return
      return
    return

  #板覧更新ボタン
  $view.find(".bbsmenu_reload").on "click", ->
    $button = $(@)
    $status = $view.find(".bbsmenu_reload_status")

    $button.attr("disabled", true)
    $status
      .removeClass("done fail")
      .addClass("loading")
      .text("更新中")

    BBSMenu.get((res) ->
      $button.removeAttr("disabled")
      $status.removeClass("loading")
      if res.status is "success"
        $status
          .addClass("done")
          .text("更新完了")

        iframe = parent.document.querySelector("iframe[src^=\"/view/sidemenu.html\"]")
        if iframe
          tmp = JSON.stringify(type: "request_reload")
          iframe.contentWindow.postMessage(tmp, location.origin)

        #TODO [board_title_solver]も更新するよう変更
      else
        $status
          .addClass("fail")
          .text("更新失敗")
      return
    , true)
    return

  #履歴
  setupHistory = (name, mainClass, cleanFunc, cleanRangeFunc, importFunc, outputFunc) ->
    $clear_button = $view.find(".#{name}_clear")
    $clear_range_button = $view.find(".#{name}_range_clear")
    $status = $view.find(".#{name}_status")

    #履歴件数表示
    mainClass.count().done (count) ->
      $status.text("#{count}件")
      return

    #履歴削除ボタン
    $clear_button.on "click", ->
      $clear_button.addClass("hidden")
      $status.text("削除中")

      cleanFunc()
        .done ->
          $status.text("削除完了")
          parent.$("iframe[src=\"/view/#{name}.html\"]").each ->
            @contentWindow.$(".view").trigger("request_reload")
        .fail ->
          $status.text("削除失敗")
        .always ->
          $clear_button.removeClass("hidden")
      return

    #履歴範囲削除ボタン
    $clear_range_button.on "click", ->
      $clear_range_button.addClass("hidden")
      $status.text("範囲指定削除中")

      cleanRangeFunc(parseInt($view.find(".#{name}_date_range")[0].value))
        .done ->
          $status.text("範囲指定削除完了")
          parent.$("iframe[src=\"view/#{name}.html\"]").each ->
            @contentWindow.$(".view").trigger("request_reload")
        .fail ->
          $status.text("範囲指定削除失敗")
        .always ->
          $clear_range_button.removeClass("hidden")
      return

    #履歴ファイルインポート
    $(".#{name}_file_show").on "click", ->
      $status.removeClass("done fail select")
      $(".#{name}_file_hide").click()
      return

    historyFile = "";
    $(".#{name}_file_hide").change((e) ->
      file = e.target.files
      reader = new FileReader()
      reader.readAsText(file[0])
      reader.onload = ->
        historyFile = reader.result
        $status
          .addClass("select")
          .text("ファイル選択完了")
        return
      return
    )

    #履歴インポート
    $view.find(".#{name}_import").on "click", ->
      if historyFile isnt ""
        $status
          .removeClass("done fail select")
          .addClass("loading")
          .text("更新中")
        importFunc(JSON.parse(historyFile))#適応処理
        .then () ->
          mainClass.count()
        .done (count) ->
          $status
            .addClass("done")
            .text("#{count}件 インポート完了")
          $clear_button.removeClass("hidden")
          return
        .fail ->
          $status
            .addClass("fail")
            .text("インポート失敗")
          return
      else
        $status
          .addClass("fail")
          .text("ファイルを選択してください")
      return

    #履歴エクスポート
    $view.find(".#{name}_export").on "click", ->
      outputFunc().done( (data) ->
        outputText = JSON.stringify(data)
        blob = new Blob([outputText],{type:"text/plain"})
        $a = $("<a>")
        $a.attr({
          href: window.URL.createObjectURL(blob),
          target: "_blank",
          download: "read.crx-2_#{name}.json"
        })
        $a[0].click()
        return
      )
      return
    return

  setupHistory("history", app.History, ->
    return $.when(app.History.clear(), app.read_state.clear())
  , (day) ->
    return app.History.clearRange(day)
  , (inputObj) ->
    deferred_add_func_array = []
    if inputObj.history
      for his in inputObj.history
        deferred_add_func_array.push(app.History.add(his.url, his.title, his.date))
    if inputObj.read_state
      for rs in inputObj.read_state
        deferred_add_func_array.push(app.read_state.set(rs))
    return $.when(deferred_add_func_array...)
  , ->
    d = $.Deferred()
    $.when(
      app.read_state.get_all(),
      app.History.get_all()
    ).done( (read_state_res, history_res) ->
      d.resolve({"read_state": Array.from(read_state_res), "history": Array.from(history_res)})
      return
    )
    return d.promise()
  )
  setupHistory("writehistory", app.WriteHistory, ->
    return app.WriteHistory.clear()
  , (day) ->
    return app.WriteHistory.clearRange(day)
  , (inputObj) ->
    if inputObj.writehistory
      return app.util.concurrent(inputObj.writehistory, (whis) ->
        return app.WriteHistory.add(whis.url, whis.res, whis.title, whis.name, whis.mail, whis.input_name, whis.input_mail, whis.message, whis.date)
      )
    else
      return $.Deferred().resolve().promise()
  , ->
    d = $.Deferred()
    app.WriteHistory.get_all().done( (data) ->
      d.resolve({"writehistory": Array.from(data)})
      return
    )
    return d.promise()
  )

  do ->
    #キャッシュ削除ボタン
    $clear_button = $view.find(".cache_clear")
    $status = $view.find(".cache_status")

    cache = new Cache("*")
    cache.count().done (count) ->
      $status.text("#{count}件")
      return

    $clear_button.on "click", ->
      $clear_button.remove()
      $status.text("削除中")

      cache.delete()
        .done ->
          $status.text("削除完了")
          return
        .fail ->
          $status.text("削除失敗")
          return
      return
    #キャッシュ範囲削除ボタン
    $clear_range_button = $view.find(".cache_range_clear")
    $clear_range_button.on "click", ->
      $status.text("範囲指定削除中")

      cache.clearRange(parseInt($view.find(".cache_date_range")[0].value))
        .done ->
          $status.text("削除完了")
          return
        .fail ->
          $status.text("削除失敗")
          return
      return
    return

  #ブックマークフォルダ変更ボタン
  $view.find(".bookmark_source_change").on "click", ->
    app.message.send("open", url: "bookmark_source_selector")
    return

  #ブックマークインポートボタン
  $view.find(".import_bookmark").on "click", ->
    rcrx_webstore = "hhjpdicibjffnpggdiecaimdgdghainl"
    rcrx_debug = "bhffdiookpgmjkaeiagoecflopbnphhi"
    req = "export_bookmark"

    $button = $(@)
    $status = $(".import_bookmark_status")

    $button.attr("disabled", true)
    $status.text("インポート中")

    $.Deferred (deferred) ->
      parent.chrome.runtime.sendMessage rcrx_webstore, req, (res) ->
        if res
          deferred.resolve(res)
        else
          deferred.reject()
    .then null, ->
      $.Deferred (deferred) ->
        parent.chrome.runtime.sendMessage rcrx_debug, req, (res) ->
          if res
            deferred.resolve(res)
          else
            deferred.reject()
    .done (res) ->
      for url, bookmark of res.bookmark
        if typeof(url) is typeof(bookmark.title) is "string"
          app.bookmark.add(url, bookmark.title)
      for url, bookmark of res.bookmark_board
        if typeof(url) is typeof(bookmark.title) is "string"
          app.bookmark.add(url, bookmark.title)
      $status.text("インポート完了")
    .fail ->
      $status.text("インポートに失敗しました。read.crx v0.73以降がインストールされている事を確認して下さい。")
    .always ->
      $button.attr("disabled", false)

  #「テーマなし」設定
  if app.config.get("theme_id") is "none"
    $view.find(".theme_none").attr("checked", true)

  app.message.add_listener "config_updated", (message) ->
    if message.key is "theme_id"
      $view.find(".theme_none").attr("checked", message.val is "none")
    return

  $view.find(".theme_none").on "click", ->
    app.config.set("theme_id", if @checked then "none" else "default")
    return

  #bbsmenu設定
  resetBBSMenu = ->
    app.config.del("bbsmenu").then ->
      $view.find(".direct.bbsmenu").val(app.config.get("bbsmenu"))

  if $view.find(".direct.bbsmenu").val() is ""
    resetBBSMenu()

  $view.find(".direct.bbsmenu").on "change", ->
    if $view.find(".direct.bbsmenu").val() isnt ""
      $(".bbsmenu_reload").trigger("click")
    return

  $view.find(".bbsmenu_reset").on "click", ->
    resetBBSMenu()
    return

  #設定ファイルインポート
  $(".config_file_show").on "click", ->
    $cfg_status.removeClass("done fail select")
    $(".config_file_hide").click()
    return

  configFile = "";
  $cfg_status = $view.find(".config_import_status")
  $(".config_file_hide").change((e) ->
    file = e.target.files
    reader = new FileReader()
    reader.readAsText(file[0])
    reader.onload = ->
      configFile = reader.result
      $cfg_status
        .addClass("select")
        .text("ファイル選択完了")
      return
    return
  )

  #設定インポート
  $view.find(".config_import_button").on "click", ->
    if configFile isnt ""
      $cfg_status
        .removeClass("done fail select")
        .addClass("loading")
        .text("更新中")
      $.Deferred (d) ->
        jsonConfig = JSON.parse(configFile)
        keySet(jsonConfig)
        d.resolve()
      .done ->
        $cfg_status
          .addClass("done")
          .text("インポート完了")
        return
      .fail ->
        $cfg_status
          .addClass("fail")
          .text("インポート失敗")
        return
    else
      $cfg_status
        .addClass("fail")
        .text("ファイルを選択してください")
    return

  #設定を実際にインポートする
  keySet = (json) ->
    for key, value of json
      key_before = key
      key = key.slice(7)
      if key isnt "theme_id"
        $key = $view.find("input[name=\"#{key}\"]")
        switch $key.attr("type")
          when "text" then $key.val(value).trigger("input")
          when "checkbox"then $key.prop("checked", value is "on").trigger("change")
          when "radio" then $key.val([value]).trigger("change")
          when "range" then $key.val([value]).trigger("input")
          when "number" then $key.val([value]).trigger("input")
          else
            $keyTextArea = $view.find("textarea[name=\"#{key}\"]")
            if $keyTextArea[0] then $keyTextArea.val(value).trigger("input")
       #config_theme_idは「テーマなし」の場合があるので特例化
       else
         if value is "none"
           $theme_none = $view.find(".theme_none")
           if not $theme_none.prop("checked") then $theme_none.trigger("click")
         else $view.find("input[name=\"theme_id\"]").val([value]).trigger("change")
    return

  #設定エクスポート
  $view.find(".config_export_button").on "click", ->
    content = app.config.getAll()
    content = content.replace(/"config_last_board_sort_config":".*?","/,"\"")
    content = content.replace(/"config_last_version":".*?","/,"\"")
    blob = new Blob([content],{type:"text/plain"})
    $a = $("<a>")
    $a.attr({
      href: window.URL.createObjectURL(blob),
      target: "_blank",
      download: "read.crx-2_config.json"
    })
    $a[0].click()
    return

  #datファイルインポート
  $(".dat_file_show").on "click", ->
    $dat_status.removeClass("done fail select")
    $(".dat_file_hide").click()
    return

  datFile = "";
  $dat_status = $view.find(".dat_import_status")
  $(".dat_file_hide").change((e) ->
    file = e.target.files
    reader = new FileReader()
    reader.readAsText(file[0])
    reader.onload = ->
      datFile = reader.result
      $dat_status
        .addClass("select")
        .text("ファイル選択完了")
      return
    return
  )

  #設定インポート
  $view.find(".dat_import_button").on "click", ->
    if datFile isnt ""
      $dat_status
        .removeClass("done fail select")
        .addClass("loading")
        .text("更新中")
      $.Deferred (d) ->
        datDom = $view.find("textarea[name=\"image_replace_dat\"]")
        datDom[0].value = datFile
        datDom.trigger("input")
        d.resolve()
      .done ->
        $dat_status
          .addClass("done")
          .text("インポート完了")
        return
    else
      $dat_status
        .addClass("fail")
        .text("ファイルを選択してください")
    return

  #書込履歴テーブル削除
  $view.find(".writehistory_delete_table").on "click", ->
    openDatabase("WriteHistory", "", "WriteHistory", 0).transaction( (tx) ->
      tx.executeSql("drop table WriteHistory", [])
      $view.find(".writehistory_delete_table").text("テーブル削除(完了)")
      return
    )
    return

  return
