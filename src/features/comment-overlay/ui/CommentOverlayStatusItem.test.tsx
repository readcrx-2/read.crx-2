import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StatusBar, StatusBarProvider } from "src/view/browser/components/StatusBar";
import type { Page } from "src/view/browser/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const THREAD_URL = "https://example.com/test/read.cgi/software/1/";

const mocks = vi.hoisted(() => ({
  isTauri: true,
  viewPage: {
    type: "thread",
    title: "スレッド",
    threadUrl: "https://example.com/test/read.cgi/software/1/",
  } as Page,
  snapshot: {
    state: {
      status: "idle" as "idle" | "running" | "stopped",
      targetThreadUrl: null as string | null,
      cursor: null as { threadUrl: string; lastResponseNumber: number } | null,
    },
    visible: false,
    error: null as string | null,
  },
  openPlacementWindow: vi.fn().mockReturnValue(true),
  controller: {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    setVisible: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("src/app/platform/runtime", () => ({
  isTauriRuntime: () => mocks.isTauri,
}));

vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabStore: () => ({ viewPage: mocks.viewPage }),
}));

vi.mock("src/features/comment-overlay/application/use-comment-overlay", () => ({
  useCommentOverlay: () => ({
    controller: mocks.controller,
    snapshot: mocks.snapshot,
  }),
}));

// 表示位置の調整窓はTauriのモニターAPIと別窓に依存するため、開く要求だけを確認する。
vi.mock("src/features/comment-overlay/ui/OverlayPlacementWindow", () => ({
  useOpenOverlayPlacementWindow: () => mocks.openPlacementWindow,
}));

import { CommentOverlayStatusItem } from "src/features/comment-overlay/ui/CommentOverlayStatusItem";

function renderItem(): void {
  render(
    <StatusBarProvider>
      <CommentOverlayStatusItem isActive />
      <StatusBar />
    </StatusBarProvider>,
  );
}

describe("CommentOverlayStatusItem", () => {
  beforeEach(() => {
    mocks.isTauri = true;
    mocks.viewPage = {
      type: "thread",
      title: "スレッド",
      threadUrl: THREAD_URL,
    };
    mocks.snapshot = {
      state: {
        status: "idle",
        targetThreadUrl: null,
        cursor: null,
      },
      visible: false,
      error: null,
    };
    mocks.controller.start.mockClear();
    mocks.controller.stop.mockClear();
    mocks.controller.setVisible.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("Browser版では実況操作を表示しない", () => {
    mocks.isTauri = false;

    renderItem();

    expect(screen.queryByRole("button", { name: /コメントOverlay制御/ })).toBeNull();
  });

  it("スレッド以外では実況操作を表示しない", () => {
    mocks.viewPage = { type: "boardList", title: "ホーム" };

    renderItem();

    expect(screen.queryByRole("button", { name: /コメントOverlay制御/ })).toBeNull();
  });

  it("スレッドでは単一ボタンからコメント表示を開始する", () => {
    renderItem();

    fireEvent.click(screen.getByRole("button", { name: /コメントOverlay制御/ }));
    fireEvent.click(screen.getByRole("button", { name: "コメントを画面に流す: OFF" }));

    expect(mocks.controller.start).toHaveBeenCalledWith(THREAD_URL);
  });

  it("開始処理中の連打を抑え、完了後は再び操作できる", async () => {
    let finishStart: (() => void) | undefined;
    mocks.controller.start.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishStart = resolve;
        }),
    );
    renderItem();
    fireEvent.click(screen.getByRole("button", { name: /コメントOverlay制御/ }));
    const toggle = screen.getByRole("button", { name: "コメントを画面に流す: OFF" });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(mocks.controller.start).toHaveBeenCalledTimes(1);
    expect(toggle).toBeDisabled();
    await act(async () => {
      finishStart?.();
    });
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);
    expect(mocks.controller.start).toHaveBeenCalledTimes(2);
  });

  it("開始に失敗しても切り替えボタンを解除して再試行できる", async () => {
    mocks.controller.start.mockRejectedValueOnce(new Error("表示失敗"));
    renderItem();
    fireEvent.click(screen.getByRole("button", { name: /コメントOverlay制御/ }));
    const toggle = screen.getByRole("button", { name: "コメントを画面に流す: OFF" });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);
    expect(mocks.controller.start).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(toggle).toBeEnabled());
  });

  it("コメント表示中は同じボタンから実況とOverlayをまとめて停止する", () => {
    mocks.snapshot = {
      state: {
        status: "running",
        targetThreadUrl: THREAD_URL,
        cursor: { threadUrl: THREAD_URL, lastResponseNumber: 3 },
      },
      visible: true,
      error: null,
    };

    renderItem();

    fireEvent.click(screen.getByRole("button", { name: /コメントOverlay制御/ }));
    fireEvent.click(screen.getByRole("button", { name: "コメントを画面に流す: ON" }));

    expect(mocks.controller.stop).toHaveBeenCalledTimes(1);
  });

  it("スレッドを離れても表示中の実況を停止しない", () => {
    mocks.viewPage = { type: "boardList", title: "ホーム" };
    mocks.snapshot = {
      state: {
        status: "running",
        targetThreadUrl: THREAD_URL,
        cursor: { threadUrl: THREAD_URL, lastResponseNumber: 3 },
      },
      visible: true,
      error: null,
    };

    renderItem();

    expect(screen.getByRole("button", { name: /コメントOverlay制御/ })).toBeInTheDocument();
    expect(mocks.controller.stop).not.toHaveBeenCalled();
  });

  it("送信エラーがあると実況エラーをステータスバーへ表示する", () => {
    mocks.snapshot = {
      state: {
        status: "running",
        targetThreadUrl: THREAD_URL,
        cursor: { threadUrl: THREAD_URL, lastResponseNumber: 3 },
      },
      visible: true,
      error: "[ChLens] コメントOverlay eventの送信に失敗しました:",
    };

    renderItem();

    fireEvent.click(screen.getByRole("button", { name: /コメント実況エラー/ }));

    expect(screen.getByText(/コメント実況エラー/)).toBeInTheDocument();
  });

  it("Overlay制御は単一アイコンから開くミニウィンドウへ収納する", () => {
    renderItem();

    expect(screen.getAllByRole("button")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /コメントOverlay制御/ }));

    expect(screen.getByText("コメントOverlay")).toBeInTheDocument();
    expect(screen.getByText("コメントを画面に流す")).toBeInTheDocument();
    expect(screen.queryByText("Overlay表示")).toBeNull();
  });

  it("表示位置の調整は小窓を閉じ、クリック元の窓を起点に別窓で開く", () => {
    mocks.openPlacementWindow.mockClear();
    renderItem();

    fireEvent.click(screen.getByRole("button", { name: /コメントOverlay制御/ }));
    fireEvent.click(screen.getByRole("button", { name: "表示位置を調整…" }));

    expect(mocks.openPlacementWindow).toHaveBeenCalledExactlyOnceWith(window);
    expect(screen.queryByText("コメントを画面に流す")).toBeNull();
  });
});
