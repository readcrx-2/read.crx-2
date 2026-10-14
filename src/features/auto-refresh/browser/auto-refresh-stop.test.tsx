import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { resolveThreadAutoRefreshStop } from "src/features/auto-refresh/browser/auto-refresh-stop";
import { useAutoRefresh } from "src/features/auto-refresh/browser/use-auto-refresh";
import { useAutoNextThread } from "src/features/next-thread/browser/use-auto-next-thread";
import { useThreadRefreshController } from "src/features/thread/browser/use-thread-refresh-controller";
import { container } from "src/service-container/index";
import type { IConfig } from "src/service-container/interfaces";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

function StopHarness({
  autoNextThreadEnabled,
  missingFromSubject,
  onStop,
  onSearchExhausted,
  requestRefresh,
}: {
  autoNextThreadEnabled: boolean;
  missingFromSubject: boolean;
  onStop: () => void;
  onSearchExhausted: () => void;
  requestRefresh: () => void;
}) {
  const [enabled, setEnabled] = useState(true);
  const [stopped, setStopped] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const controller = useThreadRefreshController(0);
  const state = resolveThreadAutoRefreshStop({
    autoNextThreadEnabled,
    responseCount: 600,
    expired: !missingFromSubject,
    missingFromSubject,
    stopped,
  });
  const refresh = useAutoRefresh({
    enabled,
    scopeUrl: "https://example.com/test/read.cgi/live/1700000200/",
    expired: state.shouldStopFetching,
    loading: false,
    refreshController: controller,
    pauseAutoScroll: false,
    responseCount: 600,
    lastResponseNum: 600,
    rootRef,
    requestRefresh,
    deferAutoStop: state.shouldDeferNextThreadStop,
    deferExpiredStop: state.shouldDeferNextThreadStop,
    onThreadExpiredDetected: () => setStopped(true),
    onThreadExpired: () => {
      setEnabled(false);
      onStop();
    },
  });
  const search = useAutoNextThread({
    autoRefreshEnabled: enabled,
    featureEnabled: autoNextThreadEnabled,
    threadUrl: "https://example.com/test/read.cgi/live/1700000200/",
    threadTitle: "実況スレ Part.20",
    responseCount: 600,
    expired: state.autoRefreshExpired,
    mode: "balanced",
    responseMessages: [],
    canAutoScroll: refresh.canAutoScroll,
    followThread: vi.fn(),
    onSearchExhausted: () => {
      // 画面と同じく期限終了の記録を停止判定へ戻し、探索と自動更新を一緒に終了させる。
      setStopped(true);
      onSearchExhausted();
    },
  });
  return (
    <div className="content-area">
      <div className="content-area__tab-panel" data-active="true">
        <div ref={rootRef}>
          <div ref={refresh.autoScrollBoundaryRef} />
        </div>
      </div>
      <output data-testid="enabled">{enabled ? "ON" : "OFF"}</output>
      <output data-testid="search">{search.status}</output>
    </div>
  );
}

describe("dat落ちから次スレ待機と停止までの連携", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0),
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
    container.config = {
      get: vi.fn(() => "3000"),
      set: vi.fn(),
      getAll: () => ({}),
      ready: (callback) => callback(),
    } as IConfig;
    container.message = { send: vi.fn(), on: vi.fn(), off: vi.fn() };
    container.board = {
      getThreads: vi.fn().mockResolvedValue({ threads: [], message: null }),
      getCachedResCount: vi.fn(),
    };
    container.toast = { info: vi.fn(), error: vi.fn(), success: vi.fn(), notify: vi.fn() };
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each([false, true])(
    "600レスのdat落ちでも3分待ち、期限終了で一度だけOFFにする（subject不在=%s）",
    async (missingFromSubject) => {
      const onStop = vi.fn();
      const onSearchExhausted = vi.fn();
      const requestRefresh = vi.fn();
      render(
        <StopHarness
          autoNextThreadEnabled
          missingFromSubject={missingFromSubject}
          onStop={onStop}
          onSearchExhausted={onSearchExhausted}
          requestRefresh={requestRefresh}
        />,
      );
      await act(async () => vi.advanceTimersByTimeAsync(179_999));
      expect(screen.getByTestId("enabled")).toHaveTextContent("ON");
      expect(screen.getByTestId("search")).toHaveTextContent("searching");
      expect(onStop).not.toHaveBeenCalled();
      expect(requestRefresh).not.toHaveBeenCalled();
      await act(async () => vi.advanceTimersByTimeAsync(1));
      expect(screen.getByTestId("enabled")).toHaveTextContent("OFF");
      expect(onSearchExhausted).toHaveBeenCalledOnce();
      expect(onStop).toHaveBeenCalledOnce();
      const requestCount = vi.mocked(container.board.getThreads).mock.calls.length;
      await act(async () => vi.advanceTimersByTimeAsync(30_000));
      expect(container.board.getThreads).toHaveBeenCalledTimes(requestCount);
      expect(onStop).toHaveBeenCalledOnce();
    },
  );

  it("次スレ移動がOFFならdat落ちで直ちに停止して探索しない", async () => {
    const onStop = vi.fn();
    render(
      <StopHarness
        autoNextThreadEnabled={false}
        missingFromSubject={false}
        onStop={onStop}
        onSearchExhausted={vi.fn()}
        requestRefresh={vi.fn()}
      />,
    );
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(screen.getByTestId("enabled")).toHaveTextContent("OFF");
    expect(container.board.getThreads).not.toHaveBeenCalled();
    expect(onStop).toHaveBeenCalledOnce();
  });
});
