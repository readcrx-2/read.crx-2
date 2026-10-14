import type {
  IBBSMenuService,
  IBoardService,
  IBookmark,
  ICacheService,
  IConfig,
  IMessage,
  INGService,
  IReadStateService,
  IToastService,
  IUtil,
} from "src/core/ports/services";
import type { IThreadService } from "src/core/ports/thread";

// Core が使う型は src/core/ports に正本を置く（Phase B・C-1）。ここからは互換のために再エクスポートする。
export type { IBBSMenuResult } from "src/core/ports/bbs-menu";
export type { IBoardResult } from "src/core/ports/board";
export type { ICacheItem } from "src/core/ports/cache";
export type { INGResult } from "src/core/ports/ng";
export type { IReadState } from "src/core/ports/read-state";
export type {
  IBBSMenuChangeNotifier,
  IBBSMenuService,
  IBoardService,
  IBookmark,
  IBookmarkItem,
  ICacheService,
  IConfig,
  IMessage,
  INGService,
  IReadStateService,
  IToastService,
  IUtil,
} from "src/core/ports/services";
export type { IRes, IThread, IThreadDetail, IThreadService } from "src/core/ports/thread";

export interface INotificationService {
  notify(
    title: string,
    options?: { message?: string; url?: string; tag?: string; targetWindow?: Window },
  ): Promise<boolean>;
  isSupported(targetWindow?: Window): boolean;
}

export interface IServiceContainer {
  config: IConfig;
  cache: ICacheService;
  bookmark: IBookmark;
  message: IMessage;
  util: IUtil;
  readState: IReadStateService;
  board: IBoardService;
  bbsMenu: IBBSMenuService;
  toast: IToastService;
  notification: INotificationService;
  thread: IThreadService;
  ng: INGService;
}
