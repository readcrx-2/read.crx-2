import type { Dispatch, RefObject } from "react";
import type { Page, Pane, Tab, TabViewState } from "src/view/browser/types";

export interface TabStoreState {
  // 横並びのペイン群。配列順がそのまま画面上の左→右の並び。
  panes: Pane[];
  // フォーカス中のペイン。タブ追加/キーボード操作などの暗黙の対象になる。
  activePaneId: string;
  // 閉じたタブの undo は全ペイン共有。
  closedTabs: Tab[];
}

// アクション種別を型定義・生成処理・reducerで共有し、文字列の表記ずれを防ぐ。
export const TAB_ACTION_TYPES = {
  ADD_TAB: "ADD_TAB",
  OPEN_IN_NEW_TAB: "OPEN_IN_NEW_TAB",
  OPEN_IN_NEW_TAB_FORCE: "OPEN_IN_NEW_TAB_FORCE",
  CLOSE_TAB: "CLOSE_TAB",
  CLOSE_OTHER_TABS: "CLOSE_OTHER_TABS",
  CLOSE_RIGHT_TABS: "CLOSE_RIGHT_TABS",
  CLOSE_ALL_TABS: "CLOSE_ALL_TABS",
  REOPEN_CLOSED_TAB: "REOPEN_CLOSED_TAB",
  TOGGLE_PIN: "TOGGLE_PIN",
  MOVE_TAB: "MOVE_TAB",
  SELECT_TAB: "SELECT_TAB",
  NAVIGATE: "NAVIGATE",
  NAVIGATE_TAB: "NAVIGATE_TAB",
  GO_BACK: "GO_BACK",
  GO_FORWARD: "GO_FORWARD",
  GO_TO_HISTORY_INDEX: "GO_TO_HISTORY_INDEX",
  UPDATE_TAB_VIEW_STATE: "UPDATE_TAB_VIEW_STATE",
  UPDATE_TITLE: "UPDATE_TITLE",
  UPDATE_TITLE_FOR_TAB: "UPDATE_TITLE_FOR_TAB",
  RELOAD: "RELOAD",
  FOLLOW_NEXT_THREAD: "FOLLOW_NEXT_THREAD",
  SET_AUTO_REFRESH_ENABLED: "SET_AUTO_REFRESH_ENABLED",
  SET_AUTO_REFRESH_STOPPED_PAGE_KEY: "SET_AUTO_REFRESH_STOPPED_PAGE_KEY",
  SPLIT_PANE: "SPLIT_PANE",
  OPEN_IN_RIGHT_PANE: "OPEN_IN_RIGHT_PANE",
  CLOSE_PANE: "CLOSE_PANE",
  SWAP_PANE_TABS: "SWAP_PANE_TABS",
  SET_ACTIVE_PANE: "SET_ACTIVE_PANE",
  MOVE_TAB_TO_PANE: "MOVE_TAB_TO_PANE",
  RESTORE: "RESTORE",
} as const;

