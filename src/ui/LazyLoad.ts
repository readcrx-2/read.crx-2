///<reference path="../../typings/globals/jquery/index.d.ts" />

namespace UI {
  "use strict";

  export class LazyLoad {
    static UPDATE_INTERVAL = 200;

    container: HTMLElement;
    private scroll = false;
    private imgs: HTMLImageElement[] = [];
    private updateInterval: number = null;

    constructor (container: HTMLElement) {
      this.container = container;

      $(this.container).on("scroll", this.onScroll.bind(this));
      this.scan();
    }

    private onScroll (): void {
      this.scroll = true;
    }

    public immediateLoad (img: HTMLImageElement): void {
      if (img.getAttribute("data-src") === null) return;
      this.load(img);
    }

    private load (img: HTMLImageElement): void {
      var newImg: HTMLImageElement, attrIndex: number, attr: Attr;

      newImg = document.createElement("img");

      for (attrIndex = 0; attr = img.attributes[attrIndex]; attrIndex++) {
        if (attr.name !== "data-src") {
          newImg.setAttribute(attr.name, attr.value);
        }
      }

      $(newImg).one("load error", function (e) {
        $(img).replaceWith(this);

        if (e.type === "load") {
          $(this).trigger("lazyload-load").addClass("fade");
          var _this = this;
          setTimeout(function(){
            _this.classList.add("fadeIn")
          }, 0);
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
      this.imgs = this.imgs.filter((img: HTMLImageElement) => {
        var top: number, current: HTMLElement;

        if (img.offsetWidth !== 0) { //imgが非表示の時はロードしない
          top = 0;
          current = img;

          while (current !== null && current !== this.container) {
            top += current.offsetTop;
            current = <HTMLElement>current.offsetParent;
          }

          if (
            !(top + img.offsetHeight < this.container.scrollTop ||
            this.container.scrollTop + this.container.clientHeight < top)
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
