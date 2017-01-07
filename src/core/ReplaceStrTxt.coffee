###*
@namespace app
@class ReplaceStrTxt
@static
###
class app.ReplaceStrTxt
  _replaceTable = null
  _configName = "replace_str_txt_obj"
  _configStringName = "replace_str_txt"
  _urlPattern =
    contain: 0
    dontContain: 1
    match: 2
    dontMatch: 3
    regex: 4
    dontRegex: 5
  _INVALID_BEFORE = "#^##invalid##^#"
  _INVALID_URL = "invalid://invalid"

  #jsonには正規表現のオブジェクトが含めれないので
  #それを展開
  _setupReg = () ->
    for d from _replaceTable
      try
        if d.type is "rx"
          d.beforeReg = new RegExp(d.before, "g")
        else if d.type is "rx2"
          d.beforeReg = new RegExp(d.before, "ig")
        else if d.type is "ex"
          d.beforeReg = new RegExp(d.before.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"), "ig")
      catch e
        app.message.send "notify", {
          html: """
            ReplaceStr.txtの置換対象正規表現(#{d.before})を読み込むのに失敗しました
            この行は無効化されます
          """
          background_color: "red"
        }
        d.before = _INVALID_BEFORE

      try
        if d.urlPattern is _urlPattern.regex or d.urlPattern is _urlPattern.dontRegex
          d.urlReg = new RegExp(d.url)
      catch e
        app.message.send "notify", {
          html: """
            ReplaceStr.txtの対象URL/タイトル正規表現(#{d.url})を読み込むのに失敗しました
            この行は無効化されます
          """
          background_color: "red"
        }
        d.url = _INVALID_URL
    return

  _config =
    get: ->
      return JSON.parse(app.config.get(_configName))
    set: (str) ->
      app.config.set(_configName, JSON.stringify(str))
      return
    getString: ->
      return app.config.get(_configStringName)
    setString: (str) ->
      app.config.set(_configStringName, str)
      return

  ###*
  @method get
  @return {Object}
  ###
  @get: ->
    if !_replaceTable?
      _replaceTable = new Set(_config.get())
      _setupReg()
    return _replaceTable

  ###*
  @method parse
  @param {String} string
  @return {Object}
  ###
  @parse: (string) ->
    replaceTable = new Set()
    if string isnt ""
      replaceStrSplit = string.split("\n")
      for r in replaceStrSplit
        continue if r is ""
        continue if ["//",";", "'"].some((ele) -> r.startsWith(ele))
        s = /(?:<(\w{2,3})>)?(.*)\t(.+)\t(name|mail|date|msg|all)(?:\t(?:<(\d)>)?(.+))?/.exec(r)
        if s?
          obj =
            type: if s[1]? then s[1] else "ex"
            place: s[4]
            before: s[2]
            after: s[3]
            urlPattern: s[5]
            url: s[6]
          if obj.type is ""
            obj.type = "rx"
          if obj.place is ""
            obj.place = "all"
          if s[6]? and !s[5]?
            obj.urlPattern = 0
          replaceTable.add(obj)
    return replaceTable

  ###*
  @method set
  @param {String} string
  ###
  @set: (string) ->
    _replaceTable = @parse(string)
    _config.set(Array.from(_replaceTable))
    _setupReg()
    return

  ###
  @method do
  @param {String} url
  @param {String} title
  @param {Object} res
  ###
  @do: (url, title, res) ->
    for d from @get()
      continue if d.before is _INVALID_BEFORE
      continue if d.url is _INVALID_URL
      if d.url?
        if d.urlPattern is _urlPattern.contain or d.urlPattern is _urlPattern.dontContain
          flag = (url.includes(d.url) or title.includes(d.url))
        else if d.urlPattern is _urlPattern.match or d.urlPattern is _urlPattern.dontMatch
          flag = (url is d.url or title is d.url)
        if (
          ((d.urlPattern is _urlPattern.contain or d.urlPattern is _urlPattern.match) and !flag) or
          ((d.urlPattern is _urlPattern.dontContain or d.urlPattern is _urlPattern.dontMatch) and flag)
        )
          continue
      if d.type is "ex2"
        before = d.before
      else
        before = d.beforeReg
      switch d.place
        when "name"
          res.name = res.name.replace(before, d.after)
        when "mail"
          res.mail = res.mail.replace(before, d.after)
        when "date"
          res.other = res.other.replace(before, d.after)
        when "msg"
          res.message = res.message.replace(before, d.after)
        when "all"
          res =
            name: name.replace(before, d.after)
            mail: mail.replace(before, d.after)
            other: other.replace(before, d.after)
            message: message.replace(before, d.after)
    return res
