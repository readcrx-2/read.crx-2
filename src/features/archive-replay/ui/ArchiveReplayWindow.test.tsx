import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CommentOverlayWindowPlatform } from "src/features/comment-overlay/platform";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { MemoryArchiveReplayOverlayEventBus } from "../platform";
import { ArchiveReplayWindow } from "./ArchiveReplayWindow";

const getThreadMock = vi.hoisted(() => vi.fn());
const mainThreadSyncPublisher = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock("src/service-container", () => ({
  container: {
    config: {
      get: vi.fn(() => "dark"),
      ready: vi.fn((callback: () => void) => callback()),
    },
    message: {
      on: vi.fn(),
      off: vi.fn(),
    },
    thread: {
      getThread: getThreadMock,
    },
  },
}));

afterEach(() => {
  cleanup();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  vi.restoreAllMocks();
});

describe("過去実況再生ウィンドウ", () => {
  beforeEach(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    getThreadMock.mockReset();
    mainThreadSyncPublisher.mockReset();
    mainThreadSyncPublisher.mockResolvedValue(undefined);
    getThreadMock.mockResolvedValue({
      url: "https://example.com/thread-a/",
      title: "架空の実況",
      res: [
        {
          num: 1,
          name: "名無し",
          mail: "",
          date: "2026/09/16(水) 23:30:00",
          message: "開始",
        },
        {
          num: 2,
          name: "名無し",
          mail: "",
          date: "2026/09/16(水) 23:30:10",
          message: "途中",
        },
      ],
    });
  });

  it("開始日時を省略して読み込み、レスの時刻へシークできる", async () => {
    const archiveReplayEventBus = new MemoryArchiveReplayOverlayEventBus();
    const overlayPlatform = {
      show: vi.fn(async () => {}),
      hide: vi.fn(async () => {}),
    } as unknown as CommentOverlayWindowPlatform;
    render(
      <div className="browser-shell">
        <ArchiveReplayWindow
          archiveReplayEventBus={archiveReplayEventBus}
          mainThreadSyncPublisher={mainThreadSyncPublisher}
          overlayPlatform={overlayPlatform}
          seekRequestSubscriber={async () => () => {}}
        />
      </div>,
    );

    expect(screen.getByTestId("archive-replay-window")).toHaveAttribute("data-theme", "dark");

    fireEvent.change(screen.getByLabelText("実況スレッドURL"), {
      target: { value: "https://example.com/thread-a/" },
    });
    fireEvent.click(screen.getByRole("button", { name: "複数スレを読み込む" }));

    expect(await screen.findByText("スレ1: 架空の実況")).toBeInTheDocument();
    expect(getThreadMock).toHaveBeenCalledWith("https://example.com/thread-a/");
    // 読み込み結果の描画後もOverlayへの配信は非同期で続くため、配信そのものの完了を待つ。
    await waitFor(() => {
      expect(
        archiveReplayEventBus.events.some(
          (event) => event.type === "comment" && event.comment.responseNumber === 1,
        ),
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "現在の実況スレをメインで開く" }));
    expect(mainThreadSyncPublisher).toHaveBeenCalledWith(
      expect.objectContaining({
        threadUrl: "https://example.com/thread-a/",
        responseNumber: 1,
        title: "架空の実況",
      }),
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "メインを実況スレに追従" }));
    expect(mainThreadSyncPublisher).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "10秒進める" }));
    expect(mainThreadSyncPublisher).toHaveBeenCalledTimes(3);
    expect(mainThreadSyncPublisher).toHaveBeenLastCalledWith(
      expect.objectContaining({
        responseNumber: 2,
        playbackAt: Date.parse("2026-09-16T23:30:10+09:00"),
      }),
    );
    expect(
      archiveReplayEventBus.events.some(
        (event) => event.type === "comment" && event.comment.responseNumber === 2,
      ),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "最初から" }));
    expect(archiveReplayEventBus.events.filter((event) => event.type === "reset")).not.toHaveLength(
      0,
    );

    fireEvent.click(screen.getByRole("button", { name: "過去実況再生を閉じる" }));
    expect(overlayPlatform.hide).toHaveBeenCalled();
    expect(archiveReplayEventBus.events.some((event) => event.type === "stop")).toBe(true);
  });

  it("Main追従を有効にするとスレ境界で同期先を切り替える", async () => {
    getThreadMock.mockImplementation(async (threadUrl: string) => ({
      url: threadUrl,
      title: threadUrl.includes("thread-b") ? "架空の実況B" : "架空の実況A",
      res: [
        {
          num: 1,
          name: "名無し",
          mail: "",
          date: threadUrl.includes("thread-b")
            ? "2026/09/16(水) 23:30:10"
            : "2026/09/16(水) 23:30:00",
          message: "投稿",
        },
      ],
    }));

    render(
      <ArchiveReplayWindow
        mainThreadSyncPublisher={mainThreadSyncPublisher}
        overlayPlatform={
          {
            show: vi.fn(async () => {}),
            hide: vi.fn(async () => {}),
          } as unknown as CommentOverlayWindowPlatform
        }
        seekRequestSubscriber={async () => () => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText("実況スレッドURL"), {
      target: {
        value: "https://example.com/thread-a/\nhttps://example.com/thread-b/",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "複数スレを読み込む" }));
    expect(await screen.findByText("スレ2: 架空の実況B")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "メインを実況スレに追従" }));
    expect(mainThreadSyncPublisher).toHaveBeenLastCalledWith(
      expect.objectContaining({ threadUrl: "https://example.com/thread-a/" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "10秒進める" }));
    expect(mainThreadSyncPublisher).toHaveBeenLastCalledWith(
      expect.objectContaining({
        threadUrl: "https://example.com/thread-b/",
        responseNumber: 1,
        title: "架空の実況B",
      }),
    );
  });
});
