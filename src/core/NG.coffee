###*
@namespace app
@class NG
@static
###
class app.NG
  @NG_TYPE_INVALID = "invalid"
  @NG_TYPE_REG_EXP = "RegExp"
  @NG_TYPE_REG_EXP_TITLE = "RegExpTitle"
  @NG_TYPE_REG_EXP_NAME = "RegExpName"
  @NG_TYPE_REG_EXP_MAIL = "RegExpMail"
  @NG_TYPE_REG_EXP_ID = "RegExpId"
  @NG_TYPE_REG_EXP_SLIP = "RegExpSlip"
  @NG_TYPE_REG_EXP_BODY = "RegExpBody"
  @NG_TYPE_REG_EXP_URL = "RegExpUrl"
  @NG_TYPE_TITLE = "Title"
  @NG_TYPE_NAME = "Name"
  @NG_TYPE_MAIL = "Mail"
  @NG_TYPE_ID = "ID"
  @NG_TYPE_SLIP = "Slip"
  @NG_TYPE_BODY = "Body"
  @NG_TYPE_WORD = "Word"
  @NG_TYPE_URL = "Url"
  @NG_TYPE_AUTO = "Auto"
  @NG_TYPE_AUTO_CHAIN = "Chain"
  @NG_TYPE_AUTO_CHAIN_ID = "ChainID"
  @NG_TYPE_AUTO_CHAIN_SLIP = "ChainSLIP"
  @NG_TYPE_AUTO_NOTHING_ID = "NothingID"
  @NG_TYPE_AUTO_NOTHING_SLIP = "NothingSLIP"
  @NG_TYPE_AUTO_REPEAT_MESSAGE = "RepeatMessage"
  @NG_TYPE_AUTO_FORWARD_LINK = "ForwardLink"

  _ng = null
  _configName = "ngobj"
  _configStringName = "ngwords"
  _ignoreResRegNumber = /^ignoreResNumber:(\d+)(?:-?(\d+))?,(.*)$/
  _ignoreNgType = /^ignoreNgType:(?:\$\((.*?)\):)?(.*)$/
  _expireDate = /^expireDate:(\d{4}\/\d{1,2}\/\d{1,2}),(.*)$/
  _expNgWords = /^\$\[(.*?)\]\$:(.*)$/

  #jsonには正規表現のオブジェクトが含めれないので
  #それを展開
  _setupReg = (obj) ->
    _convReg = (ngElement) ->
      reg = null
      try
        reg = new RegExp ngElement.word
      catch e
        app.message.send "notify", {
          html: """
            NG機能の正規表現(#{ngElement.type}: #{ngElement.word})を読み込むのに失敗しました
            この行は無効化されます
          """
          background_color: "red"
        }
      return reg

    for n from obj
      convFlag = true
      if n.subElements?
        for subElement in n.subElements
          continue unless subElement.type.startsWith(app.NG.NG_TYPE_REG_EXP)
          subElement.reg = _convReg(subElement)
          unless subElement.reg
            subElement.type = app.NG.NG_TYPE_INVALID
            convFlag = false
            break
      if convFlag and n.type.startsWith(app.NG.NG_TYPE_REG_EXP)
        n.reg = _convReg(n)
        convFlag = false unless n.reg
      n.type = app.NG.NG_TYPE_INVALID unless convFlag
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

    _getNgElement = (ngWord) ->
      return null if ngWord.startsWith("Comment:") or ngWord is ""
      ngElement =
        type: ""
        word: ""
        subElements: []
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
        when ngWord.startsWith("RegExpUrl:")
          ngElement.type = app.NG.NG_TYPE_REG_EXP_URL
          ngElement.word = ngWord.substr(10)
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
        when ngWord.startsWith("Url:")
          ngElement.type = app.NG.NG_TYPE_URL
          ngElement.word = ngWord.substr(4)
        when ngWord.startsWith("Auto:")
          ngElement.type = app.NG.NG_TYPE_AUTO
          ngElement.word = ngWord.substr(5)
          if ngElement.word is ""
            ngElement.word = "*"
          else if tmp = /\$\((.*)\):/.exec(ngElement.word)
            ngElement.subType = tmp[1].split(",") if tmp[1]?
        # AND条件用副要素の切り出し
        when _expNgWords.test(ngWord)
          m = _expNgWords.exec(ngWord)
          for i in [1..2]
            elm = _getNgElement(m[i])
            continue unless elm
            if ngElement.type isnt ""
              subElement =
                type: ngElement.type
                word: ngElement.word
              ngElement.subElements.push(subElement)
            ngElement.type = elm.type
            ngElement.word = elm.word
            if elm.subElements? and elm.subElements.length > 0
              for e in elm.subElements
                ngElement.subElements.push(e)
        else
          ngElement.type = app.NG.NG_TYPE_WORD
          ngElement.word = app.util.normalize(ngWord)
      return ngElement

    ngStrSplit = string.split("\n")
    for ngWord in ngStrSplit
      # 関係ないプレフィックスは飛ばす
      continue if ngWord.startsWith("Comment:") or ngWord is ""

      ngElement = {}

      # 指定したレス番号はNG除外する
      if _ignoreResRegNumber.test(ngWord)
        m = ngWord.match(_ignoreResRegNumber)
        ngElement =
          start: m[1]
          finish: m[2]
        ngWord = m[3]
      # 例外NgTypeの指定
      else if _ignoreNgType.test(ngWord)
        m = ngWord.match(_ignoreNgType)
        ngElement =
          exception: true
          subType: m[1]?.split(",")
        ngWord = m[2]
      # 有効期限の指定
      else if _expireDate.test(ngWord)
        m = ngWord.match(_expireDate)
        d = app.util.stringToDate(m[1] + " 23:59:59")
        ngElement =
          expire: d.valueOf() + 1000
        ngWord = m[2]
      # キーワードごとの取り出し
      elm = _getNgElement(ngWord)
      ngElement.type = elm.type
      ngElement.word = elm.word
      ngElement.subType = elm.subType if elm.subType?
      ngElement.subElements = elm.subElements if elm.subElements?
      # 拡張項目の設定
      unless ngElement.exception?
        ngElement.exception = false
      if ngElement.subType?
        i = 0
        while i < ngElement.subType.length
          ngElement.subType[i] = ngElement.subType[i].trim()
          if ngElement.subType[i] is ""
            ngElement.subType.splice(i, 1)
          else
            i++
        if ngElement.subType.length is 0
          delete ngElement.subType

      ng.add(ngElement) if ngElement.word isnt ""
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
  @param {String} url
  @param {Boolean} exceptionFlg
  @param {String} subType
  ###
  @isNGBoard: (title, url, exceptionFlg = false, subType = null) ->
    return @checkNGThread({}, title, url, exceptionFlg, subType, true)

  ###*
  @method checkNGThread
  @param {Object} res
  @param {String} threadTitle
  @param {String} url
  @param {Boolean} exceptionFlg
  @param {String} subType
  @param {Boolean} isBoard
  @return {String|null}
  ###
  @checkNGThread: (res, threadTitle, url, exceptionFlg = false, subType = null, isBoard = false) ->
    tmpTitle = app.util.normalize(threadTitle)
    if isBoard
      tmpTxt1 = tmpTitle
      tmpTxt2 = tmpTitle
    else
      decodedName = app.util.decodeCharReference(res.name)
      decodedMail = app.util.decodeCharReference(res.mail)
      decodedOther = app.util.decodeCharReference(res.other)
      decodedMes = app.util.decodeCharReference(res.message)
      tmpTxt1 = decodedName + " " + decodedMail + " " + decodedOther + " " + decodedMes
      tmpTxt2 = app.util.normalize(tmpTxt1)

    _checkWord = (n) ->
      if (
        (n.type is app.NG.NG_TYPE_REG_EXP and n.reg.test(tmpTxt1)) or
        (n.type is app.NG.NG_TYPE_REG_EXP_NAME and n.reg.test(decodedName)) or
        (n.type is app.NG.NG_TYPE_REG_EXP_MAIL and n.reg.test(decodedMail)) or
        (n.type is app.NG.NG_TYPE_REG_EXP_ID and res.id? and n.reg.test(res.id)) or
        (n.type is app.NG.NG_TYPE_REG_EXP_SLIP and res.slip? and n.reg.test(res.slip)) or
        (n.type is app.NG.NG_TYPE_REG_EXP_BODY and n.reg.test(decodedMes)) or
        (n.type is app.NG.NG_TYPE_REG_EXP_TITLE and n.reg.test(tmpTitle)) or
        (n.type is app.NG.NG_TYPE_REG_EXP_URL and n.reg.test(url)) or
        (n.type is app.NG.NG_TYPE_TITLE and tmpTitle.includes(n.word)) or
        (n.type is app.NG.NG_TYPE_NAME and app.util.normalize(decodedName).includes(n.word)) or
        (n.type is app.NG.NG_TYPE_MAIL and app.util.normalize(decodedMail).includes(n.word)) or
        (n.type is app.NG.NG_TYPE_ID and res.id?.includes(n.word)) or
        (n.type is app.NG.NG_TYPE_SLIP and res.slip?.includes(n.word)) or
        (n.type is app.NG.NG_TYPE_BODY and app.util.normalize(decodedMes).includes(n.word)) or
        (n.type is app.NG.NG_TYPE_WORD and tmpTxt2.includes(n.word)) or
        (n.type is app.NG.NG_TYPE_URL and url.includes(n.word))
      )
        return n.type
      return null

    for n from @get()
      continue if n.type is app.NG.NG_TYPE_INVALID
      if isBoard
        # isNGBoard用の項目チェック
        unless n.type in [app.NG.NG_TYPE_REG_EXP, app.NG.NG_TYPE_REG_EXP_TITLE, app.NG.NG_TYPE_TITLE, app.NG.NG_TYPE_WORD, app.NG.NG_TYPE_REG_EXP_URL, app.NG.NG_TYPE_URL]
          continue
      else
        # ignoreResNumber用レス番号のチェック
        if n.start? and ((n.finish? and n.start <= res.num and res.num <= n.finish) or (parseInt(n.start) is res.num))
          continue
      # 有効期限のチェック
      continue if n.expire? and Date.now() > n.expire
      # ignoreNgType用例外フラグのチェック
      continue if n.exception isnt exceptionFlg
      # ng-typeのチエック
      continue if n.subType? and subType and n.subType.indexOf(subType) is -1

      # サブ条件のチェック
      if n.subElements?
        noneNg = false
        for subElement in n.subElements
          ngType = _checkWord(subElement)
          unless ngType
            noneNg = true
            break
        continue if noneNg
      # メイン条件のチェック
      if n.type isnt "" and n.word isnt ""
        ngType = _checkWord(n)
        return ngType if ngType
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

  ###*
  @method isIgnoreNgType
  @param {Object} res
  @param {String} threadTitle
  @param {String} url
  @param {String} ngType
  @return {Boolean}
  ###
  @isIgnoreNgType: (res, threadTitle, url, ngType) ->
    if (
      @isNGBoard(threadTitle, url, true, ngType) or
      @checkNGThread(res, threadTitle, url, true, ngType)
    )
      return true
    return false

  ###*
  @method execExpire
  ###
  @execExpire: ->
    configStr = _config.getString()
    newConfigStr = ""
    updateFlag = false

    ngStrSplit = configStr.split("\n")
    for ngWord in ngStrSplit
      # 有効期限の確認
      if _expireDate.test(ngWord)
        m = ngWord.match(_expireDate)
        d = app.util.stringToDate(m[1] + " 23:59:59")
        if d.valueOf() + 1000 < Date.now()
          updateFlag = true
        else
          newConfigStr += "\n" if newConfigStr isnt ""
          newConfigStr += ngWord
      else
        newConfigStr += "\n" if newConfigStr isnt ""
        newConfigStr += ngWord
    # 期限切れデータが存在した場合はNG情報を更新する
    if updateFlag
      _config.setString(newConfigStr)
      _ng = @parse(newConfigStr)
      _config.set(Array.from(_ng))
      _setupReg(_ng)

    return
