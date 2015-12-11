///<reference path="../lib/DefinitelyTyped/jquery/jquery.d.ts" />

interface Window {
  chrome: any;
}

declare var webkitNotifications: any;
declare var chrome: any;

module app {
  "use strict";

  var logLevels = ["log", "debug", "info", "warn", "error"];

  export function criticalError (message:string):void {
    webkitNotifications
      .createNotification(
        "",
        "深刻なエラーが発生したのでread.crxを終了します",
        "詳細 : " + message
      )
      .show()

    parent.chrome.tabs.getCurrent(function (tab):void {
      parent.chrome.tabs.remove(tab.id);
    });
  }
  export var clitical_error = criticalError;

  export function log (level:string, ...data:any[]) {
    if (logLevels.indexOf(level) !== -1) {
      console[level].apply(console, data);
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
  export var deep_copy = deepCopy;

  export function defer (fn:Function):void {
    setTimeout(fn, 0);
  }

  export function assert_arg (name:string, rule:string[], arg:any[]):boolean {
    var key:number, val:any;

    for (key = 0; val = rule[key]; key++) {
      if (typeof arg[key] !== val) {
        log("error", name + ": 不正な引数", deepCopy(arg));
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
    private _callbackStore:Function[] = [];
    private _latestCallArg: any[] = null;
    wasCalled = false;

    constructor (config:CallbacksConfiguration = {}) {
      this._config = config;
    }

    add (callback:Function):void {
      if (!this._config.persistent && this._latestCallArg) {
        callback.apply(null, deepCopy(this._latestCallArg));
      }
      else {
        this._callbackStore.push(callback);
      }
    }

    remove (callback:Function):void {
      var index:number;

      index = this._callbackStore.indexOf(callback);
      if (index !== -1) {
        this._callbackStore.splice(index, 1);
      }
      else {
        log("error",
          "app.Callbacks: 存在しないコールバックを削除しようとしました。");
      }
    }

    call (...arg:any[]):void {
      var key:number, callback:Function, tmpCallbackStore;

      if (!this._config.persistent && this._latestCallArg) {
        app.log("error",
          "app.Callbacks: persistentでないCallbacksが複数回callされました。");
      }
      else {
        this.wasCalled = true;

        this._latestCallArg = deepCopy(arg);

        tmpCallbackStore = this._callbackStore.slice(0);

        for (key = 0; callback = tmpCallbackStore[key]; key++) {
          if (this._callbackStore.indexOf(callback) !== -1) {
            callback.apply(null, deepCopy(arg));
          }
        }

        if (!this._config.persistent) {
          this._callbackStore = null;
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

        var data, iframes, key:number, iframe:HTMLIFrameElement;

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
          iframes = document.getElementsByTagName("iframe");

          // parentから伝わってきた場合はiframeにも伝える
          if (e.source === parent) {
            for (key = 0; iframe = iframes[key]; key++) {
              iframe.contentWindow.postMessage(e.data, location.origin);
            }
          }
          // iframeから伝わってきた場合は、parentと他のiframeにも伝える
          else {
            if (parent !== window) {
              parent.postMessage(e.data, location.origin);
            }

            for (key = 0; iframe = iframes[key]; key++) {
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
      var data: Object, iframes, key:number, iframe:HTMLIFrameElement;

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

        iframes = document.getElementsByTagName("iframe");
        for (key = 0; iframe = iframes[key]; key++) {
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
  (<any>message).add_listener = message.addListener;
  (<any>message).remove_listener = message.removeListener;

  export class Config {
    private static _default = {
      layout: "pane-3",
      theme_id: "default",
      always_new_tab: "on",
      button_change_netsc_newtab: "off",
      dblclick_reload: "on",
      auto_load_second: "0",
      auto_load_all: "off",
      thumbnail_supported: "on",
      thumbnail_ext: "off",
      aa_font: "aa",
      popup_trigger: "click",
      ngwords: "",
      bookmark_show_dat: "on",
      hide_needless_thread: "on",
      default_name: "",
      default_mail: "",
      sync_id: "",
      sync_pass: "",
      sync_device: "",
      no_history: "off",
      user_css: "",
      bbsmenu: "http://kita.jikkyo.org/cbm/cbm.cgi/20.p0.m0.jb.vs.op.sc.nb.bb/-all/bbsmenu.html",
      format_2chnet: "html"
    };

    private _cache:{[index:string]:string;} = {};
    ready: Function;
    _onChanged: any;

    constructor () {
      var ready = new Callbacks();
      this.ready = ready.add.bind(ready);

      // localStorageからの移行処理
      (() => {
        var found:{[index:string]:string;} = {}, index:number, key:string,
          val:string;

        var localStorage_length = localStorage.length
        for (index = 0; index < localStorage_length; index++) {
          key = localStorage.key(index);
          if (/^config_/.test(key)) {
            val = localStorage.getItem(key);
            this._cache[key] = val;
            found[key] = val;
          }
        }

        chrome.storage.local.set(found);

        for (key in found) {
          localStorage.removeItem(key);
        }
      })();

      chrome.storage.local.get(null, (res) => {
        var key:string, val:string;
        if (this._cache !== null) {
          for (key in res) {
            val = res[key];

            if (
              /^config_/.test(key) &&
              (typeof val === "string" || typeof val ==="number")
            ) {
              this._cache[key] = val;
            }
          }
          ready.call();
        }
      });

      this._onChanged = (change, area) => {
        var key:string, info;

        if (area === "local") {
          for (key in change) {
            if (!/^config_/.test(key)) continue;

            info = change[key];
            if (typeof info.newValue === "string") {
              this._cache[key] = info.newValue;

              app.message.send("config_updated", {
                key: key.slice(7),
                val: info.newValue
              });
            }
            else {
              delete this._cache[key];
            }
          }
        }
      };

      chrome.storage.onChanged.addListener(this._onChanged);
    }

    get (key:string):string {
      if (this._cache["config_" + key] != null) {
        return this._cache["config_" + key];
      }
      else if (Config._default[key] != null) {
        return Config._default[key];
      }
      else {
        return undefined;
      }
    }

    //設定の連想配列をjson文字列で渡す
    getAll ():string {
      var json = new Object();
      for(var key in Config._default) {
        json["config_" + key] = Config._default[key];
      }
      $.extend(json, this._cache);
      return JSON.stringify(json);
    }

    set (key:string, val:string) {
      var deferred = $.Deferred(),
        tmp = {};

      if (
        typeof key !== "string" ||
        !(typeof val === "string" || typeof val === "number")
      ) {
        log("error", "app.Config::setに不適切な値が渡されました",
          arguments);
        return deferred.reject();
      }

      tmp["config_" + key] = val;

      chrome.storage.local.set(tmp, () => {
        if (chrome.runtime.lasterror) {
          deferred.reject(chrome.runtime.lasterror.message);
        } else {
          deferred.resolve();
        }
      });

      return deferred.promise();
    }

    del (key:string) {
      var deferred = $.Deferred();

      if (typeof key !== "string") {
        log("error", "app.Config::delにstring以外の値が渡されました",
          arguments);
        return deferred.reject();
      }

      chrome.storage.local.remove("config_" + key, () => {
        if (chrome.runtime.lasterror) {
          deferred.reject(chrome.runtime.lasterror.message);
        } else {
          deferred.resolve();
        }
      });

      return deferred.promise();
    }

    destroy ():void {
      this._cache = null;
      chrome.storage.onChanged.removeListener(this._onChanged);
    }
  }

  export var config: Config;
  if (!frameElement) {
    config = new Config();
  }

  export function escape_html (str:string):string {
    return str
      .replace(/\&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  export function safe_href (url:string):string {
    return /^https?:\/\//.test(url) ? url : "/view/empty.html";
  }

  export var manifest: any;

  (function () {
    var xhr:XMLHttpRequest;

    if (/^chrome-extension:\/\//.test(location.origin)) {
      manifest = chrome.runtime.getManifest();
    }
  })();

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
  (function () {
    var pending_modules = [], ready_modules = {}, fire_definition,
      add_ready_module;

    fire_definition = function (module_id, dependencies, definition) {
      var dep_modules = [], key, dep_module_id, callback;

      for (key = 0; dep_module_id = dependencies[key]; key++) {
        dep_modules.push(ready_modules[dep_module_id].module);
      }

      if (module_id !== null) {
        callback = add_ready_module.bind({
          module_id: module_id,
          dependencies: dependencies
        });
        defer(function () {
          definition.apply(null, dep_modules.concat(callback));
        });
      }
      else {
        defer(function () {
          definition.apply(null, dep_modules);
        });
      }
    };

    add_ready_module = function (module) {
      ready_modules[this.module_id] = {
        dependencies: this.dependencies,
        module: module
      };

      // このモジュールが初期化された事で依存関係が満たされたモジュールを初期化
      pending_modules = pending_modules.filter((val) => {
        if (val.dependencies.indexOf(this.module_id) !== -1) {
          if (!val.dependencies.some(function (a) { return !ready_modules[a]; })) {
            fire_definition(val.module_id, val.dependencies, val.definition);
            return false;
          }
        }
        return true;
      });
    };

    app.module = function (module_id, dependencies, definition) {
      if (!dependencies) dependencies = [];

      // 依存関係が満たされていないモジュールは、しまっておく
      if (dependencies.some(function (a) { return !ready_modules[a]; })) {
        pending_modules.push({
          module_id: module_id,
          dependencies: dependencies,
          definition: definition
        });
      }
      // 依存関係が満たされている場合、即座にモジュール初期化を開始する
      else {
        fire_definition(module_id, dependencies, definition);
      }
    };

    if (window["jQuery"]) {
      app.module("jquery", [], function (callback) {
        callback(window["jQuery"]);
      });
    }
  })();

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
      htmlVersion = document.documentElement.getAttribute("data-app-version");
      if (manifest.version !== htmlVersion) {
        location.reload(true);
      }
      else {
        $(function () {
          app.config.ready(function () {
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
