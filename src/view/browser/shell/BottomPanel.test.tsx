import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { BottomPanel } from "src/view/browser/shell/BottomPanel";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  closePanel: vi.fn(),
  canAutoScroll: false,
  isAutoScrolling: false,
  detached: false,
  viewPage: {
    type: "thread",
    title: "スレッド",
    threadUrl: "https://example.com/test/read.cgi/software/1/",
  },
  viewTab: { id: "tab-1" },
}));

vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabStore: () => ({
    viewPage: mocks.viewPage,
    viewTab: mocks.viewTab,
  }),
}));

vi.mock("src/features/tabs/browser/use-detached-tab-controller", () => ({
  useDetachedTabController: () => ({ isDetachedTab: () => mocks.detached }),
}));

vi.mock("src/view/browser/hooks/use-bottom-panel", () => ({
  BOTTOM_PANEL_THREAD_LIST_TAB_ID: "thread-list",
  BOTTOM_PANEL_WRITE_TAB_ID: "write",
  useBottomPanel: () => ({
    isOpen: true,
    height: 200,
    activePanelTabId: "write",
    tabs: [
      { id: "write", label: "書き込み" },
      { id: "thread-list", label: "スレ一覧" },
    ],
    openPanel: vi.fn(),
    closePanel: mocks.closePanel,
    togglePanel: vi.fn(),
    setHeight: vi.fn(),
    setActivePanelTab: vi.fn(),
  }),
}));

vi.mock("src/features/auto-refresh/browser/use-auto-scroll-state", () => ({
  useAutoScrollState: () => ({
    canAutoScroll: mocks.canAutoScroll,
    isAutoScrolling: mocks.isAutoScrolling,
    isPaused: false,
  }),
}));

vi.mock("src/features/write/ui/WritePanelContent", () => ({
  WritePanelContent: () => <div>write panel</div>,
}));

describe("BottomPanel", () => {
  beforeEach(() => {
    mocks.closePanel.mockReset();
    mocks.canAutoScroll = false;
    mocks.isAutoScrolling = false;
    mocks.detached = false;
    mocks.viewPage = {
      type: "thread",
      title: "スレッド",
      threadUrl: "https://example.com/test/read.cgi/software/1/",
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("スレッドでは書き込みパネルを表示する", () => {
    render(<BottomPanel />);

    expect(screen.getByText("write panel")).toBeInTheDocument();
    expect(mocks.closePanel).not.toHaveBeenCalled();
  });

  it("スレッド以外へ移動したらパネルを閉じて非表示にする", async () => {
    mocks.viewPage = {
      type: "boardList" as const,
      title: "ホーム",
      threadUrl: "",
    };

    render(<BottomPanel />);

    await waitFor(() => {
      expect(mocks.closePanel).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText("write panel")).not.toBeInTheDocument();
  });

  it("表示中のスレッドを別窓へ移したらパネルを閉じる", async () => {
    mocks.detached = true;

    render(<BottomPanel />);

    await waitFor(() => {
      expect(mocks.closePanel).toHaveBeenCalledTimes(1);
    });
  });

  it("別窓内に置いたパネルは、自タブが切り離し中でも閉じない", () => {
    mocks.detached = true;

    render(<BottomPanel hostedInTabWindow />);

    expect(screen.getByText("write panel")).toBeInTheDocument();
    expect(mocks.closePanel).not.toHaveBeenCalled();
  });

  it("別窓内に置いたパネルも、スレッド以外へ移動したら閉じる", async () => {
    mocks.detached = true;
    mocks.viewPage = {
      type: "boardList" as const,
      title: "ホーム",
      threadUrl: "",
    };

    render(<BottomPanel hostedInTabWindow />);

    await waitFor(() => {
      expect(mocks.closePanel).toHaveBeenCalledTimes(1);
    });
  });

  it("自動追従有効中にパネルが開いてもスレッド末尾へ同期する", () => {
    mocks.canAutoScroll = true;

    const scrollContainer = document.createElement("div");
    scrollContainer.className = "content-area__tab-panel";
    scrollContainer.setAttribute("data-active", "true");

    let scrollTopValue = 10;
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => 480,
    });

    document.body.appendChild(scrollContainer);

    render(<BottomPanel />);

    expect(scrollTopValue).toBe(480);
    scrollContainer.remove();
  });
});
