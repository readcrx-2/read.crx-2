do ($ = jQuery) ->
  $root = null

  popup_destroy = ($popup) ->
    $popup.find(".popup").addBack().each ->
      $($(@).data("popup_source"))
        .off("mouseleave", on_mouseenter)
        .off("mouseenter", on_mouseleave)
      return
    $popup.remove()
    return

  remove = ->
    return unless $root
    $root.find(".popup").addBack().not(".active").each ->
      $this = $(@)
      if $this.has(".popup.active").length is 0
        $root = null if $this.is($root)
        popup_destroy($this)
      return
    return

  on_mouseenter = ->
    $this = $(@)
    $popup = if $this.is(".popup") then $this else $($this.data("popup"))
    $popup.addClass("active")
    return

  on_mouseleave = ->
    $this = $(@)
    $popup = if $this.is(".popup") then $this else $($this.data("popup"))
    $popup.removeClass("active")
    setTimeout(remove, 300)
    return

  $.popup = (default_parent, popup, mouse_x, mouse_y, source) ->
    $popup = $(popup)
    $popup
      .addClass("popup active")
      .data("popup_source", source)

    #.popup内にsourceが有った場合はネスト
    #そうでなければ、指定されたデフォルトの要素に追加
    $parent = $(source).closest(".popup")
    if $parent.length is 1
      $parent.append($popup)
    else
      popup_destroy($root) if $root
      $root = $popup
      $(default_parent).append($popup)

    #同一ソースからのポップアップが既に有る場合は、処理を中断
    flg = false
    $popup.siblings(".popup").each ->
      flg or= $($(@).data("popup_source")).is(source)
      return
    if flg
      $popup.remove()
      return

    #兄弟ノードの削除
    $parent.children(".popup").not($popup).each ->
      popup_destroy($(@))
      return

    #表示位置決定
    do ->
      margin = 20
      viewTop = default_parent[0].querySelector(".nav_bar").offsetHeight
      viewHeight = document.body.offsetHeight - viewTop

      #カーソルの上下左右のスペースを測定
      space =
        left: mouse_x
        right: document.body.offsetWidth - mouse_x
        top: mouse_y
        bottom: document.body.offsetHeight - mouse_y

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

    $(source)
      .data("popup", $popup[0])
      .add($popup)
        .on("mouseenter", on_mouseenter)
        .on("mouseleave", on_mouseleave)
    return
  return