export type TabAction =
  | { type: typeof TAB_ACTION_TYPES.ADD_TAB; preserveActivePane?: boolean }
  | { type: typeof TAB_ACTION_TYPES.OPEN_IN_NEW_TAB; page: Page; background?: boolean }
  | {
      type: typeof TAB_ACTION_TYPES.OPEN_IN_NEW_TAB_FORCE;
      page: Page;
      focus?: boolean;
      tabId?: string;
    }
  | {
      type: typeof TAB_ACTION_TYPES.CLOSE_TAB;
      tabId: string;
      preserveActivePane?: boolean;
      // 別窓の最後のタブを閉じる時だけ、ペインを空にしない代替タブを作る。
      replaceLastTab?: boolean;
    }
  | { type: typeof TAB_ACTION_TYPES.CLOSE_OTHER_TABS; tabId: string }
  | { type: typeof TAB_ACTION_TYPES.CLOSE_RIGHT_TABS; tabId: string }
  | { type: typeof TAB_ACTION_TYPES.CLOSE_ALL_TABS }
  | { type: typeof TAB_ACTION_TYPES.REOPEN_CLOSED_TAB }
  | { type: typeof TAB_ACTION_TYPES.TOGGLE_PIN; tabId: string }
  | { type: typeof TAB_ACTION_TYPES.MOVE_TAB; dragTabId: string; toIndex: number }
  | { type: typeof TAB_ACTION_TYPES.SELECT_TAB; tabId: string; preserveActivePane?: boolean }
  | { type: typeof TAB_ACTION_TYPES.NAVIGATE; page: Page }
  | { type: typeof TAB_ACTION_TYPES.NAVIGATE_TAB; tabId: string; page: Page }
  | { type: typeof TAB_ACTION_TYPES.GO_BACK }
  | { type: typeof TAB_ACTION_TYPES.GO_FORWARD }
  | { type: typeof TAB_ACTION_TYPES.GO_TO_HISTORY_INDEX; index: number }
  | {
      type: typeof TAB_ACTION_TYPES.UPDATE_TAB_VIEW_STATE;
      tabId: string;
      pageKey: string;
      patch: Partial<TabViewState>;
    }
  | { type: typeof TAB_ACTION_TYPES.UPDATE_TITLE; title: string }
  | {
      type: typeof TAB_ACTION_TYPES.UPDATE_TITLE_FOR_TAB;
      tabId: string;
      title: string;
      boardUrl?: string;
    }
  | { type: typeof TAB_ACTION_TYPES.RELOAD }
  | {
      type: typeof TAB_ACTION_TYPES.FOLLOW_NEXT_THREAD;
      page: Extract<Page, { type: "thread" }>;
      keepAutoRefresh?: boolean;
    }
  | {
      type: typeof TAB_ACTION_TYPES.SET_AUTO_REFRESH_ENABLED;
      enabled: boolean;
      pageKey?: string;
    }
  | {
      type: typeof TAB_ACTION_TYPES.SET_AUTO_REFRESH_STOPPED_PAGE_KEY;
      pageKey: string | null;
    }
  // --- ペイン操作（横分割） ---
  // いずれも対象ペインは注入された paneId（操作元ペイン）を基準にする。
  | { type: typeof TAB_ACTION_TYPES.SPLIT_PANE }
  | { type: typeof TAB_ACTION_TYPES.OPEN_IN_RIGHT_PANE; tabId: string }
  | { type: typeof TAB_ACTION_TYPES.CLOSE_PANE }
  | { type: typeof TAB_ACTION_TYPES.SWAP_PANE_TABS }
  | { type: typeof TAB_ACTION_TYPES.SET_ACTIVE_PANE }
  | {
      type: typeof TAB_ACTION_TYPES.MOVE_TAB_TO_PANE;
      tabId: string;
      fromPaneId: string;
      toPaneId: string;
      toIndex: number;
    }
  | { type: typeof TAB_ACTION_TYPES.RESTORE; state: TabStoreState };

// ペインスコープ: 全アクションに「対象ペイン」を付与できる。
// 省略時はアクティブペインに作用する（グローバルハンドラ用）。
// 表示場所がメインペインでも別窓でも、操作対象のタブを明示できるようにする。
// tabIdを省略した既存アクションは、従来どおり対象ペインのselectedTabへ作用する。
export type ScopedTabAction = TabAction & { paneId?: string; tabId?: string };

export interface PaneScopedState {
  tabs: Tab[];
  // ペイン自身が選択しているタブ。別窓の表示対象とは独立している。
  selectedTabId: string;
  closedTabs: Tab[];
}

export interface PaneScopedTabStore {
  state: PaneScopedState;
  // stateRef はグローバル状態を指す。ペイン解決には paneId を併用する。
  stateRef: RefObject<TabStoreState>;
  dispatch: Dispatch<ScopedTabAction>;
  // ペインの選択状態。別窓を開いても変わらない対象。
  selectedTab: Tab;
  selectedTabId: string;
  // 現在の表示領域が描画している対象。別窓ではscopeで固定される。
  viewTab: Tab;
  viewTabId: string;
  viewPage: Page;
  paneId: string;
}
