///<reference path="global.d.ts" />
import Config from "./app/Config";

export {default as Callbacks} from "./app/Callbacks";
export * from "./app/Defer";
export * from "./app/Log";
export {default as message} from "./app/Message";
export * from "./app/Util";

export let config: Config;
if (!frameElement) {
  config = new Config();
}

export const manifest = (async () => {
  if (!/^(?:chrome|moz)-extension:\/\//.test(location.origin)) {
    throw new Error("manifest.jsonの取得に失敗しました");
  }
  try {
    const response = await fetch("/manifest.json");
    return await response.json();
  } catch {}
})();

export async function boot(path: string, requirements, fn) {
  if (!fn) {
    fn = requirements;
    requirements = null;
  }

  // Chromeがiframeのsrcと無関係な内容を読み込むバグへの対応
  if (
    frameElement &&
    (<HTMLIFrameElement>frameElement).src !== location.href
  ) {
    location.href = (<HTMLIFrameElement>frameElement).src;
    return;
  }

  if (location.pathname === path) {
    const htmlVersion = document.documentElement.dataset.appVersion!;
    if ((await manifest).version !== htmlVersion) {
      location.reload(true);
      return;
    }

    const onload = () => {
      config.ready( () => {
        if (!requirements) {
          fn();
          return;
        }

        const modules: any[] = [];
        for (const module of <string[]>requirements) {
          modules.push(parent.app[module]);
        }
        fn(...modules);
      });
    };

    // async関数のためDOMContentLoadedに間に合わないことがある
    if (document.readyState === "loading") {
      document.on("DOMContentLoaded", onload);
    } else {
      onload();
    }
  }
}
