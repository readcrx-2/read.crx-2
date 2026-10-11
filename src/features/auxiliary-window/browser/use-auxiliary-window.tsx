import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { platform } from "src/app/platform";
import {
  type AuxiliaryWindowHandle,
  type AuxiliaryWindowOptions,
  createAuxiliaryWindowRoot,
} from "src/features/auxiliary-window/browser/auxiliary-window-root";
import {
  type AuxiliaryWindowWatcher,
  watchAuxiliaryWindow,
} from "src/features/auxiliary-window/browser/auxiliary-window-watcher";

export type {
  AuxiliaryWindowHandle,
  AuxiliaryWindowOptions,
} from "src/features/auxiliary-window/browser/auxiliary-window-root";

interface ManagedAuxiliaryWindowHandle extends AuxiliaryWindowHandle {
  watcher: AuxiliaryWindowWatcher;
  /** OSの×で閉じたことを親窓から確認する監視のid。 */
  closedMonitorId: number;
  opener: Window;
}

// タブ別窓・画像ビューアと同じ間隔で、親窓から別窓のclosedを確認する。
const CLOSED_MONITOR_INTERVAL_MS = 250;

function releaseHandle(handle: ManagedAuxiliaryWindowHandle): void {
  handle.opener.clearInterval(handle.closedMonitorId);
  handle.watcher.release();
}

export interface AuxiliaryWindowState {
  root: HTMLElement | null;
  isOpen: boolean;
  open: (sourceWindow?: Window) => boolean;
  close: () => void;
}

/**
 * 別窓を開き、Reactを接続するrootだけを準備する。
 *
 * 変更理由: 書き込み窓とタブ別窓で同じCSS移送・root生成を使い回し、
 * 別窓の種類ごとにWindowProxyの扱いが分裂しないようにする。
 */
export function openAuxiliaryWindow(
  options: AuxiliaryWindowOptions,
  sourceWindow?: Window,
): AuxiliaryWindowHandle | null {
  const opener = sourceWindow ?? (typeof window === "undefined" ? null : window);
  if (!opener) {
    return null;
  }

  let auxiliaryWindow: Window | null = null;
  try {
    auxiliaryWindow = sourceWindow
      ? (platform.window.openPopup?.(options.name, options.features, sourceWindow) ?? null)
      : (platform.window.openPopup?.(options.name, options.features) ?? null);
  } catch (error) {
    console.error(`[${options.logLabel}] 別窓の生成に失敗しました`, error);
    return null;
  }
  if (!auxiliaryWindow) {
    console.error(`[${options.logLabel}] 別窓を開けませんでした`);
    return null;
  }

  try {
    return {
      window: auxiliaryWindow,
      root: createAuxiliaryWindowRoot(opener.document, auxiliaryWindow, options),
    };
  } catch (error) {
    console.error(`[${options.logLabel}] 別窓の表示基盤を作成できませんでした`, error);
    try {
      if (!auxiliaryWindow.closed) {
        auxiliaryWindow.close();
      }
    } catch (closeError) {
      // root作成失敗時にWindowProxyへ触れない環境でも、本窓へ例外を伝播させない。
      console.error(`[${options.logLabel}] 失敗した別窓を閉じられませんでした`, closeError);
    }
    return null;
  }
}

/**
 * アプリ内の表示を名前付き別窓へ移すためのライフサイクルだけを管理する。
 *
 * 変更理由: 別窓の生成・CSS移送・終了監視を各ページへ持たせると、スレ・スレ一覧・
 * 書き込みで挙動がずれるため、表示するReactツリーから独立した境界にまとめる。
 */
export function useAuxiliaryWindow(options: AuxiliaryWindowOptions): AuxiliaryWindowState {
  const handleRef = useRef<ManagedAuxiliaryWindowHandle | null>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);

  const close = useCallback(() => {
    const handle = handleRef.current;
    handleRef.current = null;
    setRoot(null);
    if (!handle) {
      return;
    }

    releaseHandle(handle);
  }, []);

  const open = useCallback(
    (sourceWindow?: Window) => {
      const existing = handleRef.current;
      if (existing && !existing.window.closed) {
        existing.window.focus();
        return true;
      }

      const opener = sourceWindow ?? (typeof window === "undefined" ? null : window);
      if (!opener) {
        return false;
      }

      const opened = sourceWindow
        ? openAuxiliaryWindow(options, sourceWindow)
        : openAuxiliaryWindow(options);
      if (!opened) {
        return false;
      }

      const { window: auxiliaryWindow, root: auxiliaryRoot } = opened;
      const isCurrent = () => handleRef.current?.window === auxiliaryWindow;
      const handleClosed = () => {
        const handle = handleRef.current;
        if (handle?.window !== auxiliaryWindow) {
          return;
        }
        handleRef.current = null;
        setRoot(null);
        releaseHandle(handle);
      };
      // 変更理由: 以前はbeforeunloadを窓の終了として扱っていたため、別窓でF5を押すと
      // Portal先だけが消えて真っ白な窓が残った。タブ別窓と同じ監視へ寄せ、再読み込みでは
      // rootを作り直して表示を復元し、closedを確認できた時だけ終了として扱う。
      const watcher = watchAuxiliaryWindow({
        window: auxiliaryWindow,
        sourceDocument: opener.document,
        isCurrent,
        getReconnectOptions: () => options,
        onClosed: handleClosed,
        onReconnect: (nextRoot) => {
          const handle = handleRef.current;
          if (handle?.window !== auxiliaryWindow) {
            return;
          }
          handleRef.current = { ...handle, root: nextRoot };
          setRoot(nextRoot);
        },
      });
      // beforeunloadの発火には実装差があるため、OSの×による終了は親窓から確認する。
      const closedMonitorId = opener.setInterval(() => {
        if (auxiliaryWindow.closed) {
          handleClosed();
        }
      }, CLOSED_MONITOR_INTERVAL_MS);
      handleRef.current = {
        window: auxiliaryWindow,
        root: auxiliaryRoot,
        watcher,
        closedMonitorId,
        opener,
      };
      setRoot(auxiliaryRoot);
      auxiliaryWindow.focus();
      return true;
    },
    [options],
  );

  useEffect(() => {
    return () => {
      const handle = handleRef.current;
      handleRef.current = null;
      if (handle) {
        releaseHandle(handle);
      }
    };
  }, []);

  return useMemo(
    () => ({
      root,
      isOpen: root !== null,
      open,
      close,
    }),
    [close, open, root],
  );
}
