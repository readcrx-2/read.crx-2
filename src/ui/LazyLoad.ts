///<reference path="../global.d.ts" />
///<reference path="../app.ts" />

namespace UI {
  "use strict";

  export class LazyLoad {
    static UPDATE_INTERVAL = 200;

    container: HTMLElement;
    private scroll = false;
    private imgs: HTMLElement[] = [];
    private imgPlaceTable = new Map<HTMLElement, number>();
    private updateInterval: number = null;
    private loaded: boolean = false;

    constructor (container: HTMLElement) {
      this.container = container;

      $(this.container).on("scroll", this.onScroll.bind(this));
      $(this.container).on("resize", this.onResize.bind(this));
      this.scan();
    }

    private onScroll (): void {
      this.scroll = true;
    }

    private onResize (): void {
      this.imgPlaceTable.clear();
    }

    public viewLoaded (): void {
      this.loaded = true;
    }

    public immediateLoad (img: any): void {
      if (img.tagName === "IMG" || img.tagName === "VIDEO") {
        if (img.getAttribute("data-src") === null) return;
        this.load(img);
      }
    }

    private load (img: any, byBottom: boolean = false): void {
      var newImg: HTMLImageElement, cpyImg: HTMLImageElement, attr: Attr, attrs: Attr[];

      // タグ名に基づいて型をキャストする
      if (img.tagName === "IMG") {
        img = <HTMLImageElement>img;
        newImg = document.createElement("img");
      } else if (img.tagName === "AUDIO") {
        img = <HTMLAudioElement>img;
      } else if (img.tagName === "VIDEO") {
        img = <HTMLVideoElement>img;
      }
      // immediateLoadにて処理済みのものを除外する
      if (img.getAttribute("data-src") === null) return;

      if (img.tagName === "IMG" && img.className !== "favicon") {
        cpyImg = img;
        attrs = Array.from(cpyImg.attributes)
        for (attr of attrs) {
          if (attr.name !== "data-src") {
            newImg.setAttribute(attr.name, attr.value);
          }
        }
      }

      $(newImg).one("load error", function (e) {
        $(img).replaceWith(this);

        if (e.type === "load") {
          if (byBottom === false) {
            $(this).trigger("lazyload-load");
          } else {
            $(this).trigger("lazyload-loadbybottom");
          }
          UI.Animate.fadeIn(this);
        }
      });
      $(img).one("load error loadedmetadata", function (e) {
        if (img.tagName === "IMG" && img.className === "favicon") return;
        if (e.type !== "error") {
          if (byBottom === false) {
            $(this).trigger("lazyload-load");
          } else {
            $(this).trigger("lazyload-loadbybottom");
          }
        }
      });

      if (img.tagName === "IMG" && img.className !== "favicon") {
        img.src = "/img/loading.webp";
        newImg.src = img.getAttribute("data-src");
      } else if (img.tagName === "AUDIO" || img.tagName === "VIDEO") {
        img.preload = "metadata";
        img.src = img.getAttribute("data-src");
      } else {
        img.src = img.getAttribute("data-src");
      }
      img.removeAttribute("data-src");
    }

    private watch (): void {
      if (this.updateInterval === null) {
        this.updateInterval = setInterval(() => {
          if (this.scroll) {
            this.update();
            this.scroll = false;
          }
        }, LazyLoad.UPDATE_INTERVAL);
      }
    }

    private unwatch (): void {
      if (this.updateInterval !== null) {
        clearInterval(this.updateInterval);
        this.updateInterval = null;
      }
    }

    scan (): void {
      this.imgs = Array.prototype.slice.call(this.container.querySelectorAll("img[data-src], audio[data-src], video[data-src]"));
      if (this.imgs.length > 0) {
        this.update();
        this.watch();
      }
      else {
        this.unwatch();
      }
    }

    update (): void {
      var scrollTop: number, clientHeight: number;
      scrollTop = this.container.scrollTop;
      clientHeight = this.container.clientHeight;

      this.imgs = this.imgs.filter((img: HTMLElement) => {
        var top: number, current: HTMLElement;

        if (img.offsetWidth !== 0) { //imgが非表示の時はロードしない
          if (this.imgPlaceTable.has(img)) {
            top = this.imgPlaceTable.get(img);
          } else {
            top = 0;
            current = img;
            while (current !== null && current !== this.container) {
              top += current.offsetTop;
              current = <HTMLElement>current.offsetParent;
            }
            this.imgPlaceTable.set(img, top);
          }

          if (
            !(top + img.offsetHeight < scrollTop ||
            scrollTop + clientHeight < top)
          ) {
            this.load(img);
            return false;
          }
        }
        // 逆スクロール時の範囲チェック
        if (this.loaded === true && app.config.get("use_mediaviewer") === "on") {
          var bottom: number, target_height: number;

          bottom = 0;
          current = img;
          if (img.tagName === "IMG") {
            target_height = parseInt(app.config.get("image_height"));
          } else if (img.tagName === "VIDEO") {
            target_height = parseInt(app.config.get("video_height"));
          }

          while (current !== null && current !== this.container) {
            bottom += current.offsetTop;
            current = <HTMLElement>current.offsetParent;
          }
          if (bottom === 0) return true;
          bottom += target_height;

          if (
            bottom > this.container.scrollTop &&
            bottom < this.container.scrollTop + this.container.clientHeight
          ) {
            this.load(img, true);
            return false;
          }
        }
        return true;
      });

      if (this.imgs.length === 0) {
        this.unwatch();
      }
    }
  }
}
