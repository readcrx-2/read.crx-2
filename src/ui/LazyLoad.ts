///<reference path="../global.d.ts" />

namespace UI {
  "use strict";

  export class LazyLoad {
    static UPDATE_INTERVAL = 200;

    container: HTMLElement;
    private scroll = false;
    private imgs: HTMLImageElement[] = [];
    private imgPlaceTable = new Map<HTMLImageElement, number>();
    private updateInterval: number = null;

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

    public immediateLoad (img: HTMLImageElement): void {
      if (img.getAttribute("data-src") === null) return;
      this.load(img);
    }

    private load (img: HTMLImageElement): void {
      var newImg: HTMLImageElement, attr: Attr, attrs: Attr[];

      newImg = document.createElement("img");

      attrs = Array.from(img.attributes)
      for (attr of attrs) {
        if (attr.name !== "data-src") {
          newImg.setAttribute(attr.name, attr.value);
        }
      }

      $(newImg).one("load error", function (e) {
        $(img).replaceWith(this);

        if (e.type === "load") {
          $(this).trigger("lazyload-load");
          UI.Animate.fadeIn(this);
        }
      });

      newImg.src = img.getAttribute("data-src");
      img.removeAttribute("data-src");
      img.src = "/img/loading.webp";
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

    update (): void {
      var scrollTop: number, clientHeight: number;
      scrollTop = this.container.scrollTop;
      clientHeight = this.container.clientHeight;

      this.imgs = this.imgs.filter((img: HTMLImageElement) => {
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
        return true;
      });

      if (this.imgs.length === 0) {
        this.unwatch();
      }
    }
  }
}
