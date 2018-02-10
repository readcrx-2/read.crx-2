###*
@namespace app
@class NG
@static
###
class app.NG
  @NG_TYPE_REG_EXP = "regExp"
  @NG_TYPE_REG_EXP_TITLE = "regExpTitle"
  @NG_TYPE_REG_EXP_NAME = "regExpName"
  @NG_TYPE_REG_EXP_MAIL = "regExpMail"
  @NG_TYPE_REG_EXP_ID = "regExpId"
  @NG_TYPE_REG_EXP_SLIP = "regExpSlip"
  @NG_TYPE_REG_EXP_BODY = "regExpBody"
  @NG_TYPE_TITLE = "title"
  @NG_TYPE_NAME = "name"
  @NG_TYPE_MAIL = "mail"
  @NG_TYPE_ID = "id"
  @NG_TYPE_SLIP = "slip"
  @NG_TYPE_BODY = "body"
  @NG_TYPE_WORD = "word"
  @NG_TYPE_AUTO = "auto"
  @NG_TYPE_AUTO_CHAIN = "chain"
  @NG_TYPE_AUTO_CHAIN_ID = "chainID"
  @NG_TYPE_AUTO_CHAIN_SLIP = "chainSLIP"
  @NG_TYPE_AUTO_NOTHING_ID = "nothingID"
  @NG_TYPE_AUTO_NOTHING_SLIP = "nothingSLIP"
  @NG_TYPE_AUTO_REPEAT_MESSAGE = "repeatMessage"
  @NG_TYPE_AUTO_FORWORD_LINK = "forwordLink"

  _ng = null
  _configName = "ngobj"
  _configStringName = "ngwords"
  _ignoreResRegNumber = /^ignoreResNumber:(\d+)(?:-?(\d+))?,(.*)$/

  #jsonには正規表現のオブジェクトが含めれないので
  #それを展開
  _setupReg = (obj) ->
    for n from obj
      continue if !n.type.startsWith(app.NG.NG_TYPE_REG_EXP)
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
    return ng if string is ""
    ngStrSplit = string.split("\n")
    for ngWord in ngStrSplit
      # 関係ないプレフィックスは飛ばす
      continue if ngWord.startsWith("Comment:")

      ngElement = {}

      # 指定したレス番号はNG除外する
      if _ignoreResRegNumber.test(ngWord)
        m = ngWord.match(_ignoreResRegNumber)
        ngElement =
          start: m[1]
          finish: m[2]
        ngWord = m[3]
      # キーワードごとのNG処理
      switch true
        when ngWord.startsWith("RegExp:")
          ngElement.type = app.NG.NG_TYPE_REG_EXP
          ngElement.word = ngWord.substr(7)
        when ngWord.startsWith("RegExpTitle:")
          ngElement.type = app.NG.NG_TYPE_REG_EXP_TITLE
          ngElement.word = ngWord.substr(12)
        when ngWord.startsWith("RegExpName:")
          ngElement.type = app.NG.NG_TYPE_REG_EXP_NAME
          ngElement.word = ngWord.substr(11)
        when ngWord.startsWith("RegExpMail:")
          ngElement.type = app.NG.NG_TYPE_REG_EXP_MAIL
          ngElement.word = ngWord.substr(11)
        when ngWord.startsWith("RegExpID:")
          ngElement.type = app.NG.NG_TYPE_REG_EXP_ID
          ngElement.word = ngWord.substr(9)
        when ngWord.startsWith("RegExpSlip:")
          ngElement.type = app.NG.NG_TYPE_REG_EXP_SLIP
          ngElement.word = ngWord.substr(11)
        when ngWord.startsWith("RegExpBody:")
          ngElement.type = app.NG.NG_TYPE_REG_EXP_BODY
          ngElement.word = ngWord.substr(11)
        when ngWord.startsWith("Title:")
          ngElement.type = app.NG.NG_TYPE_TITLE
          ngElement.word = app.util.normalize(ngWord.substr(6))
        when ngWord.startsWith("Name:")
          ngElement.type = app.NG.NG_TYPE_NAME
          ngElement.word = app.util.normalize(ngWord.substr(5))
        when ngWord.startsWith("Mail:")
          ngElement.type = app.NG.NG_TYPE_MAIL
          ngElement.word = app.util.normalize(ngWord.substr(5))
        when ngWord.startsWith("ID:")
          ngElement.type = app.NG.NG_TYPE_ID
          ngElement.word = ngWord
        when ngWord.startsWith("Slip:")
          ngElement.type = app.NG.NG_TYPE_SLIP
          ngElement.word = ngWord.substr(5)
        when ngWord.startsWith("Body:")
          ngElement.type = app.NG.NG_TYPE_BODY
          ngElement.word = app.util.normalize(ngWord.substr(5))
        when ngWord.startsWith("Auto:")
          ngElement.type = app.NG.NG_TYPE_AUTO
          ngElement.word = ngWord.substr(5)
          if ngElement.word is ""
            ngElement.word = "*"
          else if tmp = /\$\((.*)\):/.exec(ngElement.word)
            ngElement.subType = tmp[1].split(",")
        else
          ngElement.type = app.NG.NG_TYPE_WORD
          ngElement.word = app.util.normalize(ngWord)
      ng.add(ngElement) unless ngElement.word is ""
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
        (n.type is app.NG.NG_TYPE_REG_EXP and n.reg.test(title)) or
        (n.type is app.NG.NG_TYPE_REG_EXP_TITLE and n.reg.test(title)) or
        (n.type is app.NG.NG_TYPE_TITLE and tmpTitle.includes(n.word)) or
        (n.type is app.NG.NG_TYPE_WORD and tmpTitle.includes(n.word))
      )
        return true
    return false

  ###*
  @method checkNGThread
  @param {Object} res
  @return {String|null}
  ###
  @checkNGThread: (res) ->
    decodedName = app.util.decodeCharReference(res.name)
    decodedMail = app.util.decodeCharReference(res.mail)
    decodedOther = app.util.decodeCharReference(res.other)
    decodedMes = app.util.decodeCharReference(res.message)

    tmpTxt1 = decodedName + " " + decodedMail + " " + decodedOther + " " + decodedMes
    tmpTxt2 = app.util.normalize(tmpTxt1)

    for n from @get()
      if n.start? and ((n.finish? and n.start <= res.num and res.num <= n.finish) or (parseInt(n.start) is res.num))
        continue
      if (
        (n.type is app.NG.NG_TYPE_REG_EXP and n.reg.test(tmpTxt1)) or
        (n.type is app.NG.NG_TYPE_REG_EXP_NAME and n.reg.test(decodedName)) or
        (n.type is app.NG.NG_TYPE_REG_EXP_MAIL and n.reg.test(decodedMail)) or
        (n.type is app.NG.NG_TYPE_REG_EXP_ID and res.id? and n.reg.test(res.id)) or
        (n.type is app.NG.NG_TYPE_REG_EXP_SLIP and res.slip? and n.reg.test(res.slip)) or
        (n.type is app.NG.NG_TYPE_REG_EXP_BODY and n.reg.test(decodedMes)) or
        (n.type is app.NG.NG_TYPE_NAME and app.util.normalize(decodedName).includes(n.word)) or
        (n.type is app.NG.NG_TYPE_MAIL and app.util.normalize(decodedMail).includes(n.word)) or
        (n.type is app.NG.NG_TYPE_ID and res.id?.includes(n.word)) or
        (n.type is app.NG.NG_TYPE_SLIP and res.slip?.includes(n.word)) or
        (n.type is app.NG.NG_TYPE_BODY and app.util.normalize(decodedMes).includes(n.word)) or
        (n.type is app.NG.NG_TYPE_WORD and tmpTxt2.includes(n.word))
      )
        return n.type
    return null

  ###*
  @method isIgnoreResNumForAuto
  @param {Number} resNum
  @param {String} subType
  @return {Boolean}
  ###
  @isIgnoreResNumForAuto: (resNum, subType = "") ->
    for n from @get()
      continue if n.type isnt app.NG.NG_TYPE_AUTO
      continue if n.subType? and (n.subType.indexOf(subType) is -1)
      if n.start? and ((n.finish? and n.start <= resNum and resNum <= n.finish) or (parseInt(n.start) is resNum))
        return true
    return false
