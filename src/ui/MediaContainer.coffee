###*
@class MediaContainer
@constructor
@param {Element} container
###
export default class MediaContainer

  constructor: (@container) ->
    ###*
    @property _videoPlayTime
    @type Number
    @private
    ###
    @_videoPlayTime = 0

    @setVideoEvents()
    @setHoverEvents()
    return

  ###*
  @method setHoverEvents
  ###
  setHoverEvents: ->
    isImageOn = app.config.isOn("hover_zoom_image")
    isVideoOn = app.config.isOn("hover_zoom_video")
    imageRatio = app.config.get("zoom_ratio_image") / 100
    videoRatio = app.config.get("zoom_ratio_video") / 100

    @container.on("mouseenter", ({target}) ->
      return unless target.matches(".thumbnail > a > img.image, .thumbnail > video")
      if isImageOn and target.tagName is "IMG"
        zoomWidth = parseInt(target.offsetWidth * imageRatio)
      else if isVideoOn and target.tagName is "VIDEO"
        # Chromeでmouseenterイベントが複数回発生するのを回避するため
        if "&[BROWSER]" is "chrome"
          return unless target.style.width is ""
        zoomWidth = parseInt(target.offsetWidth * videoRatio)
      else
        return
      target.closest(".thumbnail").addClass("zoom")
      target.style.width = "#{zoomWidth}px"
      target.style.maxWidth = null
      target.style.maxHeight = null
      return
    , true)

    @container.on("mouseleave", ({target}) ->
      return unless (
        target.matches(".thumbnail > a > img.image, .thumbnail > video") and
        (
          (isImageOn and target.tagName is "IMG") or
          (isVideoOn and target.tagName is "VIDEO")
        )
      )
      target.closest(".thumbnail").removeClass("zoom")
      target.style.width = null
      if target.tagName is "IMG"
        target.style.maxWidth = "#{app.config.get("image_width")}px"
        target.style.maxHeight = "#{app.config.get("image_height")}px"
      else if target.tagName is "VIDEO"
        target.style.maxWidth = "#{app.config.get("video_width")}px"
        target.style.maxHeight = "#{app.config.get("video_height")}px"
      return
    , true)
    return

  ###*
  @method setVideoEvents
  ###
  setVideoEvents: ->
    # VIDEOの再生/一時停止
    @container.on("click", ({target}) ->
      return unless target.matches(".thumbnail > video:not([data-src])")
      target.preload = "auto" if target.preload is "metadata"
      if target.paused
        target.play()
      else
        target.pause()
      return
    )

    # VIDEO再生中はマウスポインタを消す
    @container.on("mouseenter", ({target}) =>
      return unless target.matches(".thumbnail > video:not([data-src])")

      func = ({type}) =>
        @_controlVideoCursor(target, type)
        return

      target.on("play", func)
      target.on("timeupdate", func)
      target.on("pause", func)
      target.on("ended", func)
      return
    , true)

    # マウスポインタのリセット
    @container.on("mousemove", ({target, type}) =>
      return unless target.matches(".thumbnail > video:not([data-src])")
      @_controlVideoCursor(target, type)
      return
    )
    return

  ###*
  @method _setImageBlurOne
  @param {Element} thumbnail
  @param {Boolean} blurMode
  @static
  @private
  ###
  @_setImageBlurOne: (thumbnail, blurMode) ->
    media = thumbnail.$("a > img.image, video")
    if blurMode
      v = app.config.get("image_blur_length")
      thumbnail.addClass("image_blur")
      media.style.WebkitFilter = "blur(#{v}px)"
    else
      thumbnail.removeClass("image_blur")
      media.style.WebkitFilter = "none"
    return

  ###*
  @method setImageBlur
  @param {Element} res
  @param {Boolean} blurMode
  @static
  ###
  @setImageBlur: (res, blurMode) ->
    for thumb in res.$$(".thumbnail[media-type='image'], .thumbnail[media-type='video']")
      MediaContainer._setImageBlurOne(thumb, blurMode)
    return

  ###*
  @method _controlVideoCursor
  @param {Element} ele
  @param {String} act
  @private
  ###
  _controlVideoCursor: (ele, act) ->
    switch act
      when "play"
        @_videoPlayTime = Date.now()
      when "timeupdate"
        return if ele.style.cursor is "none"
        if Date.now() - @_videoPlayTime > 2000
          ele.style.cursor = "none"
      when "pause", "ended"
        ele.style.cursor = "auto"
        @_videoPlayTime = 0
      when "mousemove"
        return if @_videoPlayTime is 0
        ele.style.cursor = "auto"
        @_videoPlayTime = Date.now()
    return
