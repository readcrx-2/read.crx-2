import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createLogger } from "src/app/logger";
import {
  type AuxiliaryWindowWatcher,
  watchAuxiliaryWindow,
} from "src/features/auxiliary-window/browser/auxiliary-window-watcher";
import {
  type AuxiliaryWindowHandle,
  type AuxiliaryWindowOptions,
  openAuxiliaryWindow,
} from "src/features/auxiliary-window/browser/use-auxiliary-window";
import {
  type DetachedTabController,
  DetachedTabControllerContext,
} from "src/features/tabs/browser/detached-tab-controller";
import { useTheme } from "src/view/browser/hooks/use-theme";
import type { ViewSurface } from "src/view/browser/hooks/use-view-surface";
import { DetachedTabWindowContent } from "src/view/browser/shell/DetachedTabWindowContent";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import {
  useTabDispatch,
  useTabPanes,
  useTabStore,
} from "src/view/browser/state/tabs/use-tab-store";
import { getCurrentPage, type Page, type Pane, type Tab } from "src/view/browser/types";

const logger = createLogger("view/browser");

interface TabWindowEntry extends AuxiliaryWindowHandle {
  tabId: string;
  watcher: AuxiliaryWindowWatcher;
}

function findTab(panes: readonly Pane[], tabId: string): { tab: Tab; paneId: string } | null {
  for (const pane of panes) {
    const tab = pane.tabs.find((candidate) => candidate.id === tabId);
    if (tab) {
      return { tab, paneId: pane.id };
    }
  }
  return null;
}

function isDetachablePage(page: Page): boolean {
  return page.type === "thread" || page.type === "threadList";
}

function createTabWindowOptions(tab: Tab): AuxiliaryWindowOptions {
  const page = getCurrentPage(tab);
  const safeTabId = encodeURIComponent(tab.id);
  return {
    name: `chlens-tab-${safeTabId}`,
    features: "popup,width=1180,height=820,resizable=yes",
    title: `${page.title || "タブ"} - read.crx 2`,
    shellClassName: "detached-tab-window",
    logLabel: "TabWindow",
  };
}

/**
 * タブ本体を別窓へ移す共有ホスト。
 *
 * 変更理由: 別窓の生成・再利用・終了監視をタブメニューへ持たせると、同じタブを
 * 別経路から開いた時に窓が重複する。ここでtabId単位に一つのWindowProxyを管理し、
 * TabPanelだけをPortalすることで、タブ状態はTabStoreへ残したまま表示場所を移す。
 */
