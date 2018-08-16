///<reference path="../global.d.ts" />
///<reference path="../app.ts" />

namespace UI {
  type HTMLMediaElement = HTMLImageElement | HTMLAudioElement | HTMLVideoElement;

  export class LazyLoad {
    container: HTMLElement;
    private observer: IntersectionObserver;
    private medias: HTMLMediaElement[] = [];
    private pause: boolean = false;
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

      this.observer = new IntersectionObserver(this.onChange.bind(this), {root: this.container, rootMargin: "10px"})
      this.container.on("scrollstart", this.onScrollStart.bind(this));
      this.container.on("scrollfinish", this.onScrollFinish.bind(this));
      this.container.on("searchstart", this.onSearchStart.bind(this));
      this.container.on("searchfinish", this.onSearchFinish.bind(this));
      this.container.on("immediateload", this.onImmediateLoad.bind(this));
      this.scan();
    }

    private onChange(changes): void {
      var change;

      if (this.pause) return;

      for (change of changes) {
        if (change.isIntersecting) {
          this.load(change.target);
        }
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

    private onSearchFinish(): void {
      this.pause = false;
    }

    private onImmediateLoad (e): void {
      this.immediateLoad(e.target);
    }

    public immediateLoad (media: HTMLMediaElement): void {
      if (media.tagName === "IMG" || media.tagName === "VIDEO") {
        if (media.dataset.src === undefined) return;
        this.load(media);
      }
    }

    private async load ($media: HTMLMediaElement): Promise<void> {
      var $newImg: HTMLImageElement, attrs: Attr[];
      var imgFlg: boolean = ($media.tagName === "IMG");
      var faviconFlg: boolean = $media.hasClass("favicon");

      // immediateLoadにて処理済みのものを除外する
      if ($media.dataset.src === undefined) return;

      $newImg = $__("img");

      if (imgFlg && !faviconFlg) {
        attrs = <Attr[]>Array.from($media.attributes);
        for (var {name, value} of attrs) {
          if (!this.noNeedAttrs.includes(name)) {
            $newImg.setAttr(name, value);
          }
        }
      }

      var load = function (this:HTMLImageElement, e) {
        $newImg.off("load", load);
        $newImg.off("error", load);
        $media.parent().replaceChild(this, $media);

        if (e.type === "load") {
          UI.Animate.fadeIn(this);
        }
      };
      $newImg.on("load", load);
      $newImg.on("error", load);

      var loadmetadata = function (this: HTMLMediaElement, e) {
        if (imgFlg && (faviconFlg || $media.hasClass("loading"))) {
          return;
        }
        $media.off("loadedmetadata", loadmetadata);
        $media.off("error", loadmetadata);
      };
      $media.on("loadedmetadata", loadmetadata);
      $media.on("error", loadmetadata);

      var mdata = $media.dataset;
      if (imgFlg && !faviconFlg) {
        $media.src = "/img/loading.webp";
        switch (mdata.type) {
          case "default":
            $newImg.src = mdata.src!;
            break;
          case "referrer":
            $newImg.src = this.getWithReferrer(mdata.src!, mdata.referrer!, mdata.userAgent!);
            break;
          case "extract":
            try {
              $newImg.src = await this.getWithExtract(mdata.src!, mdata.extract!, mdata.pattern!, mdata.extractReferrer!, mdata.userAgent!);
            } catch (e) {
              $newImg.src = "";
            }
            break;
          case "cookie":
            try {
              $newImg.src = await this.getWithCookie(mdata.src!, mdata.cookie!, mdata.cookieReferrer!, mdata.userAgent!);
            } catch (e) {
              $newImg.src = "";
            }
            break;
          default: $newImg.src = mdata.src!;
        }
      } else {
        $media.src = $media.dataset.src!;
      }
      $media.removeAttr("data-src");
      this.observer.unobserve($media);
    }

    scan (): void {
      var media;
      this.medias = <HTMLMediaElement[]>Array.from(this.container.$$("img[data-src], audio[data-src], video[data-src]"));
      for (media of this.medias) {
        this.observer.observe(media);
      }
    }

    private getWithReferrer (link: string, referrer: string, userAgent: string, cookie: string = ""): string {
      //TODO: use chrome.webRequest, chrome.cookies
      //if(referrer !== ""){ req.setRequestHeader("Referer", referrer); }
      //if(userAgent !== ""){ req.setRequestHeader("User-Agent", userAgent); }
      //if(cookie !== ""){ req.setRequestHeader("Set-Cookie", cookie); }
      return link;
    }

    private async getWithCookie (link: string, cookieLink: string, referrer: string, userAgent: string): Promise<string> {
      var req = new app.HTTP.Request("GET", cookieLink)
      //TODO: use chrome.webRequest
      //if(referrer !== ""){ req.headers["Referer"] = referrer); }
      //if(userAgent !== ""){ req.headers["User-Agent"] = userAgent; }
      try {
        var res = await req.send();
        if (res.status === 200) {
          var cookie = res.headers["Set-Cookie"];
          return this.getWithReferrer(link, "", userAgent, cookie);
        }
      } catch (e) {}
      throw new Error("通信に失敗しました");
    }

    private async getWithExtract (link: string, extractLink: string, pattern: string, referrer: string, userAgent: string): Promise<string> {
      var req = new app.HTTP.Request("GET", extractLink)
      //TODO: use chrome.webRequest
      //if(referrer !== ""){ req.headers["Referer"] = referrer); }
      //if(userAgent !== ""){ req.headers["User-Agent"] = userAgent; }
      try {
        var res = await req.send();
        if (res.status === 200) {
          var m = res.body.match(new RegExp(pattern));
          if (m !== null) {
            return link.replace(/\$EXTRACT(\d+)?/g, (str, n) => {
              return (n === null) ? m![1] : m![n];
            });
          }
        }
      } catch (e) {}
      throw new Error("通信に失敗しました");
    }
  }
}
