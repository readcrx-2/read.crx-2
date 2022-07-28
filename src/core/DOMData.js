###*
@class DOMData
@static
###
_list = new WeakMap()

export set = (dom, prop, val) ->
  _list.set(dom, {}) unless _list.has(dom)
  _list.get(dom)[prop] = val
  return
export get = (dom, prop) ->
  if _list.has(dom)
    return _list.get(dom)[prop]
  return null
