///<reference path="global.d.ts" />

namespace app {
  "use strict";

  var logLevels = ["log", "debug", "info", "warn", "error"];

  export function criticalError (message:string):void {
    new Notification(
      "深刻なエラーが発生したのでread.crxを終了します",
      {
        body: `詳細 : ${message}`
      }
    )

    parent.chrome.tabs.getCurrent( (tab): void => {
      parent.chrome.tabs.remove(tab.id);
    });
  }

  export function log (level:string, ...data:any[]) {
    if (logLevels.includes(level)) {
      console[level](...data);
    }
    else {
      log("error", "app.log: 引数levelが不正な値です", arguments);
    }
  }

  export function deepCopy (src:any):any {
    var copy:any, key:string;

    if (typeof src !== "object" || src === null) {
      return src;
    }

    if (Array.isArray(src)) {
      copy = [];
    }
    else {
      copy = {};
    }

    for (key in src) {
      copy[key] = deepCopy(src[key]);
    }

    return copy;
  }

  export function defer (fn:Function):void {
    requestIdleCallback(fn);
  }

  export function assertArg (name:string, rule:string[], arg:any[]):boolean {
    var key:number, val:any;

    for ([key, val] of rule.entries()) {
      if (typeof arg[key] !== val) {
        log("error", `${name}: 不正な引数`, deepCopy(arg));
        return true;
      }
    }

    return false;
  }

