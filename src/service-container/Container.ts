import { installCorePorts } from "src/core/ports/registry";
import {
  IBBSMenuService,
  IBoardService,
  IBookmark,
  ICacheService,
  IConfig,
  IHistoryService,
  IMessage,
  INGService,
  INotificationService,
  IReadStateService,
  IServiceContainer,
  IThreadService,
  IToastService,
  IUtil,
} from "src/service-container/interfaces";

const globalObj = window as unknown as Record<string, unknown>;

// getter/setter 内の `this` を正しく型付けするため、
// 未登録状態 (undefined) を許容する内部ストア込みの型を明示する。
// 型注釈なしのオブジェクトリテラルだとアクセサ内の `this` が `{}` に推論され、
// `this._config` などが全て型エラーになる。
interface ServiceContainerImpl extends IServiceContainer {
  _config: IConfig | undefined;
  _cache: ICacheService | undefined;
  _bookmark: IBookmark | undefined;
  _message: IMessage | undefined;
  _util: IUtil | undefined;
  _readState: IReadStateService | undefined;
  _board: IBoardService | undefined;
  _bbsMenu: IBBSMenuService | undefined;
  _toast: IToastService | undefined;
  _notification: INotificationService | undefined;
  _thread: IThreadService | undefined;
  _ng: INGService | undefined;
  _history: IHistoryService | undefined;
}

if (!globalObj.__ServiceContainer) {
  const impl: ServiceContainerImpl = {
    _config: undefined,
    _cache: undefined,
    _bookmark: undefined,
    _message: undefined,
    _util: undefined,
    _readState: undefined,
    _board: undefined,
    _bbsMenu: undefined,
    _toast: undefined,
    _notification: undefined,
    _thread: undefined,
    _ng: undefined,
    _history: undefined,

    get config(): IConfig {
      if (!this._config) throw new Error("Config service not registered");
      return this._config;
    },
    set config(value: IConfig) {
      this._config = value;
    },

    get cache(): ICacheService {
      if (!this._cache) throw new Error("Cache service not registered");
      return this._cache;
    },
    set cache(value: ICacheService) {
      this._cache = value;
    },

    get bookmark(): IBookmark {
      if (!this._bookmark) throw new Error("Bookmark service not registered");
      return this._bookmark;
    },
    set bookmark(value: IBookmark) {
      this._bookmark = value;
    },

    get message(): IMessage {
      if (!this._message) throw new Error("Message service not registered");
      return this._message;
    },
    set message(value: IMessage) {
      this._message = value;
    },

    get util(): IUtil {
      if (!this._util) throw new Error("Util service not registered");
      return this._util;
    },
    set util(value: IUtil) {
      this._util = value;
    },

    get readState(): IReadStateService {
      if (!this._readState) throw new Error("ReadState service not registered");
      return this._readState;
    },
    set readState(value: IReadStateService) {
      this._readState = value;
    },

    get board(): IBoardService {
      if (!this._board) throw new Error("Board service not registered");
      return this._board;
    },
    set board(value: IBoardService) {
      this._board = value;
    },

    get bbsMenu(): IBBSMenuService {
      if (!this._bbsMenu) throw new Error("BBSMenu service not registered");
      return this._bbsMenu;
    },
    set bbsMenu(value: IBBSMenuService) {
      this._bbsMenu = value;
    },

    get toast(): IToastService {
      if (!this._toast) throw new Error("Toast service not registered");
      return this._toast;
    },
    set toast(value: IToastService) {
      this._toast = value;
    },

    get notification(): INotificationService {
      if (!this._notification) throw new Error("Notification service not registered");
      return this._notification;
    },
    set notification(value: INotificationService) {
      this._notification = value;
    },

    get thread(): IThreadService {
      if (!this._thread) throw new Error("Thread service not registered");
      return this._thread;
    },
    set thread(value: IThreadService) {
      this._thread = value;
    },

    get ng(): INGService {
      if (!this._ng) throw new Error("NG service not registered");
      return this._ng;
    },
    set ng(value: INGService) {
      this._ng = value;
    },

    get history(): IHistoryService {
      if (!this._history) throw new Error("History service not registered");
      return this._history;
    },
    set history(value: IHistoryService) {
      this._history = value;
    },
  };
  globalObj.__ServiceContainer = impl;
}

// window 上のプロパティは unknown なので、上で登録した実体の型へ戻すキャストが必要。
export const container: IServiceContainer = globalObj.__ServiceContainer as IServiceContainer;
globalObj.container = container;
// core が参照するサービスの登録先を、この global と同じ実体にする。
// 登録後の代入もそのまま見えるため、setupContainer の前後どちらでも同じ値を使える。
installCorePorts(container);

// import { IServiceContainer, IConfig, ICacheService, IBookmark, IMessage, IUtil } from "src/service-container/interfaces";

// class ServiceContainer implements IServiceContainer {
//   private _config?: IConfig;
//   private _cache?: ICacheService;
//   private _bookmark?: IBookmark;
//   private _message?: IMessage;

//   get config(): IConfig {
//     if (!this._config) throw new Error("Config service not registered");
//     return this._config;
//   }
//   set config(value: IConfig) { this._config = value; }

//   get cache(): ICacheService {
//     if (!this._cache) throw new Error("Cache service not registered");
//     return this._cache;
//   }
//   set cache(value: ICacheService) { this._cache = value; }

//   get bookmark(): IBookmark {
//     if (!this._bookmark) throw new Error("Bookmark service not registered");
//     return this._bookmark;
//   }
//   set bookmark(value: IBookmark) { this._bookmark = value; }

//   get message(): IMessage {
//     if (!this._message) throw new Error("Message service not registered");
//     return this._message;
//   }
//   set message(value: IMessage) { this._message = value; }
//   get util(): IUtil {
//     if (!this._util) throw new Error("Util service not registered");
//     return this._util;
//   }
//   set util(value: IUtil) { this._util = value; }
// }
// こっちにするとregistered-errorになる

// export const container = new ServiceContainer();
