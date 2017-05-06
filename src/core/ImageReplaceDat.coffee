###*
@namespace app
@class NG
@static
###
class app.ImageReplaceDat
  _dat = null
  _configName = "image_replace_dat_obj"
  _configStringName = "image_replace_dat"
  _INVALID_URL = "invalid://invalid"

  #jsonには正規表現のオブジェクトが含めれないので
  #それを展開
  _setupReg = () ->
    for d from _dat
      try
        d.baseUrlReg = new RegExp(d.baseUrl, "i")
      catch e
        app.message.send "notify", {
          html: """
            ImageViewURLReplace.datの一致URLの正規表現(#{d.baseUrl})を読み込むのに失敗しました
            この行は無効化されます
          """
          background_color: "red"
        }
        d.baseUrl = _INVALID_URL
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
    if !_dat?
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
    if string isnt ""
      datStrSplit = string.split("\n")
      for d in datStrSplit
        continue if d is ""
        continue if ["//",";", "'"].some((ele) -> d.startsWith(ele))
        r = d.split("\t")
        if r[0]?
          obj =
            baseUrl: r[0]
            replaceUrl: if r[1]? then r[1] else ""
            referrerUrl: if r[2]? then r[2] else ""
            userAgent: if r[5]? then r[5] else ""

          if r[3]?
            obj.param = {}
            rurl = r[3].split("=")[1]
            if r[3].includes("$EXTRACT")
              obj.param =
                type: "extract"
                pattern: r[4]
                referrerUrl: if rurl? then rurl else ""
            else if r[4].includes("$COOKIE")
              obj.param =
                type: "cookie"
                referrerUrl: if rurl? then rurl else ""
          dat.add(obj)
    return dat

  ###*
  @method set
  @param {String} string
  ###
  @set: (string) ->
    _dat = @parse(string)
    _config.set(Array.from(_dat))
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
