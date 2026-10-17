import React, {
  createContext,
  type Dispatch,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { registerDebugStateProvider } from "src/app/debug/debug-api";
import { createLogger } from "src/app/logger";
import { platform } from "src/app/platform";
import { container } from "src/service-container/index";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { recordAutoRefreshTransitions } from "src/view/browser/state/tabs/tab-store-debug";
import {
  clearThreadVisitsForTab,
  deriveHistoryBoardTitle,
  getThreadVisitKey,
  isHistoryDisabled,
  reportHistoryPersistenceError,
  type ThreadHistoryVisit,
} from "src/view/browser/state/tabs/tab-store-history-visit";
import {
  createPane,
  createTab,
  createTabFromPage,
  readInitialPageFromLocation,
} from "src/view/browser/state/tabs/tab-store-new-tab";
import { getPageIdentity } from "src/view/browser/state/tabs/tab-store-page-identity";
import { tabReducer } from "src/view/browser/state/tabs/tab-store-reducer";
import { findTabAcrossPanes } from "src/view/browser/state/tabs/tab-store-selectors";
import {
  loadTabStoreSession,
  saveTabStoreSession,
} from "src/view/browser/state/tabs/tab-store-session";
import {
  getActivePane,
  getActivePaneActiveTab,
  getPane,
  getPaneActiveTab,
  resolvePaneId,
  updatePane,
} from "src/view/browser/state/tabs/tab-store-state-helpers";
import {
  type PaneScopedState,
  type PaneScopedTabStore,
  type ScopedTabAction,
  TAB_ACTION_TYPES,
  type TabStoreState,
} from "src/view/browser/state/tabs/tab-store-types";
import { useTabViewScope } from "src/view/browser/state/tabs/use-tab-view-scope";
import {
  getCurrentPage,
  getPageViewStateKey,
  type Page,
  type Pane,
  type TabViewState,
} from "src/view/browser/types";
import { parseInternalBrowserPage } from "src/view/browser/utils/link-routing";
import browser from "webextension-polyfill";

const logger = createLogger("view/browser");

export type { TabActionCreators } from "src/view/browser/state/tabs/tab-store-actions";
export { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
export type {
  PaneScopedState,
  PaneScopedTabStore,
  ScopedTabAction,
  TabAction,
  TabStoreState,
} from "src/view/browser/state/tabs/tab-store-types";
export { TAB_ACTION_TYPES } from "src/view/browser/state/tabs/tab-store-types";

const initialPageFromLocation = readInitialPageFromLocation();
const restoredSession = loadTabStoreSession();
const initialState: TabStoreState = (() => {
  if (restoredSession) {
    if (!initialPageFromLocation) return restoredSession;
    // 外部リンクの起動先は復元済みセッションへ追加する。qを理由に復元を飛ばすと、
    // 起動時の保存で以前のタブが上書きされ、F5でも同じ初期化が繰り返される。
    const pane = getActivePane(restoredSession);
    const target =
      pane.tabs.find(
        (tab) => getPageIdentity(getCurrentPage(tab)) === getPageIdentity(initialPageFromLocation),
      ) ?? createTabFromPage(initialPageFromLocation);
    return updatePane(restoredSession, pane.id, (current) => ({
      ...current,
      tabs: pane.tabs.includes(target) ? pane.tabs : [...pane.tabs, target],
      activeTabId: target.id,
    }));
  }
  const tab = initialPageFromLocation ? createTabFromPage(initialPageFromLocation) : createTab();
  const pane = createPane(tab);
  return {
    panes: [pane],
    activePaneId: pane.id,
    closedTabs: [],
  };
})();

// --- ペイン解決ヘルパー ---

// --- Context ---

// グローバルコンテキスト: ペイン配列を含む全体状態を保持する。
interface TabContextValue {
  state: TabStoreState;
  // startTransition 配下の dispatch でも常に最新 state を参照できるよう同期 ref を公開する。
  stateRef: React.RefObject<TabStoreState>;
  dispatch: Dispatch<ScopedTabAction>;
}

const TabContext = createContext<TabContextValue | null>(null);
const TabDispatchContext = createContext<Dispatch<ScopedTabAction> | null>(null);
// 各ペインのサブツリーに paneId を供給する。未提供時はアクティブペインにフォールバックする。
const PaneContext = createContext<{ paneId: string } | null>(null);

export const PaneProvider: React.FC<{
  paneId: string;
  children: ReactNode;
}> = ({ paneId, children }) => {
  const value = useMemo(() => ({ paneId }), [paneId]);
  return <PaneContext.Provider value={value}>{children}</PaneContext.Provider>;
};

export const TabProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // 変更理由: reducerはタブ生成時にcrypto.randomUUID()や設定値を使うため純粋ではない。
  // 以前はdispatch内の同期計算とuseReducerで2回評価しており、新規タブのIDが
  // stateRef側と描画側で食い違って閲覧履歴のタイトル同期などが外れていた。
  // reducerはdispatchで1回だけ評価し、その結果をstateRefとReact stateの両方へ渡す。
  const [state, setState] = useState(initialState);
  const stateRef = useRef(state);
  const threadVisitRef = useRef<Map<string, ThreadHistoryVisit>>(new Map());
  // ウィンドウタイトル更新用に、アクティブペインのアクティブタブの現在ページを参照する。
  const currentPage = getCurrentPage(getActivePaneActiveTab(state));

  const persistThreadVisit = useCallback(
    (tabId: string, page: Extract<Page, { type: "thread" }>) => {
      if (isHistoryDisabled()) {
        clearThreadVisitsForTab(threadVisitRef.current, tabId);
        return;
      }

      const date = Date.now();
      const visitKey = getThreadVisitKey(tabId, page.threadUrl);
      const visit: ThreadHistoryVisit = {
        tabId,
        threadUrl: page.threadUrl,
        title: page.title,
        boardTitle: deriveHistoryBoardTitle(page.threadUrl),
        date,
        pending: Promise.resolve(),
      };

      clearThreadVisitsForTab(threadVisitRef.current, tabId);

      visit.pending = (async () => {
        if (visit.title === visit.threadUrl) {
          try {
            const previousRecords = await container.history.getByUrl(visit.threadUrl);
            const previousTitle = previousRecords.find(
              (record) => record.title.trim() !== "" && record.title !== visit.threadUrl,
            )?.title;
            if (previousTitle) {
              // 変更理由: URLだけで開かれた過去スレでは、取得完了まで既知のタイトルを履歴に残す。
              visit.title = previousTitle;
            }
          } catch (error) {
            // 変更理由: 既存履歴の参照に失敗しても、新しい閲覧記録そのものは欠かさず保存する。
            reportHistoryPersistenceError("既存履歴タイトルの取得に失敗しました", error);
          }
        }
        await container.history.add(visit.threadUrl, visit.title, visit.date, visit.boardTitle);
      })().catch((error) => {
        reportHistoryPersistenceError("閲覧履歴の保存に失敗しました", error);
      });

      threadVisitRef.current.set(visitKey, visit);
    },
    [],
  );

  const hasRecordedLaunchVisitRef = useRef(false);
  useEffect(() => {
    if (hasRecordedLaunchVisitRef.current || initialPageFromLocation?.type !== "thread") return;
    hasRecordedLaunchVisitRef.current = true;
    // 「ChLensで開く」の起動先は初期stateへ直接入るため、開くactionを経由しない。
    // この経路でも閲覧記録を作り、取得後のタイトル更新を同じ履歴へ反映できるようにする。
    const launchTab = getActivePaneActiveTab(stateRef.current);
    const page = getCurrentPage(launchTab);
    if (
      page.type === "thread" &&
      getPageIdentity(page) === getPageIdentity(initialPageFromLocation)
    ) {
      persistThreadVisit(launchTab.id, page);
    }
  }, [persistThreadVisit]);

  const syncThreadVisitTitle = useCallback(
    (tabId: string, page: Extract<Page, { type: "thread" }>, title: string) => {
      const visitKey = getThreadVisitKey(tabId, page.threadUrl);
      const visit = threadVisitRef.current.get(visitKey);
      if (!visit || visit.title === title || title.trim() === "") {
        return;
      }

      visit.pending = visit.pending
        .then(async () => {
          await container.history.remove(visit.threadUrl, visit.date);
          await container.history.add(visit.threadUrl, title, visit.date, visit.boardTitle);
          visit.title = title;
        })
        .catch((error) => {
          reportHistoryPersistenceError("閲覧履歴タイトルの更新に失敗しました", error);
        });
    },
    [],
  );

  const dispatch = useCallback<Dispatch<ScopedTabAction>>(
    (action) => {
      const prevState = stateRef.current;
      const nextState = tabReducer(prevState, action);
      // 開始拒否は状態が変わらない場合もあるため、同一stateで抜ける前に記録する。
      recordAutoRefreshTransitions(action, prevState, nextState);
      if (nextState === prevState) return;
      // stateRefは常に最後にdispatchした結果を指す。描画後のEffectで書き戻すと、
      // startTransitionで先に確定した古い描画がrefを巻き戻すため、ここだけで更新する。
      stateRef.current = nextState;
      setState(nextState);
      // Reactの描画後のEffectまで保存を待つと、その前のF5・終了で直前の操作が失われるため、
      // 操作時点で保存する。reducerは1回しか評価しないので、保存内容と描画内容は一致する。
      saveTabStoreSession(nextState);

      const recordThreadVisitForTab = (tabId: string) => {
        const nextTab = findTabAcrossPanes(nextState, tabId);
        if (!nextTab) {
          return;
        }

        const nextPage = getCurrentPage(nextTab);
        if (nextPage.type !== "thread") {
          return;
        }

        const prevTab = findTabAcrossPanes(prevState, tabId);
        const prevPage = prevTab ? getCurrentPage(prevTab) : null;
        if (prevPage?.type === "thread" && prevPage.threadUrl === nextPage.threadUrl) {
          return;
        }

        // 変更理由: 戻る/進むではなく「開く系 action」で current page が thread に変わった瞬間に記録し、
        // 背景タブでも表示待ちなしで履歴へ出るようにする。
        persistThreadVisit(tabId, nextPage);
      };

      switch (action.type) {
        case TAB_ACTION_TYPES.NAVIGATE:
        case TAB_ACTION_TYPES.FOLLOW_NEXT_THREAD:
        case TAB_ACTION_TYPES.NAVIGATE_TAB: {
          // 対象タブが明示されていれば別窓の描画タブを記録し、省略時は従来どおりペインのactiveTabを記録する。
          const paneId = resolvePaneId(prevState, action.paneId);
          const targetTabId = action.tabId ?? getPane(nextState, paneId).activeTabId;
          recordThreadVisitForTab(targetTabId);
          return;
        }

        case TAB_ACTION_TYPES.OPEN_IN_NEW_TAB:
        case TAB_ACTION_TYPES.OPEN_IN_NEW_TAB_FORCE:
        case TAB_ACTION_TYPES.REOPEN_CLOSED_TAB: {
          const prevTabIds = new Set(prevState.panes.flatMap((p) => p.tabs).map((tab) => tab.id));
          const insertedTab = nextState.panes
            .flatMap((p) => p.tabs)
            .find((tab) => !prevTabIds.has(tab.id));
          if (insertedTab) {
            recordThreadVisitForTab(insertedTab.id);
          }
          return;
        }

        case TAB_ACTION_TYPES.UPDATE_TITLE: {
          const paneId = resolvePaneId(nextState, action.paneId);
          const targetTabId = action.tabId ?? getPane(nextState, paneId).activeTabId;
          const nextTab = findTabAcrossPanes(nextState, targetTabId);
          const nextPage = nextTab ? getCurrentPage(nextTab) : null;
          if (nextPage?.type === "thread") {
            syncThreadVisitTitle(targetTabId, nextPage, action.title);
          }
          return;
        }

        case TAB_ACTION_TYPES.UPDATE_TITLE_FOR_TAB: {
          if (action.boardUrl) {
            return;
          }
          const nextTab = findTabAcrossPanes(nextState, action.tabId);
          const nextPage = nextTab ? getCurrentPage(nextTab) : null;
          if (nextPage?.type === "thread") {
            syncThreadVisitTitle(action.tabId, nextPage, action.title);
          }
          return;
        }

        default:
          return;
      }
    },
    [persistThreadVisit, syncThreadVisitTitle],
  );

  // 外部CLIからペイン・タブ構成と自動更新状態を確認できるよう、最新のstateを公開する。
  useEffect(
    () =>
      registerDebugStateProvider("tabs", () => {
        const current = stateRef.current;
        return {
          activePaneId: current.activePaneId,
          panes: current.panes.map((pane) => ({
            id: pane.id,
            activeTabId: pane.activeTabId,
            tabs: pane.tabs.map((tab) => ({
              id: tab.id,
              page: getCurrentPage(tab),
              autoRefreshEnabled: tab.autoRefreshEnabled,
              autoRefreshPageKey: tab.autoRefreshPageKey,
              autoRefreshStoppedPageKey: tab.autoRefreshStoppedPageKey ?? null,
            })),
          })),
        };
      }),
    [],
  );

  // background からの新タブ追加指示を受け取り OPEN_IN_NEW_TAB をディスパッチする
  useEffect(() => {
    const handleMessage = (message: unknown) => {
      const msg = message as { type?: unknown; url?: unknown };
      if (msg.type === "open-tab-in-viewer" && typeof msg.url === "string") {
        const page = parseInternalBrowserPage(msg.url);
        if (page) {
          dispatch(tabActions.openInNewTab(page));
        }
      }
    };
    browser.runtime.onMessage.addListener(handleMessage);
    return () => {
      browser.runtime.onMessage.removeListener(handleMessage);
    };
  }, [dispatch]);

  // セッション永続化: 変更はdispatch時に保存済みなので、ここでは起動時の初期状態だけを保存する。
  // 起動URLのqで追加したタブを、下のEffectでqを消す前に保存しておく必要がある。
  useEffect(() => {
    saveTabStoreSession(stateRef.current);
  }, []);

  useEffect(() => {
    if (!initialPageFromLocation) return;
    try {
      // 起動指示は一度だけ消費し、次のF5では現在の保存済みセッションをそのまま復元する。
      const url = new window.URL(window.location.href);
      url.searchParams.delete("q");
      window.history.replaceState(window.history.state, "", url.href);
    } catch (error) {
      logger.error("起動先のURLパラメーターを消費できませんでした", error);
    }
  }, []);

  // アクティブタブのページタイトルが変わったらウィンドウタイトルを更新する
  useEffect(() => {
    const title = currentPage.title ? `${currentPage.title} - read.crx 2` : "read.crx 2";
    platform.window.setTitle(title).catch(() => {});
  }, [currentPage.title]);

  const contextValue = useMemo<TabContextValue>(
    () => ({ state, stateRef, dispatch }),
    [state, dispatch],
  );

  return (
    <TabDispatchContext.Provider value={dispatch}>
      <TabContext.Provider value={contextValue}>{children}</TabContext.Provider>
    </TabDispatchContext.Provider>
  );
};

// 注入された paneId を解決する（無効/未提供ならアクティブペイン）。
function usePaneIdFromContext(state: TabStoreState): string {
  const paneCtx = useContext(PaneContext);
  if (paneCtx && state.panes.some((p) => p.id === paneCtx.paneId)) {
    return paneCtx.paneId;
  }
  return state.activePaneId;
}

/**
 * 表示中のタブを暗黙の対象にできる操作だけを列挙する。
 *
 * 変更理由: OPEN_IN_NEW_TAB_FORCE.tabIdなどは「新しく作るタブ」のIDであり、
 * 表示タブのIDを機械的に補うと新規タブの識別子を上書きして衝突する。
 */
function actionUsesImplicitExistingTab(action: ScopedTabAction): boolean {
  switch (action.type) {
    case TAB_ACTION_TYPES.NAVIGATE:
    case TAB_ACTION_TYPES.GO_BACK:
    case TAB_ACTION_TYPES.GO_FORWARD:
    case TAB_ACTION_TYPES.GO_TO_HISTORY_INDEX:
    case TAB_ACTION_TYPES.UPDATE_TITLE:
    case TAB_ACTION_TYPES.RELOAD:
    case TAB_ACTION_TYPES.FOLLOW_NEXT_THREAD:
    case TAB_ACTION_TYPES.SET_AUTO_REFRESH_ENABLED:
    case TAB_ACTION_TYPES.SET_AUTO_REFRESH_STOPPED_PAGE_KEY:
      return true;
    default:
      return false;
  }
}

function scopeActionToViewTab(
  action: ScopedTabAction,
  paneId: string,
  viewTabId: string | null,
): ScopedTabAction {
  const scopedAction = action.paneId === undefined ? { ...action, paneId } : action;
  if (
    scopedAction.tabId !== undefined ||
    viewTabId == null ||
    !actionUsesImplicitExistingTab(scopedAction)
  ) {
    return scopedAction;
  }
  return { ...scopedAction, tabId: viewTabId };
}

export function useTabStore(): PaneScopedTabStore {
  const ctx = useContext(TabContext);
  if (!ctx) {
    throw new Error("useTabStore must be used within TabProvider");
  }
  const paneId = usePaneIdFromContext(ctx.state);
  const pane = getPane(ctx.state, paneId);
  const viewScope = useTabViewScope();
  const selectedTab = getPaneActiveTab(pane);
  // スコープのタブが閉じた瞬間も読み取り側は描画できるよう選択タブへ戻す。
  // 操作対象はscopeTabIdを別に保持し、消えた別窓から選択タブへ誤送信しない。
  const scopedViewTab = viewScope ? findTabAcrossPanes(ctx.state, viewScope.tabId) : null;
  const viewTab = scopedViewTab ?? selectedTab;
  const scopeTabId = scopedViewTab?.id ?? null;
  const hasViewScope = viewScope !== null;
  const selectedTabId = selectedTab.id;
  const viewTabId = viewTab.id;
  const viewPage = getCurrentPage(viewTab);

  // 既存の一覧・閉じたタブ参照を壊さず、選択対象だけを明示的に返す。
  const state: PaneScopedState = useMemo(
    () => ({
      tabs: pane.tabs,
      selectedTabId,
      closedTabs: ctx.state.closedTabs,
    }),
    [ctx.state.closedTabs, pane.tabs, selectedTabId],
  );

  const globalDispatch = ctx.dispatch;
  const dispatch = useMemo<Dispatch<ScopedTabAction>>(
    () => (action) => {
      // 表示対象が消えた直後は、別タブへ操作をフォールバックさせない。
      if (hasViewScope && scopeTabId == null) {
        return;
      }
      globalDispatch(scopeActionToViewTab(action, paneId, scopeTabId));
    },
    [globalDispatch, hasViewScope, paneId, scopeTabId],
  );

  return {
    state,
    stateRef: ctx.stateRef,
    dispatch,
    selectedTab,
    selectedTabId,
    viewTab,
    viewTabId,
    viewPage,
    paneId,
  };
}

export function useTabDispatch(): Dispatch<ScopedTabAction> {
  const tabContext = useContext(TabContext);
  const globalDispatch = useContext(TabDispatchContext);
  if (!globalDispatch) {
    throw new Error("useTabDispatch must be used within TabProvider");
  }
  if (!tabContext) {
    throw new Error("useTabDispatch must be used within TabProvider");
  }
  const viewScope = useTabViewScope();
  const paneCtx = useContext(PaneContext);
  const paneId = paneCtx?.paneId ?? tabContext.state.activePaneId;
  const scopeTabId = viewScope
    ? (findTabAcrossPanes(tabContext.state, viewScope.tabId)?.id ?? null)
    : null;
  const hasViewScope = viewScope !== null;
  return useMemo<Dispatch<ScopedTabAction>>(
    () => (action) => {
      if (hasViewScope && scopeTabId == null) {
        return;
      }
      globalDispatch(scopeActionToViewTab(action, paneId, scopeTabId));
    },
    [globalDispatch, hasViewScope, paneId, scopeTabId],
  );
}

export function useTabDispatchForTab(tabId: string): Dispatch<ScopedTabAction> {
  const dispatch = useTabDispatch();
  return useMemo<Dispatch<ScopedTabAction>>(
    () => (action) => {
      // 変更理由: 別窓のページは元ペインのselectedTabと一致しない場合があるため、
      // 既存タブを暗黙に操作するページアクションだけへ描画元タブを補う。
      dispatch(
        action.tabId === undefined && actionUsesImplicitExistingTab(action)
          ? { ...action, tabId }
          : action,
      );
    },
    [dispatch, tabId],
  );
}

const EMPTY_TAB_VIEW_STATE: TabViewState = {};

export function useTabViewState(
  tabId: string,
  page: Page,
): {
  state: TabViewState;
  update: (patch: Partial<TabViewState>) => void;
} {
  const { state, dispatch } = useTabStore();
  const tab = state.tabs.find((candidate) => candidate.id === tabId);
  const pageKey = getPageViewStateKey(page);
  const persistedState = tab?.viewStates?.[pageKey] ?? EMPTY_TAB_VIEW_STATE;

  const update = useCallback(
    (patch: Partial<TabViewState>) => {
      dispatch(tabActions.updateTabViewState(tabId, pageKey, patch));
    },
    [dispatch, pageKey, tabId],
  );

  return {
    state: persistedState,
    update,
  };
}

// App レイアウト用: ペイン配列とアクティブペインを取得する。
export function useTabPanes(): { panes: Pane[]; activePaneId: string } {
  const ctx = useContext(TabContext);
  if (!ctx) {
    throw new Error("useTabPanes must be used within TabProvider");
  }
  return { panes: ctx.state.panes, activePaneId: ctx.state.activePaneId };
}

export function useActivePaneId(): string {
  const ctx = useContext(TabContext);
  if (!ctx) {
    throw new Error("useActivePaneId must be used within TabProvider");
  }
  return ctx.state.activePaneId;
}

// 現在のサブツリーが属するペインの id（無ければアクティブペイン）。
export function usePaneId(): string {
  const ctx = useContext(TabContext);
  if (!ctx) {
    throw new Error("usePaneId must be used within TabProvider");
  }
  return usePaneIdFromContext(ctx.state);
}
