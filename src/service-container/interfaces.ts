import type { createBoardTitleSolver } from "src/core/board/BoardTitleSolver";
import type { createOpenedBoards } from "src/core/board/OpenedBoards";
import type * as HistoryModule from "src/core/history/History";
import type * as WriteHistoryModule from "src/core/history/WriteHistory";
import type {
  IBBSMenuService,
  IBoardService,
  IBookmark,
  ICacheService,
  IConfig,
  ICoreNoticeService,
  IMessage,
  INGService,
  IReadStateService,
  IUtil,
} from "src/core/ports/services";
import type { IThreadService } from "src/core/ports/thread";
import type Cache from "src/core/storage/Cache";
import type { createReplaceStrTxt } from "src/core/thread/ReplaceStrTxt";

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
  IBookmarkEntry,
  IBookmarkItem,
  ICacheService,
  IConfig,
  ICoreNoticeService,
  IMessage,
  INGService,
  IReadStateService,
  IUtil,
} from "src/core/ports/services";
export type { IRes, IThread, IThreadDetail, IThreadService } from "src/core/ports/thread";

/** 画面のトースト。core は使わない（core からの知らせは ICoreNoticeService を通す）。 */
export interface IToastService {
  notify(
    message: string,
    options?: { html?: boolean; backgroundColor?: string; targetWindow?: Window },
  ): void;
  success(message: string, options?: { targetWindow?: Window }): void;
  error(message: string, options?: { targetWindow?: Window }): void;
  info(message: string, options?: { targetWindow?: Window }): void;
}

export interface INotificationService {
  notify(
    title: string,
    options?: { message?: string; url?: string; tag?: string; targetWindow?: Window },
  ): Promise<boolean>;
  isSupported(targetWindow?: Window): boolean;
}

/**
 * 閲覧履歴（Phase E、計画書 §3.6）。view・features は core/history/History を直接使わず、ここから使う。
 * 関数の形は core の実装から取り、二重に書かない。
 */
export type IHistoryService = Pick<
  typeof HistoryModule,
  "add" | "remove" | "get" | "getByUrl" | "getAll" | "clear"
>;

/** 書き込み履歴（Phase E、計画書 §3.6）。関数の形は core/history/WriteHistory から取る。 */
export type IWriteHistoryService = Pick<
  typeof WriteHistoryModule,
  "add" | "update" | "remove" | "get" | "getByUrl" | "getAll" | "clear"
>;

/** スレのログの一覧・検索・削除・書き出し（Phase E、計画書 §3.6）。関数の形は core/storage/Cache の静的メソッドから取る。 */
export type IThreadLogService = Pick<
  typeof Cache,
  "listLogs" | "searchLogsPage" | "deleteLogs" | "getLogArchiveRecords" | "replaceLogArchiveRecords"
>;

/** 開いた板の記録への書き込み（Phase E、計画書 §3.6）。読み取り用の parseOpenedBoardEntries は純粋なので直接使う。 */
export type IOpenedBoardsService = Pick<
  ReturnType<typeof createOpenedBoards>,
  "upsertOpenedBoardEntry"
>;

/** 板名の解決（Phase E、計画書 §3.6）。解決結果のキャッシュを持つため、サービスコンテナ経由で使う。 */
export type IBoardTitleService = Pick<
  ReturnType<typeof createBoardTitleSolver>,
  "ask" | "askByUrl" | "getCachedTitles"
>;

/** 置換ルールの保存（Phase E、計画書 §3.6）。解析済みのルールを持つため、サービスコンテナ経由で使う。 */
export type IReplaceStrService = Pick<ReturnType<typeof createReplaceStrTxt>, "set">;

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
  history: IHistoryService;
  writeHistory: IWriteHistoryService;
  threadLog: IThreadLogService;
  openedBoards: IOpenedBoardsService;
  boardTitle: IBoardTitleService;
  replaceStr: IReplaceStrService;
  notice: ICoreNoticeService;
}
