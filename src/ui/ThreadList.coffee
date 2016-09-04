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

    table = @table
    $table = $(table)
    $thead = $("<thead>").appendTo($table)
    $table.append("<tbody>")
    $tr = $("<tr>").appendTo($thead)

    #項目のツールチップ表示
    $table
      .on "mouseenter", "td", ->
        app.defer =>
          @title = @textContent
          return
        return
      .on "mouseleave", "td", ->
        @removeAttribute("title")
        return

    for key in Object.keys(keyToLabel) when key in option.th
      $("<th>",
        class: key.replace(/([A-Z])/g, ($0, $1) -> "_" + $1.toLowerCase()),
        text: keyToLabel[key]
      ).appendTo($tr)
      @_flg[key] = true

    selector =
      bookmark: "td:nth-child(#{$table.find("th.bookmark").index() + 1})"
      title: "td:nth-child(#{$table.find("th.title").index() + 1})"
      res: "td:nth-child(#{$table.find("th.res").index() + 1})"
      unread: "td:nth-child(#{$table.find("th.unread").index() + 1})"
      heat: "td:nth-child(#{$table.find("th.heat").index() + 1})"
      writtenRes: "td:nth-child(#{$table.find("th.written_res").index() + 1})"
      viewedDate: "td:nth-child(#{$table.find("th.viewed_date").index() + 1})"

    #ブックマーク更新時処理
    app.message.add_listener "bookmark_updated", (msg) =>
      return if msg.bookmark.type isnt "thread"

      if msg.type is "expired"
        $tr = $table.find("tr[data-href=\"#{msg.bookmark.url}\"]")
        if msg.bookmark.expired
          $tr.addClass("expired")
        else
          $tr.removeClass("expired")

      if @_flg.bookmark
        if msg.type is "added"
          $tr = $table.find("tr[data-href=\"#{msg.bookmark.url}\"]")
          $tr.find(selector.bookmark).text("★")
        else if msg.type is "removed"
          $tr = $table.find("tr[data-href=\"#{msg.bookmark.url}\"]")
          $tr.find(selector.bookmark).text("")

      if @_flg.bookmarkAddRm
        if msg.type is "added"
          @addItem(
            title: msg.bookmark.title
            url: msg.bookmark.url
            res_count: msg.bookmark.res_count or 0
            read_state: msg.bookmark.read_state or null
            created_at: /\/(\d+)\/$/.exec(msg.bookmark.url)[1] * 1000
          )
        else if msg.type is "removed"
          $table.find("tr[data-href=\"#{msg.bookmark.url}\"]").remove()

      if @_flg.res and msg.type is "res_count"
        tr = table.querySelector("tr[data-href=\"#{msg.bookmark.url}\"]")
        if tr
          td = tr.querySelector(selector.res)
          old_res_count = +td.textContent
          td.textContent = msg.bookmark.res_count
          if @_flg.unread
            td = tr.querySelector(selector.unread)
            old_unread = +td.textContent
            unread = old_unread + (msg.bookmark.res_count - old_res_count)
            td.textContent = unread or ""
            if unread > 0
              tr.classList.add("updated")
            else
              tr.classList.remove("updated")
          if @_flg.heat
            td = tr.querySelector(selector.heat)
            td.textContent = ThreadList._calcHeat(
              Date.now()
              /\/(\d+)\/$/.exec(msg.bookmark.url)[1] * 1000
              msg.bookmark.res_count
            )

      if @_flg.title and msg.type is "title"
        $tr = $table.find("tr[data-href=\"#{msg.bookmark.url}\"]")
        $tr.find(selector.title).text(msg.bookmark.title)
      return

    #未読数更新
    if @_flg.unread
      app.message.add_listener "read_state_updated", (msg) ->
        tr = table.querySelector("tr[data-href=\"#{msg.read_state.url}\"]")
        if tr
          res = tr.querySelector(selector.res)
          unread = tr.querySelector(selector.unread)
          unreadCount = Math.max(+res.textContent - msg.read_state.read, 0)
          unread.textContent = unreadCount or ""
          if unreadCount > 0
            tr.classList.add("updated")
          else
            tr.classList.remove("updated")
        return

      app.message.add_listener "read_state_removed", (msg) ->
        tr = table.querySelector("tr[data-href=\"#{msg.url}\"]")
        if tr
          tr.querySelector(selector.unread).textContent = ""
          tr.classList.remove("updated")
        return

    #リスト内検索
    if typeof option.searchbox is "object"
      title_index = $table.find("th.title").index()
      $searchbox = $(option.searchbox)

      $searchbox
        .closest(".view")
          .on "request_reload", ->
            $(option.searchbox).val("").triggerHandler("input")
            return
        .end()
        .on "input", ->
          if @value isnt ""
            $table.table_search("search", {
              query: @value, target_col: title_index})
            hitCount = $table.attr("data-table_search_hit_count")
            $(@).siblings(".hit_count").text(hitCount + "hit").show()
          else
            $table.table_search("clear")
            $(@).siblings(".hit_count").text("").hide()
          return
        .on "keyup", (e) ->
          if e.which is 27 #Esc
            @value = ""
            $(@).triggerHandler("input")
          return

    #コンテキストメニュー
    if @_flg.bookmark or @_flg.bookmarkAddRm or @_flg.writtenRes or @_flg.viewedDate
      do ->
        onClick= ->
          $this = $(@)
          $tr = $($this.parent().data("contextmenu_source"))

          threadURL = $tr.attr("data-href")
          threadTitle = $tr.find(selector.title).text()
          threadRes = $tr.find(selector.res).text()
          threadWrittenRes = parseInt($tr.find(selector.writtenRes).text())
          date = $tr.find(selector.viewedDate).text()
          if date? and date isnt ""
            date_ = /(\d{4})\/(\d\d)\/(\d\d) (\d\d):(\d\d)/.exec(date)
            threadViewedDate = new Date(date_[1], date_[2]-1, date_[3], date_[4], date_[5]).valueOf()

          if $this.hasClass("add_bookmark")
            app.bookmark.add(threadURL, threadTitle, threadRes)
          else if $this.hasClass("del_bookmark")
            app.bookmark.remove(threadURL)
          else if $this.hasClass("del_history")
            app.History.remove(threadURL, threadViewedDate)
            $tr.remove()
          else if $this.hasClass("del_writehistory")
            app.WriteHistory.remove(threadURL, threadWrittenRes)
            $tr.remove()
          else if $this.hasClass("del_read_state")
            app.read_state.remove(threadURL)
            app.History.remove(threadURL)

          $this.parent().remove()
          return

        $table
          .on "contextmenu", "tbody > tr", (e) ->
            if e.type is "contextmenu"
              e.preventDefault()

            app.defer =>
              $menu = $(
                $("#template_thread_list_contextmenu")
                  .prop("content")
                    .querySelector(".thread_list_contextmenu")
              ).clone()

              $menu
                .data("contextmenu_source", @)
                .appendTo($table.closest(".view"))

              url = @getAttribute("data-href")

              if app.bookmark.get(url)
                $menu.find(".add_bookmark").remove()
              else
                $menu.find(".del_bookmark").remove()

              if (
                not that._flg.unread or
                not /^\d+$/.test(@querySelector(selector.unread).textContent) or
                app.bookmark.get(url)?
              )
                $menu.find(".del_read_state").remove()

              $menu.one("click", "li", onClick)

              $.contextmenu($menu, e.clientX, e.clientY)
              return
            return
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

    tbody = @table.querySelector("tbody")
    now = Date.now()

    html = ""

    for item in arg
      trClassName = "open_in_rcrx"
      if item.expired
        trClassName += " expired"
      if item.ng
        trClassName += " ng_thread"

      if app.escape_html(item.title).substr(0,1) isnt "★"
        trClassName += " net"

      tmpHTML = " data-href=\"#{app.escape_html(item.url)}\""
      tmpHTML += " data-title=\"#{app.escape_html(item.title)}\""

      if item.thread_number?
        tmpHTML += " data-thread_number=\"#{app.escape_html(""+item.thread_number)}\""

      tmpHTML += ">"

      #ブックマーク状況
      if @_flg.bookmark
        tmpHTML += "<td>"
        if app.bookmark.get(item.url)
          tmpHTML += "★"
        tmpHTML += "</td>"

      #タイトル
      if @_flg.title
        tmpHTML += "<td>#{app.escape_html(item.title)}</td>"
        if /.+\.2ch\.netの人気スレ|【漫画あり】コンビニで浪人を購入する方法|★★ ２ちゃんねる\(sc\)のご案内 ★★★|浪人はこんなに便利/.test(item.title)
          trClassName += " needlessThread"

      #板名
      if @_flg.boardTitle
        tmpHTML += "<td>#{app.escape_html(item.board_title)}</td>"

      #レス数
      if @_flg.res
        tmpHTML += "<td>"
        if item.res_count > 0
          tmpHTML += app.escape_html(""+item.res_count)
        tmpHTML += "</td>"

      #レス番号
      if @_flg.writtenRes
        tmpHTML += "<td>"
        if item.res > 0
          tmpHTML += app.escape_html(""+item.res)
        tmpHTML += "</td>"

      #未読数
      if @_flg.unread
        tmpHTML += "<td>"
        if item.read_state and item.res_count > item.read_state.read
          trClassName += " updated"
          tmpHTML += app.escape_html(""+(item.res_count - item.read_state.read))
        tmpHTML += "</td>"

      #勢い
      if @_flg.heat
        tmpHTML += "<td>"
        tmpHTML += app.escape_html(ThreadList._calcHeat(now, item.created_at, item.res_count))
        tmpHTML += "</td>"

      #名前
      if @_flg.name
        tmpHTML += "<td>"
        tmpHTML += app.escape_html(item.name)
        tmpHTML += "</td>"

      #メール
      if @_flg.mail
        tmpHTML += "<td>"
        tmpHTML += app.escape_html(item.mail)
        tmpHTML += "</td>"

      #本文
      if @_flg.message
        tmpHTML += "<td>"
        tmpHTML += app.escape_html(item.message)
        tmpHTML += "</td>"

      #作成日時
      if @_flg.createdDate
        tmpHTML += "<td>"
        tmpHTML += app.escape_html(ThreadList._dateToString(new Date(item.created_at)))
        tmpHTML += "</td>"

      #閲覧日時
      if @_flg.viewedDate
        tmpHTML += "<td>"
        tmpHTML += app.escape_html(ThreadList._dateToString(new Date(item.date)))
        tmpHTML += "</td>"

      #書込日時
      if @_flg.writtenDate
        tmpHTML += "<td>"
        tmpHTML += app.escape_html(ThreadList._dateToString(new Date(item.date)))
        tmpHTML += "</td>"

      html += "<tr class=\"#{trClassName}\"" + tmpHTML + "</tr>"

    tbody.insertAdjacentHTML("BeforeEnd", html)
    return

  ###*
  @method empty
  ###
  empty: ->
    $(@table).find("tbody").empty()
    return

  ###*
  @method getSelected
  @return {Element|null}
  ###
  getSelected: ->
    @table.querySelector("tr.selected")

  ###*
  @method select
  @param {Element|number} tr
  ###
  select: (target) ->
    @clearSelect()

    if typeof target is "number"
      target = @table.querySelector("tbody > tr:nth-child(#{target}), tbody > tr:last-child")

    unless target
      return

    target.classList.add("selected")
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
        current = current.nextElementSibling

        while current and current.offsetHeight is 0
          current = current.nextElementSibling

        if not current
          current = prevCurrent
          break
    else
      current = @table.querySelector("tbody > tr")

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
        current = current.previousElementSibling

        while current and current.offsetHeight is 0
          current = current.previousElementSibling

        if not current
          current = prevCurrent
          break
    else
      current = @table.querySelector("tbody > tr")

    if current
      @select(current)
    return

  ###*
  @method clearSelect
  ###
  clearSelect: ->
    @getSelected()?.classList.remove("selected")
    return
