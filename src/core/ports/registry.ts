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
  IToastService,
  IUtil,
} from "src/core/ports/services";

/**
 * core が使うサービスの一覧。
 *
 * core は service-container を import せず、ここで宣言した型だけに依存する（Phase C-1）。
 * 実体は service-container の setup が installCorePorts で登録する。
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
  toast: IToastService;
  ng: INGService;
  notice: ICoreNoticeService;
}

let installed: CorePorts | null = null;

/**
 * 登録前に使うと、どのサービスを参照したかを含めて失敗させる。
 * 未登録のまま undefined を返すと、呼び出し側で原因の分からない TypeError になるため。
 */
export const corePorts: CorePorts = new Proxy({} as CorePorts, {
  get(_target, key) {
    if (installed === null) {
      throw new Error(
        `corePorts.${String(key)} を使う前に installCorePorts が呼ばれていません（service-container の setup より前に core を呼んでいないか確認してください）`,
      );
    }
    return Reflect.get(installed, key);
  },
});

/** service-container の setup が呼ぶ。複数回呼ばれても最後の登録が使われる。 */
export function installCorePorts(ports: CorePorts): void {
  installed = ports;
}
