import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AutoRefreshStatusItem } from "src/features/auto-refresh/ui/AutoRefreshStatusItem";
import { container } from "src/service-container/index";
import { StatusBar, StatusBarProvider } from "src/view/browser/components/StatusBar";
import type { Page } from "src/view/browser/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  viewTab: { id: "tab-a" },
  dispatch: vi.fn(),
  viewPage: {
    type: "thread",
    title: "スレッド",
    threadUrl: "https://example.com/test/read.cgi/software/1/",
  } as Page,
  autoRefreshPanel: {
    panelKind: "thread" as "thread" | "threadList" | null,
    isOnThread: true,
    isEnabled: false,
    intervalSec: 30,
    toggle: vi.fn(),
    setIntervalSec: vi.fn(),
  },
  autoNextThreadSetting: {
    enabled: false,
    mode: "balanced" as const,
    setEnabled: vi.fn(),
    setMode: vi.fn(),
  },
  popupAutoScrollPauseSetting: {
    enabled: true,
    setEnabled: vi.fn(),
  },
  canAutoScroll: false,
  isPaused: false,
}));

vi.mock("src/features/tabs/browser/use-tab-store", () => ({
  useTabStore: () => ({
    viewPage: mocks.viewPage,
    viewTab: mocks.viewTab,
    dispatch: mocks.dispatch,
  }),
}));

vi.mock("src/features/auto-refresh/browser/use-auto-refresh-panel", () => ({
  MIN_INTERVAL_SEC: 5,
  MAX_INTERVAL_SEC: 120,
  MIN_BOARD_INTERVAL_SEC: 20,
  MAX_BOARD_INTERVAL_SEC: 300,
  useAutoRefreshPanel: () => mocks.autoRefreshPanel,
}));

vi.mock("src/features/next-thread/browser/use-auto-next-thread-setting", () => ({
  useAutoNextThreadSetting: () => mocks.autoNextThreadSetting,
}));

vi.mock("src/features/auto-refresh/browser/use-popup-auto-scroll-pause-setting", () => ({
  usePopupAutoScrollPauseSetting: () => mocks.popupAutoScrollPauseSetting,
}));

vi.mock("src/features/auto-refresh/browser/use-auto-scroll-state", () => ({
  useAutoScrollState: () => ({
    canAutoScroll: mocks.canAutoScroll,
    isAutoScrolling: false,
    isPaused: mocks.isPaused,
  }),
}));

function createRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 120,
    bottom: 144,
    left: 48,
    right: 160,
    width: 112,
    height: 24,
    toJSON: () => ({}),
  } as DOMRect;
}

function renderItem() {
  return render(
    <StatusBarProvider>
      <AutoRefreshStatusItem />
      <StatusBar />
    </StatusBarProvider>,
  );
}

