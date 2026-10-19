import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  commandPalette,
  commandPaletteStore,
} from "src/view/browser/commands/command-palette-store";
import { TitleBar } from "src/view/browser/shell/TitleBar";
import type { Page } from "src/view/browser/types";
import {
  consumeManualRefresh,
  getManualRefreshScopeKey,
  MANUAL_REFRESH_COOLDOWN_MS,
} from "src/view/browser/utils/manual-refresh";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { dispatchMock, mocks } = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  mocks: {
    viewPage: {
      type: "thread" as const,
      title: "Current Thread",
      threadUrl: "https://example.com/test/read.cgi/software/1/",
    } as Page,
    viewTab: {
      id: "tab-1",
      history: [
        {
          type: "thread",
          title: "Current Thread",
          threadUrl: "https://example.com/test/read.cgi/software/1/",
        },
      ] as Page[],
      currentIndex: 0,
      pinned: false,
      reloadKey: 0,
      autoRefreshEnabled: false,
      autoRefreshPageKey: null,
    },
  },
}));

vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabStore: () => ({
    viewTab: mocks.viewTab,
    viewPage: mocks.viewPage,
    dispatch: dispatchMock,
    paneId: "pane-1",
    stateRef: {
      get current() {
        return {
          panes: [{ id: "pane-1", tabs: [mocks.viewTab], activeTabId: mocks.viewTab.id }],
          activePaneId: "pane-1",
          closedTabs: [],
        };
      },
    },
  }),
  useTabPanes: () => ({ panes: [{ id: "pane-1" }], activePaneId: "pane-1" }),
}));

vi.mock("src/features/tabs/ui/TabContextMenu", () => ({
  TabContextMenu: ({
    tab,
    position,
  }: {
    tab: { id: string };
    position: { x: number; y: number };
  }) => (
    <div
      data-testid="title-bar-tab-menu"
      data-tab-id={tab.id}
      data-x={position.x}
      data-y={position.y}
    />
  ),
}));

const { titleBarButtonSettingsHolder } = vi.hoisted(() => ({
  titleBarButtonSettingsHolder: {
    value: {
      backEnabled: true,
      forwardEnabled: true,
      refreshEnabled: true,
    },
  },
}));

vi.mock("src/view/browser/hooks/use-title-bar-navigation-setting", () => ({
  useTitleBarButtonSettings: () => titleBarButtonSettingsHolder.value,
}));

