window.UI ?= {}

###*
@namespace UI
@class ThreadContent
@constructor
@param {String} URL
@param {Element} container
@requires jQuery
###
class UI.ThreadContent
  constructor: (@url, @container) ->
    ###*
    @property _$container
    @type Object
    @private
    ###
    @_$container = $(@container)

    ###*
    @property idIndex
    @type Object
    ###
    @idIndex = {}

    ###*
    @property slipIndex
    @type Object
    ###
    @slipIndex = {}

    ###*
    @property tripIndex
    @type Object
    ###
    @tripIndex = {}

    ###*
    @property repIndex
    @type Object
    ###
    @repIndex = {}

    ###*
    @property writtenRes
    @type Array
    ###
    @getWrittenRes = =>
      d = $.Deferred()
      app.WriteHistory.getByUrl(@url).done( (data) ->
        d.resolve(data)
        return
      )
      return d.promise()

    ###*
    @property oneId
    @type null | String
    ###
    @oneId = null
    return

  ###*
  @method scrollTo
  @param {Number} resNum
  @param {Boolean} [animate=false]
  @param {Number} [offset=0]
  ###
  scrollTo: (resNum, animate = false, offset = 0) ->
    target = @container.childNodes[resNum - 1]

    # 検索中で、ターゲットが非ヒット項目で非表示の場合、スクロールを中断
    if target and @container.classList.contains("searching") and not target.classList.contains("search_hit")
      target = null

    # もしターゲットがNGだった場合、その直前の非NGレスをターゲットに変更する
    if target and target.classList.contains("ng")
      target = $(target).prevAll(":not(.ng)")[0]

    if target
      if animate
        @_$container.animate(scrollTop: target.offsetTop + offset)
      else
        @container.scrollTop = target.offsetTop + offset
    return

  ###*
  @method getRead
  @return {Number} 現在読んでいると推測されるレスの番号
  ###
  getRead: ->
    containerBottom = @container.scrollTop + @container.clientHeight
    read = @container.children.length
    for res, key in @container.children when res.offsetTop > containerBottom
      read = key - 1
      break

    # >>1の底辺が表示領域外にはみ出していた場合対策
    if read is 0
      read = 1

    read

  ###*
  @method getSelected
  @return {Element|null}
  ###
  getSelected: ->
    @container.querySelector("article.selected")

  ###*
  @method select
  @param {Element | Number} target
  @param {bool} [preventScroll = false]
  ###
  select: (target, preventScroll = false) ->
    @container.querySelector("article.selected")?.classList.remove("selected")

    if typeof target is "number"
      target = @container.querySelector("article:nth-child(#{target}), article:last-child")

    unless target
      return

    target.classList.add("selected")
    if not preventScroll
      @scrollTo(+target.querySelector(".num").textContent)
    return

  ###*
  @method clearSelect
  ###
  clearSelect: ->
    @getSelected()?.classList.remove("selected")
    return

  ###*
  @method selectNext
  @param {number} [repeat = 1]
  ###
  selectNext: (repeat = 1) ->
    current = @getSelected()

    # 現在選択されているレスが表示範囲外だった場合、それを無視する
    if (
      current and
      (
        current.offsetTop + current.offsetHeight < @container.scrollTop or
        @container.scrollTop + @container.offsetHeight < current.offsetTop
      )
    )
      current = null

    unless current
      @select(@container.children[@getRead() - 1], true)
    else
      target = current

      for [0...repeat]
        prevTarget = target

        if (
          (
            target.offsetTop + target.offsetHeight <=
            @container.scrollTop + @container.offsetHeight
          ) and
          target.nextElementSibling
        )
          target = target.nextElementSibling

          while target and target.offsetHeight is 0
            target = target.nextElementSibling

        if not target
          target = prevTarget
          break

        if (
          @container.scrollTop + @container.offsetHeight <
          target.offsetTop + target.offsetHeight
        )
          if target.offsetHeight >= @container.offsetHeight
            @container.scrollTop += @container.offsetHeight * 0.5
          else
            @container.scrollTop = (
              target.offsetTop -
              @container.offsetHeight +
              target.offsetHeight +
              10
            )
        else if not target.nextElementSibling
          @container.scrollTop += @container.offsetHeight * 0.5
          if target is prevTarget
            break

      if target and target isnt current
        @select(target, true)
    return

  ###*
  @method selectPrev
  @param {number} [repeat = 1]
  ###
  selectPrev: (repeat = 1) ->
    current = @getSelected()

    # 現在選択されているレスが表示範囲外だった場合、それを無視する
    if (
      current and
      (
        current.offsetTop + current.offsetHeight < @container.scrollTop or
        @container.scrollTop + @container.offsetHeight < current.offsetTop
      )
    )
      current = null

    unless current
      @select(@container.children[@getRead() - 1], true)
    else
      target = current

      for [0...repeat]
        prevTarget = target

        if (
          @container.scrollTop <= target.offsetTop and
          target.previousElementSibling
        )
          target = target.previousElementSibling

          while target and target.offsetHeight is 0
            target = target.previousElementSibling

        if not target
          target = prevTarget
          break

        if @container.scrollTop > target.offsetTop
          if target.offsetHeight >= @container.offsetHeight
            @container.scrollTop -= @container.offsetHeight * 0.5
          else
            @container.scrollTop = target.offsetTop - 10
        else if not target.previousElementSibling
          @container.scrollTop -= @container.offsetHeight * 0.5
          if target is prevTarget
            break

      if target and target isnt current
        @select(target, true)
    return

  ###*
  @method addItem
  @param {Object | Array}
  ###
  addItem: (items) ->
    d = $.Deferred()
    unless Array.isArray(items)
      items = [items]

    resNum = @container.children.length
    ng = app.NG.get()

    @getWrittenRes().done((writtenRes) =>
      html = ""

      for res in items
        resNum++

        articleClass = []
        articleDataId = null
        articleDataSlip = null
        articleDataTrip = null

        if /(?:\u3000{5}|\u3000\u0020|[^>]\u0020\u3000)(?!<br>|$)/i.test(res.message)
          articleClass.push("aa")

        for writtenHistory in writtenRes when writtenHistory.res is resNum
          articleClass.push("written")
          break

        articleHtml = "<header>"

        #.num
        articleHtml += """<span class="num">#{resNum}</span> """

        #.name
        articleHtml += """<span class="name"""
        if /^\s*(?:&gt;|\uff1e){0,2}([\d\uff10-\uff19]+(?:[\-\u30fc][\d\uff10-\uff19]+)?(?:\s*,\s*[\d\uff10-\uff19]+(?:[\-\u30fc][\d\uff10-\uff19]+)?)*)\s*$/.test(res.name)
          articleHtml += " name_anchor"
        tmp = (
          res.name
            .replace(/<(?!(?:\/?b|\/?font(?: color="?[#a-zA-Z0-9]+"?)?)>)/g, "&lt;")
            .replace(/<\/b>\(([^<>]+? [^<>]+?)\)<b>$/, ($0, $1) =>
              articleDataSlip = $1

              @slipIndex[$1] = [] unless @slipIndex[$1]?
              @slipIndex[$1].push(resNum)

              return ""
            )
            .replace(/<\/b>(◆[^<>]+?) <b>/, ($0, $1) =>
              articleDataTrip = $1

              @tripIndex[$1] = [] unless @tripIndex[$1]?
              @tripIndex[$1].push(resNum)

              return """<span class="trip">#{$1}</span>"""
            )
            .replace(/<\/b>(.*?)<b>/g, """<span class="ob">$1</span>""")
            .replace(/&lt;span.*?>(.*?)&lt;\/span>/g, "<span class=\"ob\">$1</span>")
            .replace(/&lt;small.*?>(.*?)&lt;\/small>/g, "<small>$1</small>")
        )
        articleHtml += """">#{tmp}</span>"""

        #.mail
        tmp = res.mail.replace(/<.*?(?:>|$)/g, "")
        articleHtml += """ [<span class="mail">#{tmp}</span>] """

        #.other
        tmp = (
          res.other
            #タグ除去
            .replace(/<.*?(?:>|$)/g, "")
            #.id
            .replace(/(?:^| )(ID:(?!\?\?\?)[^ <>"']+|発信元:\d+.\d+.\d+.\d+)/, ($0, $1) =>
              fixedId = $1.replace(/\u25cf$/, "") #末尾●除去

              articleDataId = fixedId

              if resNum is 1
                @oneId = fixedId

              if fixedId is @oneId
                articleClass.push("one")

              if fixedId.substr(-4,4) is ".net"
                articleClass.push("net")

              @idIndex[fixedId] = [] unless @idIndex[fixedId]?
              @idIndex[fixedId].push(resNum)

              return """<span class="id">#{$1}</span>"""
            )
            #.beid
            .replace /(?:^| )(BE:(\d+)\-[A-Z\d]+\(\d+\))/,
              """<a class="beid" href="http://be.2ch.net/test/p.php?i=$3" target="_blank">$1</a>"""
        )
        # slip追加
        if articleDataSlip?
          if (index = tmp.indexOf("<span class=\"id\">")) isnt -1
            tmp = tmp.slice(0, index) + """<span class="slip">SLIP:#{articleDataSlip}</span>""" + tmp.slice(index, tmp.length)
          else
            tmp += """<span class="slip">SLIP:#{articleDataSlip}</span>"""

        articleHtml += """<span class="other">#{tmp}</span>"""

        articleHtml += "</header>"

        #文字色
        color = res.message.match(/<font color="(.*?)">/i)
        tmp = (
          res.message
            #imgタグ変換
            .replace(/<img src="(.*?)".*?>/ig, "$1")
            #Rock54
            .replace(/(?:<small.*?>&#128064;|<i>&#128064;<\/i>)<br>Rock54: (Caution|Warning)\((.+?)\) ?.*?(?:<\/small>)?/ig, "<div class=\"rock54\">&#128064; Rock54: $1($2)</div>")
            #SLIPが変わったという表示
            .replace(/<hr>VIPQ2_EXTDAT: (.+): EXT was configured /i, "<div class=\"slipchange\">VIPQ2_EXTDAT: $1: EXT configure</div>")
            #タグ除去
            .replace(/<(?!(?:br|hr|div class="(?:rock54|slipchange)"|\/?b)>).*?(?:>|$)/ig, "")
            #URLリンク
            .replace(/(h)?(ttps?:\/\/(?!img\.2ch\.net\/(?:ico|emoji)\/[\w\-_]+\.gif)(?:[a-hj-zA-HJ-Z\d_\-.!~*'();\/?:@=+$,%#]|\&(?!gt;)|[iI](?![dD]:)+)+)/g,
              '<a href="h$2" target="_blank">$1$2</a>')
            #Beアイコン埋め込み表示
            .replace ///^(?:\s*sssp|https?)://(img\.2ch\.net/ico/[\w\-_]+\.gif)\s*<br>///, ($0, $1) =>
              if app.url.tsld(@url) in ["2ch.net", "bbspink.com", "2ch.sc"]
                """<img class="beicon" src="/img/dummy_1x1.png" data-src="http://#{$1}"><br>"""
              else
                $0
            #エモーティコン埋め込み表示
            .replace ///(?:\s*sssp|https?)://(img\.2ch\.net/emoji/[\w\-_]+\.gif)\s*///g, ($0, $1) =>
              if app.url.tsld(@url) in ["2ch.net", "bbspink.com", "2ch.sc"]
                """<img class="beicon emoticon" src="/img/dummy_1x1.png" data-src="http://#{$1}">"""
              else
                $0
            #アンカーリンク
            .replace app.util.Anchor.reg.ANCHOR, ($0) =>
              anchor = app.util.Anchor.parseAnchor($0)

              if anchor.targetCount >= 25
                disabled = true
                disabledReason = "指定されたレスの量が極端に多いため、ポップアップを表示しません"
              else if anchor.targetCount is 0
                disabled = true
                disabledReason = "指定されたレスが存在しません"
              else
                disabled = false

              #rep_index更新
              if not disabled
                for segment in anchor.segments
                  target = segment[0]
                  while target <= segment[1]
                    @repIndex[target] = [] unless @repIndex[target]?
                    @repIndex[target].push(resNum) unless resNum in @repIndex[target]
                    target++

              "<a href=\"javascript:undefined;\" class=\"anchor" +
              (if disabled then " disabled\" data-disabled_reason=\"#{disabledReason}\"" else "\"") +
              ">#{$0}</a>"
            #IDリンク
            .replace /id:(?:[a-hj-z\d_\+\/\.\!]|i(?!d:))+/ig, ($0) ->
              "<a href=\"javascript:undefined;\" class=\"anchor_id\">#{$0}</a>"
        )
        articleHtml += "<div class=\"message\""
        if color? then articleHtml += " style=\"color:##{color[1]};\""
        articleHtml += ">#{tmp}</div>"

        tmpTxt1 = res.name + " " + res.mail + " " + res.other + " " + res.message
        tmpTxt2 = app.util.normalize(tmpTxt1)
        for n in ng
          if n.start? and ((n.finish? and n.start <= resNum and resNum <= n.finish) or (parseInt(n.start) is resNum))
            continue
          if (
            (n.type is ("regExp") and n.reg.test(tmpTxt1)) or
            (n.type is ("regExpName") and n.reg.test(res.name)) or
            (n.type is ("regExpMail") and n.reg.test(res.mail)) or
            (n.type is ("regExpId") and articleDataId? and n.reg.test(articleDataId)) or
            (n.type is ("regExpBody") and n.reg.test(res.message)) or
            (n.type is ("name") and app.util.normalize(res.name).includes(n.word)) or
            (n.type is ("mail") and app.util.normalize(res.mail).includes(n.word)) or
            (n.type is ("id") and articleDataId?.includes(n.word)) or
            (n.type is ("body") and app.util.normalize(res.message).includes(n.word)) or
            (n.type is ("word") and tmpTxt2.includes(n.word))
          )
            articleClass.push("ng")
            break

        tmp = ""
        tmp += " class=\"#{articleClass.join(" ")}\""
        if articleDataId?
          tmp += " data-id=\"#{articleDataId}\""
        if articleDataSlip?
          tmp += " data-slip=\"#{articleDataSlip}\""
        if articleDataTrip?
          tmp += " data-trip=\"#{articleDataTrip}\""

        articleHtml = """<article#{tmp}>#{articleHtml}</article>"""
        html += articleHtml

      @container.insertAdjacentHTML("BeforeEnd", html)

      #idカウント, .freq/.link更新
      do =>
        for id, index of @idIndex
          idCount = index.length
          for resNum in index
            elm = @container.childNodes[resNum - 1].getElementsByClassName("id")[0]
            elm.firstChild.nodeValue = elm.firstChild.nodeValue.replace(/(?:\(\d+\))?$/, "(#{idCount})")
            if idCount >= 5
              elm.classList.remove("link")
              elm.classList.add("freq")
            else if idCount >= 2
              elm.classList.add("link")
        return

      #slipカウント, .freq/.link更新
      do =>
        for slip, index of @slipIndex
          slipCount = index.length
          for resNum in index
            elm = @container.childNodes[resNum - 1].getElementsByClassName("slip")[0]
            elm.firstChild.nodeValue = elm.firstChild.nodeValue.replace(/(?:\(\d+\))?$/, "(#{slipCount})")
            if slipCount >= 5
              elm.classList.remove("link")
              elm.classList.add("freq")
            else if slipCount >= 2
              elm.classList.add("link")
        return

      #tripカウント, .freq/.link更新
      do =>
        for trip, index of @tripIndex
          tripCount = index.length
          for resNum in index
            elm = @container.childNodes[resNum - 1].getElementsByClassName("trip")[0]
            elm.firstChild.nodeValue = elm.firstChild.nodeValue.replace(/(?:\(\d+\))?$/, "(#{tripCount})")
            if tripCount >= 5
              elm.classList.remove("link")
              elm.classList.add("freq")
            else if tripCount >= 2
              elm.classList.add("link")
        return

      #参照関係再構築
      do =>
        for resKey, index of @repIndex
          res = @container.childNodes[resKey - 1]
          if res
            resCount = index.length
            if elm = res.getElementsByClassName("rep")[0]
              newFlg = false
            else
              newFlg = true
              elm = document.createElement("span")
            elm.textContent = "返信 (#{resCount})"
            elm.className = if resCount >= 5 then "rep freq" else "rep link"
            res.setAttribute("data-rescount", app.util.makeList(1, resCount, " "))
            if newFlg
              res.getElementsByClassName("other")[0].appendChild(
                document.createTextNode(" ")
              )
              res.getElementsByClassName("other")[0].appendChild(elm)
        return

      #サムネイル追加処理
      do =>
        addThumbnail = (sourceA, thumbnailPath) ->
          sourceA.classList.add("has_thumbnail")

          thumbnail = document.createElement("div")
          thumbnail.className = "thumbnail"

          thumbnailLink = document.createElement("a")
          thumbnailLink.href = app.safe_href(sourceA.href)
          thumbnailLink.target = "_blank"
          thumbnail.appendChild(thumbnailLink)

          thumbnailImg = document.createElement("img")
          thumbnailImg.src = "/img/dummy_1x1.png"
          thumbnailImg.setAttribute("data-src", thumbnailPath)
          thumbnailLink.appendChild(thumbnailImg)

          sib = sourceA
          while true
            pre = sib
            sib = pre.nextSibling
            if sib is null or sib.nodeName is "BR"
              if sib?.nextSibling?.classList?.contains("thumbnail")
                continue
              if not pre.classList?.contains("thumbnail")
                sourceA.parentNode.insertBefore(document.createElement("br"), sib)
              sourceA.parentNode.insertBefore(thumbnail, sib)
              break
          null

        configThumbnailSupported = app.config.get("thumbnail_supported") is "on"
        configThumbnailExt = app.config.get("thumbnail_ext") is "on"

        for a in @container.querySelectorAll(".message > a:not(.thumbnail):not(.has_thumbnail)")
          #サムネイル表示(対応サイト)
          if configThumbnailSupported
            #YouTube
            if res = /// ^https?://
                (?:www\.youtube\.com/watch\?(?:.+&)?v=|youtu\.be/)
                ([\w\-]+).*
              ///.exec(a.href)
              addThumbnail(a, "https://img.youtube.com/vi/#{res[1]}/default.jpg")
            #ニコニコ動画
            else if res = /// ^http://(?:www\.nicovideo\.jp/watch/|nico\.ms/)
                (?:sm|nm)(\d+) ///.exec(a.href)
              tmp = "http://tn-skr#{parseInt(res[1], 10) % 4 + 1}.smilevideo.jp"
              tmp += "/smile?i=#{res[1]}"
              addThumbnail(a, tmp)

          #サムネイル表示(画像っぽいURL)
          if configThumbnailExt
            if /\.(?:png|jpe?g|gif|bmp|webp)(?:[\?#:].*)?$/i.test(a.href)
              addThumbnail(a, a.href)
      return d.resolve()
    )
    return d.promise()