describe("AutoRefreshStatusItem", () => {
  beforeEach(() => {
    mocks.viewPage = {
      type: "thread",
      title: "スレッド",
      threadUrl: "https://example.com/test/read.cgi/software/1/",
    };
    mocks.autoRefreshPanel = {
      panelKind: "thread",
      isOnThread: true,
      isEnabled: false,
      intervalSec: 30,
      toggle: vi.fn(),
      setIntervalSec: vi.fn(),
    };
    mocks.autoNextThreadSetting = {
      enabled: false,
      mode: "balanced",
      setEnabled: vi.fn(),
      setMode: vi.fn(),
    };
    mocks.popupAutoScrollPauseSetting = {
      enabled: true,
      setEnabled: vi.fn(),
    };
    mocks.canAutoScroll = false;
    mocks.isPaused = false;

    container.config = {
      get: vi.fn((key: string) => {
        if (key === "auto_load_second_board") {
          return "0";
        }
        return "0";
      }),
      set: vi.fn(),
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    container.message = {
      on: vi.fn(),
      off: vi.fn(),
      send: vi.fn(),
    };
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("表示形式だけを切り替え、自動更新の開始や間隔変更を発火しない", () => {
    renderItem();
    const button = screen.getByRole("button", { name: /自動更新/ });
    Object.defineProperty(button, "getBoundingClientRect", { value: () => createRect() });
    fireEvent.click(button);
    const select = screen.getByLabelText("表示形式");
    expect(select).toHaveValue("normal");
    fireEvent.change(select, { target: { value: "live-chat" } });
    // タブ状態ではなく設定へ保存し、新しいタブや再起動後も同じ表示形式を使う。
    expect(container.config.set).toHaveBeenCalledWith("thread_display_mode", "live-chat");
    expect(select).toHaveValue("live-chat");
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(mocks.autoRefreshPanel.toggle).not.toHaveBeenCalled();
    expect(mocks.autoRefreshPanel.setIntervalSec).not.toHaveBeenCalled();
  });

  it("スレッド用ミニウィンドウを開き、同じボタンの再クリックで閉じる", () => {
    renderItem();

    const button = screen.getByRole("button", { name: /自動更新/ });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: () => createRect(),
    });

    fireEvent.click(button);

    expect(screen.getByText("スレッド自動更新")).toBeInTheDocument();
    expect(screen.getByText("自動次スレ移動")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    fireEvent.pointerDown(button);
    fireEvent.click(button);

    expect(screen.queryByText("スレッド自動更新")).not.toBeInTheDocument();
  });

  it("スレ一覧では別内容のミニウィンドウを表示する", () => {
    mocks.viewPage = {
      type: "threadList",
      title: "板",
      boardUrl: "https://example.com/software/",
      boardTitle: "Software",
    };
    mocks.autoRefreshPanel = {
      panelKind: "threadList",
      isOnThread: false,
      isEnabled: false,
      intervalSec: 40,
      toggle: vi.fn(),
      setIntervalSec: vi.fn(),
    };

    renderItem();

    const button = screen.getByRole("button", { name: /スレ一覧自動更新/ });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: () => createRect(),
    });

    fireEvent.click(button);

    expect(screen.getByText("スレ一覧自動更新")).toBeInTheDocument();
    expect(
      screen.getByText("スレ一覧を開いている間だけ、同じタブで自動更新します"),
    ).toBeInTheDocument();
    expect(screen.queryByText("自動スクロールスタイル")).not.toBeInTheDocument();
  });

  it("スレッドでもスレ一覧でもないページでは表示しない", () => {
    mocks.viewPage = {
      type: "boardList",
      title: "ホーム",
    };
    mocks.autoRefreshPanel = {
      panelKind: null,
      isOnThread: false,
      isEnabled: false,
      intervalSec: 30,
      toggle: vi.fn(),
      setIntervalSec: vi.fn(),
    };

    renderItem();

    expect(screen.queryByRole("button", { name: /自動更新/ })).toBeNull();
  });

  it("ポップアップ表示中の一時停止状態をホバーラベルで示す", () => {
    mocks.autoRefreshPanel = {
      panelKind: "thread",
      isOnThread: true,
      isEnabled: true,
      intervalSec: 30,
      toggle: vi.fn(),
      setIntervalSec: vi.fn(),
    };
    mocks.isPaused = true;

    renderItem();

    expect(
      screen.getByRole("button", {
        name: /一時停止中（ポップアップ表示中, 30秒間隔）/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("30 s")).toBeInTheDocument();
  });

  it("アイコンの横に現在の更新間隔を表示する", () => {
    renderItem();

    expect(screen.getByText("30 s")).toBeInTheDocument();
  });

  it("スレ一覧では一覧用の更新間隔をアイコン横に表示する", () => {
    mocks.viewPage = {
      type: "threadList",
      title: "板",
      boardUrl: "https://example.com/software/",
      boardTitle: "Software",
    };
    mocks.autoRefreshPanel = {
      panelKind: "threadList",
      isOnThread: false,
      isEnabled: false,
      intervalSec: 40,
      toggle: vi.fn(),
      setIntervalSec: vi.fn(),
    };

    renderItem();

    expect(screen.getByText("40 s")).toBeInTheDocument();
  });

  it("詳細設定は既定で折りたたみ、開き直しても開閉状態を保つ", () => {
    renderItem();

    const button = screen.getByRole("button", { name: /自動更新/ });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: () => createRect(),
    });

    fireEvent.click(button);
    const details = screen.getByText("詳細設定").closest("details");
    expect(details).not.toHaveAttribute("open");
    // よく使う操作は折りたたみの外に置く。
    expect(screen.getByRole("slider", { name: "更新間隔" }).closest("details")).toBeNull();

    (details as HTMLDetailsElement).open = true;
    fireEvent(details as HTMLDetailsElement, new Event("toggle"));

    fireEvent.pointerDown(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(screen.getByText("詳細設定").closest("details")).toHaveAttribute("open");
  });

  it("ミニウィンドウから自動次スレ移動を切り替えられる", () => {
    renderItem();

    const button = screen.getByRole("button", { name: /自動更新/ });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: () => createRect(),
    });

    fireEvent.click(button);

    const nextThreadToggle = screen
      .getByText("自動次スレ移動")
      .closest(".mini-window__toggle-row")
      ?.querySelector("button");

    expect(nextThreadToggle).not.toBeNull();
    fireEvent.click(nextThreadToggle as HTMLButtonElement);

    expect(mocks.autoNextThreadSetting.setEnabled).toHaveBeenCalledWith(true);
  });

  it("ミニウィンドウから次スレ判定を変更できる", () => {
    renderItem();

    const button = screen.getByRole("button", { name: /自動更新/ });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: () => createRect(),
    });

    fireEvent.click(button);
    fireEvent.change(screen.getByRole("combobox", { name: "次スレ判定" }), {
      target: { value: "aggressive" },
    });

    expect(mocks.autoNextThreadSetting.setMode).toHaveBeenCalledWith("aggressive");
  });

  it("ミニウィンドウからポップアップ表示中の一時停止を切り替えられる", () => {
    renderItem();

    const button = screen.getByRole("button", { name: /自動更新/ });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: () => createRect(),
    });

    fireEvent.click(button);

    const pauseToggle = screen
      .getByText("ポップアップ表示中は一時停止")
      .closest(".mini-window__toggle-row")
      ?.querySelector("button");

    expect(pauseToggle).not.toBeNull();
    expect(pauseToggle).toHaveTextContent("ON");
    fireEvent.click(pauseToggle as HTMLButtonElement);

    expect(mocks.popupAutoScrollPauseSetting.setEnabled).toHaveBeenCalledWith(false);
  });

  it("スレ一覧で自動更新間隔が有効なときはアクティブ色になる", () => {
    mocks.viewPage = {
      type: "threadList",
      title: "板",
      boardUrl: "https://example.com/software/",
      boardTitle: "Software",
    };
    mocks.autoRefreshPanel = {
      panelKind: "threadList",
      isOnThread: false,
      isEnabled: true,
      intervalSec: 40,
      toggle: vi.fn(),
      setIntervalSec: vi.fn(),
    };

    const { container: rendered } = renderItem();

    const statusBar = rendered.querySelector(".status-bar");
    expect(statusBar?.className).toContain("status-bar--active");
  });

  it("スレ一覧ミニウィンドウから自動更新を切り替えられる", () => {
    mocks.viewPage = {
      type: "threadList",
      title: "板",
      boardUrl: "https://example.com/software/",
      boardTitle: "Software",
    };
    mocks.autoRefreshPanel = {
      panelKind: "threadList",
      isOnThread: false,
      isEnabled: false,
      intervalSec: 40,
      toggle: vi.fn(),
      setIntervalSec: vi.fn(),
    };

    renderItem();

    const button = screen.getByRole("button", { name: /スレ一覧自動更新/ });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: () => createRect(),
    });

    fireEvent.click(button);

    const toggleButton = screen
      .getByText("自動更新")
      .closest(".mini-window__toggle-row")
      ?.querySelector("button");

    expect(toggleButton).not.toBeNull();
    fireEvent.click(toggleButton as HTMLButtonElement);

    expect(mocks.autoRefreshPanel.toggle).toHaveBeenCalledTimes(1);
  });
});
