window.UI ?= {}

###*
@namespace UI
@class ThreadList
@constructor
@param {Element} table
@param {Object} option
  @param {Boolean} [option.bookmark=false]
  @param {Boolean} [option.title=false]
  @param {Boolean} [option.boardTitle=false]
  @param {Boolean} [option.res=false]
  @param {Boolean} [option.unread=false]
  @param {Boolean} [option.heat=false]
  @param {Boolean} [option.createdDate=false]
  @param {Boolean} [option.viewedDate=false]
  @param {Boolean} [option.bookmarkAddRm=false]
  @param {Element} [option.searchbox]
@requires jQuery
###
class UI.ThreadList
  "use Strict"

  constructor: (@table, option) ->
    ###*
    @property _flg
    @type Object
    @private
    ###
    @_flg =
      bookmark: false
      title: false
      boardTitle: false
      res: false
      writtenRes: false
      unread: false
      heat: false
      name: false
      mail: false
      message: false
      createdDate: false
      viewedDate: false
      writtenDate: false

      bookmarkAddRm: !!option.bookmarkAddRm
      searchbox: undefined

    keyToLabel =
      bookmark: "★"
      title: "タイトル"
      boardTitle: "板名"
      res: "レス数"
      writtenRes: "レス番号"
      unread: "未読数"
      heat: "勢い"
      name: "名前"
      mail: "メール"
      message: "本文"
      createdDate: "作成日時"
      viewedDate: "閲覧日時"
      writtenDate: "書込日時"

    that = @

    $table = @table
    $thead = $__("thead")
    $table.addLast($thead)
    $table.addLast($__("tbody"))
    $tr = $__("tr")
    $thead.addLast($tr)

    #項目のツールチップ表示
    $table.on("mouseenter", (e) ->
      if e.target.tagName is "TD"
        app.defer( ->
          e.target.title = e.target.textContent
          return
        )
      return
    , true)
    $table.on("mouseleave", (e) ->
      if e.target.tagName is "TD"
        e.target.removeAttr("title")
      return
    , true)

    selector = {}
    column = {}
    i = 0
    for key in Object.keys(keyToLabel) when key in option.th
      i++
      $th = $__("th")
      $th.setClass(key.replace(/([A-Z])/g, ($0, $1) -> "_" + $1.toLowerCase()))
      $th.textContent = keyToLabel[key]
      $tr.addLast($th)
      @_flg[key] = true
      selector[key] = "td:nth-child(#{i})"
      column[key] = i

    #ブックマーク更新時処理
    app.message.addListener "bookmark_updated", (msg) =>
      return if msg.bookmark.type isnt "thread"

      if msg.type is "expired"
        $tr = $table.$("tr[data-href=\"#{msg.bookmark.url}\"]")
        if $tr?
          if msg.bookmark.expired
            $tr.addClass("expired")
            if app.config.get("bookmark_show_dat") is "off"
              $tr.addClass("hidden")
            else
              $tr.removeClass("hidden")
          else
            $tr.removeClass("expired")

      if msg.type is "errored"
        $tr = $table.$("tr[data-href=\"#{msg.bookmark.url}\"]")
        $tr?.addClass("errored")

      if @_flg.bookmark
        if msg.type is "added"
          $tr = $table.$("tr[data-href=\"#{msg.bookmark.url}\"]")
          $tr?.$(selector.bookmark).textContent = "★"
        else if msg.type is "removed"
          $tr = $table.$("tr[data-href=\"#{msg.bookmark.url}\"]")
          $tr?.$(selector.bookmark).textContent = ""

      if @_flg.bookmarkAddRm
        if msg.type is "added"
          boardUrl = app.URL.threadToBoard(msg.bookmark.url)
          app.BoardTitleSolver.ask(boardUrl).then( (boardName) =>
            @addItem(
              title: msg.bookmark.title
              url: msg.bookmark.url
              res_count: msg.bookmark.res_count or 0
              read_state: msg.bookmark.read_state or null
              created_at: /\/(\d+)\/$/.exec(msg.bookmark.url)[1] * 1000
              board_url: boardUrl
              board_title: boardName
              is_https: (app.URL.getScheme(msg.bookmark.url) is "https")
            )
            return
          )
        else if msg.type is "removed"
          $table.$("tr[data-href=\"#{msg.bookmark.url}\"]").remove()

      if @_flg.res and msg.type is "res_count"
        tr = $table.$("tr[data-href=\"#{msg.bookmark.url}\"]")
        if tr
          td = tr.$(selector.res)
          old_res_count = +td.textContent
          td.textContent = msg.bookmark.res_count
          td.dataset.beforeres = old_res_count
          if @_flg.unread
            td = tr.$(selector.unread)
            old_unread = +td.textContent
            unread = old_unread + (msg.bookmark.res_count - old_res_count)
            td.textContent = unread or ""
            if unread > 0
              tr.addClass("updated")
            else
              tr.removeClass("updated")
          if @_flg.heat
            td = tr.$(selector.heat)
            td.textContent = ThreadList._calcHeat(
              Date.now()
              /\/(\d+)\/$/.exec(msg.bookmark.url)[1] * 1000
              msg.bookmark.res_count
            )

      if @_flg.title and msg.type is "title"
        $tr = $table.$("tr[data-href=\"#{msg.bookmark.url}\"]")
        $tr?.$(selector.title).textContent = msg.bookmark.title
      return

    #未読数更新
    if @_flg.unread
      app.message.addListener "read_state_updated", (msg) ->
        tr = $table.$("tr[data-href=\"#{msg.read_state.url}\"]")
        if tr
          res = tr.$(selector.res)
          unread = tr.$(selector.unread)
          unreadCount = Math.max(+res.textContent - msg.read_state.read, 0)
          unread.textContent = unreadCount or ""
          if unreadCount > 0
            tr.addClass("updated")
          else
            tr.removeClass("updated")
        return

      app.message.addListener "read_state_removed", (msg) ->
        tr = $table.$("tr[data-href=\"#{msg.url}\"]")
        if tr
          tr.$(selector.unread).textContent = ""
          tr.removeClass("updated")
        return

    #リスト内検索
    if typeof option.searchbox is "object"
      title_index = column.title
      $searchbox = option.searchbox

      _isComposing = false
      $searchbox.on("compositionstart", ->
        _isComposing = true
        return
      )
      $searchbox.on("compositionend", ->
        _isComposing = false
        @dispatchEvent(new Event("input"))
        return
      )
      $searchbox.on("input", ->
        return if _isComposing
        if @value isnt ""
          UI.table_search($table, "search", {
            query: @value, target_col: title_index})
          hitCount = $table.dataset.tableSearchHitCount
          for dom in @parent().child() when dom.hasClass("hit_count")
            dom.textContent = hitCount + "hit"
        else
          UI.table_search($table, "clear")
          for dom in @parent().child() when dom.hasClass("hit_count")
            dom.textContent = ""
        return
      )
      $searchbox.on("keyup", (e) ->
        if e.which is 27 #Esc
          @value = ""
          @dispatchEvent(new Event("input"))
        return
      )

    #コンテキストメニュー
    if @_flg.bookmark or @_flg.bookmarkAddRm or @_flg.writtenRes or @_flg.viewedDate
      do ->
        $table.on("contextmenu", (e) ->
          target = e.target.closest("tbody > tr")
          return unless target
          if e.type is "contextmenu"
            e.preventDefault()

          app.defer( =>
            $menu = $$.I("template_thread_list_contextmenu").content.$(".thread_list_contextmenu").cloneNode(true)
            $table.closest(".view").addLast($menu)

            url = target.dataset.href

            if app.bookmark.get(url)
              $menu.C("add_bookmark")[0]?.remove()
            else
              $menu.C("del_bookmark")[0]?.remove()

            if (
              not that._flg.unread or
              not /^\d+$/.test(target.$(selector.unread).textContent) or
              app.bookmark.get(url)?
            )
              $menu.C("del_read_state")[0]?.remove()

            $menu.on("click", fn = (e) ->
              return if e.target.tagName isnt "LI"
              $menu.off("click", fn)

              $tr = target

              threadURL = $tr.dataset.href
              threadTitle = $tr.$(selector.title)?.textContent
              threadRes = $tr.$(selector.res)?.textContent
              threadWrittenRes = parseInt($tr.$(selector.writtenRes)?.textContent ? 0)
              date = $tr.$(selector.viewedDate)?.textContent
              if date? and date isnt ""
                date_ = /(\d{4})\/(\d\d)\/(\d\d) (\d\d):(\d\d)/.exec(date)
                threadViewedDate = new Date(date_[1], date_[2]-1, date_[3], date_[4], date_[5]).valueOf()

              if e.target.hasClass("add_bookmark")
                app.bookmark.add(threadURL, threadTitle, threadRes)
              else if e.target.hasClass("del_bookmark")
                app.bookmark.remove(threadURL)
              else if e.target.hasClass("del_history")
                app.History.remove(threadURL, threadViewedDate)
                $tr.remove()
              else if e.target.hasClass("del_writehistory")
                app.WriteHistory.remove(threadURL, threadWrittenRes)
                $tr.remove()
              else if e.target.hasClass("ignore_res_number")
                $tr.setAttr("ignore-res-number", "on")
                $tr.dispatchEvent(new Event("mousedown", {bubbles: true}))
              else if e.target.hasClass("del_read_state")
                app.ReadState.remove(threadURL)

              @remove()
              return
            )
            UI.contextmenu($menu, e.clientX, e.clientY)
            return
          )
          return
        )
      return
    return

  ###*
  @method _calcHeat
  @static
  @private
  @param {Number} now
  @param {Number} created
  @param {Number} resCount
  @return {String}
  ###
  @_calcHeat: (now, created, resCount) ->
    if not /^\d+$/.test(created)
      created = (new Date(created)).getTime()
    if created > now
      return "0.0"
    elapsed = Math.max((now - created) / 1000, 1) / (24 * 60 * 60)
    (resCount / elapsed).toFixed(1)

  ###*
  @method _dateToString
  @static
  @private
  @param {Date}
  @return {String}
  ###
  @_dateToString: do ->
    fn = (a) -> (if a < 10 then "0" else "") + a
    (date) ->
      date.getFullYear() +
      "/" + fn(date.getMonth() + 1) +
      "/" + fn(date.getDate()) +
      " " + fn(date.getHours()) +
      ":" + fn(date.getMinutes())

  ###*
  @method addItem
  @param {Object|Array}
  ###
  addItem: (arg) ->
    unless Array.isArray(arg) then arg = [arg]

    $tbody = @table.$("tbody")
    now = Date.now()

    html = ""

    for item in arg
      trClassName = "open_in_rcrx"
      if item.expired
        trClassName += " expired"
      if item.ng
        trClassName += " ng_thread"
      if item.is_net
        trClassName += " net"
      if item.is_https
        trClassName += " https"
      if item.expired and app.config.get("bookmark_show_dat") is "off"
        trClassName += " hidden"

      tmpHTML = " data-href=\"#{app.escapeHtml(item.url)}\""
      tmpHTML += " data-title=\"#{app.escapeHtml(item.title)}\""

      if item.thread_number?
        tmpHTML += " data-thread-number=\"#{app.escapeHtml(""+item.thread_number)}\""
      if @_flg.writtenRes and item.res > 0
        tmpHTML += " data-written-res-num=\"#{item.res}\""

      tmpHTML += ">"

      #ブックマーク状況
      if @_flg.bookmark
        tmpHTML += "<td>"
        if app.bookmark.get(item.url)
          tmpHTML += "★"
        tmpHTML += "</td>"

      #タイトル
      if @_flg.title
        tmpHTML += "<td>#{app.escapeHtml(item.title)}</td>"

      #板名
      if @_flg.boardTitle
        tmpHTML += "<td>#{app.escapeHtml(item.board_title)}</td>"

      #レス数
      if @_flg.res
        tmpHTML += "<td>"
        if item.res_count > 0
          tmpHTML += app.escapeHtml(""+item.res_count)
        tmpHTML += "</td>"

      #レス番号
      if @_flg.writtenRes
        tmpHTML += "<td>"
        if item.res > 0
          tmpHTML += app.escapeHtml(""+item.res)
        tmpHTML += "</td>"

      #未読数
      if @_flg.unread
        tmpHTML += "<td>"
        if item.read_state and item.res_count > item.read_state.read
          trClassName += " updated"
          tmpHTML += app.escapeHtml(""+(item.res_count - item.read_state.read))
        tmpHTML += "</td>"

      #勢い
      if @_flg.heat
        tmpHTML += "<td>"
        tmpHTML += app.escapeHtml(ThreadList._calcHeat(now, item.created_at, item.res_count))
        tmpHTML += "</td>"

      #名前
      if @_flg.name
        tmpHTML += "<td>"
        tmpHTML += app.escapeHtml(item.name)
        tmpHTML += "</td>"

      #メール
      if @_flg.mail
        tmpHTML += "<td>"
        tmpHTML += app.escapeHtml(item.mail)
        tmpHTML += "</td>"

      #本文
      if @_flg.message
        tmpHTML += "<td>"
        tmpHTML += app.escapeHtml(item.message)
        tmpHTML += "</td>"

      #作成日時
      if @_flg.createdDate
        tmpHTML += "<td>"
        tmpHTML += app.escapeHtml(ThreadList._dateToString(new Date(item.created_at)))
        tmpHTML += "</td>"

      #閲覧日時
      if @_flg.viewedDate
        tmpHTML += "<td>"
        tmpHTML += app.escapeHtml(ThreadList._dateToString(new Date(item.date)))
        tmpHTML += "</td>"

      #書込日時
      if @_flg.writtenDate
        tmpHTML += "<td>"
        tmpHTML += app.escapeHtml(ThreadList._dateToString(new Date(item.date)))
        tmpHTML += "</td>"

      html += "<tr class=\"#{trClassName}\"" + tmpHTML + "</tr>"

    $tbody.insertAdjacentHTML("BeforeEnd", html)
    return

  ###*
  @method empty
  ###
  empty: ->
    @table.$("tbody").innerHTML = ""
    return

  ###*
  @method getSelected
  @return {Element|null}
  ###
  getSelected: ->
    @table.$("tr.selected")

  ###*
  @method select
  @param {Element|number} tr
  ###
  select: (target) ->
    @clearSelect()

    if typeof target is "number"
      target = @table.$("tbody > tr:nth-child(#{target}), tbody > tr:last-child")

    unless target
      return

    target.addClass("selected")
    target.scrollIntoViewIfNeeded()
    return

  ###*
  @method selectNext
  @param {number} [repeat = 1]
  ###
  selectNext: (repeat = 1) ->
    current = @getSelected()

    if current
      for [0...repeat]
        prevCurrent = current
        current = current.next()

        while current and current.offsetHeight is 0
          current = current.next()

        if not current
          current = prevCurrent
          break
    else
      current = @table.$("tbody > tr")

    if current
      @select(current)
    return

  ###*
  @method selectPrev
  @param {number} [repeat = 1]
  ###
  selectPrev: (repeat = 1) ->
    current = @getSelected()

    if current
      for [0...repeat]
        prevCurrent = current
        current = current.prev()

        while current and current.offsetHeight is 0
          current = current.prev()

        if not current
          current = prevCurrent
          break
    else
      current = @table.$("tbody > tr")

    if current
      @select(current)
    return

  ###*
  @method clearSelect
  ###
  clearSelect: ->
    @getSelected()?.removeClass("selected")
    return
