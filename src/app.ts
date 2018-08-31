///<reference path="global.d.ts" />

type logLevel = "log" | "debug" | "info" | "warn" | "error";
var logLevels = <Set<logLevel>>new Set(["log", "debug", "info", "warn", "error"]);

export async function criticalError (message:string):Promise<void> {
  new Notification(
    "深刻なエラーが発生したのでread.crxを終了します",
    { body: `詳細 : ${message}` }
  );

  var {id} = await parent.browser.tabs.getCurrent();
  parent.browser.tabs.remove(id);
}

export function log (level:logLevel, ...data:any[]) {
  if (logLevels.has(level)) {
    console[level](...data);
  } else {
    log("error", "app.log: 引数levelが不正な値です", level);
  }
}

export function deepCopy (src:any):any {
  var copy:any, key:string;

  if (typeof src !== "object" || src === null) {
    return src;
  }

  copy = Array.isArray(src) ? [] : {};

  for (key in src) {
    copy[key] = deepCopy(src[key]);
  }

  return copy;
}

export function defer (): Promise<void> {
  return new Promise( (resolve) => {
    setTimeout(resolve, 100);
  });
}

export function wait (ms: number): Promise<void> {
  return new Promise( (resolve) => {
    setTimeout(resolve, ms);
  });
}

export function wait5s (): Promise<void> {
  return new Promise( (resolve) => {
    setTimeout(resolve, 5 * 1000);
  });
}

export function waitAF (): Promise<void> {
  return new Promise( (resolve) => {
    requestAnimationFrame(<any>resolve);
  });
}

export function assertArg (name:string, rules:[any, string, boolean|undefined][]):boolean {
  for (let [val, type, canbeNull] of rules) {
    if (
      !(canbeNull && (val === null || val === void 0)) &&
      typeof val !== type
    ) {
      log("error", `${name}: 不正な引数(予期していた型: ${type}, 受け取った型: ${typeof val})`, deepCopy(val));
      return true
    }
  }
  return false;
}

interface CallbacksConfiguration {
  persistent?: boolean;
}
export class Callbacks {
  private _config: CallbacksConfiguration;
  private _callbackStore = new Set<Function>();
  private _latestCallArg: any[]|null = null;
  wasCalled = false;

  constructor (config:CallbacksConfiguration = {}) {
    this._config = config;
  }

  add (callback:Function):void {
    if (!this._config.persistent && this._latestCallArg) {
      callback(...deepCopy(this._latestCallArg));
    } else {
      this._callbackStore.add(callback);
    }
  }

  remove (callback:Function):void {
    if (this._callbackStore.has(callback)) {
      this._callbackStore.delete(callback);
    } else {
      log("error",
        "app.Callbacks: 存在しないコールバックを削除しようとしました。");
    }
  }

  call (...arg:any[]):void {
    var callback:Function, tmpCallbackStore;

    if (!this._config.persistent && this._latestCallArg) {
      log("error",
        "app.Callbacks: persistentでないCallbacksが複数回callされました。");
    } else {
      this.wasCalled = true;

      this._latestCallArg = deepCopy(arg);

      tmpCallbackStore = new Set(this._callbackStore);

      for (callback of tmpCallbackStore) {
        if (this._callbackStore.has(callback)) {
          callback(...deepCopy(arg));
        }
      }

      if (!this._config.persistent) {
        this._callbackStore.clear();
      }
    }
  }

  destroy ():void {
    while (this._callbackStore[0]) {
      this.remove(this._callbackStore[0]);
    }
  }
}

class Message {
  private _listenerStore:Map<string, Callbacks> = new Map();
  private _bc:BroadcastChannel;

  constructor () {
    this._bc = new BroadcastChannel("readcrx");
    this._bc.on("message", ({data: {type, message}}) => {
      this._fire(type, message);
    });
  }

  private async _fire (type:string, message:any):Promise<void> {
    var message = deepCopy(message);

    await defer();
    if (this._listenerStore.has(type)) {
      this._listenerStore.get(type)!.call(message);
    }
  }

  send (type:string, message:any = {}):void {
    this._fire(type, message);
    this._bc.postMessage({type, message});
    return
  }

  on (type:string, listener:Function) {
    if (!this._listenerStore.has(type)) {
      this._listenerStore.set(type, new Callbacks({persistent: true}));
    }
    this._listenerStore.get(type)!.add(listener);
  }

  off (type:string, listener:Function) {
    if (this._listenerStore.has(type)) {
      this._listenerStore.get(type)!.remove(listener);
    }
  }
}
export var message = new Message();

