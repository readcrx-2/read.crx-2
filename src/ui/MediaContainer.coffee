###*
@namespace UI
@class MediaContainer
@constructor
@param {Element} container
###
class UI.MediaContainer

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
    isImageOn = app.config.get("hover_zoom_image") is "on"
    isVideoOn = app.config.get("hover_zoom_video") is "on"
    imageRatio = app.config.get("zoom_ratio_image") + "%"
    videoRatio = app.config.get("zoom_ratio_video") + "%"

    @container.on("mouseenter", ({target}) ->
      return unless target.matches(".thumbnail > a > img.image, .thumbnail > video")
      if isImageOn and target.tagName is "IMG"
        target.closest(".thumbnail").addClass("zoom")
        target.style.zoom = imageRatio
      else if isVideoOn and target.tagName is "VIDEO"
        target.closest(".thumbnail").addClass("zoom")
        target.style.zoom = videoRatio
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
      target.style.zoom = "normal"
      return
    , true)
    return

  ###*
  @method setVideoEvents
  ###
  setVideoEvents: ->
    # VIDEOの再生/一時停止
    @container.on("click", ({target}) ->
      return unless target.matches(".thumbnail > video")
      target.preload = "auto" if target.preload is "metadata"
      if target.paused
        target.play()
      else
        target.pause()
      return
    )

    # VIDEO再生中はマウスポインタを消す
    @container.on("mouseenter", ({target}) =>
      return unless target.matches(".thumbnail > video")

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
      return unless target.matches(".thumbnail > video")
      @_controlVideoCursor(target, type)
      return
    )
    return

  ###*
  @method _setImageBlurOne
  @param {Element} thumbnail
  @param {Boolean} blurMode
  @private
  ###
  _setImageBlurOne: (thumbnail, blurMode) ->
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
  ###
  setImageBlur: (res, blurMode) ->
    for thumb in res.$$(".thumbnail[media-type='image'], .thumbnail[media-type='video']")
      @_setImageBlurOne(thumb, blurMode)
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