export const TabWindowHost: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { panes } = useTabPanes();
  const { stateRef } = useTabStore();
  const dispatch = useTabDispatch();
  const theme = useTheme();
  const [windows, setWindows] = useState<Map<string, TabWindowEntry>>(() => new Map());
  const windowsRef = useRef(windows);
  const closeDetachedTabRef = useRef<(tabId: string) => void>(() => {});
  windowsRef.current = windows;

  const removeWindow = useCallback((tabId: string, expectedWindow?: Window) => {
    const current = windowsRef.current;
    const entry = current.get(tabId);
    if (!entry || (expectedWindow && entry.window !== expectedWindow)) {
      return;
    }

    const next = new Map(current);
    next.delete(tabId);
    windowsRef.current = next;
    setWindows(next);
  }, []);

  /**
   * paneのactiveTabが別窓へ移っていたら、本窓で操作できるタブへactiveを移す。
   *
   * 変更理由: 切り離し直後と、本窓側の閉じる操作でactiveTabが別窓タブへ移った後とで
   * 同じ補正を二重に持つと、片方だけ修正されて不可視タブへ入力が誤配送される恐れがあるため。
   */
  const ensureVisibleActiveTab = useCallback(
    (pane: Pane) => {
      const activeWindow = windowsRef.current.get(pane.activeTabId)?.window;
      if (!activeWindow || activeWindow.closed) {
        return;
      }

      const fallbackTab = pane.tabs.find((tab) => {
        const candidateWindow = windowsRef.current.get(tab.id)?.window;
        return !candidateWindow || candidateWindow.closed;
      });
      if (fallbackTab) {
        // 切り離し中のタブを本窓のactiveTabに残すと、タブバーから消えた後に
        // 本文と戻る/進む入力だけが別窓へ誤配送されるため、表示可能なタブへ移す。
        dispatch({
          ...tabActions.selectTab(fallbackTab.id, { preserveActivePane: true }),
          paneId: pane.id,
        });
      } else {
        // ペイン内の全タブが別窓にある場合も、本窓の操作対象を不可視タブへ残さない。
        // 本窓で操作できる新規タブを一つ補い、別窓の所有権は保つ。
        dispatch({ ...tabActions.addTab({ preserveActivePane: true }), paneId: pane.id });
      }
    },
    [dispatch],
  );

  const detachTab = useCallback(
    (tabId: string) => {
      const located = findTab(panes, tabId);
      if (!located || !isDetachablePage(getCurrentPage(located.tab))) {
        return false;
      }

      const existing = windowsRef.current.get(tabId);
      if (existing && !existing.window.closed) {
        existing.window.focus();
        return true;
      }

      if (existing) {
        existing.watcher.unwatch();
        removeWindow(tabId, existing.window);
      }

      // WindowProxyの生成はクリックイベントの同期処理で行い、ポップアップブロックを
      // 避ける。ReactのsetState updater内で開くとStrictMode等で副作用が二重実行される。
      const opened = openAuxiliaryWindow(createTabWindowOptions(located.tab));
      if (!opened) {
        return false;
      }

      // OSの×では親窓のclosed監視も併用し、再読み込みでタブを誤って消さないようにする。
      const entry: TabWindowEntry = {
        ...opened,
        tabId,
        watcher: watchAuxiliaryWindow({
          window: opened.window,
          sourceDocument: document,
          isCurrent: () => windowsRef.current.get(tabId)?.window === opened.window,
          getReconnectOptions: () => {
            const currentLocation = findTab(stateRef.current.panes, tabId);
            return currentLocation ? createTabWindowOptions(currentLocation.tab) : null;
          },
          onClosed: () => closeDetachedTabRef.current(tabId),
          onReconnect: (root) => {
            // タブを元窓へ勝手に戻さず、同じWindowProxyのrootだけを差し替える。
            const next = new Map(windowsRef.current);
            const latest = next.get(tabId);
            if (!latest || latest.window !== opened.window) {
              return;
            }
            next.set(tabId, { ...latest, root });
            windowsRef.current = next;
            setWindows(next);
          },
        }),
      };
      const next = new Map(windowsRef.current);
      next.set(tabId, entry);
      windowsRef.current = next;
      setWindows(next);

      const locatedPane = panes.find((pane) => pane.id === located.paneId);
      if (locatedPane) {
        ensureVisibleActiveTab(locatedPane);
      }
      opened.window.focus();
      return true;
    },
    [ensureVisibleActiveTab, panes, removeWindow, stateRef],
  );

  const reattachTab = useCallback(
    (tabId: string) => {
      const entry = windowsRef.current.get(tabId);
      if (!entry) {
        return;
      }

      entry.watcher.release();
      removeWindow(tabId, entry.window);

      const located = findTab(stateRef.current.panes, tabId);
      if (located) {
        // 明示的な「戻す」だけはタブを保持し、元ペインで選択された状態に戻す。
        dispatch({ ...tabActions.selectTab(tabId), paneId: located.paneId });
      }
    },
    [dispatch, removeWindow, stateRef],
  );

  const closeDetachedTab = useCallback(
    (tabId: string) => {
      const entry = windowsRef.current.get(tabId);
      if (!entry) {
        return;
      }

      const currentPanes = stateRef.current.panes;
      const located = findTab(currentPanes, tabId);
      const pane = located && currentPanes.find((candidate) => candidate.id === located.paneId);
      if (!located || located.tab.pinned || !pane) {
        // TabStoreの固定タブ保護を破らず、操作不能な不可視タブを残さないため、
        // 構造上閉じられない場合は明示的な復帰へフォールバックする。
        logger.warn("このタブは別窓から終了できないため元画面へ戻します", tabId);
        reattachTab(tabId);
        return;
      }

      // 先に監視を外してからCLOSE_TABを送ることで、プログラム終了をOS終了として
      // 二重処理せず、閉じたタブ履歴にも一度だけ記録する。
      entry.watcher.release();
      removeWindow(tabId, entry.window);
      dispatch({
        ...tabActions.closeTab(tabId, {
          preserveActivePane: true,
          replaceLastTab: true,
        }),
        paneId: located.paneId,
      });
    },
    [dispatch, reattachTab, removeWindow, stateRef],
  );
  closeDetachedTabRef.current = closeDetachedTab;

  const focusTabWindow = useCallback((tabId: string) => {
    const entry = windowsRef.current.get(tabId);
    if (entry && !entry.window.closed) {
      entry.window.focus();
    }
  }, []);

  const isDetachedTab = useCallback(
    (tabId: string) => {
      // closed=trueを検知してからCLOSE_TABを確定するまでの間も、レジストリ上は
      // 切り離し中として扱う。監視周期の隙間で本窓へ一瞬だけ戻る表示を防ぐ。
      return windows.has(tabId);
    },
    [windows],
  );

  const handleClosedWindow = useCallback(
    (tabId: string, expectedWindow: Window) => {
      const entry = windowsRef.current.get(tabId);
      if (!entry || entry.window !== expectedWindow || !expectedWindow.closed) {
        return;
      }

      // beforeunloadはreloadでも発火するので、closedを親窓から確認できた場合だけ
      // タブを終了する。entry identityも照合し、同じtabIdの再オープンを誤って閉じない。
      closeDetachedTab(tabId);
    },
    [closeDetachedTab],
  );

  useEffect(() => {
    // WindowProxyのbeforeunload通知はブラウザ実装差があるため、親窓からclosedを
    // 定期確認する。再読み込みではclosed=falseのままなのでタブを失わない。
    const monitorId = window.setInterval(() => {
      for (const [tabId, entry] of windowsRef.current) {
        handleClosedWindow(tabId, entry.window);
      }
    }, 250);
    return () => window.clearInterval(monitorId);
  }, [handleClosedWindow]);

  useEffect(() => {
    for (const pane of panes) {
      ensureVisibleActiveTab(pane);
    }
  }, [ensureVisibleActiveTab, panes, windows]);

  // タブを閉じる／復元する操作と別窓のライフサイクルを同期する。
  useEffect(() => {
    const availableTabIds = new Set(panes.flatMap((pane) => pane.tabs.map((tab) => tab.id)));
    for (const [tabId, entry] of windowsRef.current) {
      if (availableTabIds.has(tabId)) {
        continue;
      }
      entry.watcher.release();
      removeWindow(tabId, entry.window);
    }
  }, [panes, removeWindow]);

  // ナビゲーションでページタイトルが変わったら、別窓のタイトルも追従させる。
  useEffect(() => {
    for (const entry of windows.values()) {
      const located = findTab(panes, entry.tabId);
      if (!located || entry.window.closed) {
        continue;
      }
      const page = getCurrentPage(located.tab);
      entry.window.document.title = `${page.title || "タブ"} - read.crx 2`;
      entry.root.dataset.theme = theme;
    }
  }, [panes, theme, windows]);

  useEffect(() => {
    return () => {
      for (const entry of windowsRef.current.values()) {
        entry.watcher.release();
      }
    };
  }, []);

  const contextValue = useMemo<DetachedTabController>(
    () => ({ isDetachedTab, detachTab, reattachTab, closeDetachedTab, focusTabWindow }),
    [closeDetachedTab, detachTab, focusTabWindow, isDetachedTab, reattachTab],
  );

  return (
    <DetachedTabControllerContext.Provider value={contextValue}>
      {children}
      {[...windows.values()].map((entry) => {
        const located = findTab(panes, entry.tabId);
        if (!located || entry.window.closed) {
          return null;
        }

        const viewSurface: ViewSurface = {
          window: entry.window,
          document: entry.window.document,
        };
        return createPortal(
          <DetachedTabWindowContent
            tab={located.tab}
            paneId={located.paneId}
            surface={viewSurface}
          />,
          entry.root,
          entry.tabId,
        );
      })}
    </DetachedTabControllerContext.Provider>
  );
};
