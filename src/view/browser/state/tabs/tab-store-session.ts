import {
  getBrowserSessionJson,
  setBrowserSessionJson,
} from "src/view/browser/state/tabs/browser-session-storage";
import type { TabStoreState } from "src/view/browser/state/tabs/tab-store-types";
import type { Page, Pane, PersistedTab, Tab, TabViewStates } from "src/view/browser/types";
import {
  createTabRuntimeState,
  ensurePaneHasTab,
  getPageViewStateKey,
} from "src/view/browser/types";

// セッションJSONに書き出す形。タブは保存対象の項目だけを持つ。
interface PersistedPane {
  id: string;
  tabs: PersistedTab[];
  activeTabId: string;
}

interface PersistedTabStoreState {
  panes: PersistedPane[];
  activePaneId: string;
  closedTabs: PersistedTab[];
}

// 旧セッションに残っている可能性がある項目。読み込み時の移行だけに使う。
// threadDisplayMode・自動更新・reloadKeyなどの旧項目は、許可した項目だけを取り出すため自然に捨てられる。
type LoadedTab = Partial<PersistedTab> & {
  id: string;
  // 旧セッションの常設ホームを通常タブへ移行するためだけに読み取る。
  locked?: boolean;
};

/**
 * 現在の履歴に残っているページの表示状態だけを保存する。
 *
 * 変更理由: viewStatesは開いたページごとに追記されるだけで削除されず、長く使うタブほど
 * 操作のたびに書き出すセッションJSONが肥大化していた。戻る・進むで到達できない
 * ページの状態は復元できないため、保存時に切り捨てる。
 */
