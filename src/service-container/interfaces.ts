import type { IBBSMenuResult } from "src/core/ports/bbs-menu";
import type { IBoardResult } from "src/core/ports/board";
import type { ICacheItem } from "src/core/ports/cache";
import type { INGResult } from "src/core/ports/ng";
import type { IReadState } from "src/core/ports/read-state";
import type { IThreadService } from "src/core/ports/thread";

// Core が使う型は src/core/ports に正本を置く（Phase B）。ここからは互換のために再エクスポートする。
export type { IBBSMenuResult } from "src/core/ports/bbs-menu";
export type { IBoardResult } from "src/core/ports/board";
export type { ICacheItem } from "src/core/ports/cache";
export type { INGResult } from "src/core/ports/ng";
export type { IReadState } from "src/core/ports/read-state";
export type { IRes, IThread, IThreadDetail, IThreadService } from "src/core/ports/thread";

export interface IConfig {
  // 設定ストアは文字列ベース (app.config.get は string | null を返す)。
  // unknown だと利用側で JSON.parse 等に渡せず型エラーになるため実態に合わせる。
  get(key: string): string | null;
  set(key: string, value: unknown): Promise<void> | void;
  ready(callback: () => void): void;
  getAll(): Record<string, string>;
  del?(key: string): Promise<void>;
}

export interface ICacheService {
  getCache(path: string): ICacheItem;
}

export interface IReadStateService {
  get(url: string): Promise<IReadState | undefined>;
  getByBoard(boardUrl: string): Promise<IReadState[]>;
  set(readState: IReadState): Promise<void>;
}

export interface IBookmarkItem {
  url: string;
  title: string;
  // CoreのEntryは保存形式をそのまま公開するため、typeは将来値も含めたstringで受ける。
  type: string;
  // Coreの保存形式では未設定値をnullで保持するため、境界で値を置き換えない。
  resCount?: number | null;
  readState?: IReadState | null;
  expired?: boolean;
}

export interface IBookmark {
  /** 初回の永続データ読み込みが終わるまで待つ。 */
  readonly promiseFirstScan: Promise<boolean>;
  get(url: string): IBookmarkItem | null | undefined;
  add(item: IBookmarkItem): void;
  remove(url: string): void;
  updateResCount(url: string, count: number): void;
  updateExpired(url: string, expired: boolean): void;
  getByBoard(boardUrl: string): IBookmarkItem[];
  getAllBoards(): IBookmarkItem[];
}

export interface IMessage {
  send(type: string, data?: unknown): void;
  // 購読側は `({ key }: { key?: string }) => void` のような狭い型のコールバックを渡すため、
  // 引数を `unknown` 固定にすると全呼び出し箇所で型エラーになる。
  // メソッド構文の bivariance を利用し、ジェネリクスでコールバック側の型を推論させる。
  on<T = unknown>(type: string, callback: (data: T) => void): void;
  off<T = unknown>(type: string, callback: (data: T) => void): void;
}

export interface IUtil {
  escapeHtml(str: string): string;
  safeHref(url: string): string;
  defer(): Promise<void>;
  isNewerReadState(
    a: import("src/core/bookmark/read-state-compare").ComparableReadState | null | undefined,
    b: import("src/core/bookmark/read-state-compare").ComparableReadState | null | undefined,
  ): boolean;
  guessType(url: string): { bbsType: string; protocol: string };
}

export interface IBoardService {
  getThreads(url: string): Promise<IBoardResult>;
  getCachedResCount(url: string, options?: { forceUpdate?: boolean }): Promise<unknown>;
}

export interface IBBSMenuChangeNotifier {
  add(callback: (result: IBBSMenuResult) => void): void;
  remove(callback: (result: IBBSMenuResult) => void): void;
}

export interface IBBSMenuService {
  /** 板一覧を取得する。forceReload 時は通信して onChange へ通知する。 */
  get(forceReload?: boolean): Promise<IBBSMenuResult>;
  /** 通信せず、保存済みの板一覧だけを返す。 */
  getCached(): Promise<IBBSMenuResult>;
  /** 強制更新で板一覧が変わったときの通知。 */
  readonly onChange: IBBSMenuChangeNotifier;
}

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

export interface INGService {
  isNGBoard(title: string, url: string, resCount: number): INGResult | null;
  isNGThread(res: unknown, title: string, url: string): INGResult | null;
  add(ruleDsl: string): Promise<void> | void;
  invalidateCache(): void;
  execExpire(): void;
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
