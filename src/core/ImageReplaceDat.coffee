###*
@namespace app
@class NG
@static
###
class app.ImageReplaceDat
  _dat = []
  _reg = /^([^\t]+)(?:\t([^\t]+)(?:\t([^\t]+)(?:\t([^\t]+)(?:\t([^\t]+)(?:\t([^\t]+))?)?)?)?)?/
  _configName = "image_replace_dat_obj"
  _configStringName = "image_replace_dat"

  #jsonには正規表現のオブジェクトが含めれないので
  #それを展開
  _setupReg = () ->
    for d in _dat
      d.baseUrlReg = new RegExp d.baseUrl
      if d.scrapingPattern isnt ""
        d.scrapingPatternReg = new RegExp d.scrapingPattern
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
  @param {Function} Callback
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
        if d.startsWith("//") or d.startsWith(";") or d.startsWith("'") or d.startsWith("#")
          continue
        r = _reg.exec(d)
        if r? and r[1]?
          param = ""
          if r[4]?
            switch r[4]
              when "$EXTRACT"
                param = "extract"
          dat.push(
            baseUrl: r[1]
            replaceUrl: if r[2]? then r[2] else ""
            refererUrl: if r[3]? then r[3] else ""
            param: param
            scrapingPattern: if param is "extract" and r[5]? then r[5] else ""
            userAgent: if r[6]? then r[6] else ""
          )
    return dat

  ###*
  @method set
  @param {Object} obj
  ###
  @set: (string) ->
    _dat = @parse(string)
    _config.set(_dat)
    _setupReg()
    console.log _dat
    return
