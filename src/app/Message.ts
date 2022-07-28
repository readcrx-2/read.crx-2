import Callbacks from "./Callbacks";
import { defer } from "./Defer";
import { deepCopy } from "./Util";

class Message {
  private static readonly CHANNEL_NAME = "readcrx";
  private readonly _listenerStore: Map<string, Callbacks> = new Map();
  private readonly _bc: BroadcastChannel;

  constructor() {
    this._bc = new BroadcastChannel(Message.CHANNEL_NAME);
    this._bc.on("message", ({ data: { type, message } }) => {
      this._fire(type, message);
    });
  }

  private async _fire(type: string, message: any) {
    const msg = deepCopy(message);

    await defer();
    if (this._listenerStore.has(type)) {
      this._listenerStore.get(type).call(msg);
    }
  }

  send(type: string, message: any = {}) {
    this._fire(type, message);
    this._bc.postMessage({ type, message });
  }

  on(type: string, listener: Function) {
    if (!this._listenerStore.has(type)) {
      this._listenerStore.set(type, new Callbacks({ persistent: true }));
    }
    this._listenerStore.get(type)!.add(listener);
  }

  off(type: string, listener: Function) {
    if (this._listenerStore.has(type)) {
      this._listenerStore.get(type).remove(listener);
    }
  }
}

export default new Message();
