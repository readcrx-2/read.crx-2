###*
@namespace app
@class NG
@static
###
class app.NG
  _ng = null
  _configName = "ngobj"
  _configStringName = "ngwords"
  _ignoreResRegNumber = /^ignoreResNumber:(\d+)(?:-?(\d+))?,(.*)$/

  #jsonには正規表現のオブジェクトが含めれないので
  #それを展開
  _setupReg = (obj) ->
    keys = obj.keys()
    while !(current = keys.next()).done
      n = current.value
      continue if !n.type.startsWith("regExp")
      try
        n.reg = new RegExp n.word
      catch e
        app.message.send "notify", {
          html: """
            NG機能の正規表現(#{n.type}: #{n.word})を読み込むのに失敗しました
            この行は無効化されます
          """
          background_color: "red"
        }
        n.type = "invalid"
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
    if !_ng?
      _ng = new Set(_config.get())
      _setupReg(_ng)
    return _ng

  ###*
  @method parse
  @param {String} string
  @return {Object}
  ###
  @parse: (string) ->
    ng = new Set()
    if string isnt ""
      ngStrSplit = string.split("\n")
      for ngWord in ngStrSplit
        # 関係ないプレフィックスは飛ばす
        if ngWord.startsWith("Comment:")
          continue
        # 指定したレス番号はNG除外する
        if _ignoreResRegNumber.test(ngWord)
          m = ngWord.match(_ignoreResRegNumber)
          ngElement =
            start: m[1]
            finish: m[2]
        # キーワードごとのNG処理
        if ngWord.startsWith("RegExp:")
          ngElement =
            type: "regExp"
            word: ngWord.substr(7)
        else if ngWord.startsWith("RegExpTitle:")
          ngElement =
            type: "regExpTitle"
            word: ngWord.substr(12)
        else if ngWord.startsWith("RegExpName:")
          ngElement =
            type: "regExpName"
            word: ngWord.substr(11)
        else if ngWord.startsWith("RegExpMail:")
          ngElement =
            type: "regExpMail"
            word: ngWord.substr(11)
        else if ngWord.startsWith("RegExpID:")
          ngElement =
            type: "regExpId"
            word: ngWord.substr(9)
        else if ngWord.startsWith("RegExpSlip:")
          ngElement =
            type: "regExpSlip"
            word: ngWord.substr(11)
        else if ngWord.startsWith("RegExpBody:")
          ngElement =
            type: "regExpBody"
            word: ngWord.substr(11)
        else if ngWord.startsWith("Title:")
          ngElement =
            type: "title"
            word: app.util.normalize(ngWord.substr(6))
        else if ngWord.startsWith("Name:")
          ngElement =
            type: "name"
            word: app.util.normalize(ngWord.substr(5))
        else if ngWord.startsWith("Mail:")
          ngElement =
            type: "mail"
            word: app.util.normalize(ngWord.substr(5))
        else if ngWord.startsWith("ID:")
          ngElement =
            type: "id"
            word: ngWord
        else if ngWord.startsWith("Slip:")
          ngElement =
            type: "slip"
            word: ngWord.substr(5)
        else if ngWord.startsWith("Body:")
          ngElement =
            type: "body"
            word: app.util.normalize(ngWord.substr(5))
        else
          ngElement =
            type: "word"
            word: app.util.normalize(ngWord)
        if ngElement.word isnt ""
          ng.add(ngElement)
    return ng

  ###*
  @method set
  @param {Object} obj
  ###
  @set: (string) ->
    _ng = @parse(string)
    _config.set(Array.from(_ng))
    _setupReg(_ng)
    return

  ###*
  @method add
  @param {String} string
  ###
  @add: (string) ->
    _config.setString(string + "\n" + _config.getString())
    addNg = @parse(string)
    _config.set(Array.from(_config.get()).concat(Array.from(addNg)))

    _setupReg(addNg)
    addNgKeys = addNg.keys()
    while !(current = addNgKeys.next()).done
      _ng.add(current.value)
    return
