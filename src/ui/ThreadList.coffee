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

    $table = @table
    $thead = $__("thead")
    $table.addLast($thead)
    $table.addLast($__("tbody"))
    $tr = $__("tr")
    $thead.addLast($tr)

    #項目のツールチップ表示
    $table.on("mouseenter", ({target}) ->
      if target.tagName is "TD"
        app.defer( ->
          target.title = target.textContent
          return
        )
      return
    , true)
    $table.on("mouseleave", ({target}) ->
      if target.tagName is "TD"
        target.removeAttr("title")
      return
    , true)

    selector = {}
    column = {}
    i = 0
    for key, j in Object.keys(keyToLabel) when key in option.th
      i++
      $th = $__("th")
      $th.setClass(key.replace(/([A-Z])/g, ($0, $1) -> "_" + $1.toLowerCase()))
      $th.textContent = keyToLabel[key]
      $tr.addLast($th)
      @_flg[key] = true
      selector[key] = "td:nth-child(#{i})"
      column[key] = i

    #ブックマーク更新時処理
    app.message.addListener("bookmark_updated", ({type, bookmark}) =>
      return if bookmark.type isnt "thread"

      if type is "expired"
        $tr = $table.$("tr[data-href=\"#{bookmark.url}\"]")
        if $tr?
          if bookmark.expired
            $tr.addClass("expired")
            if app.config.get("bookmark_show_dat") is "off"
              $tr.addClass("hidden")
            else
              $tr.removeClass("hidden")
          else
            $tr.removeClass("expired")

      if type is "errored"
        $tr = $table.$("tr[data-href=\"#{bookmark.url}\"]")
        $tr?.addClass("errored")

      if @_flg.bookmark
        if type is "added"
          $tr = $table.$("tr[data-href=\"#{bookmark.url}\"]")
          $tr?.$(selector.bookmark).textContent = "★"
        else if type is "removed"
          $tr = $table.$("tr[data-href=\"#{bookmark.url}\"]")
          $tr?.$(selector.bookmark).textContent = ""

      if @_flg.bookmarkAddRm
        if type is "added"
          boardUrl = app.URL.threadToBoard(bookmark.url)
          app.BoardTitleSolver.ask(boardUrl).then( (boardName) =>
            @addItem(
              title: bookmark.title
              url: bookmark.url
              resCount: bookmark.res_count or 0
              readState: bookmark.read_state or null
              createdAt: /\/(\d+)\/$/.exec(bookmark.url)[1] * 1000
              boardUrl: boardUrl
              boardTitle: boardName
              isHttps: (app.URL.getScheme(bookmark.url) is "https")
            )
            return
          )
        else if type is "removed"
          $table.$("tr[data-href=\"#{bookmark.url}\"]").remove()

      if @_flg.res and type is "res_count"
        tr = $table.$("tr[data-href=\"#{bookmark.url}\"]")
        if tr
          td = tr.$(selector.res)
          oldResCount = +td.textContent
          td.textContent = bookmark.res_count
          td.dataset.beforeres = oldResCount
          if @_flg.unread
            td = tr.$(selector.unread)
            oldUnread = +td.textContent
            unread = oldUnread + (bookmark.res_count - oldResCount)
            td.textContent = unread or ""
            if unread > 0
              tr.addClass("updated")
            else
              tr.removeClass("updated")
          if @_flg.heat
            td = tr.$(selector.heat)
            td.textContent = ThreadList._calcHeat(
              Date.now()
              /\/(\d+)\/$/.exec(bookmark.url)[1] * 1000
              bookmark.res_count
            )

      if @_flg.title and type is "title"
        $tr = $table.$("tr[data-href=\"#{bookmark.url}\"]")
        $tr?.$(selector.title).textContent = bookmark.title
      return
    )

    #未読数更新
    if @_flg.unread
      app.message.addListener("read_state_updated", ({read_state}) ->
        tr = $table.$("tr[data-href=\"#{read_state.url}\"]")
        if tr
          res = tr.$(selector.res)
          if +res.textContent < read_state.received
            res.textContent = read_state.received
            tr.addClass("updated")
          unread = tr.$(selector.unread)
          unreadCount = Math.max(+res.textContent - read_state.read, 0)
          unread.textContent = unreadCount or ""
          if unreadCount > 0
            tr.addClass("updated")
          else
            tr.removeClass("updated")
        return
      )

      app.message.addListener("read_state_removed", ({url}) ->
        tr = $table.$("tr[data-href=\"#{url}\"]")
        if tr
          tr.$(selector.unread).textContent = ""
          tr.removeClass("updated")
        return
      )

    #リスト内検索
    if typeof option.searchbox is "object"
      titleIndex = column.title
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
          UI.TableSearch($table, "search",
            query: @value, target_col: titleIndex)
          hitCount = $table.dataset.tableSearchHitCount
          for dom in @parent().child() when dom.hasClass("hit_count")
            dom.textContent = hitCount + "hit"
        else
          UI.TableSearch($table, "clear")
          for dom in @parent().child() when dom.hasClass("hit_count")
            dom.textContent = ""
        return
      )
      $searchbox.on("keyup", ({which}) ->
        if which is 27 #Esc
          @value = ""
          @dispatchEvent(new Event("input"))
        return
      )

    #コンテキストメニュー
    if @_flg.bookmark or @_flg.bookmarkAddRm or @_flg.writtenRes or @_flg.viewedDate
      do =>
        $table.on("contextmenu", (e) =>
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
              not @_flg.unread or
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

              switch true
                when e.target.hasClass("add_bookmark")
                  app.bookmark.add(threadURL, threadTitle, threadRes)
                when e.target.hasClass("del_bookmark")
                  app.bookmark.remove(threadURL)
                when e.target.hasClass("del_history")
                  app.History.remove(threadURL, ThreadList._stringToDate(date))
                  $tr.remove()
                when e.target.hasClass("del_writehistory")
                  app.WriteHistory.remove(threadURL, threadWrittenRes)
                  $tr.remove()
                when e.target.hasClass("ignore_res_number")
                  $tr.setAttr("ignore-res-number", "on")
                  $tr.dispatchEvent(new Event("mousedown", {bubbles: true}))
                when e.target.hasClass("del_read_state")
                  app.ReadState.remove(threadURL)

              @remove()
              return
            )
            UI.ContextMenu($menu, e.clientX, e.clientY)
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
    return (resCount / elapsed).toFixed(1)

  ###*
  @method _dateToString
  @static
  @private
  @param {Date}
  @return {String}
  ###
  @_dateToString: do ->
    fn = (a) -> (if a < 10 then "0" else "") + a
    return (date) ->
      return date.getFullYear() +
        "/" + fn(date.getMonth() + 1) +
        "/" + fn(date.getDate()) +
        " " + fn(date.getHours()) +
        ":" + fn(date.getMinutes())

  ###*
  @method _stringToDate
  @static
  @private
  @param {String}
  @return {Date}
  ###
  @_stringToDate: (date) ->
    date_ = /(\d{4})\/(\d\d)\/(\d\d) (\d\d):(\d\d)/.exec(date)
    return new Date(date_[1], date_[2]-1, date_[3], date_[4], date_[5]).valueOf()

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
      trClassName += " expired" if item.expired
      trClassName += " ng_thread" if item.ng
      trClassName += " net" if item.isNet
      trClassName += " https" if item.isHttps
      if item.expired and app.config.get("bookmark_show_dat") is "off"
        trClassName += " hidden"

      tmpHeadHTML = " data-href=\"#{app.escapeHtml(item.url)}\""
      tmpHeadHTML += " data-title=\"#{app.escapeHtml(item.title)}\""

      if item.threadNumber?
        tmpHeadHTML += " data-thread-number=\"#{app.escapeHtml(""+item.threadNumber)}\""
      if @_flg.writtenRes and item.res > 0
        tmpHeadHTML += " data-written-res-num=\"#{item.res}\""

      tmpHTML = ""

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
        tmpHTML += "<td>#{app.escapeHtml(item.boardTitle)}</td>"

      #レス数
      if @_flg.res
        tmpHTML += "<td>"
        if item.resCount > 0
          tmpHTML += app.escapeHtml(""+item.resCount)
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
        if item.readState and item.resCount > item.readState.read
          trClassName += " updated"
          tmpHTML += app.escapeHtml(""+(item.resCount - item.readState.read))
        tmpHTML += "</td>"

      #勢い
      if @_flg.heat
        tmpHTML += "<td>"
        tmpHTML += app.escapeHtml(ThreadList._calcHeat(now, item.createdAt, item.resCount))
        tmpHTML += "</td>"

      #名前
      if @_flg.name
        tmpHTML += "<td>#{app.escapeHtml(item.name)}</td>"

      #メール
      if @_flg.mail
        tmpHTML += "<td>#{app.escapeHtml(item.mail)}</td>"

      #本文
      if @_flg.message
        tmpHTML += "<td>#{app.escapeHtml(item.message)}</td>"

      #作成日時
      if @_flg.createdDate
        tmpHTML += "<td>"
        tmpHTML += app.escapeHtml(ThreadList._dateToString(new Date(item.createdAt)))
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

      html += "<tr class=\"#{trClassName}\"#{tmpHeadHTML}>#{tmpHTML}</tr>"

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
    return @table.$("tr.selected")

  ###*
  @method select
  @param {Element|number} tr
  ###
  select: (target) ->
    @clearSelect()

    if typeof target is "number"
      target = @table.$("tbody > tr:nth-child(#{target}), tbody > tr:last-child")

    return unless target

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
