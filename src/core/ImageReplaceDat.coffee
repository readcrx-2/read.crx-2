###*
@class ImageReplaceDat
@static
###
export default class ImageReplaceDat
  _dat = null
  _CONFIG_NAME = "image_replace_dat_obj"
  _CONFIG_STRING_NAME = "image_replace_dat"
  _INVALID_URL = "invalid://invalid"

  #jsonには正規表現のオブジェクトが含めれないので
  #それを展開
  _setupReg = () ->
    for d from _dat
      try
        d.baseUrlReg = new RegExp(d.baseUrl, "i")
      catch
        app.message.send("notify",
          message: """
            ImageViewURLReplace.datの一致URLの正規表現(#{d.baseUrl})を読み込むのに失敗しました
            この行は無効化されます
          """
          background_color: "red"
        )
        d.baseUrl = _INVALID_URL
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
  @get: ->
    unless _dat?
      _dat = new Set(_config.get())
      _setupReg()
    return _dat

  ###*
  @method parse
  @param {String} string
  @return {Object}
  ###
  @parse: (string) ->
    dat = new Set()
    return dat if string is ""
    datStrSplit = string.split("\n")
    for d in datStrSplit
      continue if d is ""
      continue if ["//",";", "'"].some((ele) -> d.startsWith(ele))
      r = d.split("\t")
      continue unless r[0]?
      obj =
        baseUrl: r[0]
        replaceUrl: r[1] ? ""
        referrerUrl: r[2] ? ""
        userAgent: r[5] ? ""

      if r[3]?
        obj.param = {}
        rurl = r[3].split("=")[1]
        if r[3].includes("$EXTRACT")
          obj.param =
            type: "extract"
            pattern: r[4]
            referrerUrl: rurl ? ""
        else if r[4].includes("$COOKIE")
          obj.param =
            type: "cookie"
            referrerUrl: rurl ? ""
      dat.add(obj)
    return dat

  ###*
  @method set
  @param {String} string
  ###
  @set: (string) ->
    _dat = @parse(string)
    _config.set([_dat...])
    _setupReg()
    return

  ###
  @method replace
  @param {String} string
  @return {Object}
  ###
  @do: (string) ->
    dat = @get()
    res = {}
    for d from dat
      continue if d.baseUrl is _INVALID_URL
      continue if !d.baseUrlReg.test(string)
      if d.replaceUrl is ""
        return {res, err: "No parsing"}
      if d.param? and d.param.type is "extract"
        res.type = "extract"
        res.text = string.replace(d.baseUrlReg, d.replaceUrl)
        res.extract = string.replace(d.baseUrlReg, d.referrerUrl)
        res.extractReferrer = d.param.referrerUrl
        res.pattern = d.param.pattern
        res.userAgent = d.userAgent
        return {res}
      else if d.param? and d.param.type is "cookie"
        res.type = "cookie"
        res.text = string.replace(d.baseUrlReg, d.replaceUrl)
        res.cookie = string.replace(d.baseUrlReg, d.referrerUrl)
        res.cookieReferrer = d.param.referrerUrl
        res.userAgent = d.userAgent
        return {res}
      else
        res.type = "default"
        res.text = string.replace(d.baseUrlReg, d.replaceUrl)
        if d.referrerUrl isnt "" or d.userAgent isnt ""
          res.type = "referrer"
          res.referrer = string.replace(d.baseUrlReg, d.referrerUrl)
          res.userAgent = d.userAgent
        return {res}
    return {res, err: "Fail noBaseUrlReg"}
