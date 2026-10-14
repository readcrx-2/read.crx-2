import type { IBBSMenuResult } from "src/core/ports/bbs-menu";
import type { CorePorts } from "src/core/ports/registry";
import { corePorts } from "src/core/ports/registry";

/**
 * BBSMenu の既存モジュールimport互換用ファサード
 *
 * 変更理由: 以前はこのモジュールが BBSMenuModel のシングルトンを持ち、
 * BoardTitleSolver や jsutil が直接 import していたため、corePorts.bbsMenu と入口が分かれていた。
 * 板一覧の状態はサービスコンテナの bbsMenu だけが持ち、ここは既存のモジュールAPIを
 * 維持するための委譲だけを残す。新しいコードは corePorts.bbsMenu を使うこと。
 */

/** 板一覧の参照に必要なサービス。呼び出し側が渡す（C-2）。 */
export type BBSMenuFacadeDeps = Pick<CorePorts, "bbsMenu">;

export function createBBSMenuFacade(deps: BBSMenuFacadeDeps) {
  /** 変更通知の購読口 */
  const onChange = {
    /** @deprecated corePorts.bbsMenu.onChange を使用すること */
    add(callback: (result: IBBSMenuResult) => void): void {
      deps.bbsMenu.onChange.add(callback);
    },
    /** @deprecated corePorts.bbsMenu.onChange を使用すること */
    remove(callback: (result: IBBSMenuResult) => void): void {
      deps.bbsMenu.onChange.remove(callback);
    },
  };

  /** 板一覧を取得（キャッシュまたは通信） */
  async function get(forceReload = false): Promise<IBBSMenuResult> {
    return await deps.bbsMenu.get(forceReload);
  }

  // ホームの表示名参照は通信を起こさず、取得済みの板一覧だけを使う。
  async function getCached(): Promise<IBBSMenuResult> {
    return await deps.bbsMenu.getCached();
  }

  return { onChange, get, getCached };
}

// 既存の import 先（app.ts の公開 API）を維持するため、登録済みのサービスで組み立てた既定のインスタンスを公開する。
// 依存は関数が呼ばれた時点で参照されるため、ここでの組み立てで未登録の例外は出ない。
const defaultBBSMenu = createBBSMenuFacade(corePorts);

export const { onChange, get, getCached } = defaultBBSMenu;
