///<reference path="../global.d.ts" />
///<reference path="../app.ts" />
///<reference path="../core/HTTP.ts" />

namespace UI {
  "use strict";

  interface MediaPosition {
    top: number;
    offsetHeight: number;
  }
  type HTMLMediaElement = HTMLImageElement | HTMLAudioElement | HTMLVideoElement;

  export class LazyLoad {
    static UPDATE_INTERVAL = 200;

    container: HTMLElement;
    private scroll = false;
    private medias: HTMLMediaElement[] = [];
    private mediaPlaceTable = new Map<HTMLMediaElement, MediaPosition>();
    private updateInterval: number = null;
    private pause: boolean = false;
    private lastScrollTop: number = -1;
    private noNeedAttrs: string[] = [
      "data-src",
      "data-type",
      "data-extract",
      "data-extract-referrer",
      "data-pattern",
      "data-cookie",
      "data-cookie-referrer",
      "data-referrer",
      "data-user-agent"
    ];

    constructor (container: HTMLElement) {
      this.container = container;

      this.container.on("scroll", this.onScroll.bind(this));
      this.container.on("resize", this.onResize.bind(this));
      this.container.on("scrollstart", this.onScrollStart.bind(this));
      this.container.on("scrollfinish", this.onScrollFinish.bind(this));
      this.container.on("searchstart", this.onSearchStart.bind(this));
      this.container.on("searchfinish", this.onSearchFinish.bind(this));
      this.container.on("immediateload", this.onImmediateLoad.bind(this));
      this.scan();
    }

    private onScroll (): void {
      this.scroll = true;
    }

    private onResize (): void {
      this.mediaPlaceTable.clear();
    }

    public immediateLoad (media: HTMLMediaElement): void {
      if (media.tagName === "IMG" || media.tagName === "VIDEO") {
        if (media.dataset.src === null) return;
        this.load(media);
      }
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
      this.mediaPlaceTable.clear();
      this.pause = false;
    }

    private onImmediateLoad (e): void {
      this.immediateLoad(e.target);
    }

    private load (media: HTMLMediaElement, reverse: boolean = false): void {
      var newImg: HTMLImageElement, attr: Attr, attrs: Attr[];
      var imgFlg: boolean = (media.tagName === "IMG");
      var faviconFlg: boolean = media.hasClass("favicon");

      // immediateLoadにて処理済みのものを除外する
      if (media.dataset.src === null) return;

      newImg = $__("img");

      if (imgFlg && !faviconFlg) {
        attrs = <Attr[]>Array.from(media.attributes);
        for (attr of attrs) {
          if (!this.noNeedAttrs.includes(attr.name)) {
            newImg.setAttr(attr.name, attr.value);
          }
        }
      }

      $(newImg).one("load error", function (e) {
        media.parent().replaceChild(this, media);

        if (e.type === "load") {
          if (reverse === false) {
            this.dispatchEvent(new CustomEvent("lazyload-load"));
          } else {
            this.dispatchEvent(new CustomEvent("lazyload-load-reverse"));
          }
          UI.Animate.fadeIn(this);
        }
      });
      $(media).one("loadedmetadata error", function (e) {
        if (imgFlg && (faviconFlg || media.hasClass("loading"))) {
          return;
        }
        if (e.type !== "error") {
          if (reverse === false) {
            this.dispatchEvent(new CustomEvent("lazyload-load"));
          } else {
            this.dispatchEvent(new CustomEvent("lazyload-load-reverse"));
          }
        }
      });

      var mdata = media.dataset;
      if (imgFlg && !faviconFlg) {
        media.src = "/img/loading.webp";
        switch (mdata.type) {
          case "default":
            newImg.src = mdata.src;
            break;
          case "referrer":
            newImg.src = this.getWithReferrer(mdata.src, mdata.referrer, mdata.userAgent);
            break;
          case "extract":
            this.getWithExtract(mdata.src, mdata.extract, mdata.pattern, mdata.extractReferrer, mdata.userAgent).then( (imgstr) => {
              newImg.src = imgstr;
            }).catch( () => {
              newImg.src = "";
            });
            break;
          case "cookie":
            this.getWithCookie(mdata.src, mdata.cookie, mdata.cookieReferrer, mdata.userAgent).then( (imgstr) => {
              newImg.src = imgstr;
            }).catch( () => {
              newImg.src = "";
            });
            break;
          default: newImg.src = mdata.src;
        }
      } else {
        media.src = mdata.src;
      }
      media.removeAttr("data-src");
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
      this.medias = <HTMLMediaElement[]>Array.from(this.container.$$("img[data-src], audio[data-src], video[data-src]"));
      if (this.medias.length > 0) {
        this.update();
        this.watch();
      }
      else {
        this.unwatch();
      }
    }

