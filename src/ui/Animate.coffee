window.UI ?= {}
do ->
  getOriginHeight = (ele) ->
    e = ele.cloneNode(true)
    e.style.cssText = """
      contain: content;
      height: auto;
      width: #{ele.clientWidth}px;
      position: absolute;
      visibility: hidden;
      display: block;
    """
    document.body.appendChild(e)
    height = e.clientHeight
    e.remove()
    return height

  UI.Animate =
    fadeIn: (ele) ->
      ele.removeClass("hidden")
      frames =
        opacity: [0, 1]
      timing =
        duration: 250
        easing: "ease-in-out"
      ani = ele.animate(frames, timing)
      return ani
    fadeOut: (ele) ->
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
    slideDown: (ele) ->
      ele.removeClass("hidden")
      h = getOriginHeight(ele)
      frames =
        height: ["0px", "#{h}px"]
      timing =
        duration: 250
        easing: "ease-in-out"
      ani = ele.animate(frames, timing)
      return ani
    slideUp: (ele) ->
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
  return
