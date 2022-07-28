/**
@class MediaContainer
@constructor
@param {Element} container
*/
export default class MediaContainer {
  constructor(container) {
    /**
    @property _videoPlayTime
    @type Number
    @private
    */
    this.container = container;
    this._videoPlayTime = 0;

    this.setVideoEvents();
    this.setHoverEvents();
  }

  /**
  @method setHoverEvents
  */
  setHoverEvents() {
    const isImageOn = app.config.isOn("hover_zoom_image");
    const isVideoOn = app.config.isOn("hover_zoom_video");
    const imageRatio = app.config.get("zoom_ratio_image") / 100;
    const videoRatio = app.config.get("zoom_ratio_video") / 100;

    this.container.on(
      "mouseenter",
      function ({ target }) {
        let zoomWidth;
        if (!target.matches(".thumbnail > a > img.image, .thumbnail > video")) {
          return;
        }
        if (isImageOn && target.tagName === "IMG") {
          zoomWidth = parseInt(target.offsetWidth * imageRatio);
        } else if (isVideoOn && target.tagName === "VIDEO") {
          // Chromeでmouseenterイベントが複数回発生するのを回避するため
          if ("&[BROWSER]" === "chrome") {
            if (target.style.width !== "") {
              return;
            }
          }
          zoomWidth = parseInt(target.offsetWidth * videoRatio);
        } else {
          return;
        }
        target.closest(".thumbnail").addClass("zoom");
        target.style.width = `${zoomWidth}px`;
        target.style.maxWidth = null;
        target.style.maxHeight = null;
      },
      true
    );

    this.container.on(
      "mouseleave",
      function ({ target }) {
        if (
          !target.matches(".thumbnail > a > img.image, .thumbnail > video") ||
          ((!isImageOn || target.tagName !== "IMG") &&
            (!isVideoOn || target.tagName !== "VIDEO"))
        ) {
          return;
        }
        target.closest(".thumbnail").removeClass("zoom");
        target.style.width = null;
        if (target.tagName === "IMG") {
          target.style.maxWidth = `${app.config.get("image_width")}px`;
          target.style.maxHeight = `${app.config.get("image_height")}px`;
        } else if (target.tagName === "VIDEO") {
          target.style.maxWidth = `${app.config.get("video_width")}px`;
          target.style.maxHeight = `${app.config.get("video_height")}px`;
        }
      },
      true
    );
  }

  /**
  @method setVideoEvents
  */
  setVideoEvents() {
    // VIDEOの再生/一時停止
    this.container.on("click", function ({ target }) {
      if (!target.matches(".thumbnail > video:not([data-src])")) {
        return;
      }
      if (target.preload === "metadata") {
        target.preload = "auto";
      }
      if (target.paused) {
        target.play();
      } else {
        target.pause();
      }
    });

    // VIDEO再生中はマウスポインタを消す
    this.container.on(
      "mouseenter",
      ({ target }) => {
        if (!target.matches(".thumbnail > video:not([data-src])")) {
          return;
        }

        const func = ({ type }) => {
          this._controlVideoCursor(target, type);
        };

        target.on("play", func);
        target.on("timeupdate", func);
        target.on("pause", func);
        target.on("ended", func);
      },
      true
    );

    // マウスポインタのリセット
    this.container.on("mousemove", ({ target, type }) => {
      if (!target.matches(".thumbnail > video:not([data-src])")) {
        return;
      }
      this._controlVideoCursor(target, type);
    });
  }

  /**
  @method _setImageBlurOne
  @param {Element} thumbnail
  @param {Boolean} blurMode
  @static
  @private
  */
  static _setImageBlurOne(thumbnail, blurMode) {
    const media = thumbnail.$("a > img.image, video");
    if (blurMode) {
      const v = app.config.get("image_blur_length");
      thumbnail.addClass("image_blur");
      media.style.WebkitFilter = `blur(${v}px)`;
    } else {
      thumbnail.removeClass("image_blur");
      media.style.WebkitFilter = "none";
    }
  }

  /**
  @method setImageBlur
  @param {Element} res
  @param {Boolean} blurMode
  @static
  */
  static setImageBlur(res, blurMode) {
    for (let thumb of res.$$(
      ".thumbnail[media-type='image'], .thumbnail[media-type='video']"
    )) {
      MediaContainer._setImageBlurOne(thumb, blurMode);
    }
  }

  /**
  @method _controlVideoCursor
  @param {Element} ele
  @param {String} act
  @private
  */
  _controlVideoCursor(ele, act) {
    switch (act) {
      case "play":
        this._videoPlayTime = Date.now();
        break;
      case "timeupdate":
        if (ele.style.cursor === "none") {
          return;
        }
        if (Date.now() - this._videoPlayTime > 2000) {
          ele.style.cursor = "none";
        }
        break;
      case "pause":
      case "ended":
        ele.style.cursor = "auto";
        this._videoPlayTime = 0;
        break;
      case "mousemove":
        if (this._videoPlayTime === 0) {
          return;
        }
        ele.style.cursor = "auto";
        this._videoPlayTime = Date.now();
        break;
    }
  }
}
