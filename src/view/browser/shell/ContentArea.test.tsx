import "@testing-library/jest-dom/vitest";

import { render } from "@testing-library/react";
import React from "react";
import { ContentArea } from "src/view/browser/shell/ContentArea";
import type { Page, Tab } from "src/view/browser/types";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mockUseTabStore = vi.fn();
const threadPageLifecycle = vi.hoisted(() => ({
  mountCount: 0,
  unmountCount: 0,
  renderCount: 0,
}));
const detachedTabIds = vi.hoisted(() => new Set<string>());

vi.mock("src/features/tabs/browser/use-tab-store", () => ({
  useTabStore: () => mockUseTabStore(),
}));

vi.mock("src/features/tabs/browser/use-detached-tab-controller", () => ({
  useDetachedTabController: () => ({
    isDetachedTab: (tabId: string) => detachedTabIds.has(tabId),
  }),
}));

vi.mock("src/view/browser/pages/HomeTabPage", () => ({
  HomeTabPage: () => (
    <div data-testid="page-home-tab" style={{ height: "2400px" }}>
      home-tab
    </div>
  ),
}));

vi.mock("src/view/browser/pages/BoardListPage", () => ({
  BoardListPage: () => <div data-testid="page-board-list">board-list</div>,
}));

vi.mock("src/view/browser/pages/SettingsPage", () => ({
  SettingsPage: () => <div data-testid="page-settings">settings</div>,
}));

vi.mock("src/view/browser/pages/LogListPage", () => ({
  LogListPage: () => <div data-testid="page-log-list">log-list</div>,
}));

vi.mock("src/view/browser/pages/ThreadListPage", () => ({
  ThreadListPage: () => <div data-testid="page-thread-list">thread-list</div>,
}));

vi.mock("src/view/browser/pages/BookmarkListPage", () => ({
  BookmarkListPage: () => <div data-testid="page-bookmark-list">bookmark-list</div>,
}));

vi.mock("src/view/browser/pages/HistoryListPage", () => ({
  HistoryListPage: () => <div data-testid="page-history-list">history-list</div>,
}));

vi.mock("src/view/browser/pages/WriteHistoryListPage", () => ({
  WriteHistoryListPage: () => <div data-testid="page-write-history-list">write-history-list</div>,
}));

vi.mock("src/view/browser/pages/ThreadPage", () => ({
  ThreadPage: ({
    refreshKey,
    isOverlayTarget,
    startAutoRefreshAtBottom,
  }: {
    refreshKey: number;
    isOverlayTarget: boolean;
    startAutoRefreshAtBottom: boolean;
  }) => {
    threadPageLifecycle.renderCount += 1;
    // reloadKey はデータ再取得トリガにだけ使い、コンポーネント実体は再マウントさせない。
    const mountIdRef = React.useRef<number | null>(null);
    if (mountIdRef.current == null) {
      threadPageLifecycle.mountCount += 1;
      mountIdRef.current = threadPageLifecycle.mountCount;
    }

    React.useEffect(() => {
      return () => {
        threadPageLifecycle.unmountCount += 1;
      };
    }, []);

    return (
      <div
        data-testid="page-thread"
        data-mount-id={String(mountIdRef.current)}
        data-refresh-key={String(refreshKey)}
        data-overlay-target={String(isOverlayTarget)}
        data-start-auto-refresh-at-bottom={String(startAutoRefreshAtBottom)}
      >
        thread
      </div>
    );
  },
}));

function createTab(id: string): Tab {
  return {
    id,
    history: [{ type: "home", title: "ホーム" }],
    currentIndex: 0,
    pinned: false,
    reloadKey: 0,
    autoRefreshEnabled: false,
    autoRefreshPageKey: null,
  };
}

function createTabWithPage(id: string, page: Page): Tab {
  return {
    ...createTab(id),
    history: [page],
    currentIndex: 0,
  };
}

function mockState(tabs: Tab[], selectedTabId: string) {
  mockUseTabStore.mockReturnValue({
    state: {
      tabs,
      selectedTabId,
      closedTabs: [],
    },
    dispatch: vi.fn(),
  });
}

