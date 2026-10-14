import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React, { useEffect, useState } from "react";
import type { IRes } from "src/service-container/interfaces";
import { useThreadResContextMenu } from "src/view/browser/pages/thread/use-thread-res-context-menu";
import type { ThreadFilter } from "src/view/browser/types";
import type { ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  copyText: vi.fn<() => Promise<void>>(),
  ngAdd: vi.fn(),
  openWritePanelWithText: vi.fn(),
  toastInfo: vi.fn(),
  dispatch: vi.fn(),
  handleAnchorClick: vi.fn(),
  requestArchiveReplaySeek: vi.fn<() => Promise<void>>(),
  isAutoRefreshEnabled: false,
  fetchThread: vi.fn<() => Promise<void>>(),
}));

vi.mock("src/service-container/index", () => ({
  container: {
    ng: {
      add: mocks.ngAdd,
    },
    toast: {
      info: mocks.toastInfo,
      success: vi.fn(),
    },
  },
}));

vi.mock("src/features/archive-replay/platform", async (importOriginal) => {
  const actual = await importOriginal<typeof import("src/features/archive-replay/platform")>();
  return { ...actual, requestArchiveReplaySeek: mocks.requestArchiveReplaySeek };
});

vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabDispatchForTab: () => mocks.dispatch,
  useTabStore: () => ({
    viewTab: {
      id: "tab-1",
      title: "tab",
      history: [],
      currentIndex: 0,
      pinned: false,
      autoRefreshEnabled: false,
      autoRefreshPageKey: null,
      reloadKey: 0,
    },
  }),
}));

vi.mock("src/features/write/browser/use-write-request", () => ({
  useWriteRequest: () => mocks.openWritePanelWithText,
}));

vi.mock("src/view/browser/state/tabs/auto-refresh-pages", () => ({
  getAutoRefreshPageKey: () => "thread:test",
  isAutoRefreshEnabledForPage: () => mocks.isAutoRefreshEnabled,
}));

vi.mock("src/view/browser/utils/clipboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("src/view/browser/utils/clipboard")>();
  return { ...actual, copyText: mocks.copyText };
});

const TARGET_RES: IRes = {
  num: 10,
  name: "name",
  mail: "",
  date: "date",
  id: "abc123",
  message: "message",
};

function HookHarness() {
  const [responses, setResponses] = useState<IRes[]>([TARGET_RES]);
  const [capturedItems, setCapturedItems] = useState<ContextMenuItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [miniAaResNums, setMiniAaResNums] = useState<Set<number>>(new Set());

  const { openThreadResContextMenu } = useThreadResContextMenu({
    addPopupContextMenu: (_x, _y, items) => {
      setCapturedItems(items);
    },
    closePopup: () => {},
    fetchThread: mocks.fetchThread,
    filter: "all",
    filteredResponses: responses,
    handleAnchorClick: () => {},
    hideAnchorPreviewImmediately: () => {},
    miniAaResNums,
    ownResNums: new Set<number>(),
    page: {
      type: "thread",
      title: "thread title",
      threadUrl: "https://example.com/test/read.cgi/live/1/",
    },
    tabId: "tab-1",
    searchQuery,
    setFilter: () => {},
    setSearchQuery,
    setMiniAaResNums,
    setResponses,
  });

  return (
    <div>
      <output data-testid="response-class">{responses[0]?.class?.join(" ") ?? ""}</output>
      <button
        onClick={() => {
          const event = {
            preventDefault: () => {},
            clientX: 10,
            clientY: 20,
          } as unknown as React.MouseEvent;
          openThreadResContextMenu(event, TARGET_RES);
        }}
      >
        open
      </button>
      <button
        onClick={() => {
          capturedItems.find((item) => item.id === "add-ng-id")?.onSelect?.();
        }}
      >
        add-ng-id
      </button>
      <button
        onClick={() => {
          capturedItems.find((item) => item.id === "reply")?.onSelect?.();
        }}
      >
        reply
      </button>
      <button
        onClick={() => {
          capturedItems.find((item) => item.id === "copy-res")?.onSelect?.();
        }}
      >
        copy-res
      </button>
      <button
        onClick={() => {
          capturedItems.find((item) => item.id === "quote-reply")?.onSelect?.();
        }}
      >
        quote-reply
      </button>
      <button
        onClick={() => {
          capturedItems.find((item) => item.id === "auto-refresh")?.onSelect?.();
        }}
      >
        toggle-auto-refresh
      </button>
      <button
        onClick={() => {
          capturedItems.find((item) => item.id === "refresh-thread")?.onSelect?.();
        }}
      >
        refresh-thread
      </button>
      <button
        onClick={() => {
          capturedItems.find((item) => item.id === "archive-replay-seek")?.onSelect?.();
        }}
      >
        archive-replay-seek
      </button>
    </div>
  );
}

