// @ts-ignore
import { fadeIn } from "./Animate.js";

type HTMLAudioVisualElement =
  | HTMLImageElement
  | HTMLAudioElement
  | HTMLVideoElement;

export default class LazyLoad {
  private readonly container: HTMLElement;
  isManualLoad = false;
  private readonly observer?: IntersectionObserver;
  private medias: HTMLAudioVisualElement[] = [];
  private pause = false;
  private readonly noNeedAttrs: ReadonlySet<string> = new Set([
    "data-src",
    "data-type",
    "data-extract",
    "data-extract-referrer",
    "data-pattern",
    "data-cookie",
    "data-cookie-referrer",
    "data-referrer",
    "data-user-agent",
  ]);

  constructor(container: HTMLElement) {
    this.container = container;
    this.isManualLoad = app.config.isOn("manual_image_load");

    if (this.isManualLoad) return;

    this.observer = new IntersectionObserver(this.onChange.bind(this), {
      root: this.container,
      rootMargin: "10px",
    });
    this.container.on("scrollstart", this.onScrollStart.bind(this));
    this.container.on("scrollfinish", this.onScrollFinish.bind(this));
    this.container.on("searchstart", this.onSearchStart.bind(this));
    this.container.on("searchfinish", this.onSearchFinish.bind(this));
    this.container.on("immediateload", this.onImmediateLoad.bind(this));
    this.scan();
  }

  private onChange(changes: any) {
    if (this.pause) return;

    for (const change of changes) {
      if (change.isIntersecting) {
        this.load(change.target);
      }
    }
  }

  // スクロール中に無駄な画像ロードが発生するのを防止する
  private onScrollStart() {
    this.pause = true;
  }

  private onScrollFinish() {
    this.pause = false;
  }

  // 検索中に無駄な画像ロードが発生するのを防止する
  private onSearchStart() {
    this.pause = true;
  }

  private onSearchFinish() {
    this.pause = false;
  }

  private onImmediateLoad(e: any) {
    this.immediateLoad(e.target);
  }

  public immediateLoad(media: HTMLAudioVisualElement) {
    if (media.tagName === "IMG" || media.tagName === "VIDEO") {
      if (media.dataset.src === undefined) return;
      this.load(media);
    }
  }

  private async load($media: HTMLAudioVisualElement) {
    const imgFlg = $media.tagName === "IMG";
    const faviconFlg = $media.hasClass("favicon");

    // immediateLoadにて処理済みのものを除外する
    if ($media.dataset.src === undefined) return;

    const $newImg = <HTMLImageElement>$__("img");

    if (imgFlg && !faviconFlg) {
      const attrs = <Attr[]>Array.from($media.attributes);
      for (const { name, value } of attrs) {
        if (!this.noNeedAttrs.has(name)) {
          $newImg.setAttr(name, value);
        }
      }
    }

    const load = ({
      type,
      currentTarget,
    }: {
      type: string;
      currentTarget: HTMLAudioVisualElement;
    }) => {
      $newImg.off("load", load);
      $newImg.off("error", load);
      $media.parent().replaceChild(currentTarget, $media);

      if (type === "load") {
        fadeIn(currentTarget);
      }
    };
    $newImg.on("load", load);
    $newImg.on("error", load);

    const loadmetadata = () => {
      if (imgFlg && (faviconFlg || $media.hasClass("loading"))) {
        return;
      }
      $media.off("loadedmetadata", loadmetadata);
      $media.off("error", loadmetadata);
    };
    $media.on("loadedmetadata", loadmetadata);
    $media.on("error", loadmetadata);

    const mdata = $media.dataset;
    if (imgFlg && !faviconFlg) {
      $media.src = "/img/loading.&[IMG_EXT]";
      switch (mdata.type) {
        case "default":
          $newImg.src = mdata.src!;
          break;
        case "referrer":
          $newImg.src = this.getWithReferrer(
            mdata.src!,
            mdata.referrer!,
            mdata.userAgent!
          );
          break;
        case "extract":
          try {
            $newImg.src = await this.getWithExtract(
              mdata.src!,
              mdata.extract!,
              mdata.pattern!,
              mdata.extractReferrer!,
              mdata.userAgent!
            );
          } catch {
            $newImg.src = "";
          }
          break;
        case "cookie":
          try {
            $newImg.src = await this.getWithCookie(
              mdata.src!,
              mdata.cookie!,
              mdata.cookieReferrer!,
              mdata.userAgent!
            );
          } catch {
            $newImg.src = "";
          }
          break;
        default:
          $newImg.src = mdata.src!;
      }
    } else {
      $media.src = $media.dataset.src!;
    }
    $media.removeAttr("data-src");
    if (!this.isManualLoad) {
      this.observer?.unobserve($media);
    }
  }

  scan(): void {
    this.medias = <HTMLAudioVisualElement[]>(
      Array.from(
        this.container.$$("img[data-src], audio[data-src], video[data-src]")
      )
    );
    for (const media of this.medias) {
      this.observer?.observe(media);
    }
  }

  private getWithReferrer(
    link: string,
    referrer: string,
    userAgent: string,
    cookie = ""
  ): string {
    //TODO: use browser.webRequest, browser.cookies
    //if(referrer !== ""){ req.setRequestHeader("Referer", referrer); }
    //if(userAgent !== ""){ req.setRequestHeader("User-Agent", userAgent); }
    //if(cookie !== ""){ req.setRequestHeader("Set-Cookie", cookie); }
    return link;
  }

  private async getWithCookie(
    link: string,
    cookieLink: string,
    referrer: string,
    userAgent: string
  ): Promise<string> {
    const req = new app.HTTP.Request("GET", cookieLink);
    //TODO: use browser.webRequest
    //if(referrer !== ""){ req.headers["Referer"] = referrer); }
    //if(userAgent !== ""){ req.headers["User-Agent"] = userAgent; }
    try {
      const res = await req.send();
      if (res.status === 200) {
        const cookie = res.headers["Set-Cookie"];
        return this.getWithReferrer(link, "", userAgent, cookie);
      }
    } catch {}
    throw new Error("通信に失敗しました");
  }

  private async getWithExtract(
    link: string,
    extractLink: string,
    pattern: string,
    referrer: string,
    userAgent: string
  ): Promise<string> {
    const req = new app.HTTP.Request("GET", extractLink);
    //TODO: use browser.webRequest
    //if(referrer !== ""){ req.headers["Referer"] = referrer); }
    //if(userAgent !== ""){ req.headers["User-Agent"] = userAgent; }
    try {
      const res = await req.send();
      if (res.status === 200) {
        const m = res.body.match(new RegExp(pattern));
        if (m !== null) {
          return link.replace(/\$EXTRACT(\d+)?/g, (str, n) => {
            return n === null ? m![1] : m![n];
          });
        }
      }
    } catch {}
    throw new Error("通信に失敗しました");
  }
}
