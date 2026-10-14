import {
  getAutoRefreshPageKey,
  resetAutoRefreshState,
} from "src/view/browser/state/tabs/auto-refresh-pages";
import {
  createPane,
  createTab,
  createTabFromPage,
  shouldFocusNewTabOnOpen,
} from "src/view/browser/state/tabs/tab-store-new-tab";
import { getPageIdentity } from "src/view/browser/state/tabs/tab-store-page-identity";
import {
  canCloseTab,
  canOpenInRightPane,
  canReopenClosedTab,
  findTabAcrossPanes,
  hasClosableOtherTabs,
  hasClosableRightTabs,
  MAX_PANES,
} from "src/view/browser/state/tabs/tab-store-selectors";
import { sanitizeTabStoreState } from "src/view/browser/state/tabs/tab-store-session";
import {
  buildHierarchyForNewTab,
  getPane,
  getPaneActiveTab,
  pushClosed,
  pushPageToTabHistory,
  resolvePaneId,
  updatePane,
  updateTargetTab,
} from "src/view/browser/state/tabs/tab-store-state-helpers";
import {
  type ScopedTabAction,
  TAB_ACTION_TYPES,
  type TabStoreState,
} from "src/view/browser/state/tabs/tab-store-types";
import { getCurrentPage, type Pane, type Tab } from "src/view/browser/types";
import { normalizePageLocation } from "src/view/browser/utils/page-location";

