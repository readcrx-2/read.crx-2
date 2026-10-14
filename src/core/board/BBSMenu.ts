import type { IBBSMenuResult } from "src/core/ports/bbs-menu";
import { corePorts } from "src/core/ports/registry";

/**
 * BBSMenu の既存モジュールimport互換用ファサード
 *
 * 変更理由: 以前はこのモジュールが BBSMenuModel のシングルトンを持ち、
 * BoardTitleSolver や jsutil が直接 import していたため、corePorts.bbsMenu と入口が分かれていた。
 * 板一覧の状態はサービスコンテナの bbsMenu だけが持ち、ここは既存のモジュールAPIを
 * 維持するための委譲だけを残す。新しいコードは corePorts.bbsMenu を使うこと。
 */

/** 変更通知の購読口 */
export const onChange = {
  /** @deprecated corePorts.bbsMenu.onChange を使用すること */
  add(callback: (result: IBBSMenuResult) => void): void {
    corePorts.bbsMenu.onChange.add(callback);
  },
  /** @deprecated corePorts.bbsMenu.onChange を使用すること */
  remove(callback: (result: IBBSMenuResult) => void): void {
    corePorts.bbsMenu.onChange.remove(callback);
  },
};

/** 板一覧を取得（キャッシュまたは通信） */
export async function get(forceReload = false): Promise<IBBSMenuResult> {
  return await corePorts.bbsMenu.get(forceReload);
}

// ホームの表示名参照は通信を起こさず、取得済みの板一覧だけを使う。
export async function getCached(): Promise<IBBSMenuResult> {
  return await corePorts.bbsMenu.getCached();
}
