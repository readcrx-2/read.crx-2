###*
@namespace app
@class NG
@static
###
class app.ImageReplaceDat
  _dat = []
  _reg = /^([^\t]+)(?:\t([^\t]+)(?:\t([^\t]+))?)?/
  _configName = "image_replace_dat_obj"
  _configStringName = "image_replace_dat"

  #jsonには正規表現のオブジェクトが含めれないので
  #それを展開
  _setupReg = () ->
    for d in _dat
      d.baseUrlReg = new RegExp d.baseUrl
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
        console.log d
        if d.startsWith("//") or d.startsWith(":") or d.startsWith("'")
          continue
        r = _reg.exec(d)
        if r? and r[1]?
          dat.push(
            baseUrl: r[1]
            replaceUrl: if r[2]? then r[2] else ""
            refererUrl: if r[3]? then r[3] else ""
          )
    return dat

  ###*
  @method set
  @param {Object} obj
  ###
  @set: (string) ->
    _ng = @parse(string)
    _config.set(_ng)
    _setupReg(_ng)
    return
