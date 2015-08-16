app.boot "/view/config.html", ["cache", "bbsmenu"], (Cache, BBSMenu) ->
  new app.view.IframeView(document.documentElement)

  $view = $(document.documentElement)

  #閉じるボタン
  $view.find(".button_close").bind "click", ->
    if frameElement
      tmp = type: "request_killme"
      parent.postMessage(JSON.stringify(tmp), location.origin)
    return

  #汎用設定項目
  $view
    .find("input.direct[type=\"text\"], textarea.direct")
      .each ->
        this.value = app.config.get(this.name) or ""
        null
      .bind "input", ->
        app.config.set(this.name, this.value)
        return

  $view
    .find("input.direct[type=\"checkbox\"]")
      .each ->
        this.checked = app.config.get(this.name) is "on"
        null
      .bind "change", ->
        app.config.set(this.name, if this.checked then "on" else "off")
        return

  $view
    .find("input.direct[type=\"radio\"]")
      .each ->
        if this.value is app.config.get(this.name)
          this.checked = true
        return
      .bind "change", ->
        val = $view.find("""input[name="#{this.name}"]:checked""").val()
        app.config.set(this.name, val)
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
  do ->
    $clear_button = $view.find(".history_clear")
    $status = $view.find(".history_status")

    #履歴件数表示
    app.History.count().done (count) ->
      $status.text("#{count}件")
      return

    #履歴削除ボタン
    $clear_button.on "click", ->
      $clear_button.hide()
      $status.text("削除中")

      $.when(app.History.clear(), app.read_state.clear())
        .done ->
          $status.text("削除完了")
          parent.$("iframe[src=\"/view/history.html\"]").each ->
            @contentWindow.$(".view").trigger("request_reload")
        .fail ->
          $status.text("削除失敗")
      return

  #履歴ファイルインポート
  $(".history_file_show").on "click", ->
    $his_status.removeClass("done fail select")
    $(".history_file_hide").click()
    return

  historyFile = "";
  $his_status = $view.find(".history_status")
  $(".history_file_hide").change((e) ->
    file = e.target.files
    reader = new FileReader()
    reader.readAsText(file[0])
    reader.onload = ->
        historyFile = reader.result
        $his_status
          .addClass("select")
          .text("ファイル選択完了")
      return
    return
  )

  #履歴インポート
  $view.find(".history_import").on "click", ->
    if historyFile isnt ""
      $his_status
        .removeClass("done fail select")
        .addClass("loading")
        .text("更新中")
      historySet(historyFile)#適応処理
      .done ->
        app.History.count().done (count) ->
          $his_status
            .addClass("done")
            .text("#{count}件 インポート完了")
          $view.find(".history_clear").show()
        return
      .fail ->
        $his_status
          .addClass("fail")
          .text("インポート失敗")
        return
    else
      $his_status
        .addClass("fail")
        .text("インポート失敗")
    return

  #履歴を実際にインポートする
  historySet = (text) ->
    inputObj = JSON.parse(text)
    history_array  = inputObj.history
    read_state_array  = inputObj.read_state
    deferred_add_func_array = []
    for his in history_array
      deferred_add_func_array.push(app.History.add(his.url, his.title, his.date))
    for rs in read_state_array
      deferred_add_func_array.push(app.read_state.set(rs))
    return $.when.apply(null, deferred_add_func_array)

  #履歴エクスポート
  $view.find(".history_export").on "click", ->
    $.when(
      app.read_state.get_all(),
      app.History.get_all()
    ).done( (read_state_res, history_res) ->
      read_state_array = []
      for rs in read_state_res
        read_state_array.push(rs)
      history_array = []
      for his in history_res
        history_array.push(his)
      outputObj = {"read_state": read_state_array, "history": history_array}
      outputText = JSON.stringify(outputObj)
      blob = new Blob([outputText],{type:"text/plain"})
      $a = $("<a>")
      $a.attr({
        href: window.URL.createObjectURL(blob),
        target: "_blank",
        download: "read.crx-2_history.json"
      })
      $a[0].click()
      return
    )
    return

  #キャッシュ削除ボタン
  do ->
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

  #ブックマークフォルダ変更ボタン
  $view.find(".bookmark_source_change").bind "click", ->
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
      parent.chrome.extension.sendRequest rcrx_webstore, req, (res) ->
        if res
          deferred.resolve(res)
        else
          deferred.reject()
    .pipe null, ->
      $.Deferred (deferred) ->
        parent.chrome.extension.sendRequest rcrx_debug, req, (res) ->
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

  $view.find(".direct.bbsmenu").bind "change", ->
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
        jsonConfig = $.parseJSON(configFile)
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
        .text("インポート失敗")
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

  return
