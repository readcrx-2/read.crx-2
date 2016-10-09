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
    @property harmImgIndex
    @type Array
    ###
    @harmImgIndex = []

    ###*
    @property oneId
    @type null | String
    ###
    @oneId = null

    ###*
    @property _lastScrollInfo
    @type Object
    ###
    @_lastScrollInfo = {
      "resNum": "",
      "animate": false,
      "offset": 0,
      "scrollTime": 0
    }

    ###*
    @property _delayScrollInterval
    @type Number
    @private
    ###
    @_delayScrollInterval = 0

    return

  ###*
  @method getWrittenRes
  @return {Array}
  ###
  getWrittenRes: ->
    d = $.Deferred()
    app.WriteHistory.getByUrl(@url).done( (data) ->
      d.resolve(data)
      return
    )
    return d.promise()

  ###*
  @method _reScrollTo
  ###
  _reScrollTo: ->
    @scrollTo(@_lastScrollInfo.resNum, @_lastScrollInfo.animate, @_lastScrollInfo.offset, true)
    return

  ###*
  @method _delayScrollTo
  ###
  _delayScrollTo: ->
    return if @_delayScrollInterval isnt 0
    delayScrollTime = parseInt(app.config.get("delay_scroll_time"))
    @_delayScrollInterval = setInterval( =>
      if Date.now() - @_lastScrollInfo.scrollTime > delayScrollTime
        clearInterval(@_delayScrollInterval)
        @_delayScrollInterval = 0
        @_reScrollTo()
      return
    , 20)
    return

  ###*
  @method scrollTo
  @param {Number} resNum
  @param {Boolean} [animate=false]
  @param {Number} [offset=0]
  @param {Boolean} [rerun=false]
  @param {Boolean} [checkImage=false]
  ###
  scrollTo: (resNum, animate = false, offset = 0, rerun = false, checkImage = false) ->
    @_lastScrollInfo.resNum = resNum
    @_lastScrollInfo.animate = animate
    @_lastScrollInfo.offset = offset
    unless rerun
      @_lastScrollInfo.scrollTime = 0
    loadFlag = false

    target = @container.children[resNum - 1]

    # 検索中で、ターゲットが非ヒット項目で非表示の場合、スクロールを中断
    if target and @container.classList.contains("searching") and not target.classList.contains("search_hit")
      target = null

    # もしターゲットがNGだった場合、その直前/直後の非NGレスをターゲットに変更する
    if target and target.classList.contains("ng")
      target = $(target).prevAll(":not(.ng)")[0] or $(target).nextAll(":not(.ng)")[0]

    if target
      # 可変サイズの画像が存在している場合は画像を事前にロードする
      if app.config.get("use_mediaviewer") is "on" and
          app.config.get("image_height_fix") isnt "on" and
          not rerun
        viewTop = target.offsetTop + offset
        viewBottom = viewTop + @container.offsetHeight
        if viewBottom > @container.scrollHeight
          viewBottom = @container.scrollHeight
          viewTop = viewBottom - @container.offsetHeight

        # 遅延ロードの解除
        loadImageByElement = (targetElement) =>
          targetResNum = parseInt(targetElement.querySelector(".num").textContent)
          if checkImage
            qStr = "img, video"
          else
            qStr = "img[data-src], video[data-src]"
          for img in targetElement.querySelectorAll(qStr)
            loadFlag = true
            continue if checkImage or img.getAttribute("data-src") is null
            unless img.className is "favicon"
              $(img).trigger("immediateLoad")
            else
              img.src = img.getAttribute("data-src")
              img.removeAttribute("data-src")
          return

        # 表示範囲内の要素をスキャンする
        # (上方)
        tmpResNum = resNum
        tmpTarget = target
        while tmpTarget?.offsetTop + tmpTarget?.offsetHeight > viewTop
          loadImageByElement(tmpTarget)
          break if tmpResNum is 1
          tmpResNum--
          tmpTarget = @container.children[tmpResNum - 1]
        # (下方)
        tmpResNum = resNum + 1
        tmpTarget = @container.children[resNum]
        while tmpTarget?.offsetTop < viewBottom
          loadImageByElement(tmpTarget)
          tmpResNum++
          tmpTarget = @container.children[tmpResNum - 1]
          break unless tmpTarget

      # スクロールの実行
      if animate and not loadFlag
        do =>
          to = target.offsetTop + offset
          change = (to - @container.scrollTop)/15
          min = Math.min(to-change, to+change)
          max = Math.max(to-change, to+change)
          requestAnimationFrame(_scrollInterval = =>
            before = @container.scrollTop
            if min <= @container.scrollTop <= max
              @container.scrollTop = to
              return
            else
              @container.scrollTop += change
            if @container.scrollTop is before
              return
            requestAnimationFrame(_scrollInterval)
            return
          )
      else
        @container.scrollTop = target.offsetTop + offset

      @_lastScrollInfo.scrollTime = Date.now() unless rerun
      @_delayScrollTo() if loadFlag
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

    return d.resolve().promise() unless items.length > 0

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
            #be
            .replace(/<\/div><div class="be .*?"><a href="(http:\/\/be\.2ch\.net\/user\/\d+?)".*?>(.*?)<\/a>/, "<a class=\"beid\" href=\"$1\" target=\"_blank\">$2</a>")
            #タグ除去
            .replace(/<(?!(?:a class="beid".*?|\/a)>).*?(?:>|$)/g, "")
            #.id
            .replace(/(?:^| )(ID:(?!\?\?\?)[^ <>"']+|発信元:\d+.\d+.\d+.\d+)/, ($0, $1) =>
              fixedId = $1.replace(/\u25cf$/, "") #末尾●除去

              articleDataId = fixedId

              if resNum is 1
                @oneId = fixedId

              if fixedId is @oneId
                articleClass.push("one")

              if fixedId.endsWith(".net")
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

        harmfulReg = /.*[^ァ-ヺ^ー]グロ([^ァ-ヺ^ー].*|$)|.*死ね.*/
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
            .replace(/(h)?(ttps?:\/\/(?!img\.2ch\.net\/(?:ico|emoji|premium)\/[\w\-_]+\.gif)(?:[a-hj-zA-HJ-Z\d_\-.!~*'();\/?:@=+$,%#]|\&(?!gt;)|[iI](?![dD]:)+)+)/g,
              '<a href="h$2" target="_blank">$1$2</a>')
            #Beアイコン埋め込み表示
            .replace ///^(?:\s*sssp|https?)://(img\.2ch\.net/(?:ico|premium)/[\w\-_]+\.gif)\s*<br>///, ($0, $1) =>
              if app.url.tsld(@url) in ["2ch.net", "bbspink.com", "2ch.sc"]
                """<img class="beicon" src="/img/dummy_1x1.webp" data-src="http://#{$1}"><br>"""
              else
                $0
            #エモーティコン埋め込み表示
            .replace ///(?:\s*sssp|https?)://(img\.2ch\.net/emoji/[\w\-_]+\.gif)\s*///g, ($0, $1) =>
              if app.url.tsld(@url) in ["2ch.net", "bbspink.com", "2ch.sc"]
                """<img class="beicon emoticon" src="/img/dummy_1x1.webp" data-src="http://#{$1}">"""
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

              #グロ/死ねの返信レス
              isThatHarmImg = harmfulReg.test(res.message)

              #rep_index更新
              if not disabled
                for segment in anchor.segments
                  target = segment[0]
                  while target <= segment[1]
                    @repIndex[target] = [] unless @repIndex[target]?
                    @repIndex[target].push(resNum) unless resNum in @repIndex[target]
                    @harmImgIndex.push(target) if isThatHarmImg
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

        ngKeys = ng.keys()
        tmpTxt1 = res.name + " " + res.mail + " " + res.other + " " + res.message
        tmpTxt2 = app.util.normalize(tmpTxt1)
        while !(current = ngKeys.next()).done
          n = current.value
          if n.start? and ((n.finish? and n.start <= resNum and resNum <= n.finish) or (parseInt(n.start) is resNum))
            continue
          if (
            (n.type is ("regExp") and n.reg.test(tmpTxt1)) or
            (n.type is ("regExpName") and n.reg.test(res.name)) or
            (n.type is ("regExpMail") and n.reg.test(res.mail)) or
            (n.type is ("regExpId") and articleDataId? and n.reg.test(articleDataId)) or
            (n.type is ("regExpSlip") and articleDataSlip? and n.reg.test(articleDataSlip)) or
            (n.type is ("regExpBody") and n.reg.test(res.message)) or
            (n.type is ("name") and app.util.normalize(res.name).includes(n.word)) or
            (n.type is ("mail") and app.util.normalize(res.mail).includes(n.word)) or
            (n.type is ("id") and articleDataId?.includes(n.word)) or
            (n.type is ("slip") and articleDataSlip?.includes(n.word)) or
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

      fragment = document.createDocumentFragment()
      for child in @container.children
        fragment.appendChild(child.cloneNode(true))

      numbersReg = /(?:\(\d+\))?$/
      #idカウント, .freq/.link更新
      do =>
        for id, index of @idIndex
          idCount = index.length
          for resNum in index
            elm = fragment.children[resNum - 1].getElementsByClassName("id")[0]
            elmFirst = elm.firstChild
            elmFirst.textContent = elmFirst.textContent.replace(numbersReg, "(#{idCount})")
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
            elm = fragment.children[resNum - 1].getElementsByClassName("slip")[0]
            elmFirst = elm.firstChild
            elmFirst.textContent = elmFirst.textContent.replace(numbersReg, "(#{slipCount})")
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
            elm = fragment.children[resNum - 1].getElementsByClassName("trip")[0]
            elmFirst = elm.firstChild
            elmFirst.textContent = elmFirst.textContent.replace(numbersReg, "(#{tripCount})")
            if tripCount >= 5
              elm.classList.remove("link")
              elm.classList.add("freq")
            else if tripCount >= 2
              elm.classList.add("link")
        return

      #harmImg更新
      do =>
        for res in @harmImgIndex
          elm = fragment.children[res - 1]
          continue unless elm
          elm.classList.add("has_blur_word")
          if elm.classList.contains("has_image") and app.config.get("image_blur") is "on"
            for thumb in elm.querySelectorAll(".thumbnail:not(.image_blur), .mediaviewer:not(.image_blur)")
              @setImageBlur(thumb, true)
        return

      #参照関係再構築
      do =>
        for resKey, index of @repIndex
          res = fragment.children[resKey - 1]
          if res
            resCount = index.length
            if elm = res.getElementsByClassName("rep")[0]
              newFlg = false
            else
              newFlg = true
              elm = document.createElement("span")
            elm.textContent = "返信 (#{resCount})"
            elm.className = if resCount >= 5 then "rep freq" else "rep link"
            res.setAttribute("data-rescount", [1..resCount].join(" "))
            if newFlg
              res.getElementsByClassName("other")[0].appendChild(
                document.createTextNode(" ")
              )
              res.getElementsByClassName("other")[0].appendChild(elm)
            #連鎖NG
            if app.config.get("chain_ng") is "on" and res.classList.contains("ng")
              for r in index
                fragment.children[r - 1].classList.add("ng")
            #自分に対してのレス
            if res.classList.contains("written")
              for r in index
                fragment.children[r - 1].classList.add("to_written")
        return

      #サムネイル追加処理
      do =>
        addThumbnail = (sourceA, thumbnailPath, referrer, cookieStr) ->
          if app.config.get("use_mediaviewer") is "on"
            addMediaViewer(sourceA, "image", thumbnailPath)
            return
          sourceA.classList.add("has_thumbnail")
          article = sourceA.closest("article")
          article.classList.add("has_image")

          thumbnail = document.createElement("div")
          thumbnail.className = "thumbnail"

          thumbnailLink = document.createElement("a")
          thumbnailLink.href = app.safe_href(sourceA.href)
          thumbnailLink.target = "_blank"
          thumbnail.appendChild(thumbnailLink)

          thumbnailImg = document.createElement("img")
          thumbnailImg.className = "image"
          thumbnailImg.src = "/img/dummy_1x1.webp"
          thumbnailImg.setAttribute("data-src", thumbnailPath)
          #グロ画像に対するぼかし処理
          if article.hasClass("has_blur_word") and app.config.get("image_blur") is "on"
            thumbnail.className += " image_blur"
            v = app.config.get("image_blur_length")
            thumbnailImg.style.WebkitFilter = "blur(#{v}px)"
          if referrer? then thumbnailImg.setAttribute("data-referrer", referrer)
          if cookieStr? then thumbnailImg.setAttribute("data-cookie", cookieStr)
          thumbnailLink.appendChild(thumbnailImg)

          thumbnailFavicon = document.createElement("img")
          thumbnailFavicon.className = "favicon"
          thumbnailFavicon.src = "/img/dummy_1x1.webp"
          thumbnailFavicon.setAttribute("data-src", "https://www.google.com/s2/favicons?domain=#{app.url.getDomain(sourceA.href)}")
          thumbnailLink.appendChild(thumbnailFavicon)

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

        #mediaviewerの追加処理
        addMediaViewer = (sourceA, mediaType, mediaPath="", referrer, cookieStr) ->
          sourceA.classList.add("has_mediaviewer")
          if mediaType is "image" or mediaType is "video"
            article = sourceA.closest("article")
            article.classList.add("has_image")

          mediaViewer = document.createElement("div")
          mediaViewer.className = "mediaviewer"
          mediaViewer.setAttribute("media-type", mediaType)
          #グロ画像に対するぼかし処理
          if mediaType is "image" or mediaType is "video"
            if article.hasClass("has_blur_word") and app.config.get("image_blur") is "on"
              mediaViewer.className += " image_blur"
              v = app.config.get("image_blur_length")
              webkitFilter = "blur(#{v}px)"
            else
              webkitFilter = "none"

          switch mediaType
            when "image"
              mediaLink = document.createElement("a")
              mediaLink.href = app.safe_href(sourceA.href)
              mediaLink.target = "_blank"

              mediaImage = document.createElement("img")
              mediaImage.className = "image"
              mediaImage.src = "/img/dummy_1x1.webp"
              mediaImage.setAttribute("data-src", mediaPath)
              if referrer? then thumbnailImg.setAttribute("data-referrer", referrer)
              if cookieStr? then thumbnailImg.setAttribute("data-cookie", cookieStr)
              mediaImage.style.WebkitFilter = webkitFilter
              mediaImage.style.maxWidth = app.config.get("image_width") + "px"
              mediaImage.style.maxHeight = app.config.get("image_height") + "px"
              mediaLink.appendChild(mediaImage)

              mediaFavicon = document.createElement("img")
              mediaFavicon.className = "favicon"
              mediaFavicon.src = "/img/dummy_1x1.webp"
              mediaFavicon.setAttribute("data-src", "https://www.google.com/s2/favicons?domain=#{app.url.getDomain(sourceA.href)}")
              mediaLink.appendChild(mediaFavicon)

            when "audio", "video"
              mediaLink = document.createElement(mediaType)
              mediaLink.src = ""
              if mediaPath is ""
                mediaLink.setAttribute("data-src", sourceA.href)
              else
                mediaLink.setAttribute("data-src", mediaPath)
              mediaLink.preload = "none"
              switch mediaType
                when "audio"
                  mediaLink.style.width = app.config.get("audio_width") + "px"
                  mediaLink.setAttribute("controls", "")
                when "video"
                  mediaLink.style.WebkitFilter = webkitFilter
                  mediaLink.style.maxWidth = app.config.get("video_width") + "px"
                  mediaLink.style.maxHeight = app.config.get("video_height") + "px"
                  if app.config.get("video_controls") is "on"
                    mediaLink.setAttribute("controls", "")

          mediaViewer.appendChild(mediaLink)

          #高さ固定の場合
          if app.config.get("image_height_fix") is "on"
            switch mediaType
              when "image"
                h = parseInt(app.config.get("image_height"))
              when "video"
                h = parseInt(app.config.get("video_height"))
              else
                h = 100   # 最低高
            mediaViewer.style.height = h + "px"

          sib = sourceA
          while true
            pre = sib
            sib = pre.nextSibling
            if sib is null or sib.nodeName is "BR"
              if sib?.nextSibling?.classList?.contains("mediaviewer")
                continue
              if not pre.classList?.contains("mediaviewer")
                sourceA.parentNode.insertBefore(document.createElement("br"), sib)
              sourceA.parentNode.insertBefore(mediaViewer, sib)
              break
            null
          return

        app.util.concurrent(fragment.querySelectorAll(".message > a:not(.thumbnail):not(.has_thumbnail)" +
            ":not(.mediaviewer):not(.has_mediaviewer)"), (a) ->
          return app.ImageReplaceDat.do(a, a.href).done( (a, res, err) ->
            addThumbnail(a, res.text, res.referrer, res.cookie) unless err?
            if app.config.get("use_mediaviewer") is "on"
              #Audioの確認
              if app.config.get("audio_supported") is "on"
                if /\.(?:mp3|m4a|wav|oga|spx)(?:[\?#:&].*)?$/.test(a.href)
                  addMediaViewer(a, "audio")
                if app.config.get("audio_supported_ogg") is "on"
                  if /\.(?:ogg|ogx)(?:[\?#:&].*)?$/.test(a.href)
                    addMediaViewer(a, "audio")
              #Videoの確認
              if app.config.get("video_supported") is "on"
                if /\.(?:mp4|m4v|webm|ogv)(?:[\?#:&].*)?$/.test(a.href)
                  addMediaViewer(a, "video")
                if app.config.get("video_supported_ogg") is "on"
                  if /\.(?:ogg|ogx)(?:[\?#:&].*)?$/.test(a.href)
                    addMediaViewer(a, "video")
            return
          )
        ).always(=>
          @container.textContent = null
          @container.appendChild(fragment)
          d.resolve()
          return
        )
        return
      return
    )
    return d.promise()

  ###*
  @method setImageBlur
  @param {Element} thumbnail or mediaviewer
  @parm {Boolean} blurMode
  ###
  setImageBlur: (mediaviewer, blurMode) ->
    img = mediaviewer.querySelector("a > img.image, video")
    if blurMode
      v = app.config.get("image_blur_length")
      mediaviewer.classList.add("image_blur")
      img.style.WebkitFilter = "blur(#{v}px)"
    else
      mediaviewer.classList.remove("image_blur")
      img.style.WebkitFilter = "none"
    return

  ###*
  @method addClassWithOrg
  @param {Element} $res
  @parm {String} className
  ###
  addClassWithOrg: ($res, className) ->
    $res.addClass(className)
    resnum = parseInt($res.find(".num").text())
    @container.children[resnum-1].classList.add("written")
    return

  ###*
  @method removeClassWithOrg
  @param {Element} $res
  @parm {String} className
  ###
  removeClassWithOrg: ($res, className) ->
    $res.removeClass("written")
    resnum = parseInt($res.find(".num").text())
    @container.children[resnum-1].classList.remove("written")
    return

  ###*
  @method addWriteHistory
  @param {Element} $res
  ###
  addWriteHistory: ($res) ->
    resnum = parseInt($res.find(".num").text())
    name = $res.find(".name").text()
    mail = $res.find(".mail").text()
    message = $res.find(".message").text()
    date = @stringToDate($res.find(".other").text())
    if date?
      app.WriteHistory.add(@url, resnum, document.title, name, mail, name, mail, message, date.valueOf())
    return

  ###*
  @method removeWriteHistory
  @param {Element} $res
  ###
  removeWriteHistory: ($res) ->
    resnum = parseInt($res.find(".num").text())
    app.WriteHistory.remove(@url, resnum)
    return

  ###*
  @method stringToDate
  @param {String} string
  @return {Date}
  ###
  stringToDate: (string) ->
    date1 = string.match(/(\d+)\/(\d+)\/(\d+)\(.\) (\d+):(\d+):(\d+)(?:\.(\d+))?.*/)
    if date1.length >= 6
      return new Date(date1[1], date1[2]-1, date1[3], date1[4], date1[5], date1[6])
    else if date1.length >= 5
      return new Date(date1[1], date1[2]-1, date1[3], date1[4], date1[5])
    else
      return null
