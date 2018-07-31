window.UI ?= {}

class UI.AANoOverflow
  _AA_CLASS_NAME = "aa"
  _MINI_AA_CLASS_NAME = "mini_aa"
  _SCROLL_AA_CLASS_NAME = "scroll_aa"

  # minRatioはパーセント
  constructor: (@$view, {@minRatio = 40, @maxFont = 16} = {}) ->
    if @minRatio >= 100
      return
    @canvasEle = $__("canvas")
    @ctx = @canvasEle.getContext("2d")
    @ctx.font = @maxFont+'px "MS PGothic", "IPAMonaPGothic", "Konatu", "Monapo", "Textar"'

    @$view.on("view_loaded", =>
      @_setFontSizes()
      return
    )
    # Todo: observe resize
    return

  _getStrLength: (str) ->
    # canvas上での幅(おそらくhtml上でも同様)
    return @ctx.measureText(str).width

  _setFontSize: ($article, width) ->
    $message = $article.C("message")[0]
    charCountInLine = $message.innerText.split("\n").map(@_getStrLength.bind(@))
    textMaxWidth = Math.max(charCountInLine...)

    # リセット
    $message.removeClass(_MINI_AA_CLASS_NAME, _SCROLL_AA_CLASS_NAME)
    $message.style.transform = null
    $message.style.width = null
    $message.style.marginBottom = null

    return if width > textMaxWidth

    ratio = width/textMaxWidth
    ratio = Math.floor(ratio*100)/100
    if ratio < @minRatio/100
      ratio = @minRatio/100
      $message.addClass(_SCROLL_AA_CLASS_NAME)
      $message.style.width = "#{width / ratio}px"

    $message.addClass(_MINI_AA_CLASS_NAME)

    heightOld = $message.clientHeight

    $message.style.transform = "scale(#{ratio})"
    $message.style.marginBottom = "#{-(1-ratio) * heightOld}px"
    return

  _setFontSizes: ->
    $aaArticles = @$view.C("content")[0].C(_AA_CLASS_NAME)
    return unless $aaArticles.length > 0

    # レスの幅はすべて同じと考える
    width = @$view.C("content")[0].C("message")[0].clientWidth
    for $article from $aaArticles
      @_setFontSize($article, width)
    return

  setMiniAA: ($article) ->
    $article.addClass(_AA_CLASS_NAME)
    @_setFontSize($article, $article.C("message")[0].clientWidth)
    return

  unsetMiniAA: ($article) ->
    $article.removeClass(_AA_CLASS_NAME)
    $message = $article.C("message")[0]
    $message.removeClass(_MINI_AA_CLASS_NAME, _SCROLL_AA_CLASS_NAME)
    $message.style.transform = null
    $message.style.width = null
    $message.style.marginBottom = null
    return
