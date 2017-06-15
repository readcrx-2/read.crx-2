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
    e.style.cssText = """
      height: auto;
      width: #{ele.clientWidth};
      position: absolute;
      visibility: hidden;
      display: block;
    """
    document.body.appendChild(e)
    height = e.clientHeight
    e.remove()
    return height

  out.slideDown = (ele) ->
    ele.removeClass("hidden")
    h = getOriginHeight(ele)
    frames =
      height: ["0px", "#{h}px"]
    timing =
      duration: 250
      easing: "ease-in-out"
    ani = ele.animate(frames, timing)
    return ani

  out.slideUp = (ele) ->
    h = ele.clientHeight
    frames =
      height: ["#{h}px", "0px"]
    timing =
      duration: 250
      easing: "ease-in-out"
    ani = ele.animate(frames, timing)
    ani.on("finish", ->
      ele.addClass("hidden")
      return
    )
    return ani

  UI.Animate = out
  return
