import {decodeCharReference, normalize, stringToDate} from "./util.coffee"

###*
@class NG
@static
###

export TYPE =
  INVALID: "invalid"
  REG_EXP: "RegExp"
  REG_EXP_TITLE: "RegExpTitle"
  REG_EXP_NAME: "RegExpName"
  REG_EXP_MAIL: "RegExpMail"
  REG_EXP_ID: "RegExpId"
  REG_EXP_SLIP: "RegExpSlip"
  REG_EXP_BODY: "RegExpBody"
  REG_EXP_URL: "RegExpUrl"
  TITLE: "Title"
  NAME: "Name"
  MAIL: "Mail"
  ID: "ID"
  SLIP: "Slip"
  BODY: "Body"
  WORD: "Word"
  URL: "Url"
  RES_COUNT: "ResCount"
  AUTO: "Auto"
  AUTO_CHAIN: "Chain"
  AUTO_CHAIN_ID: "ChainID"
  AUTO_CHAIN_SLIP: "ChainSLIP"
  AUTO_NOTHING_ID: "NothingID"
  AUTO_NOTHING_SLIP: "NothingSLIP"
  AUTO_REPEAT_MESSAGE: "RepeatMessage"
  AUTO_FORWARD_LINK: "ForwardLink"

_CONFIG_NAME = "ngobj"
_CONFIG_STRING_NAME = "ngwords"

_ng = null
_ignoreResRegNumber = /^ignoreResNumber:(\d+)(?:-?(\d+))?,(.*)$/
_ignoreNgType = /^ignoreNgType:(?:\$\((.*?)\):)?(.*)$/
_expireDate = /^expireDate:(\d{4}\/\d{1,2}\/\d{1,2}),(.*)$/
_attachName = /^attachName:([^,]*),(.*)$/
_expNgWords = /^\$\[(.*?)\]\$:(.*)$/

#jsonには正規表現のオブジェクトが含めれないので
#それを展開
_setupReg = (obj) ->
  _convReg = ({type, word}) ->
    reg = null
    try
      reg = new RegExp(word)
    catch
      app.message.send("notify",
        message: """
          NG機能の正規表現(#{type}: #{word})を読み込むのに失敗しました
          この行は無効化されます
        """
        background_color: "red"
      )
    return reg

  for n from obj
    convFlag = true
    if n.subElements?
      for subElement in n.subElements
        continue unless subElement.type.startsWith(TYPE.REG_EXP)
        subElement.reg = _convReg(subElement)
        unless subElement.reg
          subElement.type = TYPE.INVALID
          convFlag = false
          break
    if convFlag and n.type.startsWith(TYPE.REG_EXP)
      n.reg = _convReg(n)
      convFlag = false unless n.reg
    n.type = TYPE.INVALID unless convFlag
  return

_config =
  get: ->
    return JSON.parse(app.config.get(_CONFIG_NAME))
  set: (str) ->
    app.config.set(_CONFIG_NAME, JSON.stringify(str))
    return
  getString: ->
    return app.config.get(_CONFIG_STRING_NAME)
  setString: (str) ->
    app.config.set(_CONFIG_STRING_NAME, str)
    return

###*
@method get
@return {Object}
###
export get = ->
  unless _ng?
    _ng = new Set(_config.get())
    _setupReg(_ng)
  return _ng