describe("TitleBar", () => {
  let refreshClock = Date.now();
  afterEach(() => {
    cleanup();
    commandPalette.close();
    consumeManualRefresh(getManualRefreshScopeKey("tab-1", mocks.viewPage));
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    // 変更理由: 同じタブIDを使う別テストへ、前の更新操作の3秒ロックを持ち越さない。
    refreshClock += MANUAL_REFRESH_COOLDOWN_MS + 1;
    vi.spyOn(Date, "now").mockReturnValue(refreshClock);
    mocks.viewPage = {
      type: "thread",
      title: "Current Thread",
      threadUrl: "https://example.com/test/read.cgi/software/1/",
    };
    titleBarButtonSettingsHolder.value = {
      backEnabled: true,
      forwardEnabled: true,
      refreshEnabled: true,
    };
    mocks.viewTab.history = [
      {
        type: "thread",
        title: "Current Thread",
        threadUrl: "https://example.com/test/read.cgi/software/1/",
      },
    ];
    mocks.viewTab.currentIndex = 0;
    dispatchMock.mockReset();
  });

  it("アクティブページのタイトルを中央表示する", () => {
    render(<TitleBar />);

    const titleBar = screen.getByTestId("title-bar");
    expect(titleBar).toBeInTheDocument();
    expect(screen.getByTestId("title-bar-title")).toHaveTextContent("Current Thread");
    expect(screen.getByRole("toolbar", { name: "レイアウト操作" })).toHaveClass(
      "action-toolbar-container",
    );
  });

  it("ペイン分割ボタンは表示せずコマンド操作に任せる", () => {
    render(<TitleBar />);

    expect(screen.queryByRole("button", { name: "2ペインで表示" })).toBeNull();
    expect(screen.queryByRole("button", { name: "2ペイン表示を解除" })).toBeNull();
  });

  it("ナビゲーション受け口が自ペインのIDを持つ", () => {
    render(<TitleBar />);

    expect(screen.getByTestId("title-bar-nav-slot")).toHaveAttribute("data-pane-id", "pane-1");
  });

  it("水平モードでも左端に更新ボタンを出す", () => {
    render(<TitleBar />);

    const refreshButton = screen.getByRole("button", { name: "更新" });
    expect(screen.getByTestId("title-bar-leading")).toContainElement(refreshButton);

    fireEvent.click(refreshButton);

    expect(dispatchMock).toHaveBeenCalledWith({ type: "RELOAD", tabId: "tab-1" });
    expect(refreshButton).toBeDisabled();
  });

  it("水平モードでも更新ボタンの左側に戻る・進むを表示する", () => {
    mocks.viewTab.history = [
      {
        type: "boardList",
        title: "ホーム",
      },
      {
        type: "thread",
        title: "Current Thread",
        threadUrl: "https://example.com/test/read.cgi/software/1/",
      },
      {
        type: "settings",
        title: "設定",
      },
    ];
    mocks.viewTab.currentIndex = 1;

    render(<TitleBar />);

    const leading = screen.getByTestId("title-bar-leading");
    expect([...leading.querySelectorAll("button")].map((button) => button.title)).toEqual([
      "戻る",
      "進む",
      "更新",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "戻る" }));
    fireEvent.click(screen.getByRole("button", { name: "進む" }));

    expect(dispatchMock).toHaveBeenNthCalledWith(1, { type: "GO_BACK", tabId: "tab-1" });
    expect(dispatchMock).toHaveBeenNthCalledWith(2, { type: "GO_FORWARD", tabId: "tab-1" });
  });

  it("設定でタイトルバーの各ボタンを個別に非表示にできる", () => {
    titleBarButtonSettingsHolder.value = {
      backEnabled: false,
      forwardEnabled: false,
      refreshEnabled: false,
    };
    render(<TitleBar />);

    const leading = screen.getByTestId("title-bar-leading");
    expect(leading.querySelector('[aria-label="戻る"]')).toBeNull();
    expect(leading.querySelector('[aria-label="進む"]')).toBeNull();
    expect(leading.querySelector('[aria-label="更新"]')).toBeNull();
    expect(leading).toBeEmptyDOMElement();
  });

  it("水平モードでもタイトルバー左端に設定された操作ボタンを表示する", () => {
    render(<TitleBar />);

    const leading = screen.getByTestId("title-bar-leading");
    expect([...leading.querySelectorAll("button")].map((button) => button.title)).toEqual([
      "戻る",
      "進む",
      "更新",
    ]);
  });

  it("水平モードで戻る・進む・更新の操作先を保持する", () => {
    mocks.viewTab.history = [
      {
        type: "boardList",
        title: "ホーム",
      },
      {
        type: "thread",
        title: "Current Thread",
        threadUrl: "https://example.com/test/read.cgi/software/1/",
      },
      // 変更理由: 進む操作を有効にし、戻る・進む両方のコマンド発行を検証する。
      {
        type: "boardList",
        title: "次のページ",
      },
    ];
    mocks.viewTab.currentIndex = 1;
    render(<TitleBar />);

    const leading = screen.getByTestId("title-bar-leading");
    expect([...leading.querySelectorAll("button")].map((button) => button.title)).toEqual([
      "戻る",
      "進む",
      "更新",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "戻る" }));
    fireEvent.click(screen.getByRole("button", { name: "進む" }));
    fireEvent.click(screen.getByRole("button", { name: "更新" }));
    expect(dispatchMock).toHaveBeenNthCalledWith(1, { type: "GO_BACK", tabId: "tab-1" });
    expect(dispatchMock).toHaveBeenNthCalledWith(2, { type: "GO_FORWARD", tabId: "tab-1" });
    expect(dispatchMock).toHaveBeenNthCalledWith(3, { type: "RELOAD", tabId: "tab-1" });
  });

  it("長いタイトルは省略可能なタイトル属性を持つ", () => {
    mocks.viewPage = {
      type: "thread",
      title: "長いスレッドタイトル".repeat(20),
      threadUrl: "https://example.com/test/read.cgi/software/1/",
    };

    render(<TitleBar />);

    const title = screen.getByTestId("title-bar-title");
    expect(title).toHaveAttribute("title", mocks.viewPage.title);
    expect(title).toHaveClass("title-bar__title");
  });

  it("タイトルを右クリックするとタブと同じメニューを表示する", () => {
    render(<TitleBar />);

    const title = screen.getByTestId("title-bar-title");
    fireEvent.contextMenu(title, { clientX: 120, clientY: 10 });

    const menu = screen.getByTestId("title-bar-tab-menu");
    expect(menu).toHaveAttribute("data-tab-id", "tab-1");
    expect(menu).toHaveAttribute("data-x", "120");
    expect(menu).toHaveAttribute("data-y", "10");
  });

  it("タイトルは検索アイコン付きのボタンで、クリックするとURL入力を開く", () => {
    render(<TitleBar />);

    const title = screen.getByRole("button", { name: "Current Thread" });
    expect(title).toBe(screen.getByTestId("title-bar-title"));
    expect(title.querySelector("svg")).not.toBeNull();

    fireEvent.click(title);

    expect(commandPaletteStore.getState()).toMatchObject({ opened: true, mode: "navigation" });
  });

  it("オムニバーの受け口を中央に持ち、自ペインのIDを持つ", () => {
    render(<TitleBar />);

    const slot = screen.getByTestId("title-bar-omnibar-slot");
    expect(slot).toHaveAttribute("data-pane-id", "pane-1");
    expect(screen.getByTestId("title-bar-center")).toContainElement(slot);
  });

  it("オムニバーを使えない画面ではタイトルを表示だけにする", () => {
    render(<TitleBar omnibarEnabled={false} />);

    const title = screen.getByTestId("title-bar-title");
    expect(title).toHaveTextContent("Current Thread");
    expect(screen.queryByRole("button", { name: "Current Thread" })).toBeNull();

    fireEvent.click(title);

    expect(commandPaletteStore.getState().opened).toBe(false);
  });
});