function pruneViewStates(tab: PersistedTab): TabViewStates | undefined {
  if (!tab.viewStates) return undefined;
  const reachableKeys = new Set(tab.history.map((page) => getPageViewStateKey(page)));
  const entries = Object.entries(tab.viewStates).filter(([key]) => reachableKeys.has(key));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function toPersistedTab(tab: PersistedTab): PersistedTab {
  // 許可した項目だけを書き出し、TabRuntimeStateや将来の一時状態を保存しない。
  const viewStates = pruneViewStates(tab);
  return {
    id: tab.id,
    history: tab.history,
    currentIndex: tab.currentIndex,
    pinned: tab.pinned,
    ...(viewStates ? { viewStates } : {}),
  };
}

function toPersistedTabStoreState(state: TabStoreState): PersistedTabStoreState {
  return {
    // 空になったペインだけ補い、保存のたびにホームタブを増やさない。
    panes: state.panes.map((pane) => {
      const ensured = ensurePaneHasTab(pane);
      return {
        id: ensured.id,
        tabs: ensured.tabs.map(toPersistedTab),
        activeTabId: ensured.activeTabId,
      };
    }),
    activePaneId: state.activePaneId,
    closedTabs: state.closedTabs.map(toPersistedTab),
  };
}

// 保存形式を経由して一時状態を既定値へ戻す。RESTOREも保存・復元と同じ規則で扱う。
function fromPersistedTab(tab: PersistedTab): Tab {
  return { ...toPersistedTab(tab), ...createTabRuntimeState() };
}

export function sanitizeTabStoreState(state: TabStoreState): TabStoreState {
  const persisted = toPersistedTabStoreState(state);
  return {
    panes: persisted.panes.map((pane) => ({ ...pane, tabs: pane.tabs.map(fromPersistedTab) })),
    activePaneId: persisted.activePaneId,
    closedTabs: persisted.closedTabs.map(fromPersistedTab),
  };
}

function normalizeLoadedTab(tab: LoadedTab): Tab {
  const { locked } = tab;
  // 旧常設ホーム・空の新規タブを通常ホームへ移し、固定状態とタブIDは独立して引き継ぐ。
  const oldHistory: Page[] = (tab.history ?? []).map((page) =>
    ["newTab", "boardTree"].includes(page.type) ? { type: "home", title: "ホーム" } : page,
  );
  const oldIndex = Math.max(0, Math.min(tab.currentIndex ?? 0, oldHistory.length - 1));
  const history: Page[] = [];
  let currentIndex = 0;
  oldHistory.forEach((page, index) => {
    // 板一覧から開いた板の戻る先をホームに統一するが、表示中の板一覧は復元する。
    if (
      page.type === "boardList" &&
      index !== oldIndex &&
      oldHistory[index + 1]?.type === "threadList"
    )
      return;
    if (index === oldIndex) currentIndex = history.length;
    history.push(page);
  });
  if (history[0]?.type !== "home") {
    history.unshift({ type: "home", title: "ホーム" });
    if (history.length > 1) currentIndex += 1;
  }
  return fromPersistedTab({
    id: tab.id,
    history,
    currentIndex,
    pinned: locked ? false : (tab.pinned ?? false),
    viewStates: tab.viewStates,
  });
}

// 保存済みJSONの形。旧形状（単一タブリスト）のセッションも読めるようにする。
type LoadedTabStoreState = {
  panes?: (Omit<Pane, "tabs"> & { tabs: LoadedTab[] })[];
  activePaneId?: string;
  tabs?: LoadedTab[];
  activeTabId?: string;
  closedTabs?: LoadedTab[];
};

/**
 * 保存形式の移行と実行時状態の除外をタブストア本体から分離する。
 *
 * 変更理由: reducerとセッションI/Oを同じモジュールに置くと、純粋なタブ操作の変更が
 * localStorageの互換性へ波及するため、復元・保存だけをこの境界で扱う。
 */
export function loadTabStoreSession(): TabStoreState | null {
  try {
    const raw = getBrowserSessionJson();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LoadedTabStoreState;

    // 新形状: panes を持つ
    if (parsed.panes?.length && parsed.activePaneId) {
      const panes = parsed.panes
        .filter((pane) => pane.tabs?.length > 0)
        .map((pane) =>
          ensurePaneHasTab({
            ...pane,
            tabs: pane.tabs.map((tab) => normalizeLoadedTab(tab)),
            activeTabId: pane.tabs.some((tab) => tab.id === pane.activeTabId)
              ? pane.activeTabId
              : pane.tabs[0].id,
          }),
        );
      if (panes.length === 0) return null;
      const activePaneId = panes.some((p) => p.id === parsed.activePaneId)
        ? parsed.activePaneId
        : panes[0].id;
      return {
        panes,
        activePaneId,
        closedTabs: (parsed.closedTabs ?? []).map((tab) => normalizeLoadedTab(tab)),
      };
    }

    // 旧形状: 単一タブリスト → 単一ペインへ移行
    if (parsed.tabs && parsed.tabs.length > 0 && parsed.activeTabId) {
      const tabs = parsed.tabs.map((tab) => normalizeLoadedTab(tab));
      const activeTabId = tabs.some((tab) => tab.id === parsed.activeTabId)
        ? parsed.activeTabId
        : tabs[0].id;
      const pane: Pane = ensurePaneHasTab({
        id: crypto.randomUUID(),
        tabs,
        activeTabId,
      });
      return {
        panes: [pane],
        activePaneId: pane.id,
        closedTabs: (parsed.closedTabs ?? []).map((tab) => normalizeLoadedTab(tab)),
      };
    }
  } catch (error) {
    console.error("[TabStoreSession] セッションの復元に失敗しました", error);
  }
  return null;
}

export function saveTabStoreSession(state: TabStoreState): void {
  try {
    void setBrowserSessionJson(JSON.stringify(toPersistedTabStoreState(state))).catch((error) => {
      console.error("[TabStoreSession] セッションの保存に失敗しました", error);
    });
  } catch (error) {
    // localStorage容量超過等でも、現在のタブ操作は継続できるようログだけ残す。
    console.error("[TabStoreSession] セッションの保存に失敗しました", error);
  }
}
