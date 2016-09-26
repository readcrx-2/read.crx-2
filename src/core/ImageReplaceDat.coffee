###*
@namespace app
@class NG
@static
###
class app.ImageReplaceDat
  _dat = []
  _configName = "image_replace_dat_obj"
  _configStringName = "image_replace_dat"

  #jsonには正規表現のオブジェクトが含めれないので
  #それを展開
  _setupReg = () ->
    for d in _dat
      try
        d.baseUrlReg = new RegExp d.baseUrl
      catch e
        app.message.send "notify", {
          html: """
            ImageViewURLReplace.datの一致URLの正規表現(#{d.baseUrl})を読み込むのに失敗しました
            この行は無効化されます
          """
          background_color: "red"
        }
        d.baseUrl = "invalid://invalid"

      try
        if d.param? and d.param.type is "extract"
          d.param.patternReg = new RegExp d.param.pattern
      catch e
        app.message.send "notify", {
          html: """
            ImageViewURLReplace.datのスクレイピング一致場所の正規表現(#{d.param.pattern})を読み込むのに失敗しました
            この行は無効化されます
          """
          background_color: "red"
        }
        d.baseUrl = "invalid://invalid"
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

  _getCookie = (string, dat) ->
    def = $.Deferred()
    req = new app.HTTP.Request("GET", string.replace(dat.baseUrl, dat.referrerUrl))
    #req.headers["Referer"] = string.replace(dat.baseUrl, dat.param.referrerUrl)
    if dat.userAgent isnt "" then req.headers["User-Agent"] = dat.userAgent
    req.send((res) ->
      if res.status is 200
        cookieStr = dat.header["Set-Cookie"]
        def.resolve(cookieStr)
      def.reject()
      return
    )
    return def.promise()

  _getExtract = (string, dat) ->
    def = $.Deferred()
    req = new app.HTTP.Request("GET", string.replace(dat.baseUrlReg, dat.referrerUrl))
    req.headers["Content-Type"] = "text/html"
    #req.headers["Referer"] = string.replace(dat.baseUrlReg, dat.param.referrerUrl)
    if dat.userAgent isnt "" then req.headers["User-Agent"] = dat.userAgent
    req.send((res) ->
      if res.status is 200
        def.resolve(res.body.match(dat.param.patternReg))
      def.reject()
      return
    )
    return def.promise()

  ###*
  @method get
  @return {Object}
  ###
  @get: ->
    if _dat.length is 0
      _dat = _config.get()
      _setupReg()
    return _dat

  ###*
  @method parse
  @param {String} string
  @return {Object}
  ###
  @parse: (string) ->
    dat = []
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
              obj.param.type = "extract"
              obj.param.pattern = r[4]
              obj.param.referrerUrl = if rurl? then rurl else ""
            else if r[4].includes("$COOKIE")
              obj.param.type = "cookie"
              obj.param.referrerUrl = if rurl? then rurl else ""
          dat.push(obj)
    return dat

  ###*
  @method set
  @param {String} string
  ###
  @set: (string) ->
    _dat = @parse(string)
    _config.set(_dat)
    _setupReg()
    return

  ###
  @method replace
  @param {HTMLElement} a
  @param {String} string
  @return {Object}
  ###
  @do: (a, string) ->
    def = $.Deferred()
    dat = @get()
    doing = false
    for d in dat
      continue if d.baseUrl is "invalid://invalid"
      continue if !d.baseUrlReg.test(string)
      if d.replaceUrl is ""
        def.resolve(a, string, "No parsing")
        break

      doing = true
      res = {}
      res.referrer = string.replace(dat.baseUrl, dat.referrerUrl)
      extractReg = /\$EXTRACT(\d+)?/g
      if d.param? and d.param.type is "extract"
        _getExtract(string, d).done((exMatch) ->
          res.text = string
            .replace(d.baseUrlReg, d.replaceUrl)
            .replace(extractReg, (str, num) ->
              if num?
                return exMatch[num]
              else
                return exMatch[1]
            )
          def.resolve(a, res)
          return
        ).fail(->
          def.resolve(a, string, "Fail getExtract")
          return
        )
      else
        res.text = string.replace(d.baseUrlReg, d.replaceUrl)
        if d.param? and d.param.type is "cookie"
          _getCookie(string, d).done((cookieStr) ->
            res.cookie = cookieStr
            def.resolve(a, res)
            return
          ).fail(->
            def.resolve(a, string, "Fail getCookie")
            return
          )
        else
          def.resolve(a, res)
      break
    def.resolve(a, string, "Fail noBaseUrlReg") unless doing
    return def.promise()
