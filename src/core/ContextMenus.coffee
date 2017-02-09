###*
@namespace app
@class contextMenus
@static
###
class app.contextMenus
# chrome.contextMenusの呼び出しレベルを統一するための代理クラス
# (Chrome 53 対策)

  ###*
  @method createAll
  ###
  @createAll: ->
    id = chrome.runtime.id
    viewThread = "chrome-extension://#{id}/view/thread.html*"

    @create(
      id: "add_selection_to_ngwords",
      title: "選択範囲をNG指定",
      contexts: ["selection"],
      documentUrlPatterns: [viewThread]
    )
    @create(
      id: "add_link_to_ngwords",
      title: "リンクアドレスをNG指定",
      contexts: ["link"],
      enabled: false,
      documentUrlPatterns: [viewThread]
    )
    @create(
      id: "add_media_to_ngwords",
      title: "メディアのアドレスをNG指定",
      contexts: ["image", "video", "audio"],
      documentUrlPatterns: [viewThread]
    )
    return

  ###*
  @method create
  @parm {Object} obj
  @return {Number|String} id
  ###
  @create: (obj)->
    return chrome.contextMenus.create(obj)

  ###*
  @method update
  @parm {Number|String} id
  @parm {Object} obj
  ###
  @update: (id, obj)->
    chrome.contextMenus.update(id, obj)
    return

  ###*
  @method remove
  @parm {Number|String} id
  ###
  @remove: (id)->
    chrome.contextMenus.remove(id)
    return

  ###*
  @method removeAll
  ###
  @removeAll: ->
    chrome.contextMenus.removeAll()
    return