class Config {
  private static _default = new Map<string, string>([
    ["layout", "pane-3"],
    ["theme_id", "default"],
    ["write_window_x", "0"],
    ["write_window_y", "0"],
    ["always_new_tab", "on"],
    ["button_change_netsc_newtab", "off"],
    ["button_change_scheme_newtab", "off"],
    ["open_all_unread_lazy", "on"],
    ["enable_link_with_res_number", "on"],
    ["bookmark_sort_save_type", "none"],
    ["dblclick_reload", "on"],
    ["auto_load_second", "0"],
    ["auto_load_second_board", "0"],
    ["auto_load_second_bookmark", "0"],
    ["auto_load_all", "off"],
    ["auto_load_move", "off"],
    ["auto_bookmark_notify", "on"],
    ["image_blur", "off"],
    ["image_blur_length", "4"],
    ["image_blur_word", ".{0,5}[^ァ-ヺ^ー]グロ(?:[^ァ-ヺ^ー].{0,5}|$)|.{0,5}死ね.{0,5}"],
    ["image_width", "150"],
    ["image_height", "100"],
    ["audio_supported", "off"],
    ["audio_supported_ogg", "off"],
    ["audio_width", "320"],
    ["video_supported", "off"],
    ["video_supported_ogg", "off"],
    ["video_controls", "on"],
    ["video_width", "360"],
    ["video_height", "240"],
    ["hover_zoom_image", "off"],
    ["zoom_ratio_image", "200"],
    ["hover_zoom_video", "off"],
    ["zoom_ratio_video", "200"],
    ["image_height_fix", "on"],
    ["delay_scroll_time", "600"],
    ["expand_short_url", "none"],
    ["expand_short_url_timeout", "3000"],
    ["aa_font", "aa"],
    ["aa_min_ratio", "40"],
    ["popup_trigger", "click"],
    ["popup_delay_time", "0"],
    ["ngwords", "Title: 5ちゃんねるへようこそ\nTitle:【新着情報】5chブラウザがやってきた！"],
    ["ngobj", "[{\"type\":\"Title\",\"word\":\"5ちゃんねるへようこそ\"},{\"type\":\"Title\",\"word\":\"【新着情報】5chぶらうざがやってきた！\"}]"],
    ["chain_ng", "off"],
    ["chain_ng_id", "off"],
    ["chain_ng_id_by_chain", "off"],
    ["chain_ng_slip", "off"],
    ["chain_ng_slip_by_chain", "off"],
    ["display_ng", "off"],
    ["nothing_id_ng", "off"],
    ["nothing_slip_ng", "off"],
    ["how_to_judgment_id", "first_res"],
    ["repeat_message_ng_count", "0"],
    ["forward_link_ng", "off"],
    ["ng_id_expire", "none"],
    ["ng_id_expire_date", "0"],
    ["ng_id_expire_day", "0"],
    ["ng_slip_expire", "none"],
    ["ng_slip_expire_date", "0"],
    ["ng_slip_expire_day", "0"],
    ["reject_ng_rep", "off"],
    ["bookmark_show_dat", "on"],
    ["default_name", ""],
    ["default_mail", ""],
    ["no_history", "off"],
    ["no_writehistory", "off"],
    ["user_css", ""],
    ["bbsmenu", "http://kita.jikkyo.org/cbm/cbm.cgi/20.p0.m0.jb.vs.op.sc.nb.bb/-all/bbsmenu.html"],
    ["bbsmenu_update_interval", "7"],
    ["useragent", ""],
    ["format_2chnet", "html"],
    ["sage_flag", "on"],
    ["mousewheel_change_tab", "on"],
    ["image_replace_dat_obj", "[]"],
    ["image_replace_dat", "^https?:\\/\\/(?:www\\.youtube\\.com\\/watch\\?(?:.+&)?v=|youtu\\.be\\/)([\\w\\-]+).*\thttps://img.youtube.com/vi/$1/default.jpg\nhttp:\\/\\/(?:www\\.)?nicovideon?\\.jp\\/(?:(?:watch|thumb)(?:_naisho)?(?:\\?v=|\\/)|\\?p=)(?!am|fz)[a-z]{2}(\\d+)\thttp://tn-skr.smilevideo.jp/smile?i=$1\n\\.(png|jpe?g|gif|bmp|webp)([\\?#:].*)?$\t.$1$2"],
    ["replace_str_txt_obj", "[]"],
    ["replace_str_txt", ""]
  ]);