// タブストア全体の reducer。
export function tabReducer(state: TabStoreState, action: ScopedTabAction): TabStoreState {
  switch (action.type) {
    case TAB_ACTION_TYPES.ADD_TAB: {
      const paneId = resolvePaneId(state, action.paneId);
      const pane = getPane(state, paneId);
      const activeTab = getPaneActiveTab(pane);
      const sourcePage = getCurrentPage(activeTab);
      const newTab = createTab(sourcePage, activeTab);
      // 固定タブの後ろに非固定タブを追加
      return {
        ...updatePane(state, paneId, (p) => ({
          ...p,
          tabs: [...p.tabs, newTab],
          activeTabId: newTab.id,
        })),
        // 別窓化で本窓用の代替タブを作る時は、元のフォーカスペインを奪わない。
        activePaneId: action.preserveActivePane ? state.activePaneId : paneId,
      };
    }

    case TAB_ACTION_TYPES.OPEN_IN_NEW_TAB: {
      // 同一 URL のタブが既に存在する場合はそちらをフォーカスして重複を防ぐ。
      // 重複判定はペイン内に閉じる（別ペインで同じスレを並べて見比べられるように）。
      // 強制的に新タブを開きたい場合は OPEN_IN_NEW_TAB_FORCE を使う。
      const paneId = resolvePaneId(state, action.paneId);
      const pane = getPane(state, paneId);
      const targetIdentity = getPageIdentity(action.page);
      const existingDuplicate = pane.tabs.find(
        (t) => getPageIdentity(getCurrentPage(t)) === targetIdentity,
      );
      if (existingDuplicate) {
        // スレを再度開く操作では既存タブへ移動するため、背景指定は新規作成時だけに適用する。
        // 板などを背景で開く操作は、既存タブがあっても現在の表示を維持する。
        if (action.background && action.page.type !== "thread") return state;
        return {
          ...updatePane(state, paneId, (p) => ({
            ...p,
            activeTabId: existingDuplicate.id,
          })),
          activePaneId: paneId,
        };
      }

      // バックグラウンドで新規タブを開く（アクティブタブ/ペインを切り替えない）。
      // buildHierarchyForNewTab で現在ページの板名を引き継いだカノニカルな祖先履歴を付与する。
      // background フラグが true の場合は、設定値を無視して常にバックグラウンドで開く。
      const newTabForOpen = createTabFromPage(action.page);
      const sourcePageForOpen = getCurrentPage(getPaneActiveTab(pane));
      const newHistoryForOpen = buildHierarchyForNewTab(sourcePageForOpen, action.page);
      const shouldFocus = action.background ? false : shouldFocusNewTabOnOpen();
      const nextPane = updatePane(state, paneId, (p) => ({
        ...p,
        tabs: [
          ...p.tabs,
          {
            ...newTabForOpen,
            history: newHistoryForOpen,
            currentIndex: newHistoryForOpen.length - 1,
          },
        ],
        activeTabId: shouldFocus ? newTabForOpen.id : p.activeTabId,
      }));

      return {
        ...nextPane,
        activePaneId: shouldFocus ? paneId : state.activePaneId,
      };
    }

    case TAB_ACTION_TYPES.OPEN_IN_NEW_TAB_FORCE: {
      const paneId = resolvePaneId(state, action.paneId);
      const pane = getPane(state, paneId);
      const newTabForForce = createTabFromPage(action.page);
      const sourcePageForForce = getCurrentPage(getPaneActiveTab(pane));
      const newHistoryForForce = buildHierarchyForNewTab(sourcePageForForce, action.page);
      const newTab = {
        ...newTabForForce,
        // 同期refとReactでReducerが別々に評価されても、外部から追従するタブのIDを一致させる。
        id: action.tabId ?? newTabForForce.id,
        history: newHistoryForForce,
        currentIndex: newHistoryForForce.length - 1,
      };
      const nextState = updatePane(state, paneId, (p) => ({
        ...p,
        tabs: [...p.tabs, newTab],
        // focus指定時は追加と選択を同じReducer処理で確定し、別dispatch間の状態競合を防ぐ。
        activeTabId: action.focus ? newTab.id : p.activeTabId,
      }));
      return action.focus ? { ...nextState, activePaneId: paneId } : nextState;
    }

    case TAB_ACTION_TYPES.CLOSE_TAB: {
      const paneId = resolvePaneId(state, action.paneId);
      const pane = getPane(state, paneId);
      const target = pane.tabs.find((t) => t.id === action.tabId);
      if (
        !target ||
        !canCloseTab(target, pane.tabs.length, {
          replaceLastTab: action.replaceLastTab,
          canCloseLastTab: state.panes.length > 1,
        })
      ) {
        return state;
      }
      // 2ペイン時は最後のタブを閉じる操作で空ペインを残さず、もう片方へ戻す。
      if (pane.tabs.length <= 1 && state.panes.length > 1 && !action.replaceLastTab) {
        const panes = state.panes.filter((candidate) => candidate.id !== paneId);
        return {
          ...state,
          panes,
          activePaneId: panes.some((candidate) => candidate.id === state.activePaneId)
            ? state.activePaneId
            : panes[0].id,
          closedTabs: pushClosed(state.closedTabs, target),
        };
      }
      // 単一ペインを空にしないため、最後のタブは同じページの代替タブへ置き換える。
      if (pane.tabs.length <= 1) {
        const replacement = createTab(getCurrentPage(target), target);
        return {
          ...updatePane(state, paneId, (p) => ({
            ...p,
            tabs: [replacement],
            activeTabId: replacement.id,
          })),
          // 別窓の終了で最後のタブを置き換える場合も、本窓のフォーカスは奪わない。
          activePaneId: action.preserveActivePane ? state.activePaneId : paneId,
          closedTabs: pushClosed(state.closedTabs, target),
        };
      }
      const closingIndex = pane.tabs.indexOf(target);
      const remaining = pane.tabs.filter((t) => t.id !== action.tabId);
      let newActiveId = pane.activeTabId;
      if (action.tabId === pane.activeTabId) {
        const newIndex = Math.min(closingIndex, remaining.length - 1);
        newActiveId = remaining[newIndex].id;
      }
      return {
        ...updatePane(state, paneId, (p) => ({
          ...p,
          tabs: remaining,
          activeTabId: newActiveId,
        })),
        // 別窓終了時は元窓のフォーカスペインを奪わない。通常のタブ閉じる操作では
        // 従来どおり対象ペインへフォーカスを移すため、呼び出し側で明示的に指定する。
        activePaneId: action.preserveActivePane ? state.activePaneId : paneId,
        closedTabs: pushClosed(state.closedTabs, target),
      };
    }

    case TAB_ACTION_TYPES.CLOSE_OTHER_TABS: {
      const paneId = resolvePaneId(state, action.paneId);
      const pane = getPane(state, paneId);
      // 指定タブと固定タブ以外を閉じる
      if (!hasClosableOtherTabs(pane.tabs, action.tabId)) return state;
      const closed = pane.tabs.filter((t) => t.id !== action.tabId && !t.pinned);
      const remaining = pane.tabs.filter((t) => t.id === action.tabId || t.pinned);
      if (remaining.length === 0) return state;
      let newClosed = state.closedTabs;
      for (const t of closed) {
        newClosed = pushClosed(newClosed, t);
      }
      return {
        ...updatePane(state, paneId, (p) => ({
          ...p,
          tabs: remaining,
          activeTabId: action.tabId,
        })),
        activePaneId: paneId,
        closedTabs: newClosed,
      };
    }

    case TAB_ACTION_TYPES.CLOSE_RIGHT_TABS: {
      const paneId = resolvePaneId(state, action.paneId);
      const pane = getPane(state, paneId);
      const idx = pane.tabs.findIndex((t) => t.id === action.tabId);
      if (idx === -1) return state;
      if (!hasClosableRightTabs(pane.tabs, action.tabId)) return state;
      const rightTabs = pane.tabs.slice(idx + 1).filter((t) => !t.pinned);
      const rightIds = new Set(rightTabs.map((t) => t.id));
      const remaining = pane.tabs.filter((t) => !rightIds.has(t.id));
      let newClosed = state.closedTabs;
      for (const t of rightTabs) {
        newClosed = pushClosed(newClosed, t);
      }
      let newActiveId = pane.activeTabId;
      if (rightIds.has(pane.activeTabId)) {
        newActiveId = action.tabId;
      }
      return {
        ...updatePane(state, paneId, (p) => ({
          ...p,
          tabs: remaining,
          activeTabId: newActiveId,
        })),
        activePaneId: paneId,
        closedTabs: newClosed,
      };
    }

    case TAB_ACTION_TYPES.CLOSE_ALL_TABS: {
      const paneId = resolvePaneId(state, action.paneId);
      const pane = getPane(state, paneId);
      // 固定タブ以外をすべて閉じ、新しいタブを開く
      const pinned = pane.tabs.filter((t) => t.pinned);
      const closed = pane.tabs.filter((t) => !t.pinned);
      let newClosed = state.closedTabs;
      for (const t of closed) {
        newClosed = pushClosed(newClosed, t);
      }
      const activeTab = getPaneActiveTab(pane);
      const sourcePage = getCurrentPage(activeTab);
      const newTab = createTab(sourcePage, activeTab);
      return {
        ...updatePane(state, paneId, (p) => ({
          ...p,
          tabs: [...pinned, newTab],
          activeTabId: newTab.id,
        })),
        activePaneId: paneId,
        closedTabs: newClosed,
      };
    }

    case TAB_ACTION_TYPES.REOPEN_CLOSED_TAB: {
      if (!canReopenClosedTab(state)) return state;
      const paneId = resolvePaneId(state, action.paneId);
      const [reopened, ...rest] = state.closedTabs;
      // 変更理由: 閉じたタブを新規タブとして開き直す時は、自動更新状態を引き継がない。
      const restored: Tab = {
        ...resetAutoRefreshState(reopened),
        id: crypto.randomUUID(),
      };
      return {
        ...updatePane(state, paneId, (p) => ({
          ...p,
          tabs: [...p.tabs, restored],
          activeTabId: restored.id,
        })),
        activePaneId: paneId,
        closedTabs: rest,
      };
    }

    case TAB_ACTION_TYPES.TOGGLE_PIN: {
      const paneId = resolvePaneId(state, action.paneId);
      return updatePane(state, paneId, (p) => {
        const tabs = p.tabs.map((t) => (t.id === action.tabId ? { ...t, pinned: !t.pinned } : t));
        // ホームも通常タブとして、利用者が固定したタブだけを先頭に並べる。
        tabs.sort((a, b) => Number(b.pinned) - Number(a.pinned));
        return { ...p, tabs };
      });
    }

    case TAB_ACTION_TYPES.MOVE_TAB: {
      const paneId = resolvePaneId(state, action.paneId);
      const pane = getPane(state, paneId);
      const dragTab = pane.tabs.find((t) => t.id === action.dragTabId);
      // ホームも通常タブと同じ移動・ピン留め規則で扱う。
      if (!dragTab) {
        return state;
      }

      // 変更理由: @dnd-kit の OptimisticSortingPlugin はドラッグ中に DOM を物理的に
      // 並べ替え、最終位置を source.sortable.index（グループ内インデックス）として確定する。
      // ドロップ先タブIDから移動先を逆算すると、その投影インデックスとズレてホイール順序が
      // 表示順と食い違うため、グループ内インデックスを直接の真実として並べ替える。
      const group = pane.tabs.filter((t) => t.pinned === dragTab.pinned);
      const others = pane.tabs.filter((t) => t.pinned !== dragTab.pinned);
      const fromIndex = group.findIndex((t) => t.id === action.dragTabId);
      const toIndex = Math.max(0, Math.min(action.toIndex, group.length - 1));
      if (fromIndex === -1 || fromIndex === toIndex) {
        return state;
      }

      const reorderedGroup = [...group];
      reorderedGroup.splice(toIndex, 0, reorderedGroup.splice(fromIndex, 1)[0]);
      // ピン留めタブを先頭グループとして再結合する。
      return updatePane(state, paneId, (p) => ({
        ...p,
        tabs: dragTab.pinned ? [...reorderedGroup, ...others] : [...others, ...reorderedGroup],
      }));
    }

    case TAB_ACTION_TYPES.SELECT_TAB: {
      const paneId = resolvePaneId(state, action.paneId);
      return {
        ...updatePane(state, paneId, (p) => ({
          ...p,
          activeTabId: action.tabId,
        })),
        // 別窓化で同じペインの表示対象だけを差し替える時は、本窓のフォーカスを
        // 動かさない。通常のタブ選択では従来どおり対象ペインへフォーカスを移す。
        activePaneId: action.preserveActivePane ? state.activePaneId : paneId,
      };
    }

    case TAB_ACTION_TYPES.NAVIGATE: {
      const paneId = resolvePaneId(state, action.paneId);
      const targetTab = action.tabId
        ? findTabAcrossPanes(state, action.tabId)
        : getPaneActiveTab(getPane(state, paneId));
      // ホームからの選択も現在タブの履歴に積み、同じタブへ戻れるようにする。
      if (!targetTab) {
        return state;
      }
      const currentPage = getCurrentPage(targetTab);
      if (getPageIdentity(currentPage) === getPageIdentity(action.page)) {
        return state;
      }

      const nextState = updateTargetTab(state, paneId, action.tabId, (tab) =>
        resetAutoRefreshState(pushPageToTabHistory(tab, action.page)),
      );
      return action.tabId ? nextState : { ...nextState, activePaneId: paneId };
    }

    case TAB_ACTION_TYPES.NAVIGATE_TAB: {
      const paneId = resolvePaneId(state, action.paneId);
      const pane = getPane(state, paneId);
      const targetTab = pane.tabs.find((tab) => tab.id === action.tabId);
      // 指定したタブ内で遷移し、他のホームへ操作を転送しない。
      if (!targetTab) {
        return state;
      }

      if (getPageIdentity(getCurrentPage(targetTab)) === getPageIdentity(action.page)) {
        return {
          ...updatePane(state, paneId, (p) => ({
            ...p,
            activeTabId: action.tabId,
          })),
          activePaneId: paneId,
        };
      }

      // 指定タブの実履歴を保ったままページを追加する。
      return {
        ...updatePane(state, paneId, (p) => ({
          ...p,
          activeTabId: action.tabId,
          tabs: p.tabs.map((t) =>
            t.id === action.tabId ? resetAutoRefreshState(pushPageToTabHistory(t, action.page)) : t,
          ),
        })),
        activePaneId: paneId,
      };
    }

    case TAB_ACTION_TYPES.GO_BACK: {
      const paneId = resolvePaneId(state, action.paneId);
      const tab = action.tabId
        ? findTabAcrossPanes(state, action.tabId)
        : getPaneActiveTab(getPane(state, paneId));
      if (!tab) return state;
      // 戻るはタブ内の履歴を一つ戻すだけにし、別のホームタブへ転送しない。
      if (tab.currentIndex <= 0) return state;
      return updateTargetTab(state, paneId, action.tabId, (t) =>
        resetAutoRefreshState({
          ...t,
          currentIndex: t.currentIndex - 1,
        }),
      );
    }

    case TAB_ACTION_TYPES.GO_FORWARD: {
      const paneId = resolvePaneId(state, action.paneId);
      const tab = action.tabId
        ? findTabAcrossPanes(state, action.tabId)
        : getPaneActiveTab(getPane(state, paneId));
      if (!tab) return state;
      if (tab.currentIndex >= tab.history.length - 1) return state;
      return updateTargetTab(state, paneId, action.tabId, (t) =>
        resetAutoRefreshState({
          ...t,
          currentIndex: t.currentIndex + 1,
        }),
      );
    }

    case TAB_ACTION_TYPES.GO_TO_HISTORY_INDEX: {
      const paneId = resolvePaneId(state, action.paneId);
      const tab = action.tabId
        ? findTabAcrossPanes(state, action.tabId)
        : getPaneActiveTab(getPane(state, paneId));
      if (!tab) return state;
      if (action.index < 0 || action.index >= tab.history.length) return state;
      if (action.index === tab.currentIndex) return state;
      return updateTargetTab(state, paneId, action.tabId, (t) =>
        resetAutoRefreshState({
          ...t,
          currentIndex: action.index,
        }),
      );
    }

    case TAB_ACTION_TYPES.UPDATE_TAB_VIEW_STATE: {
      // view state はタブIDで一意に特定できるため、ペインを跨いだ更新にも耐える。
      return {
        ...state,
        panes: state.panes.map((pane) => ({
          ...pane,
          tabs: pane.tabs.map((tab) => {
            if (tab.id !== action.tabId) {
              return tab;
            }

            return {
              ...tab,
              viewStates: {
                ...tab.viewStates,
                [action.pageKey]: {
                  ...tab.viewStates?.[action.pageKey],
                  ...action.patch,
                },
              },
            };
          }),
        })),
      };
    }

    case TAB_ACTION_TYPES.UPDATE_TITLE: {
      const paneId = resolvePaneId(state, action.paneId);
      const tab = action.tabId
        ? findTabAcrossPanes(state, action.tabId)
        : getPaneActiveTab(getPane(state, paneId));
      if (!tab) {
        return state;
      }

      return updateTargetTab(state, paneId, action.tabId, (t) => {
        const currentPage = { ...t.history[t.currentIndex] };
        currentPage.title = action.title;
        const newHistory = [...t.history];
        newHistory[t.currentIndex] = currentPage;
        return {
          ...t,
          history: newHistory,
        };
      });
    }

    case TAB_ACTION_TYPES.UPDATE_TITLE_FOR_TAB: {
      // 背景ペイン/タブの非同期タイトル解決でも動くよう、全ペインを横断して該当タブを更新する。
      // boardUrl がある場合は、現在ページではなく対象板の履歴を更新する。
      // URL直開き後に板名解決が完了しても、履歴中の板一覧へ結果を残すため。
      return {
        ...state,
        panes: state.panes.map((pane) => {
          if (!pane.tabs.some((t) => t.id === action.tabId)) {
            return pane;
          }
          return {
            ...pane,
            tabs: pane.tabs.map((tab) => {
              if (tab.id !== action.tabId) {
                return tab;
              }

              const targetBoardUrl = action.boardUrl
                ? normalizePageLocation(action.boardUrl)
                : null;
              const updatedHistory = tab.history.map((page, index) => {
                const isTargetPage = targetBoardUrl
                  ? page.type === "threadList" &&
                    normalizePageLocation(page.boardUrl) === targetBoardUrl
                  : index === tab.currentIndex;
                if (!isTargetPage || page.title === action.title) {
                  return page;
                }

                if (page.type === "threadList") {
                  return {
                    ...page,
                    // 変更理由: 板名解決がページ遷移後に完了しても、title と boardTitle を
                    // 同時に更新して関連板導線と板名表示の不一致を防ぐ。
                    title: action.title,
                    boardTitle: action.title,
                  };
                }

                return {
                  ...page,
                  title: action.title,
                };
              });

              if (updatedHistory.every((page, index) => page === tab.history[index])) {
                return tab;
              }

              return {
                ...tab,
                history: updatedHistory,
              };
            }),
          };
        }),
      };
    }

    case TAB_ACTION_TYPES.RELOAD: {
      // 履歴を変えずにreloadKeyをインクリメントする。
      // ContentAreaがこれをkeyに使うことでページコンポーネントが再マウントされ、データ再取得が走る。
      const paneId = resolvePaneId(state, action.paneId);
      return updateTargetTab(state, paneId, action.tabId, (tab) => ({
        ...tab,
        reloadKey: tab.reloadKey + 1,
      }));
    }

    case TAB_ACTION_TYPES.FOLLOW_NEXT_THREAD: {
      const paneId = resolvePaneId(state, action.paneId);
      return updateTargetTab(state, paneId, action.tabId, (tab) => {
        const nextTab = pushPageToTabHistory(tab, action.page);
        // 自動次スレ移動は「このタブの流れ」を保つのが目的なので、
        // 既存タブ集約を経由せず現在タブの履歴と自動更新束縛を同時に更新する。
        return {
          ...nextTab,
          autoRefreshEnabled: action.keepAutoRefresh ? true : nextTab.autoRefreshEnabled,
          autoRefreshPageKey: action.keepAutoRefresh
            ? getAutoRefreshPageKey(action.page)
            : nextTab.autoRefreshPageKey,
          // 変更理由: dat落ち確認は旧スレ固有なので、次スレへ自動更新を引き継ぐ時は解除する。
          autoRefreshStoppedPageKey: null,
        };
      });
    }

    case TAB_ACTION_TYPES.SET_AUTO_REFRESH_ENABLED: {
      const paneId = resolvePaneId(state, action.paneId);
      return updateTargetTab(state, paneId, action.tabId, (tab) => {
        const pageKey =
          action.pageKey ?? tab.autoRefreshPageKey ?? getAutoRefreshPageKey(getCurrentPage(tab));
        // dat落ちや探索期限の終了を開始操作で解除すると、同じスレのsubject取得が連発する。
        const enabled =
          action.enabled && (pageKey == null || pageKey !== tab.autoRefreshStoppedPageKey);
        return {
          ...tab,
          autoRefreshEnabled: enabled,
          autoRefreshPageKey: enabled ? pageKey : null,
        };
      });
    }

    case TAB_ACTION_TYPES.SET_AUTO_REFRESH_STOPPED_PAGE_KEY: {
      const paneId = resolvePaneId(state, action.paneId);
      return updateTargetTab(state, paneId, action.tabId, (tab) => ({
        ...tab,
        autoRefreshStoppedPageKey: action.pageKey,
        // 停止記録とON表示を同時に更新し、本文だけ止まってステータスバーが回り続ける状態を防ぐ。
        autoRefreshEnabled: false,
        autoRefreshPageKey: null,
      }));
    }

    // --- ペイン操作 ---

    case TAB_ACTION_TYPES.SPLIT_PANE: {
      // 最大ペイン数に達していれば分割しない（2ペイン固定運用）。
      if (state.panes.length >= MAX_PANES) return state;
      // 操作元ペインの右隣に、現在ページを引き継いだ新規ペインを作成してフォーカスする。
      const sourcePaneId = resolvePaneId(state, action.paneId);
      const sourceIndex = state.panes.findIndex((p) => p.id === sourcePaneId);
      const sourcePane = state.panes[sourceIndex];
      const sourceActiveTab = sourcePane ? getPaneActiveTab(sourcePane) : null;
      const sourcePage = sourceActiveTab ? getCurrentPage(sourceActiveTab) : null;
      const newPane = createPane(createTab(sourcePage, sourceActiveTab));
      const panes = [...state.panes];
      panes.splice(sourceIndex + 1, 0, newPane);
      return { ...state, panes, activePaneId: newPane.id };
    }

    case TAB_ACTION_TYPES.CLOSE_PANE: {
      // 最低1ペインは維持する。
      if (state.panes.length <= 1) return state;
      const paneId = resolvePaneId(state, action.paneId);
      const index = state.panes.findIndex((p) => p.id === paneId);
      if (index === -1) return state;
      // 変更理由: ペイン解除は表示レイアウトの変更なのでタブを閉じず、左ペインを
      // 統合先にして左から右の順で並べる。選択中タブも維持して画面内容を失わない。
      const leftPane = state.panes[0];
      const rightPane = state.panes[1];
      const selectedTabId =
        state.panes.find((candidate) => candidate.id === state.activePaneId)?.activeTabId ??
        leftPane.activeTabId;
      // 常設ホームの重複除去を行わず、両ペインの通常タブと選択をそのまま引き継ぐ。
      const mergedPane: Pane = {
        ...leftPane,
        tabs: [...leftPane.tabs, ...rightPane.tabs],
        activeTabId: selectedTabId,
      };
      return { ...state, panes: [mergedPane], activePaneId: leftPane.id };
    }

    case TAB_ACTION_TYPES.SWAP_PANE_TABS: {
      // 変更理由: 2ペインの表示内容だけを交換し、各ペインが保持している
      // 非選択タブの並びとペイン自体のフォーカスは維持する。
      if (state.panes.length < 2) return state;

      const sourcePaneId = resolvePaneId(state, action.paneId);
      const sourceIndex = state.panes.findIndex((pane) => pane.id === sourcePaneId);
      const sourcePane = state.panes[sourceIndex];
      const targetPane = state.panes.find((pane, index) => index !== sourceIndex);
      if (!sourcePane || !targetPane) return state;

      const sourceTab = sourcePane.tabs.find((tab) => tab.id === sourcePane.activeTabId);
      const targetTab = targetPane.tabs.find((tab) => tab.id === targetPane.activeTabId);
      // ホームも他のページと同様にペイン間で交換する。
      if (!sourceTab || !targetTab) return state;

      const replaceActiveTab = (pane: Pane, currentTabId: string, replacement: Tab): Pane => ({
        ...pane,
        tabs: pane.tabs.map((tab) => (tab.id === currentTabId ? replacement : tab)),
        activeTabId: replacement.id,
      });
      const updatedSourcePane = replaceActiveTab(sourcePane, sourceTab.id, targetTab);
      const updatedTargetPane = replaceActiveTab(targetPane, targetTab.id, sourceTab);

      return {
        ...state,
        panes: state.panes.map((pane) =>
          pane.id === sourcePane.id
            ? updatedSourcePane
            : pane.id === targetPane.id
              ? updatedTargetPane
              : pane,
        ),
      };
    }

    case TAB_ACTION_TYPES.SET_ACTIVE_PANE: {
      const paneId = resolvePaneId(state, action.paneId);
      if (paneId === state.activePaneId) return state;
      return { ...state, activePaneId: paneId };
    }

    case TAB_ACTION_TYPES.OPEN_IN_RIGHT_PANE: {
      // 操作元ペインのタブを右隣ペインへ移動する。右隣が無ければ新規作成する。
      const sourcePaneId = resolvePaneId(state, action.paneId);
      const sourceIndex = state.panes.findIndex((p) => p.id === sourcePaneId);
      if (sourceIndex === -1) return state;
      const sourcePane = state.panes[sourceIndex];
      const movingTab = sourcePane.tabs.find((t) => t.id === action.tabId);
      // ホームも通常タブとして移動し、空になったペインは更新時に補う。
      if (!movingTab) return state;
      const rightPane = state.panes[sourceIndex + 1];
      if (!rightPane && !canOpenInRightPane(state, sourcePaneId)) return state;

      // 元ペインから対象タブを除く。空になるなら既定タブを補充してペインを維持する。
      let remainingSourceTabs = sourcePane.tabs.filter((t) => t.id !== action.tabId);
      if (remainingSourceTabs.length === 0) {
        remainingSourceTabs = [createTab()];
      }
      const newSourceActiveId =
        sourcePane.activeTabId === action.tabId
          ? remainingSourceTabs[remainingSourceTabs.length - 1].id
          : sourcePane.activeTabId;
      const updatedSourcePane: Pane = {
        ...sourcePane,
        tabs: remainingSourceTabs,
        activeTabId: newSourceActiveId,
      };

      if (rightPane) {
        const updatedRightPane: Pane = {
          ...rightPane,
          tabs: [...rightPane.tabs, movingTab],
          activeTabId: movingTab.id,
        };
        const panes = state.panes.map((p) =>
          p.id === sourcePaneId ? updatedSourcePane : p.id === rightPane.id ? updatedRightPane : p,
        );
        return { ...state, panes, activePaneId: rightPane.id };
      }

      const newPane = createPane(movingTab);
      const panes = state.panes.map((p) => (p.id === sourcePaneId ? updatedSourcePane : p));
      panes.splice(sourceIndex + 1, 0, newPane);
      return { ...state, panes, activePaneId: newPane.id };
    }

    case TAB_ACTION_TYPES.MOVE_TAB_TO_PANE: {
      // ペイン間でタブを移動する（将来のドラッグ&ドロップ用の土台）。
      const fromPane = state.panes.find((p) => p.id === action.fromPaneId);
      const toPane = state.panes.find((p) => p.id === action.toPaneId);
      if (!fromPane || !toPane || fromPane.id === toPane.id) return state;
      const movingTab = fromPane.tabs.find((t) => t.id === action.tabId);
      // ホームも通常タブとして移動し、空になったペインは更新時に補う。
      if (!movingTab) return state;

      let remainingFrom = fromPane.tabs.filter((t) => t.id !== action.tabId);
      if (remainingFrom.length === 0) {
        remainingFrom = [createTab()];
      }
      const newFromActiveId =
        fromPane.activeTabId === action.tabId
          ? remainingFrom[remainingFrom.length - 1].id
          : fromPane.activeTabId;
      const toIndex = Math.max(0, Math.min(action.toIndex, toPane.tabs.length));
      const newToTabs = [...toPane.tabs];
      newToTabs.splice(toIndex, 0, movingTab);
      return {
        ...state,
        panes: state.panes.map((p) =>
          p.id === action.fromPaneId
            ? { ...p, tabs: remainingFrom, activeTabId: newFromActiveId }
            : p.id === action.toPaneId
              ? { ...p, tabs: newToTabs, activeTabId: movingTab.id }
              : p,
        ),
        activePaneId: action.toPaneId,
      };
    }

    case TAB_ACTION_TYPES.RESTORE:
      return sanitizeTabStoreState(action.state);

    default:
      return state;
  }
}