function FilterJumpHarness() {
  const [filter, setFilter] = useState<ThreadFilter>("image");
  const [searchQuery, setSearchQuery] = useState("keyword");
  const [filteredResponses, setFilteredResponses] = useState<IRes[]>([]);
  const [capturedItems, setCapturedItems] = useState<ContextMenuItem[]>([]);

  useEffect(() => {
    // 変更理由: 実際のThreadPageと同じく、filter解除後にfilteredResponsesが更新される
    // 1 render分の遅延を再現し、保留ジャンプが更新後にだけ実行される契約を確認する。
    setFilteredResponses(filter === "all" && searchQuery === "" ? [TARGET_RES] : []);
  }, [filter, searchQuery]);

  const { openPopupResContextMenu, openThreadResContextMenu } = useThreadResContextMenu({
    addPopupContextMenu: (_x, _y, items) => {
      setCapturedItems(items);
    },
    closePopup: () => {},
    fetchThread: async () => {},
    filter,
    filteredResponses,
    handleAnchorClick: mocks.handleAnchorClick,
    hideAnchorPreviewImmediately: () => {},
    miniAaResNums: new Set<number>(),
    ownResNums: new Set<number>(),
    page: {
      type: "thread",
      title: "thread title",
      threadUrl: "https://example.com/test/read.cgi/live/1/",
    },
    tabId: "tab-1",
    searchQuery,
    setFilter,
    setSearchQuery,
    setMiniAaResNums: () => {},
    setResponses: () => {},
  });

  return (
    <div>
      <button
        onClick={() => {
          const event = {
            preventDefault: () => {},
            clientX: 10,
            clientY: 20,
          } as unknown as React.MouseEvent;
          openThreadResContextMenu(event, TARGET_RES);
        }}
      >
        open-filtered-menu
      </button>
      <button
        onClick={() => {
          const event = {
            preventDefault: () => {},
            clientX: 10,
            clientY: 20,
          } as unknown as React.MouseEvent;
          openPopupResContextMenu("popup-1")(TARGET_RES, event);
        }}
      >
        open-filtered-popup-menu
      </button>
      <button
        onClick={() => {
          capturedItems.find((item) => item.id === "clear-filter-jump")?.onSelect?.();
        }}
      >
        clear-filter-jump
      </button>
    </div>
  );
}

