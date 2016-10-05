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
    $ =>
      $popup = $(@popup)
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
          css =
            left: "#{space.left + margin}px"
            maxWidth: "#{document.body.offsetWidth - space.left - margin * 2}px"
        else
          css =
            right: "#{space.right + margin}px"
            maxWidth: "#{document.body.offsetWidth - space.right - margin * 2}px"
        cursorTop = Math.max(space.top, viewTop + margin * 2)
        if viewHeight > $popup.outerHeight()
          cssTop = Math.min(cursorTop, document.body.offsetHeight - $popup.outerHeight()) - margin
        else
          cssTop = viewTop + margin
        css.top = "#{cssTop}px"
        css.maxHeight = "#{document.body.offsetHeight - cssTop - margin}px"
      else
        css =
          left: "#{margin}px"
          maxWidth: "#{document.body.offsetWidth - margin * 2}px"
        #例え上より下が広くても、上に十分なスペースが有れば上に配置
        if space.top > Math.min(350, space.bottom)
          cssBottom = Math.max(space.bottom, margin)
          css.bottom = "#{cssBottom}px"
          css.maxHeight = "#{viewHeight - cssBottom - margin}px"
        else
          cssTop = document.body.offsetHeight - space.bottom + margin
          css.top = "#{cssTop}px"
          css.maxHeight = "#{viewHeight - cssTop - margin}px"
      $popup.css(css)
      return

    # ノードの設定
    @source.classList.add("popup_source")
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
    @source.classList.add("active")
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
