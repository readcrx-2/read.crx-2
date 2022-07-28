/**
@class DOMData
@static
*/
const _list = new WeakMap();

export var set = function(dom, prop, val) {
  if (!_list.has(dom)) { _list.set(dom, {}); }
  _list.get(dom)[prop] = val;
};
export var get = function(dom, prop) {
  if (_list.has(dom)) {
    return _list.get(dom)[prop];
  }
  return null;
};
