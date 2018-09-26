import Callbacks from "./Callbacks";
import {defer} from "./Defer";
import {deepCopy} from "./Util";

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

export default new Message();
