###*
@class contextMenus
@static
###
# browser.contextMenusの呼び出しレベルを統一するための代理クラス
# (Chrome 53 対策)

###*
@method createAll
###
export createAll = ->
  id = browser.runtime.id
  viewThread = "chrome-extension://#{id}/view/thread.html*"

  create(
    id: "add_selection_to_ngwords",
    title: "選択範囲をNG指定",
    contexts: ["selection"],
    documentUrlPatterns: [viewThread]
  )
  create(
    id: "add_link_to_ngwords",
    title: "リンクアドレスをNG指定",
    contexts: ["link"],
    enabled: false,
    documentUrlPatterns: [viewThread]
  )
  create(
    id: "add_media_to_ngwords",
    title: "メディアのアドレスをNG指定",
    contexts: ["image", "video", "audio"],
    documentUrlPatterns: [viewThread]
  )
  create(
    id: "open_link_with_res_number",
    title: "レス番号を指定してリンクを開く",
    contexts: ["link"],
    enabled: false,
    documentUrlPatterns: [viewThread]
  )
  return

###*
@method create
@parm {Object} obj
@return {Number|String} id
###
export create = (obj)->
  return browser.contextMenus.create(obj)

###*
@method update
@parm {Number|String} id
@parm {Object} obj
###
export update = (id, obj)->
  browser.contextMenus.update(id, obj)
  return

###*
@method remove
@parm {Number|String} id
###
export remove = (id)->
  browser.contextMenus.remove(id)
  return

###*
@method removeAll
###
export removeAll = ->
  # removeAll()を使うとbackgroundのコンテキストメニューも削除されてしまうので個別に削除する
  remove("add_selection_to_ngwords")
  remove("add_link_to_ngwords")
  remove("add_media_to_ngwords")
  remove("open_link_with_res_number")
  return
