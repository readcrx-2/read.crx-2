import * as BoardTitleSolver from "src/core/board/BoardTitleSolver";
import { createOpenedBoards } from "src/core/board/OpenedBoards";
import * as History from "src/core/history/History";
import * as WriteHistory from "src/core/history/WriteHistory";
import Cache from "src/core/storage/Cache";
import * as ReplaceStrTxt from "src/core/thread/ReplaceStrTxt";
import { container } from "src/service-container/Container";

/**
 * メインのブラウザ画面（src/view/browser）だけが使うサービスを登録する（Phase E、計画書 §3.6）。
 *
 * setupContainer は overlay・replay の画面も起動時に呼ぶ。ここで登録する履歴・ログ・板名の解決などを
 * setupContainer に入れると、使わない replay.js にも core の実装が入り、約 12KB 増えたため分けた。
 * setupContainer の後（container.config の登録後）に、描画より前に呼ぶ。
 */
export function setupBrowserViewServices(): void {
  container.history = {
    add: History.add,
    remove: History.remove,
    get: History.get,
    getByUrl: History.getByUrl,
    getAll: History.getAll,
    clear: History.clear,
  };
  container.writeHistory = {
    add: WriteHistory.add,
    update: WriteHistory.update,
    remove: WriteHistory.remove,
    get: WriteHistory.get,
    getByUrl: WriteHistory.getByUrl,
    getAll: WriteHistory.getAll,
    clear: WriteHistory.clear,
  };
  // config は上で登録した container.config を使う（core の既定のインスタンスと同じ設定を見る）。
  container.openedBoards = createOpenedBoards(container);
  // 板名の解決結果のキャッシュを core の ThreadSearch や window.app と共有するため、
  // 新しく作らず core の既定のインスタンスを登録する。
  container.boardTitle = {
    ask: BoardTitleSolver.ask,
    askByUrl: BoardTitleSolver.askByUrl,
    getCachedTitles: BoardTitleSolver.getCachedTitles,
  };
  // 解析済みの置換ルールを、レスの表示で使う core の既定のインスタンスと共有する。
  container.replaceStr = { set: ReplaceStrTxt.set };
  // 静的メソッドを切り離して渡すと this が外れるため、Cache を通して呼ぶ関数で包む。
  container.threadLog = {
    listLogs: (...args) => Cache.listLogs(...args),
    searchLogsPage: (...args) => Cache.searchLogsPage(...args),
    deleteLogs: () => Cache.deleteLogs(),
    getLogArchiveRecords: () => Cache.getLogArchiveRecords(),
    replaceLogArchiveRecords: (...args) => Cache.replaceLogArchiveRecords(...args),
  };
}
