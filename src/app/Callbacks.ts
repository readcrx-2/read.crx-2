import {log} from "./Log";
import {deepCopy} from "./Util";

interface CallbacksConfiguration {
  persistent?: boolean;
}

export default class Callbacks {
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
    this._callbackStore.clear();
  }
}
