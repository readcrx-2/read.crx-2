import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createLogger } from "src/app/logger";
import { getStore2String, setStore2String } from "src/app/Store2Storage";
import {
  type AuxiliaryWindowOptions,
  useAuxiliaryWindow,
} from "src/features/auxiliary-window/browser/use-auxiliary-window";
import { useTabPanes, useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import type { Page, Tab } from "src/view/browser/types";
import { getCurrentPage } from "src/view/browser/types";

const logger = createLogger("write");

const STORAGE_KEY = "chlens_write_session_v1";

export interface WriteTarget {
  threadUrl: string;
  title: string;
  paneId: string;
  tabId: string;
}

interface SavedWriteSession {
  selectedThreadUrl?: string | null;
}

interface WriteSessionState {
  selectedThreadUrl: string | null;
  drafts: Record<string, string>;
}

interface WriteSessionControlsContextValue {
  selectedThreadUrl: string | null;
  targets: WriteTarget[];
  isWindowOpen: boolean;
  writeWindowRoot: HTMLElement | null;
  writeWindowFocusRequestId: number | null;
  selectThread: (threadUrl: string) => void;
  requestWriteWindowFocus: () => void;
  consumeWriteWindowFocusRequest: (requestId: number) => void;
  appendDraft: (threadUrl: string, text: string) => void;
  openWriteWindow: (sourceWindow?: Window) => boolean;
  closeWriteWindow: () => void;
}

interface WriteDraftContextValue {
  drafts: Record<string, string>;
  getDraft: (threadUrl: string) => string;
  setDraft: (threadUrl: string, message: string) => void;
}

export interface WriteSessionContextValue extends WriteSessionControlsContextValue {
  getDraft: (threadUrl: string) => string;
  setDraft: (threadUrl: string, message: string) => void;
}

const WRITE_WINDOW_OPTIONS: AuxiliaryWindowOptions = {
  name: "chlens-write-window",
  features: "popup,width=720,height=520,resizable=yes",
  title: "書き込み - read.crx 2",
  shellClassName: "write-window-shell",
  logLabel: "WriteSession",
};

function loadSession(): WriteSessionState {
  try {
    const raw = getStore2String(STORAGE_KEY);
    if (!raw) {
      return { selectedThreadUrl: null, drafts: {} };
    }

    const saved = JSON.parse(raw) as SavedWriteSession;
    return {
      selectedThreadUrl:
        typeof saved.selectedThreadUrl === "string" ? saved.selectedThreadUrl : null,
      // 変更理由: 保存済みの下書きを復元すると、別窓や別スレを開いた直後に
      // 意図しない本文を投稿する危険があるため、旧形式のdraftsも復元しない。
      drafts: {},
    };
  } catch (error) {
    logger.error("書き込みセッションの復元に失敗しました", error);
    return { selectedThreadUrl: null, drafts: {} };
  }
}

function getThreadPage(tab: Tab): Extract<Page, { type: "thread" }> | null {
  const page = getCurrentPage(tab);
  return page.type === "thread" ? page : null;
}

function collectWriteTargets(
  panes: ReadonlyArray<{ id: string; tabs: Tab[] }>,
  activePaneId: string,
): WriteTarget[] {
  const targets: WriteTarget[] = [];
  const seen = new Set<string>();
  const orderedPanes = [...panes].sort((left, right) => {
    if (left.id === activePaneId) return -1;
    if (right.id === activePaneId) return 1;
    return 0;
  });

  for (const pane of orderedPanes) {
    for (const tab of pane.tabs) {
      const page = getThreadPage(tab);
      if (!page || seen.has(page.threadUrl)) {
        continue;
      }

      seen.add(page.threadUrl);
      targets.push({
        threadUrl: page.threadUrl,
        title: page.title.trim() || page.threadUrl,
        paneId: pane.id,
        tabId: tab.id,
      });
    }
  }

  return targets;
}

const defaultControlsContextValue: WriteSessionControlsContextValue = {
  selectedThreadUrl: null,
  targets: [],
  isWindowOpen: false,
  writeWindowRoot: null,
  writeWindowFocusRequestId: null,
  selectThread: () => {},
  requestWriteWindowFocus: () => {},
  consumeWriteWindowFocusRequest: () => {},
  appendDraft: () => {},
  openWriteWindow: () => false,
  closeWriteWindow: () => {},
};

const defaultDraftContextValue: WriteDraftContextValue = {
  drafts: {},
  getDraft: () => "",
  setDraft: () => {},
};

const WriteSessionControlsContext = createContext<WriteSessionControlsContextValue>(
  defaultControlsContextValue,
);
const WriteDraftContext = createContext<WriteDraftContextValue>(defaultDraftContextValue);

/**
 * アプリ全体で1つだけ存在する書き込みセッションを提供する。
 *
 * 変更理由: 書き込み欄をペインの現在タブへ直接結び付けると、別窓へ移したときに
 * 投稿先と下書きが表示場所ごとに分裂する。投稿先をURL単位で共有しておくことで、
 * 下部パネルから別窓へ表示場所を移しても同じセッションを表示できる。
 * 下書き本文は入力ごとに更新されるため、投稿先や返信メニューだけを使う部品へ
 * 更新を伝播させないよう、操作用Contextと本文用Contextを分離している。
 */
export const WriteSessionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { panes, activePaneId } = useTabPanes();
  const { viewPage } = useTabStore();
  const [session, setSession] = useState<WriteSessionState>(loadSession);
  const nextWriteWindowFocusIdRef = useRef(0);
  const [writeWindowFocusRequestId, setWriteWindowFocusRequestId] = useState<number | null>(null);
  const writeWindow = useAuxiliaryWindow(WRITE_WINDOW_OPTIONS);

  const targets = useMemo(() => collectWriteTargets(panes, activePaneId), [activePaneId, panes]);

  useEffect(() => {
    const currentTargetIsAvailable =
      session.selectedThreadUrl != null &&
      targets.some((target) => target.threadUrl === session.selectedThreadUrl);
    if (currentTargetIsAvailable) {
      return;
    }

    const fallbackTarget =
      viewPage.type === "thread" &&
      targets.some((target) => target.threadUrl === viewPage.threadUrl)
        ? viewPage.threadUrl
        : (targets[0]?.threadUrl ?? null);

    if (fallbackTarget !== session.selectedThreadUrl) {
      setSession((previous) => ({ ...previous, selectedThreadUrl: fallbackTarget }));
    }
  }, [session.selectedThreadUrl, targets, viewPage]);

  useEffect(() => {
    // 変更理由: 投稿先の選択だけは再起動後も扱いやすく保つ一方、本文は保存しない。
    // 下書きをストレージへ書かないことで、古い窓や別スレへの誤投稿を防ぐ。
    void setStore2String(
      STORAGE_KEY,
      JSON.stringify({ selectedThreadUrl: session.selectedThreadUrl }),
    ).catch((error: unknown) => {
      logger.error("書き込みセッションの保存に失敗しました", error);
    });
  }, [session.selectedThreadUrl]);

  const selectThread = useCallback((threadUrl: string) => {
    // 変更理由: 返信メニューから同じ投稿先を再選択しても、対象一覧を購読する部品へ
    // 不要なContext更新を通知しない。
    setSession((previous) =>
      previous.selectedThreadUrl === threadUrl
        ? previous
        : { ...previous, selectedThreadUrl: threadUrl },
    );
  }, []);

  const requestWriteWindowFocus = useCallback(() => {
    nextWriteWindowFocusIdRef.current += 1;
    setWriteWindowFocusRequestId(nextWriteWindowFocusIdRef.current);
  }, []);

  const consumeWriteWindowFocusRequest = useCallback((requestId: number) => {
    setWriteWindowFocusRequestId((current) => (current === requestId ? null : current));
  }, []);

  const getDraft = useCallback(
    (threadUrl: string) => (threadUrl ? (session.drafts[threadUrl] ?? "") : ""),
    [session.drafts],
  );

  const setDraft = useCallback((threadUrl: string, message: string) => {
    if (!threadUrl) {
      return;
    }

    setSession((previous) => {
      // 変更理由: IME確定や外部同期で同じ本文が届いても、書き込み欄以外へ
      // 下書きContextの更新を伝播させない。
      if ((previous.drafts[threadUrl] ?? "") === message) {
        return previous;
      }

      const drafts = { ...previous.drafts };
      if (message === "") {
        // 変更理由: 投稿済みの本文を空文字のまま蓄積すると、スレッド数に比例して
        // セッション保存領域だけが増え続けるため、空になった下書きはキーごと除去する。
        delete drafts[threadUrl];
      } else {
        drafts[threadUrl] = message;
      }
      return { ...previous, drafts };
    });
  }, []);

  const appendDraft = useCallback((threadUrl: string, text: string) => {
    if (!threadUrl || !text) {
      return;
    }

    setSession((previous) => {
      const currentMessage = previous.drafts[threadUrl] ?? "";
      const separator = currentMessage === "" || currentMessage.endsWith("\n") ? "" : "\n";
      return {
        ...previous,
        selectedThreadUrl: threadUrl,
        drafts: { ...previous.drafts, [threadUrl]: `${currentMessage}${separator}${text}` },
      };
    });
  }, []);

  const controlsContextValue = useMemo<WriteSessionControlsContextValue>(
    () => ({
      selectedThreadUrl: session.selectedThreadUrl,
      targets,
      isWindowOpen: writeWindow.isOpen,
      writeWindowRoot: writeWindow.root,
      writeWindowFocusRequestId,
      selectThread,
      requestWriteWindowFocus,
      consumeWriteWindowFocusRequest,
      appendDraft,
      openWriteWindow: writeWindow.open,
      closeWriteWindow: writeWindow.close,
    }),
    [
      appendDraft,
      consumeWriteWindowFocusRequest,
      writeWindow.close,
      writeWindow.open,
      selectThread,
      session.selectedThreadUrl,
      targets,
      writeWindow.isOpen,
      writeWindowFocusRequestId,
      writeWindow.root,
      requestWriteWindowFocus,
    ],
  );

  const draftContextValue = useMemo<WriteDraftContextValue>(
    () => ({ drafts: session.drafts, getDraft, setDraft }),
    [getDraft, session.drafts, setDraft],
  );

  return (
    <WriteSessionControlsContext.Provider value={controlsContextValue}>
      <WriteDraftContext.Provider value={draftContextValue}>{children}</WriteDraftContext.Provider>
    </WriteSessionControlsContext.Provider>
  );
};

export function useWriteSessionControls(): WriteSessionControlsContextValue {
  return useContext(WriteSessionControlsContext);
}

export function useWriteDraft(threadUrl: string): string {
  const { drafts } = useContext(WriteDraftContext);
  return threadUrl ? (drafts[threadUrl] ?? "") : "";
}

export function useWriteDraftActions(): Pick<WriteDraftContextValue, "setDraft"> {
  const { setDraft } = useContext(WriteDraftContext);
  return { setDraft };
}

export function useWriteSession(): WriteSessionContextValue {
  const controls = useWriteSessionControls();
  const drafts = useContext(WriteDraftContext);
  return useMemo(
    () => ({ ...controls, getDraft: drafts.getDraft, setDraft: drafts.setDraft }),
    [controls, drafts.getDraft, drafts.setDraft],
  );
}
