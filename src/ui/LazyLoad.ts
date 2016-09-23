///<reference path="../global.d.ts" />
///<reference path="../app.ts" />

namespace UI {
  "use strict";

  interface ImagePosition {
    top: number;
    offsetHeight: number;
  }

  export class LazyLoad {
    static UPDATE_INTERVAL = 200;

    container: HTMLElement;
    private scroll = false;
    private imgs: HTMLImageElement[] = [];
    private imgPlaceTable = new Map<HTMLImageElement, ImagePosition>();
    private updateInterval: number = null;
    private pause: boolean = false;
    private lastScrollTop: number = -1;

    constructor (container: HTMLElement) {
      this.container = container;

      $(this.container).on("scroll", this.onScroll.bind(this));
      $(this.container).on("resize", this.onResize.bind(this));
      $(this.container).on("scrollstart", this.onScrollStart.bind(this));
      $(this.container).on("scrollfinish", this.onScrollFinish.bind(this));
      $(this.container).on("searchstart", this.onSearchStart.bind(this));
      $(this.container).on("searchfinish", this.onSearchFinish.bind(this));
      $(this.container).on("immediateload", "img", this.onImmediateLoad.bind(this));
      this.scan();
    }

    private onScroll (): void {
      this.scroll = true;
    }

    private onResize (): void {
      this.imgPlaceTable.clear();
    }

    public immediateLoad (img: HTMLImageElement): void {
      if (img.getAttribute("data-src") === null) return;
      this.load(img);
    }

    // スクロール中に無駄な画像ロードが発生するのを防止する
    private onScrollStart(): void {
      this.pause = true;
    }

    private onScrollFinish(): void {
      this.pause = false;
    }

    // 検索中に無駄な画像ロードが発生するのを防止する
    private onSearchStart(): void {
      this.pause = true;
    }

    // 検索による表示位置の変更に対応するため、テーブルをクリアしてから再開する
    private onSearchFinish(): void {
      this.imgPlaceTable.clear();
      this.pause = false;
    }

    private onImmediateLoad (e): void {
      this.immediateLoad(e.target);
    }

    private load (img: HTMLImageElement, reverse: boolean = false): void {
      var newImg: HTMLImageElement, attr: Attr, attrs: Attr[];
      // immediateLoadにて処理済みのものを除外する
      if (img.getAttribute("data-src") === null) return;

      newImg = document.createElement("img");

      if (!img.classList.contains("favicon")) {
        attrs = <Attr[]>Array.from(img.attributes)
        for (attr of attrs) {
          if (attr.name !== "data-src") {
            newImg.setAttribute(attr.name, attr.value);
          }
        }
      }

      $(newImg).one("load error", function (e) {
        $(img).replaceWith(this);

        if (e.type === "load") {
          if (reverse === false) {
            $(this).trigger("lazyload-load");
          } else {
            $(this).trigger("lazyload-load-reverse");
          }
          UI.Animate.fadeIn(this);
        }
      });

      if (!img.classList.contains("favicon")) {
        img.src = "/img/loading.webp";
        newImg.src = img.getAttribute("data-src");
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
      this.imgs = Array.prototype.slice.call(this.container.querySelectorAll("img[data-src]"));
      if (this.imgs.length > 0) {
        this.update();
        this.watch();
      }
      else {
        this.unwatch();
      }
    }

    private getImagePosition (img: HTMLImageElement): ImagePosition {
      var current: HTMLImageElement;
      var pos: ImagePosition = {top: 0, offsetHeight: 0};

      // 高さが固定の場合のみテーブルの値を使用する
      if (
        app.config.get("image_height_fix") === "on" &&
        this.imgPlaceTable.has(img)
      ) {
        pos = this.imgPlaceTable.get(img);
      } else {
        pos.top = 0;
        current = img;
        while (current !== null && current !== this.container) {
          pos.top += current.offsetTop;
          current = <HTMLImageElement>current.offsetParent;
        }
        pos.offsetHeight = img.offsetHeight;
        this.imgPlaceTable.set(img, pos);
      }
      return pos;
    }

    update (): void {
      var scrollTop: number, clientHeight: number, reverseMode: boolean = false;
      var pos: ImagePosition;

      scrollTop = this.container.scrollTop;
      clientHeight = this.container.clientHeight;
      if (this.pause === true) return;
      if (
        scrollTop < this.lastScrollTop &&
        scrollTop > this.lastScrollTop - clientHeight
      ) {
        reverseMode = true;
      }
      this.lastScrollTop = scrollTop;

      this.imgs = this.imgs.filter((img: HTMLImageElement) => {

        // 逆スクロール時の範囲チェック(lazyload-load-reverseを優先させるため先に実行)
        if (reverseMode === true) {
          var bottom: number, targetHeight: number;

          targetHeight = parseInt(app.config.get("image_height"));

          pos = this.getImagePosition(img);
          if (pos.top === 0) return true;
          bottom = pos.top + targetHeight;

          if (
            bottom > this.container.scrollTop &&
            bottom < this.container.scrollTop + this.container.clientHeight
          ) {
            this.load(img, true);
            return false;
          }
        }

        if (img.offsetWidth !== 0) { //imgが非表示の時はロードしない
          pos = this.getImagePosition(img);

          if (
            !(pos.top + pos.offsetHeight < scrollTop ||
            scrollTop + clientHeight < pos.top)
          ) {
            this.load(img);
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
