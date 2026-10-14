import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { getStore2String, setStore2String } from "src/app/Store2Storage";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";

export interface PanelTab {
  id: string;
  label: string;
}

export const BOTTOM_PANEL_THREAD_LIST_TAB_ID = "thread-list";
export const BOTTOM_PANEL_WRITE_TAB_ID = "write";
export const THREAD_LIST_AUTO_REFRESH_INTERVALS_SEC = [10, 15, 30, 60] as const;
export type ThreadListAutoRefreshIntervalSec =
  (typeof THREAD_LIST_AUTO_REFRESH_INTERVALS_SEC)[number];

export interface WritePanelInsertRequest {
  id: number;
  text: string;
  threadUrl?: string;
}

const STORAGE_KEY = "chlens_bottom_panel_v1";
export const DEFAULT_BOTTOM_PANEL_HEIGHT = 200;
const MIN_HEIGHT = 80;
// 画面高の半分で一覧を開けるよう、従来の上限を一般的な表示領域より余裕のある値にする。
const MAX_HEIGHT = 1000;
// 既存の保存状態にタブ情報がない場合は、従来の書き込みパネルを既定にして
// アップデート後も起動時の表示を変えない。
const DEFAULT_ACTIVE_PANEL_TAB_ID = BOTTOM_PANEL_WRITE_TAB_ID;
const DEFAULT_THREAD_LIST_AUTO_REFRESH_INTERVAL_SEC: ThreadListAutoRefreshIntervalSec = 30;

// 追加するタブはここに加えるだけでパネルに反映される
export const BOTTOM_PANEL_TABS: PanelTab[] = [
  { id: BOTTOM_PANEL_WRITE_TAB_ID, label: "書き込み" },
  { id: BOTTOM_PANEL_THREAD_LIST_TAB_ID, label: "スレ一覧" },
];

interface SavedState {
  isOpen?: boolean;
  height?: number;
  // 保存済み設定のキーは既存データとの互換性のため変更しない。
  activeTabId?: string;
  threadListAutoRefreshEnabled?: boolean;
  threadListAutoRefreshIntervalSec?: number;
}

