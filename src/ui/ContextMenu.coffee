window.UI ?= {}
do ->
  cleanup = ->
    $$.C("contextmenu_menu")[0]?.remove()
    return

  eventFn = (e) ->
    if e.target?.hasClass("contextmenu_menu") or e.target?.parent()?.hasClass("contextmenu_menu")
      return
    cleanup()
    return

  doc = document.documentElement
  doc.on("keydown", (e) ->
    if e.which is 27
      cleanup()
    return
  )
  doc.on("mousedown", eventFn)
  doc.on("contextmenu", eventFn)

  window.on("blur", ->
    cleanup()
    return
  )

  UI.ContextMenu = ($menu, x, y) ->
    cleanup()

    $menu.addClass("contextmenu_menu")
    $menu.style.position = "fixed"
    menuWidth = $menu.offsetWidth
    $menu.style.left = "#{x}px"
    $menu.style.top = "#{y}px"

    if window.innerWidth < $menu.offsetLeft + menuWidth
      $menu.style.left = ""
      $menu.style.right = "1px"
    if window.innerHeight < $menu.offsetTop + $menu.offsetHeight
      $menu.style.top = "#{Math.max($menu.offsetTop - $menu.offsetHeight, 0)}px"
    return