###*
@method parse
@param {String} string
@return {Object}
###
parse = (string) ->
  ng = new Set()
  return ng if string is ""

  _getNgElement = (ngWord) ->
    return null if ngWord.startsWith("Comment:") or ngWord is ""
    ngElement =
      type: ""
      word: ""
      subElements: []
    # キーワードごとのNG処理
    switch
      when ngWord.startsWith("RegExp:")
        ngElement.type = TYPE.REG_EXP
        ngElement.word = ngWord.substr(7)
      when ngWord.startsWith("RegExpTitle:")
        ngElement.type = TYPE.REG_EXP_TITLE
        ngElement.word = ngWord.substr(12)
      when ngWord.startsWith("RegExpName:")
        ngElement.type = TYPE.REG_EXP_NAME
        ngElement.word = ngWord.substr(11)
      when ngWord.startsWith("RegExpMail:")
        ngElement.type = TYPE.REG_EXP_MAIL
        ngElement.word = ngWord.substr(11)
      when ngWord.startsWith("RegExpID:")
        ngElement.type = TYPE.REG_EXP_ID
        ngElement.word = ngWord.substr(9)
      when ngWord.startsWith("RegExpSlip:")
        ngElement.type = TYPE.REG_EXP_SLIP
        ngElement.word = ngWord.substr(11)
      when ngWord.startsWith("RegExpBody:")
        ngElement.type = TYPE.REG_EXP_BODY
        ngElement.word = ngWord.substr(11)
      when ngWord.startsWith("RegExpUrl:")
        ngElement.type = TYPE.REG_EXP_URL
        ngElement.word = ngWord.substr(10)
      when ngWord.startsWith("Title:")
        ngElement.type = TYPE.TITLE
        ngElement.word = normalize(ngWord.substr(6))
      when ngWord.startsWith("Name:")
        ngElement.type = TYPE.NAME
        ngElement.word = normalize(ngWord.substr(5))
      when ngWord.startsWith("Mail:")
        ngElement.type = TYPE.MAIL
        ngElement.word = normalize(ngWord.substr(5))
      when ngWord.startsWith("ID:")
        ngElement.type = TYPE.ID
        ngElement.word = ngWord
      when ngWord.startsWith("Slip:")
        ngElement.type = TYPE.SLIP
        ngElement.word = ngWord.substr(5)
      when ngWord.startsWith("Body:")
        ngElement.type = TYPE.BODY
        ngElement.word = normalize(ngWord.substr(5))
      when ngWord.startsWith("Url:")
        ngElement.type = TYPE.URL
        ngElement.word = ngWord.substr(4)
      when ngWord.startsWith("ResCount:")
        ngElement.type = TYPE.RES_COUNT
        ngElement.word = parseInt(ngWord.substr(9))
      when ngWord.startsWith("Auto:")
        ngElement.type = TYPE.AUTO
        ngElement.word = ngWord.substr(5)
        if ngElement.word is ""
          ngElement.word = "*"
        else if tmp = /\$\((.*)\):/.exec(ngElement.word)
          ngElement.subType = tmp[1].split(",") if tmp[1]?
      # AND条件用副要素の切り出し
      when _expNgWords.test(ngWord)
        m = _expNgWords.exec(ngWord)
        for i in [1..2]
          ele = _getNgElement(m[i])
          continue unless ele
          if ngElement.type isnt ""
            subElement =
              type: ngElement.type
              word: ngElement.word
            ngElement.subElements.push(subElement)
          ngElement.type = ele.type
          ngElement.word = ele.word
          if ele.subElements?.length > 0
            ngElement.subElements.push(ele.subElements...)
      else
        ngElement.type = TYPE.WORD
        ngElement.word = normalize(ngWord)
    return ngElement

  ngStrSplit = string.split("\n")
  for ngWord in ngStrSplit
    # 関係ないプレフィックスは飛ばす
    continue if ngWord.startsWith("Comment:") or ngWord is ""

    ngElement = {}

    # 指定したレス番号はNG除外する
    if (m = ngWord.match(_ignoreResRegNumber))?
      ngElement =
        start: m[1]
        finish: m[2]
      ngWord = m[3]
    # 例外NgTypeの指定
    else if (m = ngWord.match(_ignoreNgType))?
      ngElement =
        exception: true
        subType: m[1].split(",") if m[1]?
      ngWord = m[2]
    # 有効期限の指定
    else if (m = ngWord.match(_expireDate))?
      expire = stringToDate("#{m[1]} 23:59:59")
      ngElement =
        expire: expire.valueOf() + 1000
      ngWord = m[2]
    # 名前の付与
    else if (m = ngWord.match(_attachName))?
      ngElement =
        name: m[1]
      ngWord = m[2]
    # キーワードごとの取り出し
    ele = _getNgElement(ngWord)
    ngElement.type = ele.type
    ngElement.word = ele.word
    ngElement.subType = ele.subType if ele.subType?
    ngElement.subElements = ele.subElements if ele.subElements?
    # 拡張項目の設定
    unless ngElement.exception?
      ngElement.exception = false
    if ngElement.subType?
      for st, i in ngElement.subType by -1
        ngElement.subType[i] = st.trim()
        if ngElement.subType[i] is ""
          ngElement.subType.splice(i, 1)
      if ngElement.subType.length is 0
        ngElement.subType = null

    ng.add(ngElement) if ngElement.word isnt ""
  return ng

###*
@method set
@param {Object} obj
###
export set = (string) ->
  _ng = parse(string)
  _config.set([_ng...])
  _setupReg(_ng)
  return

###*
@method add
@param {String} string
###
export add = (string) ->
  _config.setString(string + "\n" + _config.getString())
  addNg = parse(string)
  _config.set([_config.get()...].concat([addNg...]))

  _setupReg(addNg)
  for ang from addNg
    _ng.add(ang)
  return

###*
@method _checkWord
@param {Object} ngObj
@param {Object} threadObj/resObj
@private
###
_checkWord = ({type, reg, word}, {all, name, mail, id, slip, mes, title, url, resCount}) ->
  if (
    ( type is TYPE.REG_EXP and reg.test(all) ) or
    ( type is TYPE.REG_EXP_NAME and reg.test(name) ) or
    ( type is TYPE.REG_EXP_MAIL and reg.test(mail) ) or
    ( type is TYPE.REG_EXP_ID and id? and reg.test(id) ) or
    ( type is TYPE.REG_EXP_SLIP and slip? and reg.test(slip) ) or
    ( type is TYPE.REG_EXP_BODY and reg.test(mes) ) or
    ( type is TYPE.REG_EXP_TITLE and reg.test(title) ) or
    ( type is TYPE.REG_EXP_URL and reg.test(url) ) or
    ( type is TYPE.TITLE and normalize(title).includes(word) ) or
    ( type is TYPE.NAME and normalize(name).includes(word) ) or
    ( type is TYPE.MAIL and normalize(mail).includes(word) ) or
    ( type is TYPE.ID and id?.includes(word) ) or
    ( type is TYPE.SLIP and slip?.includes(word) ) or
    ( type is TYPE.BODY and normalize(mes).includes(word) ) or
    ( type is TYPE.WORD and normalize(all).includes(word) ) or
    ( type is TYPE.URL and url.includes(word) ) or
    ( type is TYPE.RES_COUNT and word < resCount )
  )
    return type
  return null

