import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TabContextMenu } from "src/features/tabs/ui/TabContextMenu";
import { container } from "src/service-container";
import type { Tab } from "src/view/browser/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { copyTextMock, dispatchMock, threadTab, secondTab } = vi.hoisted(() => ({
  copyTextMock: vi.fn<() => Promise<void>>(),
  dispatchMock: vi.fn(),
  threadTab: {
    id: "tab-1",
    history: [
      {
        type: "thread" as const,
        title: "Current Thread",
        threadUrl: "https://example.com/test/read.cgi/software/123/",
      },
    ],
    currentIndex: 0,
    pinned: false,
    reloadKey: 0,
    autoRefreshEnabled: false,
    autoRefreshPageKey: null,
  } satisfies Tab,
  secondTab: {
    id: "tab-2",
    history: [
      {
        type: "boardList" as const,
        title: "Other Tab",
      },
    ],
    currentIndex: 0,
    pinned: false,
    reloadKey: 0,
    autoRefreshEnabled: false,
    autoRefreshPageKey: null,
  } satisfies Tab,
}));

vi.mock("src/view/browser/utils/clipboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("src/view/browser/utils/clipboard")>();
  return { ...actual, copyText: copyTextMock };
});

vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabStore: () => ({
    state: {
      tabs: [threadTab, secondTab],
      closedTabs: [],
    },
    paneId: "pane-1",
    stateRef: {
      current: {
        panes: [{ id: "pane-1", tabs: [threadTab, secondTab], activeTabId: threadTab.id }],
        activePaneId: "pane-1",
        closedTabs: [],
      },
    },
    dispatch: dispatchMock,
  }),
}));

describe("TabContextMenu", () => {
  beforeEach(() => {
    // コピー後の通知まで実行されるため、テストでも通知サービスを登録する。
    container.toast = { notify: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() };
    copyTextMock.mockResolvedValue();
    container.bookmark = {
      promiseFirstScan: Promise.resolve(true),
      ready: vi.fn(async () => undefined),
      getAll: vi.fn(() => []),
      import: vi.fn(async () => true),
      get: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
      updateResCount: vi.fn(),
      updateExpired: vi.fn(),
      getByBoard: vi.fn(),
      getAllBoards: vi.fn(() => []),
    };
  });

  afterEach(() => {
    cleanup();
    copyTextMock.mockReset();
    dispatchMock.mockReset();
  });

  it("コマンドへ移動した項目をタブメニューに表示しない", () => {
    render(<TabContextMenu tab={threadTab} position={{ x: 10, y: 10 }} onClose={vi.fn()} />);

    // 変更理由: 他・右側・すべてのタブを閉じる操作はコマンドパレットへ移動したため、
    // タブメニューには置かない。スレッドのコピー3項目は共通メニューとして残す。
    expect(screen.queryByRole("button", { name: "他のタブを閉じる" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "右側のタブを閉じる" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "すべて閉じる" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "右のペインで開く" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "スレタイ&URLをMarkdownでコピー" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "datのURLをコピー" })).not.toBeInTheDocument();
  });

  it("スレッドのコピー項目を統一された順序とアイコンで表示する", () => {
    render(<TabContextMenu tab={threadTab} position={{ x: 10, y: 10 }} onClose={vi.fn()} />);

    const copyLabels = ["スレタイをコピー", "URLをコピー", "スレタイ＆URLをコピー"];
    const copyButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".context-menu__item"),
    ).filter((button) => copyLabels.includes(button.textContent?.trim() ?? ""));
    expect(copyButtons).toHaveLength(copyLabels.length);
    expect(copyButtons.map((button) => button.textContent?.trim())).toEqual(copyLabels);
    for (const button of copyButtons) {
      expect(button.querySelector("svg")).toHaveClass("lucide-clipboard");
    }

    fireEvent.click(copyButtons[2]!);
    expect(copyTextMock).toHaveBeenLastCalledWith(
      "Current Thread\nhttps://example.com/test/read.cgi/software/123/",
      expect.objectContaining({
        window: expect.any(Object),
        document: expect.any(Object),
      }),
    );
  });

  it("閉じる操作を対象タブのコマンドとして実行する", () => {
    render(<TabContextMenu tab={threadTab} position={{ x: 10, y: 10 }} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "タブを閉じる" }));
    expect(dispatchMock).toHaveBeenCalledWith({
      type: "CLOSE_TAB",
      tabId: threadTab.id,
      paneId: "pane-1",
    });
  });
});
