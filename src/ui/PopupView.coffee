window.UI ?= {}

###*
@namespace UI
@class PopupView
@constructor
@param {Element} default_parent
###
class UI.PopupView

  constructor: (@default_parent)->
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
    @_popupArea = @default_parent.querySelector(".popup_area")

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

    return

  ###*
  @method show
  @param {Element} popup
  @param {Number} mouseX
  @param {Number} mouseY
  @param {Element} source
  ###
  show: (@popup, @mouseX, @mouseY, @source) ->

    #同一ソースからのポップアップが既に有る場合は、処理を中断
    if @_popupStack.length > 0
      popupInfo = @_popupStack[@_popupStack.length - 1]
      return if Object.is(@source, popupInfo.source)

    #sourceがpopup内のものならば、兄弟ノードの削除
    #それ以外は、全てのノードを削除
    if @source.closest(".popup")
      @source.classList.remove("active")
      @_remove(false)
    else
      @_remove(true)

    #表示位置決定
    do =>
      margin = 20
      viewTop = @default_parent.querySelector(".nav_bar").offsetHeight
      viewHeight = document.body.offsetHeight - viewTop

      #カーソルの上下左右のスペースを測定
      space =
        left: @mouseX
        right: document.body.offsetWidth - @mouseX
        top: @mouseY
        bottom: document.body.offsetHeight - @mouseY

      #通常はカーソル左か右のスペースを用いるが、そのどちらもが狭い場合は上下に配置する
      if Math.max(space.left, space.right) > 400
        #例え右より左が広くても、右に十分なスペースが有れば右に配置
        if space.right > 350
          @popup.style.left = "#{space.left + margin}px"
          @popup.style.maxWidth = "#{document.body.offsetWidth - space.left - margin * 2}px"
        else
          @popup.style.right = "#{space.right + margin}px"
          @popup.style.maxWidth = "#{document.body.offsetWidth - space.right - margin * 2}px"
        cursorTop = Math.max(space.top, viewTop + margin * 2)
        outerHeight = @_getOuterHeight(@popup, true)
        if viewHeight > outerHeight + margin
          cssTop = Math.min(cursorTop, document.body.offsetHeight - outerHeight) - margin
        else
          cssTop = viewTop + margin
        @popup.style.top = "#{cssTop}px"
        @popup.style.maxHeight = "#{document.body.offsetHeight - cssTop - margin}px"
      else
        @popup.style.left = "#{margin}px"
        @popup.style.maxWidth = "#{document.body.offsetWidth - margin * 2}px"
        #例え上より下が広くても、上に十分なスペースが有れば上に配置
        if space.top > Math.min(350, space.bottom)
          cssBottom = Math.max(space.bottom, margin)
          @popup.style.bottom = "#{cssBottom}px"
          @popup.style.maxHeight = "#{viewHeight - cssBottom - margin}px"
        else
          cssTop = document.body.offsetHeight - space.bottom + margin
          @popup.style.top = "#{cssTop}px"
          @popup.style.maxHeight = "#{viewHeight - cssTop - margin}px"
      return

    # ノードの設定
    @source.classList.add("popup_source")
    @source.classList.add("active")
    @source.addEventListener("mouseenter", (e) => @_on_mouseenter(e.currentTarget))
    @source.addEventListener("mouseleave", (e) => @_on_mouseleave(e.currentTarget))
    @popup.classList.add("popup")
    @popup.addEventListener("mouseenter", (e) => @_on_mouseenter(e.currentTarget))
    @popup.addEventListener("mouseleave", (e) => @_on_mouseleave(e.currentTarget))

    # リンク情報の保管
    popupInfo =
      source: @source
      popup: @popup
    @_popupStack.push(popupInfo)

    # popupの表示
    @_popupArea.appendChild(popupInfo.popup)

    return

  ###*
  @method _remove
  @param {Boolean} forceRemove
  ###
  _remove: (forceRemove) ->
    while @_popupStack.length > 0
      popupInfo = @_popupStack[@_popupStack.length - 1]
      # 末端の非アクティブ・ノードを選択
      break if forceRemove is false and
              (popupInfo.source.classList.contains("active") or
              popupInfo.popup.classList.contains("active"))
      # 該当ノードの除去
      popupInfo.source.removeEventListener("mouseenter", (e) => @_on_mouseenter(e.currentTarget))
      popupInfo.source.removeEventListener("mouseleave", (e) => @_on_mouseleave(e.currentTarget))
      popupInfo.popup.removeEventListener("mouseenter", (e) => @_on_mouseenter(e.currentTarget))
      popupInfo.popup.removeEventListener("mouseleave", (e) => @_on_mouseleave(e.currentTarget))
      popupInfo.source.classList.remove("popup_source")
      @_popupArea.removeChild(popupInfo.popup)
      @_popupStack.pop()
      null
    return

  ###*
  @method _on_mouseenter
  @param {Object} target
  ###
  _on_mouseenter: (target) ->
    target.classList.add("active")
    return

  ###*
  @method _on_mouseleave
  @param {Object} target
  ###
  _on_mouseleave: (target) ->
    target.classList.remove("active")
    setTimeout( =>
      @_remove(false)
    , 300)
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
    @_popupArea.appendChild(elm)
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
        tmp = /rgba\(.*\) ([\d]+)px ([\d]+)px ([\d]+)px ([\d]+)px/.exec(boxShadow)
        @_popupMarginHeight += Math.abs(parseInt(tmp[2]))
        @_popupMarginHeight += Math.abs(parseInt(tmp[4]))
      outerHeight += @_popupMarginHeight
    return outerHeight