  private _cache = new Map<string, string>();
  ready: Function;
  _onChanged: any;

  constructor () {
    var ready = new Callbacks();
    this.ready = ready.add.bind(ready);

    ( async () => {
      var key:string, val:any;
      var res = await browser.storage.local.get(null);
      if (this._cache !== null) {
        for ([key, val] of Object.entries(res)) {
          if (
            key.startsWith("config_") &&
            (typeof val === "string" || typeof val === "number")
          ) {
            this._cache.set(key, val.toString());
          }
        }
        ready.call();
      }
    })();

    this._onChanged = (change, area) => {
      var key:string, val:any;

      if (area !== "local") {
        return;
      }

      for ([key, val] of Object.entries(change)) {
        if (!key.startsWith("config_")) continue;
        var {newValue} = val;

        if (typeof newValue === "string") {
          this._cache.set(key, newValue);

          message.send("config_updated", {
            key: key.slice(7),
            val: newValue
          });
        } else {
          this._cache.delete(key);
        }
      }
    };

    browser.storage.onChanged.addListener(this._onChanged);
  }

  get (key:string):string|null {
    if (this._cache.has(`config_${key}`)) {
      return this._cache.get(`config_${key}`)!;
    } else if (Config._default.has(key)) {
      return Config._default.get(key)!;
    }
    return null;
  }

  //設定の連想配列をjson文字列で渡す
  getAll ():string {
    var json = {};
    for(var [key, val] of Config._default) {
      json[`config_${key}`] = val;
    }
    for(var [key, val] of this._cache) {
      json[key] = val;
    }
    return JSON.stringify(json);
  }

  isOn (key:string):boolean {
    return this.get(key) === "on";
  }

  async set (key:string, val:string): Promise<void> {
    var tmp = {};

    if (
      typeof key !== "string" ||
      !(typeof val === "string" || typeof val === "number")
    ) {
      log("error", "app.Config::setに不適切な値が渡されました",
        arguments);
      throw new Error("app.Config::setに不適切な値が渡されました");
    }

    tmp[`config_${key}`] = val;

    await browser.storage.local.set(tmp)
  }

  async del (key:string): Promise<void> {
    if (typeof key !== "string") {
      log("error", "app.Config::delにstring以外の値が渡されました",
        arguments);
      throw new Error("app.Config::delにstring以外の値が渡されました");
    }

    await browser.storage.local.remove(`config_${key}`)
  }

  destroy ():void {
    this._cache.clear();
    browser.storage.onChanged.removeListener(this._onChanged);
  }
}

export var config: Config;
if (!frameElement) {
  config = new Config();
}

export function replaceAll (str:string, before:string, after:string): string {
  var i = str.indexOf(before);
  if (i === -1) return str;
  var result = str.slice(0, i) + after;
  var j = str.indexOf(before, i+before.length);
  while (j !== -1) {
    result += str.slice(i+before.length, j) + after;
    i = j;
    j = str.indexOf(before, i+before.length);
  }
  return result + str.slice(i+before.length);
}

export function escapeHtml (str:string):string {
  return replaceAll(
    replaceAll(
      replaceAll(
        replaceAll(
          replaceAll(str, "&", "&amp;")
        , "<", "&lt;")
      , ">", "&gt;")
    , '"', "&quot;")
  , "'", "&apos;");
}

export function safeHref (url:string):string {
  return /^https?:\/\//.test(url) ? url : "/view/empty.html";
}

export var manifest = (async () => {
  if (/^(?:chrome|moz)-extension:\/\//.test(location.origin)) {
    try {
      let response = await fetch("/manifest.json");
      return await response.json();
    } catch (e) {}
  }
  throw new Error("manifest.jsonの取得に失敗しました");
})();

export function clipboardWrite (str:string):void {
  var $textarea:HTMLTextAreaElement;

  $textarea = $__("textarea");
  $textarea.value = str;
  document.body.addLast($textarea);
  $textarea.select();
  document.execCommand("copy");
  $textarea.remove();
}

export async function boot (path:string, requirements, fn): Promise<void> {
  var htmlVersion:string;

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
    htmlVersion = document.documentElement.dataset.appVersion!;
    if ((await manifest).version !== htmlVersion) {
      location.reload(true);
    } else {
      let onload = () => {
        config.ready( () => {
          if (requirements) {
            let modules: any[] = [];
            for (let module of <string[]>requirements) {
              modules.push(parent.app[module]);
            }
            fn(...modules);
          } else {
            fn();
          }
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
}
