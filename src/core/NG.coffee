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
    for n from obj
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
          ngWord = m[3]
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
    for ang from addNg
      _ng.add(ang)
    return

  ###*
  @method isNGBoard
  @param {String} title
  ###
  @isNGBoard: (title) ->
    tmpTitle = app.util.normalize(title)
    for n from @get()
      if (
        (n.type is "regExp" and n.reg.test(title)) or
        (n.type is "regExpTitle" and n.reg.test(title)) or
        (n.type is "title" and tmpTitle.includes(n.word)) or
        (n.type is "word" and tmpTitle.includes(n.word))
      )
        return true
    return false

  ###*
  @method isNGThread
  @param {Array} res
  ###
  @isNGThread: (res) ->
    tmpTxt1 = res.name + " " + res.mail + " " + res.other + " " + res.message
    tmpTxt2 = app.util.normalize(tmpTxt1)

    for n from @get()
      if n.start? and ((n.finish? and n.start <= resNum and resNum <= n.finish) or (parseInt(n.start) is resNum))
        continue
      if (
        (n.type is "regExp" and n.reg.test(tmpTxt1)) or
        (n.type is "regExpName" and n.reg.test(res.name)) or
        (n.type is "regExpMail" and n.reg.test(res.mail)) or
        (n.type is "regExpId" and articleDataId? and n.reg.test(articleDataId)) or
        (n.type is "regExpSlip" and articleDataSlip? and n.reg.test(articleDataSlip)) or
        (n.type is "regExpBody" and n.reg.test(res.message)) or
        (n.type is "name" and app.util.normalize(res.name).includes(n.word)) or
        (n.type is "mail" and app.util.normalize(res.mail).includes(n.word)) or
        (n.type is "id" and articleDataId?.includes(n.word)) or
        (n.type is "slip" and articleDataSlip?.includes(n.word)) or
        (n.type is "body" and app.util.normalize(res.message).includes(n.word)) or
        (n.type is "word" and tmpTxt2.includes(n.word))
      )
        return true
    return false
