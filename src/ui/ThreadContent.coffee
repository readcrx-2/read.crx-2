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
    @private
    ###
    @_lastScrollInfo = {
      "resNum": 0,
      "animate": false,
      "offset": 0
    }

    ###*
    @property _timeoutID
    @type Number
    @private
    ###
    @_timeoutID = 0

    try
      @harmfulReg = new RegExp(app.config.get("image_blur_word"))
      @findHarmfulFlag = true
    catch e
      app.message.send "notify", {
        html: """
          画像ぼかしの正規表現を読み込むのに失敗しました
          画像ぼかし機能は無効化されます
        """
        background_color: "red"
      }
      @findHarmfulFlag = false

    return

  ###*
  @method _reScrollTo
  @private
  ###
  _reScrollTo: ->
    @scrollTo(@_lastScrollInfo.resNum, @_lastScrollInfo.animate, @_lastScrollInfo.offset, true)
    return

  ###*
  @method checkImageExists
  @param {Boolean} checkOnly
  @param {Number} [resNum=1]
  @param {Number} [offset=0]
  @return {Boolean} loadFlag
  ###
  checkImageExists: (checkOnly, resNum = 1, offset = 0) ->
    loadFlag = false
    target = @container.children[resNum - 1]

    viewTop = target.offsetTop + offset
    viewBottom = viewTop + @container.offsetHeight
    if viewBottom > @container.scrollHeight
      viewBottom = @container.scrollHeight
      viewTop = viewBottom - @container.offsetHeight

    # 遅延ロードの解除
    loadImageByElement = (targetElement) =>
      qStr = if checkOnly then "img, video" else "img[data-src], video[data-src]"
      for media in targetElement.$$(qStr)
        loadFlag = true
        continue if checkOnly or media.getAttr("data-src") is null
        if media.hasClass("favicon")
          media.src = media.getAttr("data-src")
          media.removeAttr("data-src")
        else
          media.dispatchEvent(new Event("immediateload"))
      return

    # 表示範囲内の要素をスキャンする
    # (上方)
    tmpResNum = resNum
    tmpTarget = target
    while tmpTarget?.offsetTop + tmpTarget?.offsetHeight > viewTop and tmpResNum > 0
      loadImageByElement(tmpTarget)
      tmpResNum--
      tmpTarget = @container.child()[tmpResNum - 1] if tmpResNum > 0
    # (下方)
    tmpResNum = resNum + 1
    tmpTarget = @container.child()[resNum]
    while tmpTarget?.offsetTop < viewBottom and tmpTarget
      loadImageByElement(tmpTarget)
      tmpResNum++
      tmpTarget = @container.child()[tmpResNum - 1]

    # 遅延スクロールの設定
    if loadFlag or @_timeoutID isnt 0
      clearTimeout(@_timeoutID) if @_timeoutID isnt 0
      delayScrollTime = parseInt(app.config.get("delay_scroll_time"))
      @_timeoutID = setTimeout( =>
        @_timeoutID = 0
        @_reScrollTo()
      , delayScrollTime)

    return loadFlag

  ###*
  @method scrollTo
  @param {Number} resNum
  @param {Boolean} [animate=false]
  @param {Number} [offset=0]
  @param {Boolean} [rerun=false]
  ###
  scrollTo: (resNum, animate = false, offset = 0, rerun = false) ->
    @_lastScrollInfo.resNum = resNum
    @_lastScrollInfo.animate = animate
    @_lastScrollInfo.offset = offset
    loadFlag = false

    target = @container.child()[resNum - 1]

    # 検索中で、ターゲットが非ヒット項目で非表示の場合、スクロールを中断
    if target and @container.hasClass("searching") and not target.hasClass("search_hit")
      target = null

    # もしターゲットがNGだった場合、その直前/直後の非NGレスをターゲットに変更する
    if target and target.hasClass("ng")
      replaced = target
      while (replaced = replaced.prev())
        if !replaced.hasClass("ng")
          target = replaced
          break
        if !replaced?
          replaced = target
          while (replaced = replaced.next())
            if !replaced.hasClass("ng")
              target = replaced
              break

    if target
      # 可変サイズの画像が存在している場合は画像を事前にロードする
      if app.config.get("image_height_fix") is "off" and not rerun
        loadFlag = @checkImageExists(false, resNum, offset)

      # 遅延スクロールの設定
      if loadFlag or @_timeoutID isnt 0
        @container.scrollTop = target.offsetTop + offset
        return
      return if rerun and @container.scrollTop is target.offsetTop + offset

      # スクロールの実行
      if animate
        do =>
          @container.dispatchEvent(new Event("scrollstart"))

          to = target.offsetTop + offset
          change = (to - @container.scrollTop)/15
          min = Math.min(to-change, to+change)
          max = Math.max(to-change, to+change)
          requestAnimationFrame(_scrollInterval = =>
            before = @container.scrollTop
            # 画像のロードによる座標変更時の補正
            if to isnt target.offsetTop + offset
              to = target.offsetTop + offset
              min = Math.min(to-change, to+change)
              max = Math.max(to-change, to+change)
            # 例外発生時の停止処理
            if (
              (change > 0 and @container.scrollTop > max) or
              (change < 0 and @container.scrollTop < min)
            )
              @container.scrollTop = to
              @container.dispatchEvent(new Event("scrollfinish"))
              return
            # 正常時の処理
            if min <= @container.scrollTop <= max
              @container.scrollTop = to
              @container.dispatchEvent(new Event("scrollfinish"))
              return
            else
              @container.scrollTop += change
            if @container.scrollTop is before
              @container.dispatchEvent(new Event("scrollfinish"))
              return
            requestAnimationFrame(_scrollInterval)
            return
          )
      else
        @container.scrollTop = target.offsetTop + offset
    return

  ###*
  @method getRead
  @return {Number} 現在読んでいると推測されるレスの番号
  ###
  getRead: ->
    containerBottom = @container.scrollTop + @container.clientHeight
    read = @container.child().length
    for res, key in @container.child() when res.offsetTop > containerBottom
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
    @container.$("article.selected")

  ###*
  @method select
  @param {Element | Number} target
  @param {bool} [preventScroll = false]
  ###
  select: (target, preventScroll = false) ->
    @container.$("article.selected")?.removeClass("selected")

    if typeof target is "number"
      target = @container.$("article:nth-child(#{target}), article:last-child")

    unless target
      return

    target.addClass("selected")
    if not preventScroll
      @scrollTo(+target.$(".num").textContent)
    return

  ###*
  @method clearSelect
  ###
  clearSelect: ->
    @getSelected()?.removeClass("selected")
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
      @select(@container.child()[@getRead() - 1], true)
    else
      target = current

      for [0...repeat]
        prevTarget = target

        if (
          (
            target.offsetTop + target.offsetHeight <=
            @container.scrollTop + @container.offsetHeight
          ) and
          target.next()
        )
          target = target.next()

          while target and target.offsetHeight is 0
            target = target.next()

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
        else if not target.next()
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
      @select(@container.child()[@getRead() - 1], true)
    else
      target = current

      for [0...repeat]
        prevTarget = target

        if (
          @container.scrollTop <= target.offsetTop and
          target.prev()
        )
          target = target.prev()

          while target and target.offsetHeight is 0
            target = target.prev()

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
    return new Promise( (resolve, reject) =>
      items = [items] unless Array.isArray(items)

      unless items.length > 0
        resolve()
        return

      resNum = @container.child().length

      app.WriteHistory.getByUrl(@url).then( (writtenRes) =>
        html = ""

        for res in items
          resNum++

          res.num = resNum
          res.class = []
          scheme = app.URL.getScheme(@url)

          res = app.ReplaceStrTxt.do(@url, document.title, res)

          if /(?:\u3000{5}|\u3000\u0020|[^>]\u0020\u3000)(?!<br>|$)/i.test(res.message)
            res.class.push("aa")

          for writtenHistory in writtenRes when writtenHistory.res is resNum
            res.class.push("written")
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
                res.slip = $1

                @slipIndex[$1] = [] unless @slipIndex[$1]?
                @slipIndex[$1].push(resNum)

                return ""
               )
              .replace(/<\/b>(◆[^<>]+?) <b>/, ($0, $1) =>
                res.trip = $1

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
              .replace(/<\/div><div class="be .*?"><a href="(https?:\/\/be\.2ch\.net\/user\/\d+?)".*?>(.*?)<\/a>/, "<a class=\"beid\" href=\"$1\" target=\"_blank\">$2</a>")
              #タグ除去
              .replace(/<(?!(?:a class="beid".*?|\/a)>).*?(?:>|$)/g, "")
              #.id
              .replace(/(?:^| |\d)(ID:(?!\?\?\?)[^ <>"']+|発信元:\d+.\d+.\d+.\d+)/, ($0, $1) =>
                fixedId = $1.replace(/\u25cf$/, "") #末尾●除去

                res.id = fixedId

                if resNum is 1
                  @oneId = fixedId

                if fixedId is @oneId
                  res.class.push("one")

                if fixedId.endsWith(".net")
                  res.class.push("net")

                @idIndex[fixedId] = [] unless @idIndex[fixedId]?
                @idIndex[fixedId].push(resNum)

                return """<span class="id">#{$1}</span>"""
              )
              #.beid
              .replace /(?:^| )(BE:(\d+)\-[A-Z\d]+\(\d+\))/,
                """<a class="beid" href="#{scheme}://be.2ch.net/test/p.php?i=$3" target="_blank">$1</a>"""
          )
          # slip追加
          if res.slip?
            if (index = tmp.indexOf("<span class=\"id\">")) isnt -1
              tmp = tmp.slice(0, index) + """<span class="slip">SLIP:#{res.slip}</span>""" + tmp.slice(index, tmp.length)
            else
              tmp += """<span class="slip">SLIP:#{res.slip}</span>"""

          articleHtml += """<span class="other">#{tmp}</span>"""

          articleHtml += "</header>"

          #文字色
          color = res.message.match(/<font color="(.*?)">/i)

          # id, slip, tripが取り終わったタイミングでNG判定を行う
          # NG判定されるものは、ReplaceStrTxtで置き換え後のテキストなので注意すること
          if app.NG.isNGThread(res)
            res.class.push("ng")

          tmp = (
            res.message
              #imgタグ変換
              .replace(/<img src="([\w]+):\/\/(.*?)".*?>/ig, "$1://$2")
              .replace(/<img src="\/\/(.*?)".*?>/ig, "#{scheme}://$1")
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
                if app.URL.tsld(@url) in ["2ch.net", "bbspink.com", "2ch.sc"]
                  """<img class="beicon" src="/img/dummy_1x1.webp" data-src="#{scheme}://#{$1}"><br>"""
                else
                  $0
              #エモーティコン埋め込み表示
              .replace ///(?:\s*sssp|https?)://(img\.2ch\.net/emoji/[\w\-_]+\.gif)\s*///g, ($0, $1) =>
                if app.URL.tsld(@url) in ["2ch.net", "bbspink.com", "2ch.sc"]
                  """<img class="beicon emoticon" src="/img/dummy_1x1.webp" data-src="#{scheme}://#{$1}">"""
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
                isThatHarmImg = @findHarmfulFlag and @harmfulReg.test(res.message)

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

          tmp = ""
          tmp += " class=\"#{res.class.join(" ")}\""
          if res.id?
            tmp += " data-id=\"#{res.id}\""
          if res.slip?
            tmp += " data-slip=\"#{res.slip}\""
          if res.trip?
            tmp += " data-trip=\"#{res.trip}\""

          articleHtml = """<article#{tmp}>#{articleHtml}</article>"""
          html += articleHtml

        @container.insertAdjacentHTML("BeforeEnd", html)

        numbersReg = /(?:\(\d+\))?$/
        #idカウント, .freq/.link更新
        do =>
          for id, index of @idIndex
            idCount = index.length
            for resNum in index
              elm = @container.child()[resNum - 1].C("id")[0]
              elmFirst = elm.firstChild
              elmFirst.textContent = elmFirst.textContent.replace(numbersReg, "(#{idCount})")
              if idCount >= 5
                elm.removeClass("link")
                elm.addClass("freq")
              else if idCount >= 2
                elm.addClass("link")
          return

        #slipカウント, .freq/.link更新
        do =>
          for slip, index of @slipIndex
            slipCount = index.length
            for resNum in index
              elm = @container.child()[resNum - 1].C("slip")[0]
              elmFirst = elm.firstChild
              elmFirst.textContent = elmFirst.textContent.replace(numbersReg, "(#{slipCount})")
              if slipCount >= 5
                elm.removeClass("link")
                elm.addClass("freq")
              else if slipCount >= 2
                elm.addClass("link")
          return

        #tripカウント, .freq/.link更新
        do =>
          for trip, index of @tripIndex
            tripCount = index.length
            for resNum in index
              elm = @container.child()[resNum - 1].C("trip")[0]
              elmFirst = elm.firstChild
              elmFirst.textContent = elmFirst.textContent.replace(numbersReg, "(#{tripCount})")
              if tripCount >= 5
                elm.removeClass("link")
                elm.addClass("freq")
              else if tripCount >= 2
                elm.addClass("link")
          return

        #harmImg更新
        do =>
          for res in @harmImgIndex
            elm = @container.child()[res - 1]
            continue unless elm
            elm.addClass("has_blur_word")
            if elm.hasClass("has_image") and app.config.get("image_blur") is "on"
              for thumb in elm.$$(".thumbnail:not(.image_blur)")
                @setImageBlur(thumb, true)
          return

        #参照関係再構築
        do =>
          for resKey, index of @repIndex
            res = @container.child()[resKey - 1]
            if res
              resCount = index.length
              if elm = res.C("rep")[0]
                newFlg = false
              else
                newFlg = true
                elm = $__("span")
              elm.textContent = "返信 (#{resCount})"
              elm.className = if resCount >= 5 then "rep freq" else "rep link"
              res.setAttr("data-rescount", [1..resCount].join(" "))
              if newFlg
                res.C("other")[0].addLast(
                  document.createTextNode(" ")
                )
                res.C("other")[0].addLast(elm)
              #連鎖NG
              if app.config.get("chain_ng") is "on" and res.hasClass("ng")
                for r in index
                  @container.child()[r - 1].addClass("ng")
              #自分に対してのレス
              if res.hasClass("written")
                for r in index
                  @container.child()[r - 1].addClass("to_written")
          return

        #サムネイル追加処理
        do =>
          addThumbnail = (sourceA, thumbnailPath, mediaType = "image", res) ->
            sourceA.addClass("has_thumbnail")

            thumbnail = $__("div")
            thumbnail.addClass("thumbnail")
            thumbnail.setAttr("media-type", mediaType)

            if mediaType in ["image", "video"]
              article = sourceA.closest("article")
              article.addClass("has_image")
              # グロ画像に対するぼかし処理
              if article.hasClass("has_blur_word") and app.config.get("image_blur") is "on"
                thumbnail.addClass("image_blur")
                v = app.config.get("image_blur_length")
                webkitFilter = "blur(#{v}px)"
              else
                webkitFilter = "none"

            switch mediaType
              when "image"
                thumbnailLink = $__("a")
                thumbnailLink.href = app.safeHref(sourceA.href)
                thumbnailLink.target = "_blank"

                thumbnailImg = $__("img")
                thumbnailImg.addClass("image")
                thumbnailImg.src = "/img/dummy_1x1.webp"
                thumbnailImg.style.WebkitFilter = webkitFilter
                thumbnailImg.style.maxWidth = app.config.get("image_width") + "px"
                thumbnailImg.style.maxHeight = app.config.get("image_height") + "px"
                thumbnailImg.dataset.src = thumbnailPath
                thumbnailImg.dataset.type = res.type
                if res.extract? then thumbnailImg.dataset.extract = res.extract
                if res.extractReferrer? then thumbnailImg.dataset.extractReferrer = res.extractReferrer
                if res.pattern? then thumbnailImg.dataset.pattern = res.pattern
                if res.cookie? then thumbnailImg.dataset.cookie = res.cookie
                if res.cookieReferrer? then thumbnailImg.dataset.cookieReferrer = res.cookieReferrer
                if res.referrer? then thumbnailImg.dataset.referrer = res.referrer
                if res.userAgent? then thumbnailImg.dataset.userAgent = res.userAgent
                thumbnailLink.addLast(thumbnailImg)

                thumbnailFavicon = $__("img")
                thumbnailFavicon.addClass("favicon")
                thumbnailFavicon.src = "/img/dummy_1x1.webp"
                thumbnailFavicon.setAttr("data-src", "https://www.google.com/s2/favicons?domain=#{sourceA.hostname}")
                thumbnailLink.addLast(thumbnailFavicon)

              when "audio", "video"
                thumbnailLink = $__(mediaType)
                thumbnailLink.src = ""
                thumbnailLink.setAttr("data-src", thumbnailPath)
                thumbnailLink.preload = "metadata"
                switch mediaType
                  when "audio"
                    thumbnailLink.style.width = app.config.get("audio_width") + "px"
                    thumbnailLink.setAttr("controls", "")
                  when "video"
                    thumbnailLink.style.WebkitFilter = webkitFilter
                    thumbnailLink.style.maxWidth = app.config.get("video_width") + "px"
                    thumbnailLink.style.maxHeight = app.config.get("video_height") + "px"
                    if app.config.get("video_controls") is "on"
                      thumbnailLink.setAttr("controls", "")

            thumbnail.addLast(thumbnailLink)

            # 高さ固定の場合
            if app.config.get("image_height_fix") is "on"
              switch mediaType
                when "image"
                  h = parseInt(app.config.get("image_height"))
                when "video"
                  h = parseInt(app.config.get("video_height"))
                else
                  h = 100   # 最低高
              thumbnail.style.height = h + "px"

            sib = sourceA
            while true
              pre = sib
              sib = pre.nextSibling
              if !sib? or sib.tagName is "BR"
                if sib?.nextSibling?.classList?.contains("thumbnail")
                  continue
                if not pre.classList?.contains("thumbnail")
                  sourceA.parent().insertBefore($__("br"), sib)
                sourceA.parent().insertBefore(thumbnail, sib)
                break
            return

          # 展開URL追加処理
          addExpandedURL = (sourceA, finalUrl) ->
            sourceA.addClass("has_expandedURL")

            expandedURL = $__("div")
            expandedURL.addClass("expandedURL")
            expandedURL.setAttr("short-url", sourceA.href)
            if app.config.get("expand_short_url") is "popup"
              expandedURL.addClass("hide_data")

            if finalUrl
              expandedURLLink = $__("a")
              expandedURLLink.textContent = finalUrl
              expandedURLLink.href = app.safeHref(finalUrl)
              expandedURLLink.target = "_blank"
              expandedURL.addLast(expandedURLLink)
            else
              expandedURL.addClass("expand_error")
              expandedURLLink = null

            sib = sourceA
            while true
              pre = sib
              sib = pre.nextSibling
              if !sib? or sib.tagName is "BR"
                if sib?.nextSibling?.classList?.contains("expandedURL")
                  continue
                if not pre.classList?.contains("expandedURL")
                  sourceA.parent().insertBefore($__("br"), sib)
                sourceA.parent().insertBefore(expandedURL, sib)
                break

            return expandedURLLink

          # MediaTypeの取得
          getMediaType = (href, dftValue) ->
            mediaType = null
            # Audioの確認
            if /\.(?:mp3|m4a|wav|oga|spx)(?:[\?#:&].*)?$/.test(href)
              mediaType = "audio"
            if (
              app.config.get("audio_supported_ogg") is "on" and
              /\.(?:ogg|ogx)(?:[\?#:&].*)?$/.test(href)
            )
              mediaType = "audio"
            # Videoの確認
            if /\.(?:mp4|m4v|webm|ogv)(?:[\?#:&].*)?$/.test(href)
              mediaType = "video"
            if (
              app.config.get("video_supported_ogg") is "on" and
              /\.(?:ogg|ogx)(?:[\?#:&].*)?$/.test(href)
            )
              mediaType = "video"
            # 初期値の設定と有効性のチェック
            switch mediaType
              when null
                mediaType = dftValue
              when "audio"
                mediaType = null if app.config.get("audio_supported") is "off"
              when "video"
                mediaType = null if app.config.get("video_supported") is "off"
            return mediaType

          checkUrl = (a) ->
            return new Promise( (resolve, reject) ->
              if app.config.get("expand_short_url") isnt "none"
                if app.URL.SHORT_URL_LIST.has(app.URL.getDomain(a.href))
                  # 短縮URLの展開
                  app.URL.expandShortURL(a.href).then( (finalUrl) ->
                    newLink = addExpandedURL(a, finalUrl)
                    if finalUrl
                      resolve({a, link: newLink.href})
                    else
                      resolve({a, link: a.href})
                    return
                  )
                  return
              resolve({a, link: a.href})
              return
            )

          replace = (a) ->
            return checkUrl(a).then( ({a, link}) ->
              {res, err} = app.ImageReplaceDat.do(link)
              # MediaTypeの設定
              unless err?
                href = res.text
                mediaType = getMediaType(href, "image")
              else
                href = a.href
                mediaType = getMediaType(href, null)
              # サムネイルの追加
              addThumbnail(a, href, mediaType, res) if mediaType
              return
            )

          aList = @container.$$(
            ".message > a:not(.anchor):not(.thumbnail):not(.has_thumbnail):not(.expandedURL):not(.has_expandedURL)"
          )
          Promise.all(Array.from(aList).map(replace)).catch( ->
            return
          ).then( ->
            resolve()
            return
          )
        return
      )
      return
    )

  ###*
  @method setImageBlur
  @param {Element} thumbnail
  @parm {Boolean} blurMode
  ###
  setImageBlur: (thumbnail, blurMode) ->
    media = thumbnail.$("a > img.image, video")
    if blurMode
      v = app.config.get("image_blur_length")
      thumbnail.addClass("image_blur")
      media.style.WebkitFilter = "blur(#{v}px)"
    else
      thumbnail.removeClass("image_blur")
      media.style.WebkitFilter = "none"
    return

  ###*
  @method addClassWithOrg
  @param {Element} $res
  @parm {String} className
  ###
  addClassWithOrg: ($res, className) ->
    $res.addClass(className)
    resnum = parseInt($res.C("num")[0].textContent)
    @container.child()[resnum-1].addClass("written")
    return

  ###*
  @method removeClassWithOrg
  @param {Element} $res
  @parm {String} className
  ###
  removeClassWithOrg: ($res, className) ->
    $res.removeClass("written")
    resnum = parseInt($res.C("num")[0].textContent)
    @container.child()[resnum-1].removeClass("written")
    return

  ###*
  @method addWriteHistory
  @param {Element} $res
  ###
  addWriteHistory: ($res) ->
    resnum = parseInt($res.C("num")[0].textContent)
    name = $res.C("name")[0].textContent
    mail = $res.C("mail")[0].textContent
    message = $res.C("message")[0].textContent
    date = @stringToDate($res.C("other")[0].textContent)
    if date?
      app.WriteHistory.add(@url, resnum, document.title, name, mail, name, mail, message, date.valueOf())
    return

  ###*
  @method removeWriteHistory
  @param {Element} $res
  ###
  removeWriteHistory: ($res) ->
    resnum = parseInt($res.C("num")[0].textContent)
    app.WriteHistory.remove(@url, resnum)
    return

  ###*
  @method stringToDate
  @param {String} string
  @return {Date}
  ###
  stringToDate: (string) ->
    date1 = string.match(/(\d+)\/(\d+)\/(\d+)\(.\)\s?(\d+):(\d+):(\d+)(?:\.(\d+))?.*/)
    if date1.length >= 6
      return new Date(date1[1], date1[2]-1, date1[3], date1[4], date1[5], date1[6])
    else if date1.length >= 5
      return new Date(date1[1], date1[2]-1, date1[3], date1[4], date1[5])
    else
      return null