###*
@method _checkResNum
@param {Object} ngObj
@param {Number} resNum
@private
###
_checkResNum = ({start, finish}, resNum) ->
  return (
    start? and (
      ( finish? and start <= resNum <= finish ) or
      ( parseInt(start) is resNum )
    )
  )

###*
@method isNGBoard
@param {String} threadTitle
@param {String} url
@param {Number} resCount
@param {Boolean} exceptionFlg
@param {String} subType
@return {Object|null}
###
export isNGBoard = (threadTitle, url, resCount, exceptionFlg = false, subType = null) ->
  threadObj = {
    all: normalize(threadTitle)
    title: threadTitle
    url
    resCount
  }

  now = Date.now()
  for n from get()
    continue if n.type is TYPE.INVALID or n.type is "" or n.word is ""
    continue unless n.type in [TYPE.REG_EXP, TYPE.REG_EXP_TITLE, TYPE.TITLE, TYPE.WORD, TYPE.REG_EXP_URL, TYPE.URL, TYPE.RES_COUNT]
    # 有効期限のチェック
    continue if n.expire? and now > n.expire
    # ignoreNgType用例外フラグのチェック
    continue if n.exception isnt exceptionFlg
    # ng-typeのチエック
    continue if n.subType? and subType and not n.subType.includes(subType)

    # サブ条件のチェック
    if n.subElements?
      continue unless n.subElements.every( (subElement) ->
        return _checkWord(subElement, threadObj)
      )
    # メイン条件のチェック
    ngType = _checkWord(n, threadObj)
    return {type: ngType, name: n.name} if ngType
  return null

###*
@method isNGThread
@param {Object} res
@param {String} title
@param {String} url
@param {Number} resCount
@param {Boolean} exceptionFlg
@param {String} subType
@return {Object|null}
###
export isNGThread = (res, title, url, exceptionFlg = false, subType = null) ->
  name = decodeCharReference(res.name)
  mail = decodeCharReference(res.mail)
  other = decodeCharReference(res.other)
  mes = decodeCharReference(res.message)
  all = name + " " + mail + " " + other + " " + mes
  resObj = {
    all
    name
    mail
    id: res.id ? null
    slip: res.slip ? null
    mes
    title
    url
  }

  now = Date.now()
  for n from get()
    continue if n.type is TYPE.INVALID or n.type is "" or n.word is ""
    # ignoreResNumber用レス番号のチェック
    continue if _checkResNum(n, res.num)
    # 有効期限のチェック
    continue if n.expire? and now > n.expire
    # ignoreNgType用例外フラグのチェック
    continue if n.exception isnt exceptionFlg
    # ng-typeのチエック
    continue if n.subType? and subType and not n.subType.includes(subType)

    # サブ条件のチェック
    if n.subElements?
      continue unless n.subElements.every( (subElement) ->
        return _checkWord(subElement, resObj)
      )
    # メイン条件のチェック
    ngType = _checkWord(n, resObj)
    return {type: ngType, name: n.name} if ngType
  return null

###*
@method isIgnoreResNumForAuto
@param {Number} resNum
@param {String} subType
@return {Boolean}
###
export isIgnoreResNumForAuto = (resNum, subType = "") ->
  for n from get()
    continue if n.type isnt TYPE.AUTO
    continue if n.subType? and not n.subType.includes(subType)
    return true if _checkResNum(n, resNum)
  return false

###*
@method isThreadIgnoreNgType
@param {Object} res
@param {String} threadTitle
@param {String} url
@param {String} ngType
@return {Boolean}
###
export isThreadIgnoreNgType = (res, threadTitle, url, ngType) ->
  return isNGThread(res, threadTitle, url, true, ngType)

###*
@method execExpire
###
export execExpire = ->
  configStr = _config.getString()
  newConfigStr = ""
  updateFlag = false

  ngStrSplit = configStr.split("\n")
  now = Date.now()
  for ngWord in ngStrSplit
    # 有効期限の確認
    if _expireDate.test(ngWord)
      m = ngWord.match(_expireDate)
      expire = stringToDate(m[1] + " 23:59:59")
      if expire.valueOf() + 1000 < now
        updateFlag = true
        continue
    newConfigStr += "\n" if newConfigStr isnt ""
    newConfigStr += ngWord
  # 期限切れデータが存在した場合はNG情報を更新する
  if updateFlag
    _config.setString(newConfigStr)
    _ng = parse(newConfigStr)
    _config.set([_ng...])
    _setupReg(_ng)
  return
