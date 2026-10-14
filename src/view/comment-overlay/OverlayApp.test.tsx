import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryArchiveReplayOverlayEventBus } from "src/features/archive-replay/platform";
import type { CommentCandidate } from "src/features/comment-overlay/domain";
import { MemoryCommentOverlayEventBus } from "src/features/comment-overlay/domain";
import { createBrowserCommentOverlayPlatform } from "src/features/comment-overlay/platform/browser";
import { COMMENT_OVERLAY_FONT_SIZE } from "src/features/comment-overlay/ui/OverlayStage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { OverlayApp } from "./OverlayApp";

const { publishJump } = vi.hoisted(() => ({
  publishJump: vi.fn<() => Promise<void>>(),
}));

vi.mock("src/features/comment-overlay/platform/jump-events", () => ({
  publishCommentOverlayJump: publishJump,
}));

const THREAD_URL = "https://example.test/live/1";

const oldComment: CommentCandidate = {
  responseNumber: 1,
  text: "前回の実況",
  author: "名無し",
};

const restartedComment: CommentCandidate = {
  responseNumber: 1,
  text: "再開後の実況",
  author: "名無し",
};

const candidateComment: CommentCandidate = {
  responseNumber: 1,
  text: "候補スレの実況",
  author: "名無し",
  sourceThreadUrl: "https://example.test/live/2",
};

const targetComment: CommentCandidate = {
  responseNumber: 1,
  text: "本流スレの実況",
  author: "名無し",
  sourceThreadUrl: THREAD_URL,
};

