import { createLogger } from "src/app/logger";
import {
  type AuxiliaryWindowOptions,
  createAuxiliaryWindowRoot,
} from "src/features/auxiliary-window/browser/auxiliary-window-root";

const logger = createLogger("auxiliary-window");

export interface AuxiliaryWindowWatcherParams {
  window: Window;
  /**
   * 再読み込み後にrootとスタイルを複製する元のDocument。
   * この窓が再読み込み・終了したときは、別窓も一緒に閉じる。
   */
  sourceDocument: Document;
  /** この窓が、呼び出し側のレジストリで現在も有効なentryか。同じキーの再オープンを誤って閉じないために使う。 */
  isCurrent: () => boolean;
  /** 再読み込み時にrootを作り直す際のoptions。nullなら再接続しない(対象が既に消えている等)。 */
  getReconnectOptions: () => AuxiliaryWindowOptions | null;
  /** 親窓から`closed`を確認できた時だけ呼ばれる。再読み込みでは呼ばれない。 */
  onClosed: () => void;
  /** 再読み込みでPortal先が破棄された後、作り直したrootを受け取る。 */
  onReconnect: (root: HTMLElement) => void;
}

export interface AuxiliaryWindowWatcher {
  /** 監視だけを外す。窓は閉じない。 */
  unwatch: () => void;
  /** 監視を外してから、まだ開いていれば窓を閉じる。 */
  release: () => void;
}

/**
 * 別窓の終了・再読み込みを監視する。
 *
 * 変更理由: タブ別窓と画像ビューアで、`beforeunload`はreloadでも発火するため`closed`を
 * 確認してから終了する処理と、`load`でPortal rootを再接続する処理を別々に持っていた。
 * 判定の食い違いでreloadのたびにタブやビューアが消えないよう、ここへ一本化する。
 * `closed`のポーリングは窓数が異なるため、各ホスト側で行う。
 *
 * 別窓の中身は開いた元の窓のコードがPortalで描いているため、元の窓が再読み込みや
 * 終了で消えると、別窓には操作できないDOMだけが残る。再読み込み後の元の窓も
 * その別窓を把握できないので、元の窓のpagehideで別窓を閉じて抜け殻を残さない。
 */
export function watchAuxiliaryWindow(params: AuxiliaryWindowWatcherParams): AuxiliaryWindowWatcher {
  const { window: targetWindow } = params;

  const onBeforeUnload = () => {
    // beforeunload直後はreloadでも発火するため、closedを確認できた時だけ終了する。
    if (!params.isCurrent() || !targetWindow.closed) {
      return;
    }
    params.onClosed();
  };

  const onLoad = () => {
    if (!params.isCurrent() || targetWindow.closed) {
      return;
    }
    const options = params.getReconnectOptions();
    if (!options) {
      return;
    }
    try {
      // popupの再読み込みではPortal先のDOMも破棄されるため、同じWindowProxyへ
      // rootとスタイルを再接続し、状態は呼び出し側に残したまま表示だけを復元する。
      params.onReconnect(createAuxiliaryWindowRoot(params.sourceDocument, targetWindow, options));
    } catch (error) {
      logger.error(`[${options.logLabel}] 再読み込み後の別窓を再接続できませんでした`, error);
    }
  };

  const sourceWindow = params.sourceDocument.defaultView;

  const unwatch = () => {
    targetWindow.removeEventListener("beforeunload", onBeforeUnload);
    targetWindow.removeEventListener("load", onLoad);
    sourceWindow?.removeEventListener("pagehide", onSourcePageHide);
  };

  const release = () => {
    unwatch();
    if (!targetWindow.closed) {
      targetWindow.close();
    }
  };

  // pagehideは再読み込み・ページ移動・終了のいずれでも発火し、beforeunloadと違って
  // 確認ダイアログで取り消されることもないため、元の窓が消える合図として使う。
  const onSourcePageHide = () => {
    try {
      release();
    } catch (error) {
      logger.error("元の窓の終了時に別窓を閉じられませんでした", error);
    }
  };

  targetWindow.addEventListener("beforeunload", onBeforeUnload);
  targetWindow.addEventListener("load", onLoad);
  sourceWindow?.addEventListener("pagehide", onSourcePageHide);

  return { unwatch, release };
}
