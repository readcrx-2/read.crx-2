window.UI ?= {}

###*
@namespace UI
@class ThreadContent
@constructor
@param {String} URL
@param {Element} container
@requires MediaContainer
###
class UI.ThreadContent
  _OVER1000_DATA = "Over 1000"

  constructor: (@url, @container) ->
    ###*
    @property idIndex
    @type Object
    ###
    @idIndex = new Map()

    ###*
    @property slipIndex
    @type Object
    ###
    @slipIndex = new Map()

    ###*
    @property tripIndex
    @type Object
    ###
    @tripIndex = new Map()

    ###*
    @property repIndex
    @type Object
    ###
    @repIndex = new Map()

    ###*
    @property harmImgIndex
    @type Array
    ###
    @harmImgIndex = new Set()

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
    @_lastScrollInfo =
      resNum: 0
      animate: false
      offset: 0
      animateTo: 0
      animateChange: 0

    ###*
    @property _timeoutID
    @type Number
    @private
    ###
    @_timeoutID = 0

    ###*
    @property _existIdAtFirstRes
    @type Boolean
    @private
    ###
    @_existIdAtFirstRes = false

    ###*
    @property _existSlipAtFirstRes
    @type Boolean
    @private
    ###
    @_existSlipAtFirstRes = false

    ###*
    @property _hiddenSelectors
    @type
    @private
    ###
    @_hiddenSelectors = null

    ###*
    @property _isScrolling
    @type Boolean
    @private
    ###
    @_isScrolling = false

    ###*
    @property _scrollRequestID
    @type Number
    @private
    ###
    @_scrollRequestID = 0

    ###*
    @property _over1000ResNum
    @type Number
    @private
    ###
    @_over1000ResNum = null

    ###*
    @property _rawResData
    @type Array
    @private
    ###
    @_rawResData = []

    ###*
    @property _ngIdForChain
    @type Object
    @private
    ###
    @_ngIdForChain = new Set()

    ###*
    @property _ngSlipForChain
    @type Object
    @private
    ###
    @_ngSlipForChain = new Set()

    ###*
    @property _resMessageMap
    @type Object
    @private
    ###
    @_resMessageMap = new Map()

    ###*
    @property _threadTitle
    @type String|null
    @private
    ###
    @_threadTitle = null

    try
      @harmfulReg = new RegExp(app.config.get("image_blur_word"))
      @findHarmfulFlag = true
    catch e
      app.message.send("notify",
        html: """
          画像ぼかしの正規表現を読み込むのに失敗しました
          画像ぼかし機能は無効化されます
        """
        background_color: "red"
      )
      @findHarmfulFlag = false

    @container.on "scrollstart", =>
      @_isScrolling = true
      return

    @container.on "scrollfinish", =>
      @_isScrolling = false
      return

    return

  ###*
  @method _reScrollTo
  @private
  ###
  _reScrollTo: ->
    @scrollTo(@_lastScrollInfo.resNum, @_lastScrollInfo.animate, @_lastScrollInfo.offset, true)
    return

  ###*
  @method _isHidden
  @private
  ###
  _isHidden: (ele) ->
    unless @_hiddenSelectors?
      @_hiddenSelectors = []
      css = $$.I("user_css").sheet.cssRules
      for {selectorText, style, type} in css when type is 1
        if style.display is "none"
          @_hiddenSelectors.push(selectorText)
    return (
      (ele.hasClass("ng") and not app.config.isOn("display_ng")) or
      @_hiddenSelectors.some( (selector) ->
        return ele.matches(selector)
      )
    )

  ###*
  @method _loadNearlyImages
  @param {Number} resNum
  @param {Number} [offset=0]
  @return {Boolean} loadFlag
  ###
  _loadNearlyImages: (resNum, offset = 0) ->
    loadFlag = false
    target = @container.children[resNum - 1]

    {offsetHeight: containerHeight, scrollHeight: containerScroll} = @container
    viewTop = target.offsetTop
    viewTop += offset if offset < 0
    viewBottom = viewTop + containerHeight
    if viewBottom > containerScroll
      viewBottom = containerScroll
      viewTop = viewBottom - containerHeight

    # 遅延ロードの解除
    loadImageByElement = (targetElement) =>
      for media in targetElement.$$("img[data-src], video[data-src]")
        loadFlag = true
        media.dispatchEvent(new Event("immediateload", {"bubbles": true}))
      return

    # 表示範囲内の要素をスキャンする
    # (上方)
    tmpTarget = target
    while (
      tmpTarget and
      (
        (isHidden = @_isHidden(tmpTarget)) or
        tmpTarget.offsetTop + tmpTarget.offsetHeight > viewTop
      )
    )
      loadImageByElement(tmpTarget) unless isHidden
      tmpTarget = tmpTarget.prev()
    # (下方)
    tmpTarget = target.next()
    while (
      tmpTarget and
      (
        (isHidden = @_isHidden(tmpTarget)) or
        tmpTarget.offsetTop < viewBottom
      )
    )
      loadImageByElement(tmpTarget) unless isHidden
      tmpTarget = tmpTarget.next()

    # 遅延スクロールの設定
    if (
      (loadFlag or @_timeoutID isnt 0) and
      not app.config.isOn("image_height_fix")
    )
      clearTimeout(@_timeoutID) if @_timeoutID isnt 0
      delayScrollTime = parseInt(app.config.get("delay_scroll_time"))
      @_timeoutID = setTimeout( =>
        @_timeoutID = 0
        @_reScrollTo()
      , delayScrollTime)

    return loadFlag

  ###*
  @method scrollTo
  @param {Element | Number} target
  @param {Boolean} [animate=false]
  @param {Number} [offset=0]
  @param {Boolean} [rerun=false]
  ###
  scrollTo: (target, animate = false, offset = 0, rerun = false) ->
    if typeof target is "number"
      resNum = target
    else
      resNum = +target.C("num")[0].textContent
    @_lastScrollInfo.resNum = resNum
    @_lastScrollInfo.animate = animate
    @_lastScrollInfo.offset = offset
    loadFlag = false

    target = @container.children[resNum - 1]

    # 検索中で、ターゲットが非ヒット項目で非表示の場合、スクロールを中断
    if (
      target and
      @container.hasClass("searching") and
      not target.hasClass("search_hit")
    )
      target = null

    # もしターゲットがNGだった場合、その直前/直後の非NGレスをターゲットに変更する
    if target and @_isHidden(target)
      replaced = target
      while (replaced = replaced.prev())
        unless @_isHidden(replaced)
          target = replaced
          break
        if !replaced?
          replaced = target
          while (replaced = replaced.next())
            unless @_isHidden(replaced)
              target = replaced
              break

    if target
      # 前後に存在する画像を事前にロードする
      loadFlag = @_loadNearlyImages(resNum, offset) unless rerun

      # offsetが比率の場合はpxを求める
      if 0 < offset < 1
        offset = Math.round(target.offsetHeight * offset)

      # 遅延スクロール時の実行必要性確認
      return if rerun and @container.scrollTop is target.offsetTop + offset

      # スクロールの実行
      if animate
        rerunAndCancel = false
        if @_isScrolling
          cancelAnimationFrame(@_scrollRequestID)
          rerunAndCancel = true if rerun
        do =>
          @container.dispatchEvent(new Event("scrollstart"))

          to = target.offsetTop + offset
          movingHeight = to - @container.scrollTop
          if rerunAndCancel and to is @_lastScrollInfo.animateTo
            change = @_lastScrollInfo.animateChange
          else
            change = Math.max(Math.round(movingHeight / 15), 1)
          min = Math.min(to-change, to+change)
          max = Math.max(to-change, to+change)
          unless rerun
            @_lastScrollInfo.animateTo = to
            @_lastScrollInfo.animateChange = change

          @_scrollRequestID = requestAnimationFrame(_scrollInterval = =>
            before = @container.scrollTop
            # 画像のロードによる座標変更時の補正
            if to isnt target.offsetTop + offset
              to = target.offsetTop + offset
              if to - @container.scrollTop > movingHeight
                movingHeight = to - @container.scrollTop
                change = Math.max(Math.round(movingHeight / 15), 1)
              min = Math.min(to-change, to+change)
              max = Math.max(to-change, to+change)
              unless rerun
                @_lastScrollInfo.animateTo = to
                @_lastScrollInfo.animateChange = change
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
            @_scrollRequestID = requestAnimationFrame(_scrollInterval)
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
    for res, key in @container.child() when res.offsetTop + res.offsetHeight > containerBottom
      read = key
      break

    # >>1の底辺が表示領域外にはみ出していた場合対策
    if read is 0
      read = 1

    return read

  ###*
  @method getDisplay
  @return {Object} 現在表示していると推測されるレスの番号とオフセット
  ###
  getDisplay: ->
    containerTop = @container.scrollTop
    containerBottom = containerTop + @container.clientHeight
    resRead = {resNum: 1, offset: 0, bottom: false}

    # 既に画面の一番下までスクロールしている場合
    # (いつのまにか位置がずれていることがあるので余裕を設ける)
    if containerBottom >= @container.scrollHeight - 60
      resRead.bottom = true

    # スクロール位置のレスを抽出
    for res, key in @container.child() when res.offsetTop + res.offsetHeight > containerTop
      resRead.resNum = key + 1
      resRead.offset = (containerTop - res.offsetTop) / res.offsetHeight
      break

    return resRead

  ###*
  @method getSelected
  @return {Element|null}
  ###
  getSelected: ->
    return @container.$("article.selected")

  ###*
  @method select
  @param {Element | Number} target
  @param {Boolean} [preventScroll = false]
  @param {Boolean} [animate = false]
  @param {Number} [offset = 0]
  ###
  select: (target, preventScroll = false, animate = false, offset = 0) ->
    @container.$("article.selected")?.removeClass("selected")

    if typeof target is "number"
      target = @container.$("article:nth-child(#{target}), article:last-child")

    return unless target

    target.addClass("selected")
    if not preventScroll
      @scrollTo(target, animate, offset)
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
    containerHeight = @container.offsetHeight

    if current
      {top, bottom} = current.getBoundingClientRect()
      # 現在選択されているレスが表示範囲外だった場合、それを無視する
      if top >= containerHeight or bottom <= 0
        current = null

    unless current
      @select(@container.child()[@getRead() - 1], true)
    else
      target = current

      for [0...repeat]
        prevTarget = target

        {bottom: targetBottom} = target.getBoundingClientRect()
        if targetBottom <= containerHeight and target.next()
          target = target.next()

          while target and @_isHidden(target)
            target = target.next()

        if not target
          target = prevTarget
          break

        {bottom: targetBottom, height: targetHeight} = target.getBoundingClientRect()
        if containerHeight < targetBottom
          if targetHeight >= containerHeight
            @container.scrollTop += containerHeight * 0.5
          else
            @container.scrollTop += (
              targetBottom -
              containerHeight +
              10
            )
        else if not target.next()
          @container.scrollTop += containerHeight * 0.5
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
    containerHeight = @container.offsetHeight

    if current
      {top, bottom} = current.getBoundingClientRect()
      # 現在選択されているレスが表示範囲外だった場合、それを無視する
      if top >= containerHeight or bottom <= 0
        current = null

    unless current
      @select(@container.child()[@getRead() - 1], true)
    else
      target = current

      for [0...repeat]
        prevTarget = target

        {top: targetTop, height: targetHeight} = target.getBoundingClientRect()
        if 0 <= targetTop and target.prev()
          target = target.prev()

          while target and @_isHidden(target)
            target = target.prev()

        if not target
          target = prevTarget
          break

        {top: targetTop, height: targetHeight} = target.getBoundingClientRect()
        if targetTop < 0
          if targetHeight >= containerHeight
            @container.scrollTop -= containerHeight * 0.5
          else
            @container.scrollTop = target.offsetTop - 10
        else if not target.prev()
          @container.scrollTop -= containerHeight * 0.5
          if target is prevTarget
            break

      if target and target isnt current
        @select(target, true)
    return

  ###*
  @method addItem
  @param {Object | Array}
  ###
  addItem: (items, threadTitle) ->
    items = [items] unless Array.isArray(items)

    unless items.length > 0
      return

    resNum = @container.child().length
    startResNum = resNum+1
    {bbsType} = app.URL.guessType(@url)
    writtenRes = await app.WriteHistory.getByUrl(@url)
    @_threadTitle = threadTitle

    $fragment = $_F()

    for res in items
      resNum++

      res.num = resNum
      res.class = []
      res.attr = []
      scheme = app.URL.getScheme(@url)

      res = app.ReplaceStrTxt.do(@url, document.title, res)

      if /(?:\u3000{5}|\u3000\u0020|[^>]\u0020\u3000)(?!<br>|$)/i.test(res.message)
        res.class.push("aa")

      for writtenHistory in writtenRes when writtenHistory.res is resNum
        res.class.push("written")
        break

      $article = $__("article")
      $header = $__("header")

      #.num
      $num = $__("span")
      $num.addClass("num")
      $num.textContent = resNum
      $header.addLast($num)

      #.name
      $name = $__("span")
      $name.addClass("name")
      if /^\s*(?:&gt;|\uff1e){0,2}([\d\uff10-\uff19]+(?:[\-\u30fc][\d\uff10-\uff19]+)?(?:\s*,\s*[\d\uff10-\uff19]+(?:[\-\u30fc][\d\uff10-\uff19]+)?)*)\s*$/.test(res.name)
        $name.addClass("name_anchor")
      $name.innerHTML = (
        res.name
          .replace(/<(?!(?:\/?b|\/?font(?: color="?[#a-zA-Z0-9]+"?)?)>)/g, "&lt;")
          .replace(/<\/b>\(([^<>]+? [^<>]+?)\)<b>$/, ($0, $1) =>
            res.slip = $1

            @slipIndex.set($1, new Set()) unless @slipIndex.has($1)
            @slipIndex.get($1).add(resNum)

            return ""
           )
          .replace(/<\/b>(◆[^<>]+?) <b>/, ($0, $1) =>
            res.trip = $1

            @tripIndex.set($1, new Set()) unless @tripIndex.has($1)
            @tripIndex.get($1).add(resNum)

            return """<span class="trip">#{$1}</span>"""
          )
          .replace(/<\/b>(.*?)<b>/g, """<span class="ob">$1</span>""")
          .replace(/&lt;span.*?>(.*?)&lt;\/span>/g, "<span class=\"ob\">$1</span>")
          .replace(/&lt;small.*?>(.*?)&lt;\/small>/g, "<small>$1</small>")
      )
      $header.addLast($name)

      #.mail
      $mail = $__("span")
      $mail.addClass("mail")
      $mail.innerHTML = res.mail.replace(/<.*?(?:>|$)/g, "")
      $header.addLast($mail)

      #.other
      $other = $__("span")
      tmp = (
        res.other
          #be
          .replace(/<\/div><div class="be .*?"><a href="(https?:\/\/be\.[25]ch\.net\/user\/\d+?)".*?>(.*?)<\/a>/, "<a class=\"beid\" href=\"$1\" target=\"_blank\">$2</a>")
          #タグ除去
          .replace(/<(?!(?:a class="beid".*?|\/a)>).*?(?:>|$)/g, "")
          #.id
          .replace(/(?:^| |(\d))(ID:(?!\?\?\?)[^ <>"']+|発信元:\d+.\d+.\d+.\d+)/, ($0, $1, $2) =>
            fixedId = $2.replace(/\u25cf$/, "") #末尾●除去

            res.id = fixedId
            if resNum is 1
              @oneId = fixedId
              @_existIdAtFirstRes = true

            if fixedId is @oneId
              res.class.push("one")

            if fixedId.endsWith(".net")
              res.class.push("net")

            @idIndex.set(fixedId, new Set()) unless @idIndex.has(fixedId)
            @idIndex.get(fixedId).add(resNum)

            return """#{$1 ? ""}<span class="id">#{$2}</span>"""
          )
          #.beid
          .replace(/(?:^| )(BE:(\d+)\-[A-Z\d]+\(\d+\))/,
            """<a class="beid" href="#{scheme}://be.5ch.net/test/p.php?i=$3" target="_blank">$1</a>""")
          #.date
          .replace(/\d{4}\/\d{1,2}\/\d{1,2}\(.\)\s\d{1,2}:\d\d(?::\d\d(?:\.\d+)?)?/, "<time class=\"date\">$&</time>")
      )
      # slip追加
      if res.slip?
        if (index = tmp.indexOf("<span class=\"id\">")) isnt -1
          tmp = tmp.slice(0, index) + """<span class="slip">SLIP:#{res.slip}</span>""" + tmp.slice(index, tmp.length)
        else
          tmp += """<span class="slip">SLIP:#{res.slip}</span>"""
        if resNum is 1
          @_existSlipAtFirstRes = true
      $other.innerHTML = tmp
      $header.addLast($other)
      $article.addLast($header)

      # スレッド終端の自動追加メッセージの確認
      if (
        bbsType is "2ch" and
        tmp.startsWith(_OVER1000_DATA) and
        !@_over1000ResNum
      )
        @_over1000ResNum = resNum

      #文字色
      color = res.message.match(/<font color="(.*?)">/i)

      # id, slip, tripが取り終わったタイミングでNG判定を行う
      # NG判定されるものは、ReplaceStrTxtで置き換え後のテキストなので注意すること
      if ngObj = @_checkNG(res, bbsType)
        res.class.push("ng")
        ngType = ngObj.type
        ngType += ":" + ngObj.name if ngObj.name?
        res.attr["ng-type"] = ngType

      # resデータの保管
      @_rawResData[resNum] = res

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
          .replace(/(h)?(ttps?:\/\/(?!img\.[25]ch\.net\/(?:ico|emoji|premium)\/[\w\-_]+\.gif)(?:[a-hj-zA-HJ-Z\d_\-.!~*'();\/?:@=+$,%#]|\&(?!gt;)|[iI](?![dD]:)+)+)/g,
            '<a href="h$2" target="_blank">$1$2</a>')
          #Beアイコン埋め込み表示
          .replace(///^(?:\s*sssp|https?)://(img\.[25]ch\.net/(?:ico|premium)/[\w\-_]+\.gif)\s*<br>///, ($0, $1) =>
            if app.URL.tsld(@url) in ["5ch.net", "bbspink.com", "2ch.sc"]
              return """<img class="beicon" src="/img/dummy_1x1.webp" data-src="#{scheme}://#{$1}"><br>"""
            return $0
          )
          #エモーティコン埋め込み表示
          .replace(///(?:\s*sssp|https?)://(img\.[25]ch\.net/emoji/[\w\-_]+\.gif)\s*///g, ($0, $1) =>
            if app.URL.tsld(@url) in ["5ch.net", "bbspink.com", "2ch.sc"]
              return """<img class="beicon emoticon" src="/img/dummy_1x1.webp" data-src="#{scheme}://#{$1}">"""
            return $0
          )
          #アンカーリンク
          .replace(app.util.Anchor.reg.ANCHOR, ($0) =>
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
                  @repIndex.set(target, new Set()) unless @repIndex.has(target)
                  @repIndex.get(target).add(resNum)
                  @harmImgIndex.add(target) if isThatHarmImg
                  target++

            return "<a href=\"javascript:undefined;\" class=\"anchor" +
            (if disabled then " disabled\" data-disabled-reason=\"#{disabledReason}\"" else "\"") +
            ">#{$0}</a>"
          )
          #IDリンク
          .replace(/id:(?:[a-hj-z\d_\+\/\.\!]|i(?!d:))+/ig, "<a href=\"javascript:undefined;\" class=\"anchor_id\">$&</a>")
      )

      $message = $__("div")
      $message.addClass("message")
      if color?
        $message.style.color = "##{color[1]}"
      $message.innerHTML = tmp
      $article.addLast($message)

      if app.config.isOn("display_ng") and res.class.includes("ng")
        res.class.push("disp_ng")

      $article.setClass(res.class.join(" "))
      $article.dataset.id = res.id if res.id?
      $article.dataset.slip = res.slip if res.slip?
      $article.dataset.trip = res.trip if res.trip?
      for key, val of res.attr
        $article.setAttr(key, val)

      $fragment.addLast($article)

    @updateFragmentIds($fragment, startResNum)

    @container.addLast($fragment)

    @updateIds(startResNum)

    # NG判定されたIDとSLIPの連鎖NG
    if app.config.isOn("chain_ng_id")
      for id from @_ngIdForChain
        @_chainNgById(id)
    if app.config.isOn("chain_ng_slip")
      for slip from @_ngSlipForChain
        @_chainNgBySlip(slip)

    #サムネイル追加処理
    try
      await Promise.all(
        Array.from(@container.$$(
          ".message > a:not(.anchor):not(.thumbnail):not(.has_thumbnail):not(.expandedURL):not(.has_expandedURL)"
        )).map( (a) =>
          {a, link} = await @checkUrlExpand(a)
          {res, err} = app.ImageReplaceDat.do(link)
          unless err?
            href = res.text
          else
            href = a.href
          mediaType = app.URL.getExtType(
            href
            audio: app.config.isOn("audio_supported")
            video: app.config.isOn("audio_supported")
            oggIsAudio: app.config.isOn("audio_supported_ogg")
            oggIsVideo: app.config.isOn("video_supported_ogg")
          )
          mediaType ?= "image" unless err?
          # サムネイルの追加
          @addThumbnail(a, href, mediaType, res) if mediaType
          return
        )
      )
      #harmImg更新
      do =>
        for res from @harmImgIndex
          elm = @container.child()[res - 1]
          continue unless elm
          elm.addClass("has_blur_word")
          if elm.hasClass("has_image") and app.config.isOn("image_blur")
            UI.MediaContainer.setImageBlur(elm, true)
        return
    return

  ###*
  @method updateId
  @param {String} className
  @param {Map} map
  @param {String} prefix
  ###
  updateId: ({startRes = 1, endRes, dom}, className, map, prefix) ->
    numbersReg = /(?:\(\d+\))?$/
    for [id, index] from map
      count = index.size
      for resNum from index when startRes <= resNum and (!endRes? or resNum <= endRes)
        elm = dom.child()[resNum - startRes].C(className)[0]
        elm.textContent = "#{prefix}#{id}(#{count})"
        if count >= 5
          elm.removeClass("link")
          elm.addClass("freq")
        else if count >= 2
          elm.addClass("link")
    return

  ###*
  @method updateFragmentIds
  ###
  updateFragmentIds: ($fragment, startRes) ->
    #id, slip, trip更新
    @updateId({ startRes, dom: $fragment }, "id", @idIndex, "")
    @updateId({ startRes, dom: $fragment }, "slip", @slipIndex, "SLIP:")
    @updateId({ startRes, dom: $fragment }, "trip", @tripIndex, "")
    return

  ###*
  @method updateIds
  ###
  updateIds: (endRes) ->
    #id, slip, trip更新
    @updateId({ endRes, dom: @container }, "id", @idIndex, "")
    @updateId({ endRes, dom: @container }, "slip", @slipIndex, "SLIP:")
    @updateId({ endRes, dom: @container }, "trip", @tripIndex, "")

    #参照関係再構築
    do =>
      for [resKey, index] from @repIndex
        res = @container.child()[resKey - 1]
        continue unless res
        resCount = index.size
        if elm = res.C("rep")[0]
          newFlg = false
        else
          newFlg = true
          elm = $__("span")
        elm.textContent = "返信 (#{resCount})"
        elm.className = if resCount >= 5 then "rep freq" else "rep link"
        res.dataset.rescount = [1..resCount].join(" ")
        if newFlg
          res.C("other")[0].addLast(
            document.createTextNode(" ")
          )
          res.C("other")[0].addLast(elm)
        #連鎖NG
        if app.config.isOn("chain_ng") and res.hasClass("ng")
          @_chainNG(res)
        #自分に対してのレス
        if res.hasClass("written")
          for r from index
            @container.child()[r - 1].addClass("to_written")
    return

  ###*
  @method _chainNG
  @param {Element} res
  @private
  ###
  _chainNG: (res) =>
    resNum = +res.C("num")[0].textContent
    return unless @repIndex.has(resNum)
    for r from @repIndex.get(resNum)
      continue if r <= resNum
      getRes = @container.child()[r - 1]
      continue if getRes.hasClass("ng")
      rn = +getRes.C("num")[0].textContent
      continue if app.NG.isIgnoreResNumForAuto(rn, app.NG.NG_TYPE_AUTO_CHAIN)
      continue if app.NG.isIgnoreNgType(@_rawResData[rn], @_threadTitle, @url, app.NG.NG_TYPE_AUTO_CHAIN)
      getRes.addClass("ng")
      getRes.addClass("disp_ng") if app.config.isOn("display_ng")
      getRes.setAttr("ng-type", app.NG.NG_TYPE_AUTO_CHAIN)
      # NG連鎖IDの登録
      if app.config.isOn("chain_ng_id") and app.config.isOn("chain_ng_id_by_chain")
        if id = getRes.getAttr("data-id")
          @_ngIdForChain.add(id) unless @_ngIdForChain.has(id)
          @_chainNgById(id)
      # NG連鎖SLIPの登録
      if app.config.isOn("chain_ng_slip") and app.config.isOn("chain_ng_slip_by_chain")
        if slip = getRes.getAttr("data-slip")
          @_ngSlipForChain.add(slip) unless @_ngSlipForChain.has(slip)
          @_chainNgBySlip(slip)
      @_chainNG(getRes)
    return

  ###*
  @method _chainNgById
  @param {String} id
  @private
  ###
  _chainNgById: (id) =>
    # 連鎖IDのNG
    for r in @container.$$("article[data-id=\"#{id}\"]")
      continue if r.hasClass("ng")
      rn = +r.C("num")[0].textContent
      continue if app.NG.isIgnoreResNumForAuto(rn, app.NG.NG_TYPE_AUTO_CHAIN_ID)
      continue if app.NG.isIgnoreNgType(@_rawResData[rn], @_threadTitle, @url, app.NG.NG_TYPE_AUTO_CHAIN_ID)
      r.addClass("ng")
      r.addClass("disp_ng") if app.config.isOn("display_ng")
      r.setAttr("ng-type", app.NG.NG_TYPE_AUTO_CHAIN_ID)
      # 連鎖NG
      @_chainNG(r) if app.config.isOn("chain_ng")
    return

  ###*
  @method _chainNgBySlip
  @param {String} slip
  @private
  ###
  _chainNgBySlip: (slip) =>
    # 連鎖SLIPのNG
    for r in @container.$$("article[data-slip=\"#{slip}\"]")
      continue if r.hasClass("ng")
      rn = +r.C("num")[0].textContent
      continue if app.NG.isIgnoreResNumForAuto(rn, app.NG.NG_TYPE_AUTO_CHAIN_SLIP)
      continue if app.NG.isIgnoreNgType(@_rawResData[rn], @_threadTitle, @url, app.NG.NG_TYPE_AUTO_CHAIN_SLIP)
      r.addClass("ng")
      r.addClass("disp_ng") if app.config.isOn("display_ng")
      r.setAttr("ng-type", app.NG.NG_TYPE_AUTO_CHAIN_SLIP)
      # 連鎖NG
      @_chainNG(r) if app.config.isOn("chain_ng")
    return

  ###*
  @method _checkNG
  @param {Object} objRes
  @param {String} bbsType
  @return {Object|null}
  @private
  ###
  _checkNG: (objRes, bbsType) =>
    if ngObj = @_getNgType(objRes, bbsType)
      # NG連鎖IDの登録
      if (
        app.config.isOn("chain_ng_id") and
        objRes.id? and
        not (ngObj.type in [app.NG.NG_TYPE_ID, app.NG.NG_TYPE_AUTO_CHAIN_ID])
      )
        @_ngIdForChain.add(objRes.id) unless @_ngIdForChain.has(objRes.id)
      # NG連鎖SLIPの登録
      if (
        app.config.isOn("chain_ng_slip") and
        objRes.slip? and
        not (ngObj.type in [app.NG.NG_TYPE_SLIP, app.NG.NG_TYPE_AUTO_CHAIN_SLIP])
      )
        @_ngSlipForChain.add(objRes.slip) unless @_ngSlipForChain.has(objRes.slip)
    return ngObj

  ###*
  @method _getNgType
  @param {Object} objRes
  @param {String} bbsType
  @return {Object|null}
  @private
  ###
  _getNgType: (objRes, bbsType) =>
    return null if @_over1000ResNum? and objRes.num >= @_over1000ResNum

    # 登録ワードのNG
    if (
      (ngObj = app.NG.checkNGThread(objRes, @_threadTitle, @url)) and
      !app.NG.isIgnoreNgType(objRes, @_threadTitle, @url, ngObj.type)
    )
      return ngObj

    if bbsType is "2ch"
      # idなしをNG
      if (
        app.config.isOn("nothing_id_ng") and !objRes.id? and
        ((app.config.get("how_to_judgment_id") is "first_res" and @_existIdAtFirstRes) or
         (app.config.get("how_to_judgment_id") is "exists_once" and @idIndex.size isnt 0)) and
        !app.NG.isIgnoreResNumForAuto(objRes.num, app.NG.NG_TYPE_AUTO_NOTHING_ID) and
        !app.NG.isIgnoreNgType(objRes, @_threadTitle, @url, app.NG.NG_TYPE_AUTO_NOTHING_ID)
      )
        return {type: app.NG.NG_TYPE_AUTO_NOTHING_ID}
      # slipなしをNG
      if (
        app.config.isOn("nothing_slip_ng") and !objRes.slip? and
        ((app.config.get("how_to_judgment_id") is "first_res" and @_existSlipAtFirstRes) or
         (app.config.get("how_to_judgment_id") is "exists_once" and @slipIndex.size isnt 0)) and
        !app.NG.isIgnoreResNumForAuto(objRes.num, app.NG.NG_TYPE_AUTO_NOTHING_SLIP) and
        !app.NG.isIgnoreNgType(objRes, @_threadTitle, @url, app.NG.NG_TYPE_AUTO_NOTHING_SLIP)
      )
        return {type: app.NG.NG_TYPE_AUTO_NOTHING_SLIP}

    # 連鎖IDのNG
    if (
      app.config.isOn("chain_ng_id") and
      objRes.id? and
      @_ngIdForChain.has(objRes.id) and
      !app.NG.isIgnoreResNumForAuto(objRes.num, app.NG.NG_TYPE_AUTO_CHAIN_ID) and
      !app.NG.isIgnoreNgType(objRes, @_threadTitle, @url, app.NG.NG_TYPE_AUTO_CHAIN_ID)
    )
      return {type: app.NG.NG_TYPE_AUTO_CHAIN_ID}
    # 連鎖SLIPのNG
    if (
      app.config.isOn("chain_ng_slip") and
      objRes.slip? and
      @_ngSlipForChain.has(objRes.slip) and
      !app.NG.isIgnoreResNumForAuto(objRes.num, app.NG.NG_TYPE_AUTO_CHAIN_SLIP) and
      !app.NG.isIgnoreNgType(objRes, @_threadTitle, @url, app.NG.NG_TYPE_AUTO_CHAIN_SLIP)
    )
      return {type: app.NG.NG_TYPE_AUTO_CHAIN_SLIP}

    # 連投レスをNG
    if app.config.get("repeat_message_ng_count") > 1
      resMessage = (
        objRes.message
          # アンカーの削除
          .replace(/<a [^>]*>(?:&gt;){1,2}[\d]+(?:(?:-|,)[\d]+)*<\/a>/g, "")
          # <a>タグの削除
          .replace(/<a [^>]*>(.*)<\/a>/g, "$1")
          # 行末ブランクの削除
          .replace(/(?:[\s]+)<br>/g, "<br>")
          # 空行の削除
          .replace(/^<br>(.*)/, "$1")
          .replace(/(?:<br>){2,}/g, "<br>")
          # 前後ブランクの削除
          .trim()
      )
      @_resMessageMap.set(resMessage, new Set()) unless @_resMessageMap.has(resMessage)
      @_resMessageMap.get(resMessage).add(objRes.num)
      if (
        @_resMessageMap.get(resMessage).size >= +app.config.get("repeat_message_ng_count") and
        !app.NG.isIgnoreResNumForAuto(objRes.num, app.NG.NG_TYPE_AUTO_REPEAT_MESSAGE) and
        !app.NG.isIgnoreNgType(objRes, @_threadTitle, @url, app.NG.NG_TYPE_AUTO_REPEAT_MESSAGE)
      )
        return {type: app.NG.NG_TYPE_AUTO_REPEAT_MESSAGE}

    # 前方参照をNG
    if (
      app.config.isOn("forward_link_ng") and
      !app.NG.isIgnoreResNumForAuto(objRes.num, app.NG.NG_TYPE_AUTO_FORWARD_LINK) and
      !app.NG.isIgnoreNgType(objRes, @_threadTitle, @url, app.NG.NG_TYPE_AUTO_FORWARD_LINK)
    )
      ngFlag = false
      resMessage = (
        objRes.message
          # <a>タグの削除
          .replace(/<a [^>]*>(.*)<\/a>/g, "$1")
      )
      m = resMessage.match(app.util.Anchor.reg.ANCHOR)
      if m
        for anc in m
          anchor = app.util.Anchor.parseAnchor(anc)
          for segment in anchor.segments
            target = segment[0]
            while target <= segment[1]
              if target > objRes.num
                ngFlag = true
                break
              target++
            break if ngFlag
          break if ngFlag
      return {type: app.NG.NG_TYPE_AUTO_FORWARD_LINK} if ngFlag

    return null

  ###*
  @method refreshNG
  ###
  refreshNG: =>
    {bbsType} = app.URL.guessType(@url)
    @_ngIdForChain.clear()
    @_ngSlipForChain.clear()
    @_resMessageMap.clear()
    # NGの解除
    for res in @container.$$("article.ng")
      res.removeClass("ng")
      res.removeClass("disp_ng")
      res.removeAttr("ng-type")
    # NGの再設定
    for res in @container.$$("article")
      continue if res.hasClass("ng")
      resNum = +res.C("num")[0].textContent
      if ngObj = @_checkNG(@_rawResData[resNum], bbsType)
        res.addClass("ng")
        res.addClass("disp_ng") if app.config.isOn("display_ng")
        ngType = ngObj.type
        ngType += ":" + ngObj.name if ngObj.name?
        res.setAttr("ng-type", ngType)
        # 連鎖NG
        if app.config.isOn("chain_ng") and @repIndex.has(resNum)
          @_chainNG(res)
    # NG判定されたIDとSLIPの連鎖NG
    if app.config.isOn("chain_ng_id")
      for id from @_ngIdForChain
        @_chainNgById(id)
    if app.config.isOn("chain_ng_slip")
      for slip from @_ngSlipForChain
        @_chainNgBySlip(slip)
    # 表示更新通知
    @container.dispatchEvent(new Event("view_refreshed", {"bubbles": true}))
    return

  ###*
  @method addThumbnail
  @param {HTMLAElement} sourceA
  @param {String} thumbnailPath
  @param {String} [mediaType="image"]
  @param {Object} res
  ###
  addThumbnail: (sourceA, thumbnailPath, mediaType = "image", res) ->
    sourceA.addClass("has_thumbnail")

    thumbnail = $__("div")
    thumbnail.addClass("thumbnail")
    thumbnail.setAttr("media-type", mediaType)

    if mediaType in ["image", "video"]
      article = sourceA.closest("article")
      article.addClass("has_image")
      # グロ画像に対するぼかし処理
      if article.hasClass("has_blur_word") and app.config.isOn("image_blur")
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
        thumbnailImg.style.maxWidth = "#{app.config.get("image_width")}px"
        thumbnailImg.style.maxHeight = "#{app.config.get("image_height")}px"
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
        thumbnailFavicon.dataset.src = "https://www.google.com/s2/favicons?domain=#{sourceA.hostname}"
        thumbnailLink.addLast(thumbnailFavicon)

      when "audio", "video"
        thumbnailLink = $__(mediaType)
        thumbnailLink.src = ""
        thumbnailLink.dataset.src = thumbnailPath
        thumbnailLink.preload = "metadata"
        switch mediaType
          when "audio"
            thumbnailLink.style.width = "#{app.config.get("audio_width")}px"
            thumbnailLink.setAttr("controls", "")
          when "video"
            thumbnailLink.style.WebkitFilter = webkitFilter
            thumbnailLink.style.maxWidth = "#{app.config.get("video_width")}px"
            thumbnailLink.style.maxHeight = "#{app.config.get("video_height")}px"
            if app.config.isOn("video_controls")
              thumbnailLink.setAttr("controls", "")

    thumbnail.addLast(thumbnailLink)

    # 高さ固定の場合
    if app.config.isOn("image_height_fix")
      switch mediaType
        when "image"
          h = parseInt(app.config.get("image_height"))
        when "video"
          h = parseInt(app.config.get("video_height"))
        else
          h = 100   # 最低高
      thumbnail.style.height = "#{h}px"

    sib = sourceA
    while true
      pre = sib
      sib = pre.next()
      if !sib? or sib.tagName is "BR"
        if sib?.next()?.hasClass("thumbnail")
          continue
        pre.addAfter(thumbnail)
        if not pre.hasClass("thumbnail")
          pre.addAfter($__("br"))
        break
    return

  ###*
  @method addExpandedURL
  @param {HTMLAElement} sourceA
  @param {String} finalUrl
  ###
  addExpandedURL: (sourceA, finalUrl) ->
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
      sib = pre.next()
      if !sib? or sib.tagName is "BR"
        if sib?.next()?.hasClass("expandedURL")
          continue
        pre.addAfter(expandedURL)
        if not pre.hasClass("expandedURL")
          pre.addAfter($__("br"))
        break
     return expandedURLLink

  ###*
  @method checkUrlExpand
  @param {HTMLAElement} a
  ###
  checkUrlExpand: (a) ->
    if (
      app.config.get("expand_short_url") isnt "none" and
      app.URL.SHORT_URL_LIST.has(app.URL.getDomain(a.href))
    )
      # 短縮URLの展開
      finalUrl = await app.URL.expandShortURL(a.href)
      newLink = @addExpandedURL(a, finalUrl)
      if finalUrl
        return {a, link: newLink.href}
    return {a, link: a.href}

  ###*
  @method addClassWithOrg
  @param {Element} $res
  @param {String} className
  ###
  addClassWithOrg: ($res, className) ->
    $res.addClass(className)
    resnum = parseInt($res.C("num")[0].textContent)
    @container.child()[resnum-1].addClass(className)
    return

  ###*
  @method removeClassWithOrg
  @param {Element} $res
  @param {String} className
  ###
  removeClassWithOrg: ($res, className) ->
    $res.removeClass(className)
    resnum = parseInt($res.C("num")[0].textContent)
    @container.child()[resnum-1].removeClass(className)
    return

  ###*
  @method addWriteHistory
  @param {Element} $res
  ###
  addWriteHistory: ($res) ->
    name = $res.C("name")[0].textContent
    mail = $res.C("mail")[0].textContent
    date = app.util.stringToDate($res.C("other")[0].textContent).valueOf()
    if date?
      app.WriteHistory.add({
        url: @url
        res: parseInt($res.C("num")[0].textContent)
        title: document.title
        name
        mail
        message: $res.C("message")[0].textContent
        date
      })
    return

  ###*
  @method removeWriteHistory
  @param {Element} $res
  ###
  removeWriteHistory: ($res) ->
    resnum = parseInt($res.C("num")[0].textContent)
    app.WriteHistory.remove(@url, resnum)
    return