  export interface CallbacksConfiguration {
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
      }
      else {
        this._callbackStore.add(callback);
      }
    }

    remove (callback:Function):void {
      if (this._callbackStore.has(callback)) {
        this._callbackStore.delete(callback);
      }
      else {
        log("error",
          "app.Callbacks: 存在しないコールバックを削除しようとしました。");
      }
    }

    call (...arg:any[]):void {
      var callback:Function, tmpCallbackStore;

      if (!this._config.persistent && this._latestCallArg) {
        app.log("error",
          "app.Callbacks: persistentでないCallbacksが複数回callされました。");
      }
      else {
        this.wasCalled = true;

        this._latestCallArg = deepCopy(arg);

        tmpCallbackStore = new Set(this._callbackStore.keys());

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

  export class Message {
    private _listenerStore:{[index:string]:Callbacks;} = {};

    constructor () {
      window.addEventListener("message", (e:MessageEvent) => {
        if (e.origin !== location.origin) return;

        var data, iframes, iframe:HTMLIFrameElement;

        if (typeof e.data === "string") {
          try {
            data = JSON.parse(e.data);
          }
          catch (e) {
          }
        }
        else {
          data = e.data;
        }

        if (typeof data !== "object" || data.type !== "app.message") {
          return;
        }

        if (data.propagation !== false) {
          iframes = Array.from(document.getElementsByTagName("iframe"));

          // parentから伝わってきた場合はiframeにも伝える
          if (e.source === parent) {
            for (iframe of iframes) {
              iframe.contentWindow.postMessage(e.data, location.origin);
            }
          }
          // iframeから伝わってきた場合は、parentと他のiframeにも伝える
          else {
            if (parent !== window) {
              parent.postMessage(e.data, location.origin);
            }

            for (iframe of iframes) {
              if (iframe.contentWindow === e.source) continue;
              iframe.contentWindow.postMessage(e.data, location.origin);
            }
          }
        }

        this._fire(data.message_type, data.message);
      });
    }

    private _fire (type:string, message:any):void {
      var message = deepCopy(message);

      defer(() => {
        if (this._listenerStore[type]) {
          this._listenerStore[type].call(message);
        }
      });
    }

    send (type:string, message:any, targetWindow?:Window):void {
      var data: Object, iframes, iframe:HTMLIFrameElement;

      data = {
        type: "app.message",
        message_type: type,
        message: message,
        propagation: !targetWindow
      };

      if (targetWindow) {
        targetWindow.postMessage(data, location.origin);
      }
      else {
        if (parent !== window) {
          parent.postMessage(data, location.origin);
        }

        iframes = Array.from(document.getElementsByTagName("iframe"));
        for (iframe of iframes) {
          iframe.contentWindow.postMessage(data, location.origin);
        }
        this._fire(type, message);
      }
    }

    addListener (type:string, listener:Function) {
      if (!this._listenerStore[type]) {
        this._listenerStore[type] = new app.Callbacks({persistent: true});
      }
      this._listenerStore[type].add(listener);
    }

    removeListener (type:string, listener:Function) {
      if (this._listenerStore[type]) {
        this._listenerStore[type].remove(listener);
      }
    }
  }
  export var message = new Message();

  export class Config {
    private static _default = new Map<string, string>([
      ["layout", "pane-3"],
      ["theme_id", "default"],
      ["always_new_tab", "on"],
      ["button_change_netsc_newtab", "off"],
      ["button_change_scheme_newtab", "off"],
      ["open_all_unread_lazy", "on"],
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
      ["popup_trigger", "click"],
      ["popup_delay_time", "0"],
      ["ngwords", "RegExpTitle:.+\.2ch\.netの人気スレ\nTitle:【漫画あり】コンビニで浪人を購入する方法\nTitle:★★ ２ちゃんねる\(sc\)のご案内 ★★★\nTitle:浪人はこんなに便利\nTitle:2ちゃんねるの運営を支えるサポーター募集"],
      ["ngobj", "[{\"type\":\"regExpTitle\",\"word\":\".+\\\\.2ch\\\\.netの人気スレ\"},{\"type\":\"title\",\"word\":\"【漫画あり】こんびにで浪人を購入する方法\"},{\"type\":\"title\",\"word\":\"★★2ちゃんねる\\\\(sc\\\\)のご案内★★★\"},{\"type\":\"title\",\"word\":\"浪人はこんなに便利\"},{\"type\":\"title\",\"word\":\"2ちゃんねるの運営を支えるさぽーたー募集\"}]"],
      ["chain_ng", "off"],
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
      ["replace_str_txt", ""],
      ["max_connection", "4"],
      ["last_information", "0"],
      ["information_count", "0"]
    ]);

    private _cache = new Map<string, string>();
    ready: Function;
    _onChanged: any;

    constructor () {
      var ready = new Callbacks();
      this.ready = ready.add.bind(ready);

      // localStorageからの移行処理
      {
        let found:{[index:string]:string;} = {}, key:string, val:string;

        for (key in localStorage) {
          if (key.startsWith("config_")) {
            val = localStorage.getItem(key)!;
            this._cache.set(key, val);
            found[key] = val;
          }
        }

        chrome.storage.local.set(found);

        for (key in found) {
          localStorage.removeItem(key);
        }
      }

      chrome.storage.local.get(null, (res) => {
        var key:string, val:string;
        if (this._cache !== null) {
          for (key in res) {
            val = res[key];

            if (
              key.startsWith("config_") &&
              (typeof val === "string" || typeof val ==="number")
            ) {
              this._cache.set(key, val);
            }
          }
          ready.call();
        }
      });

      this._onChanged = (change, area) => {
        var key:string, info;

        if (area === "local") {
          for (key in change) {
            if (!key.startsWith("config_")) continue;

            info = change[key];
            if (typeof info.newValue === "string") {
              this._cache.set(key, info.newValue);

              app.message.send("config_updated", {
                key: key.slice(7),
                val: info.newValue
              });
            }
            else {
              this._cache.delete(key);
            }
          }
        }
      };

      chrome.storage.onChanged.addListener(this._onChanged);
    }

    get (key:string):string|null {
      if (this._cache.has("config_" + key)) {
        return this._cache.get("config_" + key)!;
      }
      else if (Config._default.has(key)) {
        return Config._default.get(key)!;
      }
      return null;
    }

    //設定の連想配列をjson文字列で渡す
    getAll ():string {
      var json = {};
      for(var [key, val] of Config._default) {
        json["config_" + key] = val;
      }
      for(var [key, val] of this._cache) {
        json[key] = val;
      }
      return JSON.stringify(json);
    }

    set (key:string, val:string) {
      return new Promise( (resolve, reject) => {
        var tmp = {};

        if (
          typeof key !== "string" ||
          !(typeof val === "string" || typeof val === "number")
        ) {
          log("error", "app.Config::setに不適切な値が渡されました",
            arguments);
          reject();
          return;
        }

        tmp["config_" + key] = val;

        chrome.storage.local.set(tmp, () => {
          if (chrome.runtime.lasterror) {
            reject(chrome.runtime.lasterror.message);
          } else {
            resolve();
          }
        });
      });
    }

    del (key:string) {
      return new Promise( (resolve, reject) => {
        if (typeof key !== "string") {
          log("error", "app.Config::delにstring以外の値が渡されました",
            arguments);
          reject();
          return;
        }

        chrome.storage.local.remove("config_" + key, () => {
          if (chrome.runtime.lasterror) {
            reject(chrome.runtime.lasterror.message);
          } else {
            resolve();
          }
        });
      });
    }

    destroy ():void {
      this._cache.clear();
      chrome.storage.onChanged.removeListener(this._onChanged);
    }
  }

  export var config: Config;
  if (!frameElement) {
    config = new Config();
  }

  export const AMP_REG = /\&/g;
  export const LT_REG = /</g;
  export const GT_REG = />/g;
  export const QUOT_REG = /"/g;
  export const APOS_REG = /'/g;
  export function escapeHtml (str:string):string {
    return str
      .replace(AMP_REG, "&amp;")
      .replace(LT_REG, "&lt;")
      .replace(GT_REG, "&gt;")
      .replace(QUOT_REG, "&quot;")
      .replace(APOS_REG, "&apos;");
  }

  export function safeHref (url:string):string {
    return /^https?:\/\//.test(url) ? url : "/view/empty.html";
  }

  export var manifest: any;

  if (/^chrome-extension:\/\//.test(location.origin)) {
    let xhr = new XMLHttpRequest();
    xhr.open("GET", "/manifest.json", false);
    xhr.send();
    manifest = JSON.parse(xhr.responseText);
  }

  export function clipboardWrite (str:string):void {
    var textarea:HTMLTextAreaElement;

    textarea = <HTMLTextAreaElement>document.createElement("textarea");
    textarea.value = str;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }

  export var module;
  {
    let pending_modules = new Set<any>();
    let ready_modules = new Map<string, any>();
    let fire_definition, add_ready_module;

    fire_definition = (module_id, dependencies, definition) => {
      var dep_modules:any[] = [], dep_module_id, callback;

      for (dep_module_id of dependencies) {
        dep_modules.push(ready_modules.get(dep_module_id).module);
      }

      if (module_id !== null) {
        callback = add_ready_module.bind({
          module_id,
          dependencies
        });
        defer( () => {
          definition(...dep_modules.concat(callback));
        });
      }
      else {
        defer( () => {
          definition(...dep_modules);
        });
      }
    };

    add_ready_module = function (this:{module_id: string, dependencies: string[]}, module) {
      ready_modules.set(this.module_id,{
        dependencies: this.dependencies,
        module: module
      });

      // このモジュールが初期化された事で依存関係が満たされたモジュールを初期化
      for (var val of pending_modules.values()) {
        if (val.dependencies.includes(this.module_id)) {
          if (!val.dependencies.some((a) => { return !ready_modules.get(a); } )) {
            fire_definition(val.module_id, val.dependencies, val.definition);
            pending_modules.delete(module);
          }
        }
      }
    };

    app.module = function (module_id, dependencies, definition) {
      if (!dependencies) dependencies = [];

      // 依存関係が満たされていないモジュールは、しまっておく
      if (dependencies.some((a) => { return !ready_modules.get(a); } )) {
        pending_modules.add({
          module_id,
          dependencies,
          definition
        });
      }
      // 依存関係が満たされている場合、即座にモジュール初期化を開始する
      else {
        fire_definition(module_id, dependencies, definition);
      }
    };

    if (window["jQuery"]) {
      app.module("jquery", [], (callback) => {
        callback(window["jQuery"]);
      });
    }
  }

  export function boot (path:string, requirements, fn):void {
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
      htmlVersion = document.documentElement.getAttribute("data-app-version")!;
      if (manifest.version !== htmlVersion) {
        location.reload(true);
      }
      else {
        document.addEventListener("DOMContentLoaded", () => {
          app.config.ready(() => {
            if (requirements) {
              app.module(null, requirements, fn);
            }
            else {
              fn();
            }
          });
        });
      }
    }
  }
}
