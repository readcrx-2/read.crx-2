import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { container } from "src/service-container/index";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { getTreeMock, getMock, configSetMock, toastSuccessMock, toastErrorMock } = vi.hoisted(
  () => ({
    getTreeMock: vi.fn(),
    getMock: vi.fn(),
    configSetMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    toastErrorMock: vi.fn(),
  }),
);

vi.mock("webextension-polyfill", () => ({
  default: {
    bookmarks: {
      getTree: getTreeMock,
      get: getMock,
    },
  },
}));

import { BookmarkRootSelectorDialog } from "src/features/bookmark/ui/BookmarkRootSelectorDialog";

type MessageHandler = (payload?: unknown) => void;

let messageHandlers = new Map<string, Set<MessageHandler>>();

function setBookmarkRootState(bookmarkId: string, needReconfigure: boolean): void {
  // 保存先の設定はサービスコンテナの config から読み書きする（legacy-window-app-plan の Phase 1）。
  container.config = {
    get: (key: string) => (key === "bookmark_id" ? bookmarkId : null),
    set: configSetMock,
    ready: (callback: () => void) => callback(),
    getAll: () => ({}),
  };
  // 保存先の再設定が必要かどうかも、サービスコンテナから読む（legacy-window-app-plan の Phase 2）。
  container.bookmarkRoot = {
    isReconfigureRequired: () => needReconfigure,
    setRootNodeId: vi.fn(async () => true),
  };
}

function setTauriRuntime(enabled: boolean): void {
  const runtimeHost = window as Window &
    typeof globalThis & {
      __TAURI_INTERNALS__?: Record<string, unknown>;
    };

  if (enabled) {
    runtimeHost.__TAURI_INTERNALS__ = {};
    return;
  }

  delete runtimeHost.__TAURI_INTERNALS__;
}

describe("BookmarkRootSelectorDialog", () => {
  beforeEach(() => {
    messageHandlers = new Map<string, Set<MessageHandler>>();

    container.message = {
      send: (type, payload) => {
        for (const handler of messageHandlers.get(type) ?? []) {
          handler(payload);
        }
      },
      on: (type, callback) => {
        const handlers = messageHandlers.get(type) ?? new Set<MessageHandler>();
        handlers.add(callback as MessageHandler);
        messageHandlers.set(type, handlers);
      },
      off: (type, callback) => {
        messageHandlers.get(type)?.delete(callback as MessageHandler);
      },
    };
    container.toast = {
      notify: vi.fn(),
      success: toastSuccessMock,
      error: toastErrorMock,
      info: vi.fn(),
    };

    getTreeMock.mockResolvedValue([
      {
        id: "0",
        title: "root",
        children: [
          {
            id: "1",
            title: "ブックマーク バー",
            children: [
              {
                id: "3",
                title: "read.crx",
                children: [],
              },
            ],
          },
          {
            id: "2",
            title: "その他のブックマーク",
            children: [],
          },
        ],
      },
    ]);
    getMock.mockResolvedValue([
      {
        id: "3",
        title: "read.crx",
        children: [],
      },
    ]);
    configSetMock.mockResolvedValue(undefined);
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    messageHandlers.clear();
    getTreeMock.mockReset();
    getMock.mockReset();
    configSetMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    setTauriRuntime(false);
  });

  it("bookmark root 未設定時は自動で開き、選択したフォルダを保存する", async () => {
    setBookmarkRootState("", true);

    render(<BookmarkRootSelectorDialog />);

    expect(
      await screen.findByRole("dialog", {
        name: "ブックマーク保存先を選択",
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /read\.crx/i }));
    fireEvent.click(screen.getByRole("button", { name: "決定" }));

    await waitFor(() => {
      expect(configSetMock).toHaveBeenCalledWith("bookmark_id", "3");
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("ブックマーク保存先を更新しました");
  });

  it("手動オープン時はキャンセルで閉じられる", async () => {
    setBookmarkRootState("3", false);

    render(<BookmarkRootSelectorDialog />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    container.message.send("bookmark_root_selector_open");

    expect(
      await screen.findByRole("dialog", {
        name: "ブックマーク保存先を選択",
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("Tauriランタイムでは保存先選択ダイアログを表示しない", async () => {
    setTauriRuntime(true);

    setBookmarkRootState("", true);

    render(<BookmarkRootSelectorDialog />);
    container.message.send("bookmark_root_selector_open");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
