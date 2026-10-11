// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => {
  const messageListeners = new Set<
    (message: unknown, sender: { id: string; url: string }) => void
  >();
  const removedListeners = new Set<(tabId: number) => void>();
  return {
    messageListeners,
    removedListeners,
    create: vi.fn<() => Promise<{ id?: number }>>(),
    update: vi.fn(async (id: number) => ({ id })),
  };
});

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      id: "test-extension",
      getURL: (path: string) => `chrome-extension://test-extension/${path}`,
      onMessage: {
        addListener: (listener: (message: unknown, sender: { id: string; url: string }) => void) =>
          mocks.messageListeners.add(listener),
        removeListener: (
          listener: (message: unknown, sender: { id: string; url: string }) => void,
        ) => mocks.messageListeners.delete(listener),
      },
    },
    tabs: {
      create: mocks.create,
      update: mocks.update,
      onRemoved: {
        addListener: (listener: (tabId: number) => void) => mocks.removedListeners.add(listener),
        removeListener: (listener: (tabId: number) => void) =>
          mocks.removedListeners.delete(listener),
      },
    },
  },
}));

import { createReadyViewerTab } from "./ready-viewer-tab";

const viewerUrl = "chrome-extension://test-extension/view/index.html";

function notifyReady(tabId: number, senderUrl = viewerUrl): void {
  for (const listener of mocks.messageListeners) {
    listener({ type: "viewer-ready", tabId }, { id: "test-extension", url: senderUrl });
  }
}

describe("ビューアーの起動タブ", () => {
  beforeEach(() => {
    mocks.messageListeners.clear();
    mocks.removedListeners.clear();
    mocks.create.mockReset();
    mocks.create.mockResolvedValue({ id: 42 });
    mocks.update.mockClear();
  });

  it("対象ビューアーの準備が整うまでタブを選択しない", async () => {
    const opening = createReadyViewerTab(viewerUrl, 7);
    await Promise.resolve();
    expect(mocks.create).toHaveBeenCalledWith({ url: viewerUrl, active: false, windowId: 7 });
    expect(mocks.update).not.toHaveBeenCalled();

    notifyReady(99);
    notifyReady(42, "https://example.com/");
    await Promise.resolve();
    expect(mocks.update).not.toHaveBeenCalled();

    notifyReady(42);
    await expect(opening).resolves.toEqual({ id: 42 });
    expect(mocks.update).toHaveBeenCalledWith(42, { active: true });
    expect(mocks.messageListeners.size).toBe(0);
    expect(mocks.removedListeners.size).toBe(0);
  });

  it("タブ作成APIが返る前に届いた準備完了通知も処理する", async () => {
    mocks.create.mockImplementation(async () => {
      notifyReady(42);
      return { id: 42 };
    });
    await expect(createReadyViewerTab(viewerUrl)).resolves.toEqual({ id: 42 });
    expect(mocks.update).toHaveBeenCalledWith(42, { active: true });
  });

  it("起動中にタブを閉じた場合は待機を終了して購読を解除する", async () => {
    const opening = createReadyViewerTab(viewerUrl);
    await Promise.resolve();
    for (const listener of mocks.removedListeners) listener(42);

    await expect(opening).rejects.toThrow("起動準備中のビューアータブが閉じられました");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.messageListeners.size).toBe(0);
    expect(mocks.removedListeners.size).toBe(0);
  });
});
