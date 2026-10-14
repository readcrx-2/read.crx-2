import { type Dispatch, type FC, useEffect, useRef } from "react";
import { tabActions } from "src/features/tabs/browser/tab-store-actions";
import {
  type ScopedTabAction,
  TAB_ACTION_TYPES,
  type TabAction,
} from "src/features/tabs/browser/tab-store-types";
import { useDetachedTabController } from "src/features/tabs/browser/use-detached-tab-controller";
import { useTabDispatchForTab, useTabStore } from "src/features/tabs/browser/use-tab-store";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";

interface WindowNavigationBridgeProps {
  /** 別窓では表示対象を固定する。本窓では省略してselectedTabから解決する。 */
  tabId?: string;
  /** 本窓のブラウザ履歴をアプリ内履歴へ変換するか。別窓では無効にする。 */
  manageBrowserHistory?: boolean;
}

type WindowNavigationAction = Extract<
  TabAction,
  { type: typeof TAB_ACTION_TYPES.GO_BACK | typeof TAB_ACTION_TYPES.GO_FORWARD }
> &
  Pick<ScopedTabAction, "paneId" | "tabId">;

/**
 * 一つのWindowProxyに一つだけ戻る・進む入力を接続する。
 *
 * 変更理由: TabProviderにwindow全体のイベントを置くと、別窓のPortalも同じ
 * dispatchを共有し、元窓のサイドボタンで別窓のタブまで動いてしまう。入力元の
 * Windowと操作対象のtabIdをここで対にして、表示領域ごとの境界を保つ。
 */
export const WindowNavigationBridge: FC<WindowNavigationBridgeProps> = ({
  tabId: fixedTabId,
  manageBrowserHistory = fixedTabId == null,
}) =>
  fixedTabId == null ? (
    <MainWindowNavigationBridge manageBrowserHistory={manageBrowserHistory} />
  ) : (
    <FixedWindowNavigationBridge tabId={fixedTabId} manageBrowserHistory={manageBrowserHistory} />
  );

const MainWindowNavigationBridge: FC<{ manageBrowserHistory: boolean }> = ({
  manageBrowserHistory,
}) => {
  const { selectedTab, dispatch } = useTabStore();
  const { isDetachedTab } = useDetachedTabController();
  const { window: viewWindow } = useViewSurface();
  const targetTabId = isDetachedTab(selectedTab.id) ? null : selectedTab.id;
  useWindowNavigationEvents({ dispatch, manageBrowserHistory, targetTabId, viewWindow });
  return null;
};

const FixedWindowNavigationBridge: FC<{
  tabId: string;
  manageBrowserHistory: boolean;
}> = ({ tabId, manageBrowserHistory }) => {
  const dispatch = useTabDispatchForTab(tabId);
  const { window: viewWindow } = useViewSurface();
  useWindowNavigationEvents({
    dispatch,
    manageBrowserHistory,
    targetTabId: tabId,
    viewWindow,
  });
  return null;
};

function useWindowNavigationEvents({
  dispatch,
  manageBrowserHistory,
  targetTabId,
  viewWindow,
}: {
  dispatch: Dispatch<WindowNavigationAction>;
  manageBrowserHistory: boolean;
  targetTabId: string | null;
  viewWindow: Window;
}): void {
  const targetTabIdRef = useRef(targetTabId);
  const dispatchRef = useRef(dispatch);
  targetTabIdRef.current = targetTabId;
  dispatchRef.current = dispatch;

  useEffect(() => {
    // 別窓はWindowProxy自身の履歴をアプリ履歴に置き換えない。
    // 本窓でも対象タブが別窓へ移った間は、誤操作を防ぐため何も送らない。
    const navigate = (
      action: Extract<
        TabAction,
        { type: typeof TAB_ACTION_TYPES.GO_BACK | typeof TAB_ACTION_TYPES.GO_FORWARD }
      >,
    ) => {
      const currentTabId = targetTabIdRef.current;
      if (!currentTabId) {
        return;
      }
      dispatchRef.current({ ...action, tabId: currentTabId });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.shiftKey) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigate(tabActions.goBack());
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        navigate(tabActions.goForward());
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (event.button === 3) {
        event.preventDefault();
        navigate(tabActions.goBack());
      } else if (event.button === 4) {
        event.preventDefault();
        navigate(tabActions.goForward());
      }
    };

    const handlePopState = () => {
      // 拡張機能ページからの離脱を防ぎ、アプリ内履歴へ変換するのは本窓だけに限定する。
      if (!manageBrowserHistory) {
        return;
      }
      viewWindow.history.pushState({ app: true }, "");
      navigate(tabActions.goBack());
    };

    viewWindow.addEventListener("keydown", handleKeyDown);
    viewWindow.addEventListener("mouseup", handleMouseUp);
    if (manageBrowserHistory) {
      viewWindow.addEventListener("popstate", handlePopState);
    }

    return () => {
      viewWindow.removeEventListener("keydown", handleKeyDown);
      viewWindow.removeEventListener("mouseup", handleMouseUp);
      if (manageBrowserHistory) {
        viewWindow.removeEventListener("popstate", handlePopState);
      }
    };
  }, [manageBrowserHistory, viewWindow]);

  useEffect(() => {
    if (!manageBrowserHistory) {
      return;
    }
    // targetTabIdの変更ではリスナーを張り直さず、ブラウザ履歴の初期化も一度だけ行う。
    viewWindow.history.replaceState({ app: true }, "");
  }, [manageBrowserHistory, viewWindow]);
}
