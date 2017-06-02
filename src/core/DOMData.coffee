###*
@namespace app
@class DOMData
@static
###
class app.DOMData
  _list = new WeakMap()

  @set: (dom, prop, val) ->
    obj = if _list.has(dom) then _list.get(dom) else {}
    obj[prop] = val
    _list.set(dom, obj)
    return
  @get: (dom, prop) ->
    if _list.has(dom)
      return _list.get(dom)[prop]
    return null
