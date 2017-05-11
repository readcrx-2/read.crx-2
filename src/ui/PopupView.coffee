window.UI ?= {}

###*
@namespace UI
@class PopupView
@constructor
@param {Element} defaultParent
###
class UI.PopupView

  constructor: (@defaultParent)->
    ###*
    @property _popupStack
    @type Array
    @private
    ###
    @_popupStack = []

    ###*
    @property _popupArea
    @type Object
    @private
    ###
    @_popupArea = @defaultParent.$(".popup_area")

    ###*
    @property _popupStyle
    @type Object
    @private
    ###
    @_popupStyle = null

    ###*
    @property _popupMarginHeight
    @type Number
    @private
    ###
    @_popupMarginHeight = -1

    ###*
    @property _currentX
    @type Number
    @private
    ###
    @_currentX = 0

    ###*
    @property _currentY
    @type Number
    @private
    ###
    @_currentY = 0

    ###*
    @property _delayTime
    @type Number
    @private
    ###
    @_delayTime = parseInt(app.config.get("popup_delay_time"))

    ###*
    @property _delayTimeoutID
    @type Number
    @private
    ###
    @_delayTimeoutID = 0

    ###*
    @property _delayRemoveTimeoutID
    @type Number
    @private
    ###
    @_delayRemoveTimeoutID = 0

    return

  ###*
  @method show
  @param {Element} popup
  @param {Number} mouseX
  @param {Number} mouseY
  @param {Element} source
  ###
  show: (@popup, @mouseX, @mouseY, @source) ->

    # 同一ソースからのポップアップが既に有る場合は、処理を中断
    if @_popupStack.length > 0
      popupInfo = @_popupStack[@_popupStack.length - 1]
      return if @source is popupInfo.source

    # sourceがpopup内のものならば、兄弟ノードの削除
    # それ以外は、全てのノードを削除
    if @source.closest(".popup")
      @source.closest(".popup").addClass("active")
      @_remove(false)
    else
      @_remove(true)

    # 待機中の処理があればキャンセルする
    if @_delayTimeoutID isnt 0
      clearTimeout(@_delayTimeoutID)
      @_delayTimeoutID = 0

    # 表示位置の決定
    setDispPosition = (popupNode) =>
      margin = 20
      viewTop = @defaultParent.$(".nav_bar").offsetHeight
      bodyHeight = document.body.offsetHeight
      viewHeight = bodyHeight - viewTop

      # カーソルの上下左右のスペースを測定
      space =
        left: @mouseX
        right: document.body.offsetWidth - @mouseX
        top: @mouseY
        bottom: bodyHeight - @mouseY

      # 通常はカーソル左か右のスペースを用いるが、そのどちらもが狭い場合は上下に配置する
      if Math.max(space.left, space.right) > 400
        # 例え右より左が広くても、右に十分なスペースが有れば右に配置
        if space.right > 350
          popupNode.style.left = "#{space.left + margin}px"
          popupNode.style.maxWidth = "#{document.body.offsetWidth - space.left - margin * 2}px"
        else
          popupNode.style.right = "#{space.right + margin}px"
          popupNode.style.maxWidth = "#{document.body.offsetWidth - space.right - margin * 2}px"
        cursorTop = Math.max(space.top, viewTop + margin * 2)
        outerHeight = @_getOuterHeight(popupNode, true)
        if viewHeight > outerHeight + margin
          cssTop = Math.min(cursorTop, document.body.offsetHeight - outerHeight) - margin
        else
          cssTop = viewTop + margin
        popupNode.style.top = "#{cssTop}px"
        popupNode.style.maxHeight = "#{document.body.offsetHeight - cssTop - margin}px"
      else
        popupNode.style.left = "#{margin}px"
        popupNode.style.maxWidth = "#{document.body.offsetWidth - margin * 2}px"
        # 例え上より下が広くても、上に十分なスペースが有れば上に配置
        if space.top > Math.min(350, space.bottom)
          cssBottom = Math.max(space.bottom, margin)
          popupNode.style.bottom = "#{cssBottom}px"
          popupNode.style.maxHeight = "#{viewHeight - cssBottom - margin}px"
        else
          cssTop = document.body.offsetHeight - space.bottom + margin
          popupNode.style.top = "#{cssTop}px"
          popupNode.style.maxHeight = "#{viewHeight - cssTop - margin}px"
      return

    # マウス座標の監視
    if @_popupStack.length is 0
      @_currentX = @mouseX
      @_currentY = @mouseY
      @defaultParent.on("mousemove", (e) => @_onMouseMove(e))

    # 新規ノードの設定
    setupNewNode = (sourceNode, popupNode) =>
      # 表示位置の決定
      setDispPosition(popupNode)

      # ノードの設定
      sourceNode.addClass("popup_source")
      sourceNode.setAttr("stack-index", @_popupStack.length)
      sourceNode.on("mouseenter", (e) => @_onMouseEnter(e.currentTarget))
      sourceNode.on("mouseleave", (e) => @_onMouseLeave(e.currentTarget))
      popupNode.addClass("popup")
      popupNode.setAttr("stack-index", @_popupStack.length)
      popupNode.on("mouseenter", (e) => @_onMouseEnter(e.currentTarget))
      popupNode.on("mouseleave", (e) => @_onMouseLeave(e.currentTarget))

      # リンク情報の保管
      popupInfo =
        source: sourceNode
        popup: popupNode
      @_popupStack.push(popupInfo)

      return

    # 即時表示の場合
    if @_delayTime < 100
      # 新規ノードの設定
      setupNewNode(@source, @popup)
      # popupの表示
      @_popupArea.append(@popup)
      # ノードのアクティブ化
      app.defer =>
        @_activateNode()
        return

    # 遅延表示の場合
    else
      do (sourceNode = @source, popupNode = @popup) =>
        @_delayTimeoutID = setTimeout( =>
          @_delayTimeoutID = 0
          # マウス座標がポップアップ元のままの場合のみ実行する
          elm = document.elementFromPoint(@_currentX, @_currentY)
          if elm is sourceNode
            # 新規ノードの設定
            setupNewNode(sourceNode, popupNode)
            # ノードのアクティブ化
            sourceNode.addClass("active")
            # popupの表示
            @_popupArea.append(popupNode)
        , @_delayTime)
        return

    return

  ###*
  @method _remove
  @param {Boolean} forceRemove
  ###
  _remove: (forceRemove) ->
    while @_popupStack.length > 0
      popupInfo = @_popupStack[@_popupStack.length - 1]
      # 末端の非アクティブ・ノードを選択
      break if (
        !forceRemove and
        (
          popupInfo.source.hasClass("active") or
          popupInfo.popup.hasClass("active")
        )
      )
      # 該当ノードの除去
      popupInfo.source.off("mouseenter", (e) => @_onMouseEnter(e.currentTarget))
      popupInfo.source.off("mouseleave", (e) => @_onMouseLeave(e.currentTarget))
      popupInfo.popup.off("mouseenter", (e) => @_onMouseEnter(e.currentTarget))
      popupInfo.popup.off("mouseleave", (e) => @_onMouseLeave(e.currentTarget))
      popupInfo.source.removeClass("popup_source")
      popupInfo.source.removeAttr("stack-index")
      @_popupArea.removeChild(popupInfo.popup)
      @_popupStack.pop()

    # マウス座標の監視終了
    if @_popupStack.length is 0
      @defaultParent.off("mousemove", (e) => @_onMouseMove(e))
    return

  ###*
  @method _delayRemove
  @param {Boolean} forceRemove
  ###
  _delayRemove: (forceRemove) ->
    clearTimeout(@_delayRemoveTimeoutID) if @_delayRemoveTimeoutID isnt 0
    @_delayRemoveTimeoutID = setTimeout( =>
      @_delayRemoveTimeoutID = 0
      @_remove(forceRemove)
    , 300)
    return

  ###*
  @method _onMouseEnter
  @param {Object} target
  ###
  _onMouseEnter: (target) ->
    target.addClass("active")
    # ペア・ノードの非アクティブ化
    stackIndex = target.getAttr("stack-index")
    if target.hasClass("popup")
      @_popupStack[stackIndex].source.removeClass("active")
    else if target.hasClass("popup_source")
      @_popupStack[stackIndex].popup.removeClass("active")
    # 末端ノードの非アクティブ化
    if @_popupStack.length - 1 > stackIndex
      @_popupStack[@_popupStack.length - 1].source.removeClass("active")
      @_popupStack[@_popupStack.length - 1].popup.removeClass("active")
      @_delayRemove(false)
    return

  ###*
  @method _onMouseLeave
  @param {Object} target
  ###
  _onMouseLeave: (target) ->
    target.removeClass("active")
    @_delayRemove(false)
    return

  ###*
  @method _onMouseMove
  @param {Object} Event
  ###
  _onMouseMove: (e) ->
    @_currentX = e.clientX
    @_currentY = e.clientY
    return

  ###*
  @method _activateNode
  ###
  _activateNode: ->
    elm = document.elementFromPoint(@_currentX, @_currentY)
    if elm is @source
      @source.addClass("active")
    else if (elm is @popup) or (elm.closest(".popup") is @popup)
      @popup.addClass("active")
    else if elm.hasClass("popup_source") or elm.hasClass("popup")
      elm.addClass("active")
    else if elm.closest(".popup")
      elm.closest(".popup").addClass("active")
    else
      @source.removeClass("active")
      @popup.removeClass("active")
      @_delayRemove(false)
    return

  ###*
  @method _getOuterHeight
  @param {Object} elm
  @param {Boolean} margin
  ###
  # .outerHeight()の代用関数
  _getOuterHeight: (elm, margin = false) ->
    # 下層に表示してoffsetHeightを取得する
    elm.style.zIndex = "-1"
    @_popupArea.append(elm)
    outerHeight = elm.offsetHeight
    @_popupArea.removeChild(elm)
    elm.style.zIndex = "3"    # ソースでは"3"だが、getComputedStyleでは"0"になるため
    # 表示済みのノードが存在すればCSSの値を取得する
    if @_popupStyle is null and @_popupStack.length > 0
      @_popupStyle = getComputedStyle(@_popupStack[0].popup, null)
    # margin等の取得
    if margin and @_popupStyle isnt null
      if @_popupMarginHeight < 0
        @_popupMarginHeight = 0
        @_popupMarginHeight += parseInt(@_popupStyle.marginTop)
        @_popupMarginHeight += parseInt(@_popupStyle.marginBottom)
        boxShadow = @_popupStyle.boxShadow
        tmp = /rgba?\(.*\) (-?[\d]+)px (-?[\d]+)px ([\d]+)px (-?[\d]+)px/.exec(boxShadow)
        @_popupMarginHeight += Math.abs(parseInt(tmp[2]))
        @_popupMarginHeight += Math.abs(parseInt(tmp[4]))
      outerHeight += @_popupMarginHeight
    return outerHeight
