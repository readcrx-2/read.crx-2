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

/**
 * core が使うサービスの一覧。
 *
 * core は service-container を import せず、ここで宣言した型だけに依存する（Phase C-1）。
 * 実体は service-container の setup が作り、各モジュールの create 関数やコンストラクタへ引数で渡す。
 */
export interface CorePorts {
  config: IConfig;
  cache: ICacheService;
  bookmark: IBookmark;
  message: IMessage;
  util: IUtil;
  readState: IReadStateService;
  board: IBoardService;
  bbsMenu: IBBSMenuService;
  ng: INGService;
  notice: ICoreNoticeService;
}
