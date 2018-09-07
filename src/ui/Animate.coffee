_TIMING =
  duration: 250
  easing: "ease-in-out"
_FADE_IN_FRAMES =
  opacity: [0, 1]
_FADE_OUT_FRAMES =
  opacity: [1, 0]
_INVALIDED_EVENT = new Event("invalided")

_getOriginHeight = (ele) ->
  e = ele.cloneNode(true)
  e.style.cssText = """
    contain: content;
    height: auto;
    position: absolute;
    visibility: hidden;
    display: block;
  """
  document.body.appendChild(e)
  height = e.clientHeight
  e.remove()
  return height

_animatingMap = new WeakMap()
_resetAnimatingMap = (ele) ->
  _animatingMap.get(ele)?.emit(_INVALIDED_EVENT)
  return

export fadeIn = (ele) ->
  await app.waitAF()
  _resetAnimatingMap(ele)
  ele.removeClass("hidden")

  ani = ele.animate(_FADE_IN_FRAMES, _TIMING)
  _animatingMap.set(ele, ani)

  ani.on("finish", ->
    _animatingMap.delete(ele)
    return
  , once: true)
  return ani

export fadeOut = (ele) ->
  _resetAnimatingMap(ele)
  ani = ele.animate(_FADE_OUT_FRAMES, _TIMING)
  _animatingMap.set(ele, ani)

  invalided = false
  ani.on("invalided", ->
    invalided = true
    return
  , once: true)
  ani.on("finish", ->
    unless invalided
      await app.waitAF()
      ele.addClass("hidden")
      _animatingMap.delete(ele)
    return
  , once: true)
  return Promise.resolve(ani)

export slideDown = (ele) ->
  await app.waitAF()
  h = _getOriginHeight(ele)

  _resetAnimatingMap(ele)
  ele.removeClass("hidden")

  ani = ele.animate({ height: ["0px", "#{h}px"] }, _TIMING)
  _animatingMap.set(ele, ani)

  ani.on("finish", ->
    _animatingMap.delete(ele)
    return
  , once: true)
  return ani

export slideUp = (ele) ->
  await app.waitAF()
  h = ele.clientHeight

  _resetAnimatingMap(ele)
  # Firefoxでアニメーションが終了してから
  # .hiddenが付加されるまで時間がかかってチラつくため
  # heightであらかじめ消す(animateで上書きされる)
  ele.style.height = "0px"
  ani = ele.animate({ height: ["#{h}px", "0px"] }, _TIMING)
  _animatingMap.set(ele, ani)

  invalided = false
  ani.on("invalided", ->
    invalided = true
    return
  , once: true)
  ani.on("finish", ->
    unless invalided
      await app.waitAF()
      ele.addClass("hidden")
      ele.style.height = null
      _animatingMap.delete(ele)
    return
  , once: true)
  return ani