describe("useThreadResContextMenu", () => {
  afterEach(() => {
    cleanup();
    mocks.ngAdd.mockReset();
    mocks.openWritePanelWithText.mockReset();
    mocks.copyText.mockReset();
    mocks.toastInfo.mockReset();
    mocks.dispatch.mockReset();
    mocks.handleAnchorClick.mockReset();
    mocks.requestArchiveReplaySeek.mockReset();
    mocks.isAutoRefreshEnabled = false;
    mocks.fetchThread.mockReset();
  });

  it("ID/IPのNG追加は再起動後も有効なDSL形式で保存する", async () => {
    render(<HookHarness />);

    fireEvent.click(screen.getByRole("button", { name: "open" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "add-ng-id" }));
    });

    expect(mocks.ngAdd).toHaveBeenCalledWith('hide:\n  when id contains "abc123"');
  });

  it("保存完了までは成功通知とローカル反映を進めない", async () => {
    let resolveNgAdd: (() => void) | null = null;
    mocks.ngAdd.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveNgAdd = resolve;
        }),
    );

    render(<HookHarness />);

    fireEvent.click(screen.getByRole("button", { name: "open" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "add-ng-id" }));
      await Promise.resolve();
    });

    expect(screen.getByTestId("response-class")).toBeEmptyDOMElement();
    expect(mocks.toastInfo).not.toHaveBeenCalled();

    await act(async () => {
      resolveNgAdd?.();
      await Promise.resolve();
    });

    expect(screen.getByTestId("response-class")).toHaveTextContent("ng");
    // 通知には追加したIDだけを表示する仕様（765bf5c）に合わせる。
    expect(mocks.toastInfo).toHaveBeenCalledWith("ID/IPをNGに追加しました: abc123", {
      targetWindow: window,
    });
  });

  it("返信は書き込み欄を開いてアンカーを直接入力する", () => {
    render(<HookHarness />);

    fireEvent.click(screen.getByRole("button", { name: "open" }));
    fireEvent.click(screen.getByRole("button", { name: "reply" }));

    expect(mocks.openWritePanelWithText).toHaveBeenCalledWith(
      ">>10\n",
      "https://example.com/test/read.cgi/live/1/",
    );
  });

  it("Tauri版のThreadViewから過去実況をこの位置まで進める", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    mocks.requestArchiveReplaySeek.mockResolvedValue(undefined);
    render(<HookHarness />);

    fireEvent.click(screen.getByRole("button", { name: "open" }));
    const event = screen.getByRole("button", { name: "archive-replay-seek" });
    expect(event).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(event);
      await Promise.resolve();
    });

    expect(mocks.requestArchiveReplaySeek).toHaveBeenCalledWith({
      threadUrl: "https://example.com/test/read.cgi/live/1/",
      responseNumber: TARGET_RES.num,
    });
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("単体レスのコピーにもID:形式のIDを含める", async () => {
    mocks.copyText.mockResolvedValue();
    render(<HookHarness />);

    fireEvent.click(screen.getByRole("button", { name: "open" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "copy-res" }));
      await Promise.resolve();
    });

    expect(mocks.copyText).toHaveBeenCalledWith(
      "thread title\nhttps://example.com/test/read.cgi/live/1/10\n10 name ID:abc123  date\nmessage",
      expect.objectContaining({
        window: expect.any(Object),
        document: expect.any(Object),
      }),
    );
  });

  // it("引用して返信は書き込み欄を開いて引用文を直接入力する", () => {
  //   render(<HookHarness />);

  //   fireEvent.click(screen.getByRole("button", { name: "open" }));
  //   fireEvent.click(screen.getByRole("button", { name: "quote-reply" }));

  //   expect(mocks.openWritePanelWithText).toHaveBeenCalledWith(
  //     ">>10\n>message\n",
  //   );
  // });

  it("自動更新中は右クリックメニューから停止できる", () => {
    mocks.isAutoRefreshEnabled = true;
    render(<HookHarness />);

    fireEvent.click(screen.getByRole("button", { name: "open" }));
    fireEvent.click(screen.getByRole("button", { name: "toggle-auto-refresh" }));

    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: "SET_AUTO_REFRESH_ENABLED",
      enabled: false,
      pageKey: "thread:test",
    });
    expect(mocks.toastInfo).toHaveBeenCalledWith("スレッドの自動更新を停止しました", {
      targetWindow: window,
    });
  });

  it("コンテキストメニューの明示的な更新はsubject.txtの再確認を指定する", () => {
    render(<HookHarness />);

    fireEvent.click(screen.getByRole("button", { name: "open" }));
    fireEvent.click(screen.getByRole("button", { name: "refresh-thread" }));

    expect(mocks.fetchThread).toHaveBeenCalledWith(true);
  });

  it("フィルタ解除後のDOM更新を待って指定レスへジャンプする", async () => {
    render(<FilterJumpHarness />);

    fireEvent.click(screen.getByRole("button", { name: "open-filtered-menu" }));
    fireEvent.click(screen.getByRole("button", { name: "clear-filter-jump" }));

    await waitFor(() => {
      expect(mocks.handleAnchorClick).toHaveBeenCalledWith(TARGET_RES.num);
    });
  });

  it("ポップアップ上でもフィルタ解除後に指定レスへジャンプする", async () => {
    render(<FilterJumpHarness />);

    fireEvent.click(screen.getByRole("button", { name: "open-filtered-popup-menu" }));
    fireEvent.click(screen.getByRole("button", { name: "clear-filter-jump" }));

    await waitFor(() => {
      expect(mocks.handleAnchorClick).toHaveBeenCalledWith(TARGET_RES.num);
    });
  });
});
