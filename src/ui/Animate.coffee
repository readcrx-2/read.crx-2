UI = UI ? {}
do ->
  out = {}

  out.fadeIn = (ele) ->
    ele.removeClass("hidden")
    frames =
      opacity: [0, 1]
    timing =
      duration: 250
      easing: "ease-in-out"
    ani = ele.animate(frames, timing)
    return ani

  out.fadeOut = (ele) ->
    frames =
      opacity: [1, 0]
    timing =
      duration: 250
      easing: "ease-in-out"
    ani = ele.animate(frames, timing)
    ani.on("finish", ->
      ele.addClass("hidden")
      return
    )
    return ani

  getOriginHeight = (ele) ->
    e = ele.cloneNode(true)
    e.style.height = "auto"
    e.style.width = ele.clientWidth
    e.style.position = "absolute"
    e.style.visibility = "hidden"
    e.style.display = "block"
    document.body.appendChild(e)
    height = e.clientHeight
    e.remove()
    return height

  out.slideDown = (ele) ->
    console.log "down", ele.previousSibling.textContent, ele.cloneNode(true)
    ele.removeClass("hidden")
    h = getOriginHeight(ele)
    frames =
      height: ["0px", "#{h}px"]
    timing =
      duration: 250
      easing: "ease-in-out"
    ani = ele.animate(frames, timing)
    ani.on("finish", ->
      console.log "downed", ele.previousSibling.textContent, ele.cloneNode(true)
    )
    return ani

  out.slideUp = (ele) ->
    console.log "up", ele.previousSibling.textContent, ele.cloneNode(true)
    h = ele.clientHeight
    frames =
      height: ["#{h}px", "0px"]
    timing =
      duration: 250
      easing: "ease-in-out"
    ani = ele.animate(frames, timing)
    ani.on("finish", ->
      ele.addClass("hidden")
      console.log "uped", ele.previousSibling.textContent, ele.cloneNode(true)
      return
    )
    return ani

  UI.Animate = out
  return