describe("OverlayApp", () => {
  let scheduledFrame: FrameRequestCallback | null;

  beforeEach(() => {
    scheduledFrame = null;
    publishJump.mockReset();
    publishJump.mockResolvedValue(undefined);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      scheduledFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("同じスレッドのresetでも前回のコメントを消し、再開後の同じ番号を受け入れる", async () => {
    const eventBus = new MemoryCommentOverlayEventBus();
    const platform = createBrowserCommentOverlayPlatform();

    render(<OverlayApp eventBus={eventBus} platform={platform} />);

    // 非同期subscribeが完了してからeventを投入し、Tauriの購読開始後の境界を再現する。
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await eventBus.publish({
        version: 1,
        type: "batch",
        batch: {
          threadUrl: THREAD_URL,
          comments: [oldComment],
          latestResponseNumber: 1,
        },
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      scheduledFrame?.(0);
    });

    expect(screen.getByText("前回の実況")).toBeVisible();

    await act(async () => {
      await eventBus.publish({
        version: 1,
        type: "reset",
        batch: {
          threadUrl: THREAD_URL,
          comments: [],
          latestResponseNumber: 1,
        },
      });
    });

    expect(screen.queryByText("前回の実況")).not.toBeInTheDocument();

    await act(async () => {
      await eventBus.publish({
        version: 1,
        type: "batch",
        batch: {
          threadUrl: THREAD_URL,
          comments: [restartedComment],
          latestResponseNumber: 1,
        },
      });
    });
    act(() => {
      scheduledFrame?.(0);
    });

    expect(screen.getByText("再開後の実況")).toBeVisible();
  });

  it("次スレ移動のresetでは表示中の前スレコメントを残す", async () => {
    const eventBus = new MemoryCommentOverlayEventBus();
    const platform = createBrowserCommentOverlayPlatform();
    const nextThreadUrl = "https://example.test/live/2";

    render(<OverlayApp eventBus={eventBus} platform={platform} />);
    await act(async () => {
      await Promise.resolve();
      await eventBus.publish({
        version: 1,
        type: "batch",
        batch: {
          threadUrl: THREAD_URL,
          comments: [oldComment],
          latestResponseNumber: 1,
        },
      });
    });
    act(() => {
      scheduledFrame?.(0);
    });

    await act(async () => {
      await eventBus.publish({
        version: 1,
        type: "reset",
        preserveVisibleComments: true,
        batch: {
          threadUrl: nextThreadUrl,
          comments: [],
          latestResponseNumber: 1,
        },
      });
    });

    expect(screen.getByText("前回の実況")).toBeVisible();
  });

  it("通知コメントを即時に黄色枠で流す", async () => {
    const eventBus = new MemoryCommentOverlayEventBus();
    const platform = createBrowserCommentOverlayPlatform();

    render(<OverlayApp eventBus={eventBus} platform={platform} />);
    await act(async () => {
      await Promise.resolve();
      await eventBus.publish({
        version: 1,
        type: "system",
        threadUrl: THREAD_URL,
        comment: {
          responseNumber: 0,
          text: "次スレへ移動します",
          author: "ChLens",
          isSystem: true,
          systemId: "system-1",
          sourceThreadUrl: THREAD_URL,
        },
      });
    });
    act(() => {
      scheduledFrame?.(0);
    });

    const notification = screen.getByText("次スレへ移動します");
    expect(notification).toBeVisible();
    expect(notification).toHaveClass("comment-overlay-stage__comment--system");
  });

  it("過去実況eventはliveと分離し、再生停止時にOverlayの動きを止める", async () => {
    const eventBus = new MemoryCommentOverlayEventBus();
    const archiveReplayEventBus = new MemoryArchiveReplayOverlayEventBus();
    const platform = createBrowserCommentOverlayPlatform();

    render(
      <OverlayApp
        archiveReplayEventBus={archiveReplayEventBus}
        eventBus={eventBus}
        platform={platform}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await archiveReplayEventBus.publish({
        version: 1,
        type: "reset",
        sessionId: "replay-1",
      });
    });
    await act(async () => {
      await archiveReplayEventBus.publish({
        version: 1,
        type: "comment",
        sessionId: "replay-1",
        comment: {
          responseNumber: 1,
          text: "過去実況",
          author: "名無し",
        },
      });
    });
    await act(async () => {
      await archiveReplayEventBus.publish({
        version: 1,
        type: "playback",
        sessionId: "replay-1",
        playing: true,
      });
    });
    await act(async () => {
      await eventBus.publish({
        version: 1,
        type: "batch",
        batch: {
          threadUrl: THREAD_URL,
          comments: [oldComment],
          latestResponseNumber: 1,
        },
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      scheduledFrame?.(0);
      scheduledFrame?.(0);
    });
    await act(async () => {
      await archiveReplayEventBus.publish({
        version: 1,
        type: "playback",
        sessionId: "replay-1",
        playing: false,
      });
    });

    const renderedComment = screen.getByText("過去実況");
    expect(renderedComment).toHaveStyle({ animationPlayState: "paused" });
    expect(screen.queryByText("前回の実況")).not.toBeInTheDocument();
  });

  it("通常実況の右クリックメニューにはジャンプ項目を表示しない", async () => {
    const eventBus = new MemoryCommentOverlayEventBus();
    render(<OverlayApp eventBus={eventBus} platform={createBrowserCommentOverlayPlatform()} />);
    await act(async () => {
      await Promise.resolve();
      await eventBus.publish({
        version: 1,
        type: "batch",
        batch: {
          threadUrl: THREAD_URL,
          comments: [targetComment],
          latestResponseNumber: 1,
        },
      });
    });
    act(() => scheduledFrame?.(0));

    fireEvent.contextMenu(screen.getByText(targetComment.text));

    expect(screen.queryByRole("menuitem", { name: "このレスへジャンプ" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "レスをコピー" })).toBeVisible();
  });

  it("過去実況の一時停止中もジャンプでき、再生終了後の通常実況では項目を隠す", async () => {
    const eventBus = new MemoryCommentOverlayEventBus();
    const archiveReplayEventBus = new MemoryArchiveReplayOverlayEventBus();
    render(
      <OverlayApp
        eventBus={eventBus}
        archiveReplayEventBus={archiveReplayEventBus}
        platform={createBrowserCommentOverlayPlatform()}
      />,
    );
    await act(async () => {
      await Promise.resolve();
      await archiveReplayEventBus.publish({ version: 1, type: "reset", sessionId: "replay-1" });
      await archiveReplayEventBus.publish({
        version: 1,
        type: "comment",
        sessionId: "replay-1",
        comment: targetComment,
      });
      await archiveReplayEventBus.publish({
        version: 1,
        type: "playback",
        sessionId: "replay-1",
        playing: true,
      });
    });
    act(() => scheduledFrame?.(0));
    await act(async () => {
      await archiveReplayEventBus.publish({
        version: 1,
        type: "playback",
        sessionId: "replay-1",
        playing: false,
      });
    });

    fireEvent.contextMenu(screen.getByText(targetComment.text));
    fireEvent.click(screen.getByRole("menuitem", { name: "このレスへジャンプ" }));

    expect(publishJump).toHaveBeenCalledWith({
      threadUrl: THREAD_URL,
      responseNumber: targetComment.responseNumber,
    });

    await act(async () => {
      await archiveReplayEventBus.publish({ version: 1, type: "stop", sessionId: "replay-1" });
      await eventBus.publish({
        version: 1,
        type: "batch",
        batch: {
          threadUrl: THREAD_URL,
          comments: [targetComment],
          latestResponseNumber: 1,
        },
      });
    });
    act(() => scheduledFrame?.(0));
    fireEvent.contextMenu(screen.getByText(targetComment.text));

    expect(screen.queryByRole("menuitem", { name: "このレスへジャンプ" })).not.toBeInTheDocument();
  });

  it("実況開始時の設定をOverlayStageへ反映し、文字サイズはコード定数を使う", async () => {
    let resizeObserverConstructed = false;
    class ResizeObserverStub {
      constructor(_callback: ResizeObserverCallback) {
        resizeObserverConstructed = true;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);

    const eventBus = new MemoryCommentOverlayEventBus();
    const platform = createBrowserCommentOverlayPlatform();

    render(<OverlayApp eventBus={eventBus} platform={platform} />);
    await act(async () => {
      await Promise.resolve();
      await eventBus.publish({
        version: 1,
        type: "reset",
        settings: {
          durationSeconds: 4,
          opacity: 0.5,
          maxQueueSize: 0,
        },
        batch: {
          threadUrl: THREAD_URL,
          comments: [],
          latestResponseNumber: 0,
        },
      });
      await eventBus.publish({
        version: 1,
        type: "batch",
        batch: {
          threadUrl: THREAD_URL,
          comments: [oldComment],
          latestResponseNumber: 1,
        },
      });
    });
    act(() => {
      scheduledFrame?.(0);
    });

    const renderedComment = screen.getByText("前回の実況");
    expect(renderedComment).toHaveStyle({
      fontSize: `${COMMENT_OVERLAY_FONT_SIZE}px`,
      opacity: "0.5",
      animationDuration: "4s",
    });
    // native geometryを明示する実機Overlayでは、DOM測定を使わず保存geometryを倍率へ使う。
    expect(resizeObserverConstructed).toBe(false);

    await act(async () => {
      await eventBus.publish({
        version: 1,
        type: "settings",
        settings: {
          durationSeconds: 4,
          opacity: 0.4,
          maxQueueSize: 0,
        },
      });
    });

    expect(screen.getByText("前回の実況")).toHaveStyle({
      fontSize: `${COMMENT_OVERLAY_FONT_SIZE}px`,
      opacity: "0.4",
    });
  });

  it("本流確定時は未表示の候補コメントだけをqueueから除外する", async () => {
    // beforeEachでspyしたrequestAnimationFrameを偽タイマーで上書きしない。
    // vmForksプールではjsdomのrequestAnimationFrameも偽装対象になり、描画フレームを手動で進められなくなるため。
    vi.useFakeTimers({ toNotFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const eventBus = new MemoryCommentOverlayEventBus();
    const platform = createBrowserCommentOverlayPlatform();

    render(<OverlayApp eventBus={eventBus} platform={platform} />);
    await act(async () => {
      await Promise.resolve();
      await eventBus.publish({
        version: 1,
        type: "reset",
        batch: {
          threadUrl: THREAD_URL,
          comments: [],
          latestResponseNumber: 0,
        },
      });
      await eventBus.publish({
        version: 1,
        type: "batch",
        batch: {
          threadUrl: THREAD_URL,
          comments: [targetComment, candidateComment],
          latestResponseNumber: 1,
        },
      });
      await eventBus.publish({
        version: 1,
        type: "source-filter",
        threadUrl: THREAD_URL,
        keepSourceThreadUrl: THREAD_URL,
      });
    });

    act(() => {
      scheduledFrame?.(0);
    });
    expect(screen.getByText("本流スレの実況")).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.queryByText("候補スレの実況")).not.toBeInTheDocument();
  });
});
