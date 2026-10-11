import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  emitTo: vi.fn(),
  listen: vi.fn(),
  getByLabel: vi.fn(),
  getCurrentWindow: vi.fn(),
  replayWindow: {
    unminimize: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    setFocus: vi.fn(),
    onCloseRequested: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/event", () => ({
  emitTo: mocks.emitTo,
  listen: mocks.listen,
}));

vi.mock("@tauri-apps/api/window", () => ({
  Window: { getByLabel: mocks.getByLabel },
  getCurrentWindow: mocks.getCurrentWindow,
}));

import {
  ARCHIVE_REPLAY_MAIN_THREAD_EVENT_NAME,
  ARCHIVE_REPLAY_MAIN_WINDOW_LABEL,
  ARCHIVE_REPLAY_SEEK_EVENT_NAME,
  ARCHIVE_REPLAY_WINDOW_LABEL,
  isArchiveReplayMainThreadRequest,
  isArchiveReplaySeekRequest,
  openArchiveReplayWindow,
  requestArchiveReplayMainThread,
  requestArchiveReplaySeek,
  subscribeArchiveReplayMainThreadRequests,
  subscribeArchiveReplayWindowClose,
} from ".";

describe("過去実況操作窓のTauri platform", () => {
  beforeEach(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    mocks.emitTo.mockReset();
    mocks.emitTo.mockResolvedValue(undefined);
    mocks.getByLabel.mockReset();
    mocks.getByLabel.mockResolvedValue(mocks.replayWindow);
    mocks.getCurrentWindow.mockReset();
    mocks.getCurrentWindow.mockReturnValue(mocks.replayWindow);
    mocks.replayWindow.unminimize.mockReset();
    mocks.replayWindow.unminimize.mockResolvedValue(undefined);
    mocks.replayWindow.show.mockReset();
    mocks.replayWindow.show.mockResolvedValue(undefined);
    mocks.replayWindow.hide.mockReset();
    mocks.replayWindow.hide.mockResolvedValue(undefined);
    mocks.replayWindow.setFocus.mockReset();
    mocks.replayWindow.setFocus.mockResolvedValue(undefined);
    mocks.replayWindow.onCloseRequested.mockReset();
    mocks.replayWindow.onCloseRequested.mockResolvedValue(vi.fn());
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("操作窓を表示してフォーカスする", async () => {
    await openArchiveReplayWindow();

    expect(mocks.getByLabel).toHaveBeenCalledWith(ARCHIVE_REPLAY_WINDOW_LABEL);
    expect(mocks.replayWindow.unminimize).toHaveBeenCalledOnce();
    expect(mocks.replayWindow.show).toHaveBeenCalledOnce();
    expect(mocks.replayWindow.setFocus).toHaveBeenCalledOnce();
  });

  it("レス位置を再生窓へ限定eventとして送る", async () => {
    const request = {
      threadUrl: "https://example.com/test/read.cgi/live/1/",
      responseNumber: 42,
    };
    await requestArchiveReplaySeek(request);

    expect(mocks.emitTo).toHaveBeenCalledWith(
      ARCHIVE_REPLAY_WINDOW_LABEL,
      ARCHIVE_REPLAY_SEEK_EVENT_NAME,
      request,
    );
  });

  it("不正なレス番号をシーク要求として受け付けない", () => {
    expect(
      isArchiveReplaySeekRequest({ threadUrl: "https://example.com/thread", responseNumber: 0 }),
    ).toBe(false);
    expect(
      isArchiveReplaySeekRequest({ threadUrl: "https://example.com/thread", responseNumber: 1 }),
    ).toBe(true);
  });

  it("Mainの現在スレ同期要求を専用eventへ送る", async () => {
    const request = {
      version: 1 as const,
      sessionId: "replay-1",
      generation: 3,
      threadUrl: "https://example.com/test/read.cgi/live/1/",
      responseNumber: 42,
      title: "架空の実況",
    };

    await requestArchiveReplayMainThread(request);

    expect(mocks.emitTo).toHaveBeenCalledWith(
      ARCHIVE_REPLAY_MAIN_WINDOW_LABEL,
      ARCHIVE_REPLAY_MAIN_THREAD_EVENT_NAME,
      request,
    );
    expect(isArchiveReplayMainThreadRequest(request)).toBe(true);
    expect(isArchiveReplayMainThreadRequest({ ...request, generation: -1 })).toBe(false);
  });

  it("Main同期eventを検証して購読者へ渡す", async () => {
    const listener = vi.fn();
    mocks.listen.mockImplementationOnce(async (_eventName, handler) => {
      handler({
        payload: {
          version: 1,
          sessionId: "replay-1",
          generation: 0,
          threadUrl: "https://example.com/test/read.cgi/live/1/",
          responseNumber: 1,
          title: "架空の実況",
        },
      });
      return vi.fn();
    });

    await subscribeArchiveReplayMainThreadRequests(listener);

    expect(listener).toHaveBeenCalledWith({
      version: 1,
      sessionId: "replay-1",
      generation: 0,
      threadUrl: "https://example.com/test/read.cgi/live/1/",
      responseNumber: 1,
      title: "架空の実況",
    });
  });

  it("OSの閉じる操作を非表示処理へ委譲する", async () => {
    const onClose = vi.fn();
    await subscribeArchiveReplayWindowClose(onClose);

    const handler = mocks.replayWindow.onCloseRequested.mock.calls[0]?.[0] as
      | ((event: { preventDefault: () => void }) => void)
      | undefined;
    expect(handler).toBeDefined();
    const preventDefault = vi.fn();
    handler?.({ preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
