import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  listener: null as ((request: unknown) => void) | null,
  subscribe: vi.fn(),
}));

vi.mock("../platform", () => ({
  subscribeArchiveReplayMainThreadRequests: mocks.subscribe,
}));

vi.mock("src/app/platform", () => ({
  platform: {
    window: {
      setTitle: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

vi.mock("src/core/history/History", () => ({
  add: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  },
}));

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe("過去実況Main同期のTabProvider統合", () => {
  beforeEach(() => {
    const storage = createMemoryStorage();
    vi.stubGlobal("localStorage", storage);
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    mocks.listener = null;
    mocks.subscribe.mockReset();
    mocks.subscribe.mockImplementation(async (listener: (request: unknown) => void) => {
      mocks.listener = listener;
      return vi.fn();
    });
  });

  afterEach(() => {
    cleanup();
    vi.resetModules();
    vi.unstubAllGlobals();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("新規専用タブをMainへフォーカスしてもTabProviderの状態を壊さない", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");
    const { useArchiveReplayMainThreadSync } = await import("./use-main-thread-sync");

    function Harness() {
      useArchiveReplayMainThreadSync();
      const { viewPage, viewTab, state } = useTabStore();
      return (
        <output
          data-testid="current-url"
          data-tab-id={viewTab.id}
          data-tab-count={state.tabs.length}
        >
          {viewPage.type === "thread" ? viewPage.threadUrl : ""}
        </output>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      mocks.listener?.({
        version: 1,
        sessionId: "replay-1",
        generation: 0,
        threadUrl: "https://example.com/test/read.cgi/live/1/",
        responseNumber: 1,
        title: "架空の実況",
      });
    });

    expect(screen.getByTestId("current-url")).toHaveTextContent(
      "https://example.com/test/read.cgi/live/1/",
    );
    const tabId = screen.getByTestId("current-url").getAttribute("data-tab-id");
    const tabCount = screen.getByTestId("current-url").getAttribute("data-tab-count");
    await act(async () => {
      mocks.listener?.({
        version: 1,
        sessionId: "replay-1",
        generation: 1,
        threadUrl: "https://example.com/test/read.cgi/live/2/",
        responseNumber: 1,
        title: "架空の次スレ",
      });
    });
    expect(screen.getByTestId("current-url")).toHaveTextContent(
      "https://example.com/test/read.cgi/live/2/",
    );
    expect(screen.getByTestId("current-url")).toHaveAttribute("data-tab-id", tabId);
    expect(screen.getByTestId("current-url")).toHaveAttribute("data-tab-count", tabCount);
  });
});
