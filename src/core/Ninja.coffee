###*
@namespace app
@class Ninja
@static
###
class app.Ninja
  "use strict"

  @_siteInfo =
    "2ch":
      siteId: "2ch"
      siteName: "2ちゃんねる"
      getCookieInfo: {url: "http://www.2ch.net/", name: "HAP"}
      setCookieInfo: {url: "http://www.2ch.net/", domain: "2ch.net", name: "HAP"}

  ###*
  @method getCookie
  @static
  @param {Function} callback
  ###
  @getCookie: (callback) ->
    site = @_siteInfo["2ch"]

    chrome.cookies.get site.getCookieInfo, (res) ->
      data = []
      if res
        data.push({site, value: res.value})
      callback(data)
      return
    return

  ###*
  @method deleteCookie
  @static
  @param {String} siteId
  @param {Function} [callback]
  ###
  @deleteCookie: (siteId, callback) ->
    chrome.cookies.remove @_siteInfo[siteId].getCookieInfo, ->
      callback?()
      return
    return

  ###*
  @method getBackup
  @static
  @return {Array} result
  ###
  @getBackup: ->
    res = []

    for siteId, site of @_siteInfo
      if value = app.config.get("ninja_backup_#{siteId}")
        res.push(site: app.deepCopy(site), value: value)

    res

  ###*
  @method backup
  @static
  @param {String} siteId
  ###
  @backup: (siteId) ->
    @getCookie (res) ->
      for entry in res when entry.site.siteId is siteId
        app.config.set("ninja_backup_#{siteId}", entry.value)
        break
      return
    return

  ###*
  @method restore
  @static
  @param {String} siteId
  @param {function} [callback]
  ###
  @restore: (siteId, callback) ->
    if value = app.config.get("ninja_backup_#{siteId}")
      info = app.deepCopy(@_siteInfo[siteId].setCookieInfo)
      info.value = value
      chrome.cookies.set info, ->
        callback?()
        return
    else
      app.log("error", "app.Ninja.restore: バックアップが存在しません。")
    return

  ###*
  @method deleteBackup
  @static
  @param {String} siteId
  ###
  @deleteBackup: (siteId) ->
    app.config.del("ninja_backup_#{siteId}")
    return

  ###*
  @method enableAutoBackup
  @static
  ###
  @enableAutoBackup: ->
    app.Ninja.backup("2ch")

    chrome.cookies.onChanged.addListener (info) ->
      if not info.removed and info.cookie.domain is ".2ch.net" and info.cookie.name is "HAP"
        app.Ninja.backup("2ch")
      return
    return