describe("ContentArea tab switching", () => {
  beforeEach(() => {
    mockUseTabStore.mockReset();
    threadPageLifecycle.mountCount = 0;
    threadPageLifecycle.unmountCount = 0;
    threadPageLifecycle.renderCount = 0;
    detachedTabIds.clear();
  });

  it("アクティブでないタブは display:none で隠す", () => {
    const tab1 = createTabWithPage("tab-1", {
      type: "home",
      title: "ホーム",
    });
    const tab2 = createTabWithPage("tab-2", {
      type: "boardList",
      title: "板一覧",
    });

    mockState([tab1, tab2], "tab-1");
    const { container, rerender } = render(<ContentArea />);

    // 遅延レンダリング：未アクティブタブは初回アクティブ化まで DOM に存在しない。
    // tab-2 へ切り替えることで panel2 を初回マウントさせてから表示状態を検証する。
    mockState([tab1, tab2], "tab-2");
    rerender(<ContentArea />);

    const panel1 = container.querySelector('[data-tab-panel-id="tab-1"]') as HTMLDivElement;
    const panel2 = container.querySelector('[data-tab-panel-id="tab-2"]') as HTMLDivElement;

    expect(panel1).toHaveStyle({ display: "none" });
    expect(panel2).toHaveStyle({ display: "block" });

    mockState([tab1, tab2], "tab-1");
    rerender(<ContentArea />);

    expect(panel1).toHaveStyle({ display: "block" });
    expect(panel2).toHaveStyle({ display: "none" });
  });

  it("非アクティブ化してもタブごとの scroll 状態を保持する", () => {
    const tab1 = createTabWithPage("tab-1", {
      type: "home",
      title: "ホーム",
    });
    const tab2 = createTabWithPage("tab-2", {
      type: "boardList",
      title: "板一覧",
    });

    mockState([tab1, tab2], "tab-1");
    const { container, rerender } = render(<ContentArea />);

    // 遅延レンダリング：panel2 は一度もアクティブになっていないと DOM に存在しない。
    // tab-2 を先にアクティブ化して両パネルをマウントしてから scroll 値を設定する。
    mockState([tab1, tab2], "tab-2");
    rerender(<ContentArea />);

    const panel1 = container.querySelector('[data-tab-panel-id="tab-1"]') as HTMLDivElement;
    const panel2 = container.querySelector('[data-tab-panel-id="tab-2"]') as HTMLDivElement;

    panel1.scrollTop = 240;
    panel2.scrollTop = 32;

    mockState([tab1, tab2], "tab-1");
    rerender(<ContentArea />);

    expect(panel1.scrollTop).toBe(240);
    expect(panel2.scrollTop).toBe(32);
  });

  it("reloadKey の更新ではページを再マウントしない", () => {
    const threadPage: Page = {
      type: "thread",
      title: "スレッド",
      threadUrl: "https://example.com/test/read.cgi/board/123/",
    };
    const tab = createTabWithPage("tab-1", threadPage);

    mockState([tab], "tab-1");
    const { container, rerender } = render(<ContentArea />);

    const first = container.querySelector('[data-testid="page-thread"]') as HTMLDivElement;
    expect(first.dataset.mountId).toBe("1");
    expect(first.dataset.refreshKey).toBe("0");

    const reloadedTab: Tab = {
      ...tab,
      reloadKey: 1,
    };
    mockState([reloadedTab], "tab-1");
    rerender(<ContentArea />);

    const second = container.querySelector('[data-testid="page-thread"]') as HTMLDivElement;
    expect(second.dataset.mountId).toBe("1");
    expect(second.dataset.refreshKey).toBe("1");
    expect(threadPageLifecycle.unmountCount).toBe(0);
  });

  it("コメント実況の対象をフォーカス中ペインだけに限定する", () => {
    const tab = createTabWithPage("tab-1", {
      type: "thread",
      title: "スレッド",
      threadUrl: "https://example.com/test/read.cgi/board/123/",
    });
    mockState([tab], "tab-1");

    const { container, rerender } = render(<ContentArea isOverlayTarget={false} />);

    expect(container.querySelector('[data-testid="page-thread"]')).toHaveAttribute(
      "data-overlay-target",
      "false",
    );

    rerender(<ContentArea isOverlayTarget />);

    expect(container.querySelector('[data-testid="page-thread"]')).toHaveAttribute(
      "data-overlay-target",
      "true",
    );
  });

  it("次スレへ自動移動したページに最下部開始フラグを渡す", () => {
    const previousPage: Page = {
      type: "thread",
      title: "前スレ",
      threadUrl: "https://example.com/test/read.cgi/board/123/",
    };
    const nextPage: Page = {
      type: "thread",
      title: "次スレ",
      threadUrl: "https://example.com/test/read.cgi/board/456/",
    };
    const tab: Tab = {
      ...createTab("tab-1"),
      history: [previousPage, nextPage],
      currentIndex: 1,
      autoRefreshEnabled: true,
      autoRefreshPageKey: "thread:https://example.com/test/read.cgi/board/456/",
    };

    mockState([tab], "tab-1");
    const { container } = render(<ContentArea />);

    expect(container.querySelector('[data-testid="page-thread"]')).toHaveAttribute(
      "data-start-auto-refresh-at-bottom",
      "true",
    );
  });

  it("別タブの追加だけでは既存スレッドページを再描画しない", () => {
    const threadTab = createTabWithPage("tab-1", {
      type: "thread",
      title: "スレッド",
      threadUrl: "https://example.com/test/read.cgi/board/123/",
    });
    const homeTab = createTabWithPage("tab-2", {
      type: "home",
      title: "ホーム",
    });

    mockState([threadTab], "tab-1");
    const { rerender } = render(<ContentArea />);

    expect(threadPageLifecycle.renderCount).toBe(1);

    // アクティブタブを変えずに別タブを追加する。
    // threadTab の isActive が変わらないため TabPanel の memo がバイルアウトし、
    // ThreadPage の再描画は発生しないことを確認する。
    mockState([threadTab, homeTab], "tab-1");
    rerender(<ContentArea />);

    expect(threadPageLifecycle.renderCount).toBe(1);
    expect(threadPageLifecycle.unmountCount).toBe(0);
  });

  it("別窓へ切り離したタブは元窓の本文から外す", () => {
    const mainTab = createTabWithPage("tab-1", {
      type: "home",
      title: "ホーム",
    });
    const detachedTab = createTabWithPage("tab-2", {
      type: "boardList",
      title: "板一覧",
    });
    detachedTabIds.add(detachedTab.id);

    mockState([mainTab, detachedTab], mainTab.id);
    const { container } = render(<ContentArea />);

    expect(container.querySelector('[data-tab-panel-id="tab-1"]')).toBeInTheDocument();
    expect(container.querySelector('[data-tab-panel-id="tab-2"]')).not.toBeInTheDocument();
  });
});
