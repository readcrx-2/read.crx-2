import { act, cleanup, renderHook } from "@testing-library/react";
import type { ScopedTabAction, TabStoreState } from "src/view/browser/state/tabs/use-tab-store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { ArchiveReplayMainThreadRequest } from "../platform";
import { useArchiveReplayMainThreadSync } from "./use-main-thread-sync";

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  subscribe: vi.fn(),
  listener: null as ((request: ArchiveReplayMainThreadRequest) => void) | null,
  stateRef: null as { current: TabStoreState } | null,
}));

vi.mock("../platform", () => ({
  subscribeArchiveReplayMainThreadRequests: mocks.subscribe,
}));

vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabDispatch: () => mocks.dispatch,
  useTabStore: () => ({ stateRef: mocks.stateRef }),
}));

function createState(): TabStoreState {
  return {
    panes: [
      {
        id: "pane-1",
        tabs: [
          {
            id: "tab-home",
            history: [{ type: "boardList", title: "ホーム" }],
            currentIndex: 0,
            pinned: false,
            reloadKey: 0,
            autoRefreshEnabled: false,
            autoRefreshPageKey: null,
          },
        ],
        activeTabId: "tab-home",
      },
    ],
    activePaneId: "pane-1",
    closedTabs: [],
  };
}

function applyDispatch(action: ScopedTabAction): void {
  const state = mocks.stateRef?.current;
  if (!state) return;

  if (action.type === "OPEN_IN_NEW_TAB_FORCE") {
    state.panes[0]?.tabs.push({
      id: "tab-replay",
      history: [action.page],
      currentIndex: 0,
      pinned: false,
      reloadKey: 0,
      autoRefreshEnabled: false,
      autoRefreshPageKey: null,
    });
    if (action.focus && state.panes[0]) {
      state.panes[0].activeTabId = "tab-replay";
      state.activePaneId = state.panes[0].id;
    }
    return;
  }
  if (action.type === "SELECT_TAB") {
    const pane = state.panes.find((candidate) => candidate.id === action.paneId);
    if (pane) pane.activeTabId = action.tabId;
    return;
  }
  if (action.type === "NAVIGATE_TAB") {
    const pane = state.panes.find((candidate) => candidate.id === action.paneId);
    const tab = pane?.tabs.find((candidate) => candidate.id === action.tabId);
    if (tab) {
      tab.history.push(action.page);
      tab.currentIndex = tab.history.length - 1;
    }
  }
}

describe("useArchiveReplayMainThreadSync", () => {
  beforeEach(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    mocks.dispatch.mockReset();
    mocks.subscribe.mockReset();
    mocks.listener = null;
    mocks.stateRef = { current: createState() };
    mocks.dispatch.mockImplementation(applyDispatch);
    mocks.subscribe.mockImplementation(
      async (listener: (request: ArchiveReplayMainThreadRequest) => void) => {
        mocks.listener = listener;
        return vi.fn();
      },
    );
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("初回は専用タブを作り、同一セッションでは同じタブを遷移させる", async () => {
    renderHook(() => useArchiveReplayMainThreadSync());
    await act(async () => {
      await Promise.resolve();
    });

    const request = {
      version: 1 as const,
      sessionId: "replay-1",
      generation: 0,
      threadUrl: "https://example.com/test/read.cgi/live/1/",
      responseNumber: 1,
      title: "架空の実況1",
    };
    await act(async () => {
      mocks.listener?.(request);
    });

    expect(mocks.dispatch).toHaveBeenNthCalledWith(1, {
      type: "OPEN_IN_NEW_TAB_FORCE",
      focus: true,
      tabId: expect.any(String),
      page: {
        type: "thread",
        title: "架空の実況1",
        threadUrl: request.threadUrl,
      },
    });

    await act(async () => {
      mocks.listener?.({
        ...request,
        generation: 1,
        threadUrl: "https://example.com/test/read.cgi/live/2/",
      });
    });
    expect(mocks.dispatch).toHaveBeenNthCalledWith(2, {
      type: "NAVIGATE_TAB",
      paneId: "pane-1",
      tabId: "tab-replay",
      page: {
        type: "thread",
        title: "架空の実況1",
        threadUrl: "https://example.com/test/read.cgi/live/2/",
      },
    });

    await act(async () => {
      mocks.listener?.({
        ...request,
        generation: 0,
        threadUrl: "https://example.com/test/read.cgi/live/3/",
      });
    });
    expect(mocks.dispatch).toHaveBeenCalledTimes(2);
  });

  it("購読を作り直しても現在URLのThreadViewを再利用する", async () => {
    const first = renderHook(() => useArchiveReplayMainThreadSync());
    await act(async () => {
      await Promise.resolve();
    });

    const request = {
      version: 1 as const,
      sessionId: "replay-1",
      generation: 0,
      threadUrl: "https://example.com/test/read.cgi/live/1/",
      responseNumber: 1,
      title: "架空の実況1",
    };
    await act(async () => {
      mocks.listener?.(request);
    });
    first.unmount();

    renderHook(() => useArchiveReplayMainThreadSync());
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      mocks.listener?.({ ...request, generation: 1 });
    });

    expect(mocks.dispatch).toHaveBeenNthCalledWith(2, {
      type: "NAVIGATE_TAB",
      paneId: "pane-1",
      tabId: "tab-replay",
      page: {
        type: "thread",
        title: "架空の実況1",
        threadUrl: request.threadUrl,
      },
    });
    expect(mocks.dispatch).toHaveBeenCalledTimes(2);
  });
});