    private getMediaPosition (media: HTMLMediaElement): MediaPosition {
      var current: HTMLElement;
      var pos: MediaPosition = {top: 0, offsetHeight: 0};

      // 高さが固定の場合のみテーブルの値を使用する
      if (
        app.config.get("image_height_fix") === "on" &&
        this.mediaPlaceTable.has(media)
      ) {
        pos = this.mediaPlaceTable.get(media);
      } else {
        pos.top = 0;
        current = media;
        while (current !== null && current !== this.container) {
          pos.top += current.offsetTop;
          current = <HTMLElement>current.offsetParent;
        }
        pos.offsetHeight = media.offsetHeight;
        this.mediaPlaceTable.set(media, pos);
      }
      return pos;
    }

    private getWithReferrer (link: string, referrer: string, userAgent: string, cookie: string = ""): string {
      //TODO: use chrome.webRequest, chrome.cookies
      //if(referrer !== ""){ req.setRequestHeader("Referer", referrer); }
      //if(userAgent !== ""){ req.setRequestHeader("User-Agent", userAgent); }
      //if(cookie !== ""){ req.setRequestHeader("Set-Cookie", cookie); }
      return link;
    }

    private getWithCookie (link: string, cookieLink: string, referrer: string, userAgent: string): Promise<string> {
      return new Promise( (resolve, reject) => {
        var req = new app.HTTP.Request("GET", cookieLink)
        //TODO: use chrome.webRequest
        //if(referrer !== ""){ req.headers["Referer"] = referrer); }
        //if(userAgent !== ""){ req.headers["User-Agent"] = userAgent; }
        req.send( (res) => {
          if (res.status === 200) {
            var cookie = res.headers["Set-Cookie"];
            resolve(this.getWithReferrer(link, "", userAgent, cookie));
          } else {
            reject();
          }
        });
      });
    }

    private getWithExtract (link: string, extractLink: string, pattern: string, referrer: string, userAgent: string): Promise<string> {
      return new Promise( (resolve, reject) => {
        var req = new app.HTTP.Request("GET", extractLink)
        //TODO: use chrome.webRequest
        //if(referrer !== ""){ req.headers["Referer"] = referrer); }
        //if(userAgent !== ""){ req.headers["User-Agent"] = userAgent; }
        req.send( (res) => {
          if (res.status === 200) {
            var m = res.body.match(new RegExp(pattern));
            if (m !== null) {
              var replaced = link.replace(/\$EXTRACT(\d+)?/g, (str, n) => {
                return (n === null) ? m[1] : m[n];
              });
              resolve(replaced);
            } else {
              reject();
            }
          } else {
            reject();
          }
        });
      });
    }

    update (): void {
      var scrollTop: number, clientHeight: number, reverseMode: boolean = false;
      var pos: MediaPosition;

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

      this.medias = this.medias.filter( (media: HTMLMediaElement) => {

        // 逆スクロール時の範囲チェック(lazyload-load-reverseを優先させるため先に実行)
        if (reverseMode === true) {
          var bottom: number, targetHeight: number;

          targetHeight = 0;
          switch (media.tagName) {
            case "IMG":
              targetHeight = parseInt(app.config.get("image_height"));
              break;
            case "VIDEO":
              targetHeight = parseInt(app.config.get("video_height"));
              break;
          }

          pos = this.getMediaPosition(media);
          if (pos.top === 0) return true;
          bottom = pos.top + targetHeight;

          if (
            bottom > this.container.scrollTop &&
            bottom < this.container.scrollTop + this.container.clientHeight
          ) {
            this.load(media, true);
            return false;
          }
        }

        if (media.offsetWidth !== 0) {  //imgが非表示の時はロードしない
          pos = this.getMediaPosition(media);

          if (
            !(pos.top + pos.offsetHeight < scrollTop ||
            scrollTop + clientHeight < pos.top)
          ) {
            this.load(media);
            return false;
          }
        }
        return true;
      });

      if (this.medias.length === 0) {
        this.unwatch();
      }
    }
  }
}