function loadSaved(): SavedState {
  try {
    const raw = getStore2String(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as SavedState;
  } catch {
    // パース失敗は無視
  }
  return {};
}

function persist(patch: SavedState): void {
  try {
    const prev = loadSaved();
    void setStore2String(STORAGE_KEY, JSON.stringify({ ...prev, ...patch }));
  } catch {
    // 書き込み失敗は無視
  }
}

interface BottomPanelContextValue {
  isOpen: boolean;
  height: number;
  activePanelTabId: string;
  threadListAutoRefreshEnabled: boolean;
  threadListAutoRefreshIntervalSec: ThreadListAutoRefreshIntervalSec;
  tabs: PanelTab[];
  writePanelInsertRequest: WritePanelInsertRequest | null;
  writePanelFocusRequestId: number | null;
  openPanel: (tabId?: string) => void;
  requestWritePanelFocus: () => void;
  consumeWritePanelFocusRequest: (requestId: number) => void;
  openWritePanelWithText: (text: string, threadUrl?: string) => void;
  closePanel: () => void;
  togglePanel: (tabId?: string) => void;
  setHeight: (h: number) => void;
  setActivePanelTab: (id: string) => void;
  setThreadListAutoRefreshEnabled: (enabled: boolean) => void;
  setThreadListAutoRefreshIntervalSec: (seconds: number) => void;
  clearWritePanelInsertRequest: (requestId: number) => void;
}

const BottomPanelContext = createContext<BottomPanelContextValue | null>(null);

interface BottomPanelProviderProps {
  children: ReactNode;
  /**
   * 開閉・高さ・選択タブを、他のProviderと共有する保存領域へ読み書きしない。
   *
   * 変更理由: 切り離したタブの別窓は本窓と別のレイアウトを持つため、別窓で調整した
   * 高さや開閉が本窓の次回起動時の状態を上書きしないようにする。
   * スレ一覧の自動更新設定は利用者の設定なので、従来どおり共有する。
   */
  isolated?: boolean;
}

export const BottomPanelProvider: React.FC<BottomPanelProviderProps> = ({
  children,
  isolated = false,
}) => {
  const saved = loadSaved();
  const persistState = useCallback(
    (patch: SavedState) => {
      if (!isolated) {
        persist(patch);
        return;
      }
      const { threadListAutoRefreshEnabled, threadListAutoRefreshIntervalSec } = patch;
      const sharedPatch: SavedState = {};
      if (threadListAutoRefreshEnabled !== undefined) {
        sharedPatch.threadListAutoRefreshEnabled = threadListAutoRefreshEnabled;
      }
      if (threadListAutoRefreshIntervalSec !== undefined) {
        sharedPatch.threadListAutoRefreshIntervalSec = threadListAutoRefreshIntervalSec;
      }
      if (Object.keys(sharedPatch).length > 0) {
        persist(sharedPatch);
      }
    },
    [isolated],
  );
  const { window: viewWindow } = useViewSurface();
  const nextWritePanelInsertIdRef = useRef(0);
  const nextWritePanelFocusIdRef = useRef(0);
  const [isOpen, setIsOpen] = useState(!isolated && (saved.isOpen ?? false));
  const [height, setHeightState] = useState(() =>
    Math.max(
      MIN_HEIGHT,
      Math.min(MAX_HEIGHT, (isolated ? undefined : saved.height) ?? DEFAULT_BOTTOM_PANEL_HEIGHT),
    ),
  );
  const [activePanelTabId, setActivePanelTabIdState] = useState(() =>
    !isolated && BOTTOM_PANEL_TABS.some((tab) => tab.id === saved.activeTabId)
      ? (saved.activeTabId ?? DEFAULT_ACTIVE_PANEL_TAB_ID)
      : DEFAULT_ACTIVE_PANEL_TAB_ID,
  );
  const [threadListAutoRefreshEnabled, setThreadListAutoRefreshEnabledState] = useState(
    saved.threadListAutoRefreshEnabled ?? false,
  );
  const [threadListAutoRefreshIntervalSec, setThreadListAutoRefreshIntervalSecState] = useState(
    () =>
      THREAD_LIST_AUTO_REFRESH_INTERVALS_SEC.includes(
        saved.threadListAutoRefreshIntervalSec as ThreadListAutoRefreshIntervalSec,
      )
        ? (saved.threadListAutoRefreshIntervalSec as ThreadListAutoRefreshIntervalSec)
        : DEFAULT_THREAD_LIST_AUTO_REFRESH_INTERVAL_SEC,
  );
  const [writePanelInsertRequest, setWritePanelInsertRequest] =
    useState<WritePanelInsertRequest | null>(null);
  const [writePanelFocusRequestId, setWritePanelFocusRequestId] = useState<number | null>(null);

  const requestWritePanelFocus = useCallback(() => {
    nextWritePanelFocusIdRef.current += 1;
    setWritePanelFocusRequestId(nextWritePanelFocusIdRef.current);
  }, []);

  const consumeWritePanelFocusRequest = useCallback((requestId: number) => {
    setWritePanelFocusRequestId((current) => (current === requestId ? null : current));
  }, []);

  const setHeight = useCallback(
    (h: number) => {
      const clamped = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, h));
      setHeightState(clamped);
      persistState({ height: clamped });
    },
    [persistState],
  );

  const setActivePanelTab = useCallback(
    (id: string) => {
      if (!BOTTOM_PANEL_TABS.some((tab) => tab.id === id)) {
        return;
      }
      // 返信・ナビゲーション・ステータスバー・パネル内タブで高さが食い違わないよう、
      // 開く時と別タブへの切り替え時のサイズをここで決める。
      // 表示中の書き込み欄への返信追記では、手動調整した高さを維持する。
      if (!isOpen || activePanelTabId !== id) {
        setHeight(
          id === BOTTOM_PANEL_THREAD_LIST_TAB_ID
            ? viewWindow.innerHeight / 2
            : DEFAULT_BOTTOM_PANEL_HEIGHT,
        );
      }
      setActivePanelTabIdState(id);
      persistState({ activeTabId: id });
    },
    [activePanelTabId, isOpen, persistState, setHeight, viewWindow],
  );

  const openPanel = useCallback(
    (tabId?: string) => {
      const targetTabId = tabId ?? activePanelTabId;
      if (!BOTTOM_PANEL_TABS.some((tab) => tab.id === targetTabId)) {
        return;
      }
      setActivePanelTab(targetTabId);
      setIsOpen(true);
      persistState({ isOpen: true });
    },
    [activePanelTabId, persistState, setActivePanelTab],
  );

  const openWritePanelWithText = useCallback(
    (text: string, threadUrl?: string) => {
      // 変更理由: 右クリックの「返信」はクリップボード経由だと既存入力を壊しやすいため、
      // 書き込みパネルを開いたうえで本文へ直接追記できる要求として扱う。
      openPanel(BOTTOM_PANEL_WRITE_TAB_ID);
      nextWritePanelInsertIdRef.current += 1;
      setWritePanelInsertRequest({
        id: nextWritePanelInsertIdRef.current,
        text,
        threadUrl,
      });
    },
    [openPanel],
  );

  const closePanel = useCallback(() => {
    setIsOpen(false);
    persistState({ isOpen: false });
  }, [persistState]);

  const togglePanel = useCallback(
    (tabId?: string) => {
      if (tabId && !BOTTOM_PANEL_TABS.some((tab) => tab.id === tabId)) {
        return;
      }
      // 開く経路をopenPanelへ集約し、閉じる操作では高さを変更しない。
      // 別タブのボタンは内容を切り替え、同じタブのボタンだけで開閉する。
      if (isOpen && (!tabId || activePanelTabId === tabId)) {
        closePanel();
      } else {
        openPanel(tabId);
      }
    },
    [activePanelTabId, closePanel, isOpen, openPanel],
  );

  const setThreadListAutoRefreshEnabled = useCallback(
    (enabled: boolean) => {
      setThreadListAutoRefreshEnabledState(enabled);
      persistState({ threadListAutoRefreshEnabled: enabled });
    },
    [persistState],
  );

  const setThreadListAutoRefreshIntervalSec = useCallback(
    (seconds: number) => {
      if (
        !THREAD_LIST_AUTO_REFRESH_INTERVALS_SEC.includes(
          seconds as ThreadListAutoRefreshIntervalSec,
        )
      ) {
        return;
      }

      const interval = seconds as ThreadListAutoRefreshIntervalSec;
      setThreadListAutoRefreshIntervalSecState(interval);
      persistState({ threadListAutoRefreshIntervalSec: interval });
    },
    [persistState],
  );

  const clearWritePanelInsertRequest = useCallback((requestId: number) => {
    setWritePanelInsertRequest((prev) => {
      if (prev?.id !== requestId) {
        return prev;
      }
      return null;
    });
  }, []);

  return (
    <BottomPanelContext.Provider
      value={{
        isOpen,
        height,
        activePanelTabId,
        threadListAutoRefreshEnabled,
        threadListAutoRefreshIntervalSec,
        tabs: BOTTOM_PANEL_TABS,
        writePanelInsertRequest,
        writePanelFocusRequestId,
        openPanel,
        requestWritePanelFocus,
        consumeWritePanelFocusRequest,
        openWritePanelWithText,
        closePanel,
        togglePanel,
        setHeight,
        setActivePanelTab,
        setThreadListAutoRefreshEnabled,
        setThreadListAutoRefreshIntervalSec,
        clearWritePanelInsertRequest,
      }}
    >
      {children}
    </BottomPanelContext.Provider>
  );
};

export function useBottomPanel(): BottomPanelContextValue {
  const ctx = useContext(BottomPanelContext);
  if (!ctx) {
    throw new Error("useBottomPanel must be used within BottomPanelProvider");
  }
  return ctx;
}

// 別窓のポータルはペイン配下のBottomPanelProviderを持たないため、
// 書き込みUIの表示場所を移しても同じコンポーネントを再利用できるようにする。
export function useOptionalBottomPanel(): BottomPanelContextValue | null {
  return useContext(BottomPanelContext);
}
