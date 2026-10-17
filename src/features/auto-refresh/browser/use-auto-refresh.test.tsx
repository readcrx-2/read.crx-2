import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React, { useEffect, useState } from "react";
import { THREAD_AUTO_REFRESH_IDLE_STOP_COUNT } from "src/features/auto-refresh/browser/auto-refresh-config";
import { shouldDeferExpiredAutoRefreshStop } from "src/features/auto-refresh/browser/auto-refresh-stop";
import { useAutoRefresh } from "src/features/auto-refresh/browser/use-auto-refresh";
import { useLiveChatResponses } from "src/features/live-chat/browser/use-live-chat-responses";
import { useThreadRefreshController } from "src/features/thread/browser/use-thread-refresh-controller";
import { container } from "src/service-container/index";
import type { IConfig, IMessage } from "src/service-container/interfaces";
import { SCROLL_JUMP_EVENT } from "src/view/browser/utils/scroll-jump-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

interface TestRectOptions {
  top: number;
  bottom: number;
}

// jsdom の HTMLElement#scrollBy は ScrollToOptions 単一引数のオーバーロードを型に持たないため、
// 代入ではなく Object.assign で差し替えて、型エラーを抑止するコメントを不要にする。
function mockScrollBy(element: HTMLElement, scrollBy: (options: ScrollToOptions) => void): void {
  Object.assign(element, { scrollBy });
}

function createRect({ top, bottom }: TestRectOptions): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    bottom,
    left: 0,
    right: 240,
    width: 240,
    height: bottom - top,
    toJSON: () => ({}),
  } as DOMRect;
}

interface TestResizeObserver {
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  trigger: () => void;
}

let resizeObservers: TestResizeObserver[] = [];

class ResizeObserverStub implements TestResizeObserver {
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    resizeObservers.push(this);
  }

  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

function AutoRefreshHarness({
  enabled = true,
  startAtBottom = false,
  active = true,
  refreshKey = 0,
  expired = false,
  stopped = false,
  scopeUrl = "https://example.com/test/read.cgi/board/thread-a/",
  loading = false,
  pauseAutoScroll = false,
  onRequestRefresh,
  onNewResponses,
  onAutoStop,
  deferAutoStop = false,
  configureScrollContainer,
  onThreadExpired,
  onThreadExpiredDetected,
  deferExpiredStop = false,
  liveChatMode = false,
  hasReachedThreadLimit = false,
}: {
  enabled?: boolean;
  startAtBottom?: boolean;
  active?: boolean;
  refreshKey?: number;
  expired?: boolean;
  stopped?: boolean;
  scopeUrl?: string;
  loading?: boolean;
  pauseAutoScroll?: boolean;
  onRequestRefresh: () => void;
  onNewResponses?: (count: number, previousLastResponseNum: number | null) => void;
  onAutoStop?: () => void;
  deferAutoStop?: boolean;
  configureScrollContainer?: (scrollContainer: HTMLDivElement) => void;
  onThreadExpired?: () => void;
  onThreadExpiredDetected?: () => void;
  deferExpiredStop?: boolean;
  liveChatMode?: boolean;
  hasReachedThreadLimit?: boolean;
}) {
  const [responses, setResponses] = useState([1, 2]);
  const [isLoading, setLoading] = useState(loading);
  useEffect(() => {
    setLoading(loading);
  }, [loading]);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const refreshController = useThreadRefreshController(refreshKey);
  const liveChat = useLiveChatResponses({
    responses: responses.map((num) => ({ num })),
    scopeKey: scopeUrl,
    enabled: liveChatMode,
    isActive: active,
    isAutoRefreshEnabled: enabled,
    isFetching: isLoading,
    intervalMs: 3000,
    paused: pauseAutoScroll,
  });
  const scrollContainerRef = React.useCallback(
    (element: HTMLDivElement | null) => {
      if (element) {
        configureScrollContainer?.(element);
      }
    },
    [configureScrollContainer],
  );
  const { autoScrollBoundaryRef, canAutoScroll, isAutoScrolling } = useAutoRefresh({
    enabled,
    scopeUrl,
    startAtBottom,
    expired: expired || stopped || hasReachedThreadLimit,
    loading: isLoading,
    refreshController,
    pauseAutoScroll,
    responseCount: responses.length,
    lastResponseNum: responses.length > 0 ? responses[responses.length - 1] : null,
    rootRef,
    requestRefresh: () => {
      setLoading(true);
      onRequestRefresh();
    },
    onNewResponses,
    onAutoStop,
    deferAutoStop,
    onThreadExpired,
    onThreadExpiredDetected,
    deferExpiredStop: liveChatMode
      ? shouldDeferExpiredAutoRefreshStop({
          shouldDeferNextThreadStop: deferExpiredStop,
          expired: expired || stopped,
          hasReachedThreadLimit,
          isActive: active,
          isDraining: liveChat.isDraining,
        })
      : deferExpiredStop,
  });

  return (
    <div className="content-area">
      <div
        ref={scrollContainerRef}
        className="content-area__tab-panel"
        data-active={active ? "true" : "false"}
        data-testid="scroll-container"
      >
        <div ref={rootRef}>
          {liveChat.responses.map(({ num }) => (
            <div key={num} data-testid="response">
              {num}
            </div>
          ))}
          <div ref={autoScrollBoundaryRef} data-testid="boundary" />
          <button
            onClick={() => {
              setResponses((prev) => [...prev, prev.length + 1]);
              setLoading(false);
            }}
          >
            新着ありで完了
          </button>
          <button
            onClick={() => {
              setResponses((prev) => [...prev, prev.length + 1, prev.length + 2, prev.length + 3]);
              setLoading(false);
            }}
          >
            新着3件で完了
          </button>
          <button
            onClick={() => {
              setLoading(false);
            }}
          >
            新着なしで完了
          </button>
          <button
            onClick={() => {
              // 書き込み成功後の dispatch(RELOAD) など、hook のインターバル外から
              // 始まるリロードを再現する（requestRefresh を経由しない）。
              setLoading(true);
            }}
          >
            外部リロード開始
          </button>
          <output data-testid="can-auto-scroll">{canAutoScroll ? "enabled" : "disabled"}</output>
          <output data-testid="is-auto-scrolling">{isAutoScrolling ? "running" : "idle"}</output>
          <output data-testid="live-chat-pending">{liveChat.pendingCount}</output>
        </div>
      </div>
    </div>
  );
}

describe("useAutoRefresh", () => {
  let configMock: IConfig;
  let messageMock: IMessage;

  beforeEach(() => {
    vi.useFakeTimers();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });

    vi.stubGlobal("requestAnimationFrame", ((callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0)) as typeof requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", ((id: number) =>
      window.clearTimeout(id)) as typeof cancelAnimationFrame);
    resizeObservers = [];
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);

    configMock = {
      get: vi.fn((key: string) => {
        if (key === "auto_load_idle_stop_timeout") return "auto";
        return "3000";
      }),
      set: vi.fn(),
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    messageMock = {
      send: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    container.config = configMock;
    container.message = messageMock;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // jsdomは行の高さとスクロール上限を持たないため、表示済みの行数から実際の配置を再現する。
  function renderScrollableHarness(
    options: { liveChatMode?: boolean; pauseAutoScroll?: boolean } = {},
  ) {
    let scrollTop = 200;
    let extraHeight = 0;
    let boundaryOffset = 0;
    const onRequestRefresh = vi.fn();
    const scrollBy = vi.fn((offset: ScrollToOptions) => {
      scrollTop = Math.max(0, Math.min(scrollHeight() - 100, scrollTop + (offset.top ?? 0)));
    });
    const scrollHeight = () => 180 + screen.queryAllByTestId("response").length * 60 + extraHeight;
    render(
      <AutoRefreshHarness
        {...options}
        onRequestRefresh={onRequestRefresh}
        configureScrollContainer={(element) => {
          Object.defineProperties(element, {
            clientHeight: { configurable: true, get: () => 100 },
            scrollHeight: { configurable: true, get: scrollHeight },
            scrollTop: {
              configurable: true,
              get: () => scrollTop,
              set: (value: number) => {
                scrollTop = Math.max(0, Math.min(scrollHeight() - 100, value));
              },
            },
          });
          element.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
          mockScrollBy(element, scrollBy);
        }}
      />,
    );
    const panel = screen.getByTestId("scroll-container");
    screen.getByTestId("boundary").getBoundingClientRect = () =>
      createRect({
        top: scrollHeight() - scrollTop - 20,
        bottom: scrollHeight() - scrollTop + boundaryOffset,
      });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    return {
      panel,
      scrollBy,
      scrollHeight,
      getScrollTop: () => scrollTop,
      setScrollTop: (value: number) => {
        scrollTop = value;
      },
      setExtraHeight: (value: number) => {
        extraHeight = value;
      },
      setBoundaryOffset: (value: number) => {
        boundaryOffset = value;
      },
    };
  }

  it.each([false, true])(
    "通常・ライブチャットの新着描画で追従を外さず二重補正しない（ライブ=%s）",
    (liveChatMode) => {
      const { scrollBy, scrollHeight, getScrollTop } = renderScrollableHarness({ liveChatMode });
      expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      fireEvent.click(screen.getByText("新着3件で完了"));

      // 通信完了と異なるタイミングで各行が描画されても、描画直後に追従を維持する。
      for (let release = 0; release < 3; release++) {
        act(() => {
          vi.advanceTimersByTime(600);
        });
        expect(getScrollTop()).toBe(scrollHeight() - 100);
        expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
        const count = scrollBy.mock.calls.length;
        act(() => {
          resizeObservers[0].trigger();
          vi.advanceTimersByTime(0);
        });
        expect(scrollBy).toHaveBeenCalledTimes(count);
      }
      expect(screen.getAllByTestId("response")).toHaveLength(5);
      expect(scrollBy).toHaveBeenCalledTimes(liveChatMode ? 3 : 1);
    },
  );

  it("スクロール通知がサイズ監視より先に届いても追従を解除しない", () => {
    const { panel, setExtraHeight, getScrollTop, scrollBy } = renderScrollableHarness();
    setExtraHeight(60);
    fireEvent.scroll(panel);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(getScrollTop()).toBe(260);
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
    act(() => {
      resizeObservers[0].trigger();
      vi.advanceTimersByTime(0);
    });
    expect(scrollBy).toHaveBeenCalledTimes(1);
  });

  it.each([230, 260])(
    "通常更新前にブラウザが位置を補正していれば残りの距離だけ追従する（補正後=%s）",
    (correctedScrollTop) => {
      const { setScrollTop, getScrollTop, scrollBy } = renderScrollableHarness();
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      setScrollTop(correctedScrollTop);
      fireEvent.click(screen.getByText("新着ありで完了"));
      if (correctedScrollTop === 260) {
        expect(scrollBy).not.toHaveBeenCalled();
      } else {
        expect(scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 30, behavior: "auto" });
      }
      expect(getScrollTop()).toBe(260);
    },
  );

  it("スクロールバーで上へ移動したときも新着へ引き戻さない", () => {
    const { panel, setScrollTop, getScrollTop, scrollBy } = renderScrollableHarness();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    setScrollTop(100);
    fireEvent.scroll(panel);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    fireEvent.click(screen.getByText("新着ありで完了"));
    expect(getScrollTop()).toBe(100);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("境界の小数座標による丸め誤差では追従を解除しない", () => {
    const { panel, setBoundaryOffset } = renderScrollableHarness();
    setBoundaryOffset(0.5);
    fireEvent.scroll(panel);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
    setBoundaryOffset(2);
    fireEvent.scroll(panel);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("disabled");
  });

  it.each([false, true])(
    "通常・ライブチャットとも手動で上へ移動したら新着へ追従しない（ライブ=%s）",
    (liveChatMode) => {
      const { panel, setScrollTop, getScrollTop, scrollBy } = renderScrollableHarness({
        liveChatMode,
      });
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      fireEvent.wheel(panel, { deltaY: -100 });
      setScrollTop(100);
      fireEvent.scroll(panel);
      act(() => {
        vi.advanceTimersByTime(0);
      });
      fireEvent.click(screen.getByText("新着3件で完了"));
      act(() => {
        vi.advanceTimersByTime(1800);
      });
      expect(getScrollTop()).toBe(100);
      expect(scrollBy).not.toHaveBeenCalled();
      expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("disabled");
    },
  );

  it.each([false, true])(
    "手動で上へ移動した後にジェスチャーで最下部へ戻ると、新着へ追従を再開する（ライブ=%s）",
    (liveChatMode) => {
      const { panel, setScrollTop, scrollHeight, getScrollTop } = renderScrollableHarness({
        liveChatMode,
      });
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      fireEvent.wheel(panel, { deltaY: -100 });
      setScrollTop(100);
      fireEvent.scroll(panel);
      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("disabled");

      // ジェスチャーはscrollTopを直接書き換えて、scrollイベントを待たずに通知する。
      setScrollTop(scrollHeight() - 100);
      act(() => {
        panel.dispatchEvent(new Event(SCROLL_JUMP_EVENT));
      });
      fireEvent.click(screen.getByText("新着3件で完了"));
      act(() => {
        vi.advanceTimersByTime(1800);
      });
      expect(getScrollTop()).toBe(scrollHeight() - 100);
      expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
    },
  );

  it("ライブチャットでもポップアップ表示中は追従を停止する", () => {
    const { getScrollTop, scrollBy } = renderScrollableHarness({
      liveChatMode: true,
      pauseAutoScroll: true,
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    fireEvent.click(screen.getByText("新着3件で完了"));
    act(() => {
      vi.advanceTimersByTime(1800);
    });
    expect(getScrollTop()).toBe(200);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("新着レスの描画に合わせて底面まで scrollBy する", () => {
    const onRequestRefresh = vi.fn();
    const onNewResponses = vi.fn();
    render(
      <AutoRefreshHarness onRequestRefresh={onRequestRefresh} onNewResponses={onNewResponses} />,
    );

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => scrollHeightValue,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });

    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      scrollTopValue += top ?? 0;
    });
    mockScrollBy(scrollContainer, scrollBy);

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onRequestRefresh).toHaveBeenCalledOnce();

    scrollHeightValue = 360;
    fireEvent.click(screen.getByText("新着ありで完了"));

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).toHaveBeenCalledWith({ top: 60, behavior: "auto" });
    expect(onNewResponses).toHaveBeenCalledOnce();
    expect(onNewResponses).toHaveBeenCalledWith(1, 2);
  });

  it("手動更新では新着レス通知を呼ばない", () => {
    const onRequestRefresh = vi.fn();
    const onNewResponses = vi.fn();
    render(
      <AutoRefreshHarness onRequestRefresh={onRequestRefresh} onNewResponses={onNewResponses} />,
    );

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => 200,
      set: () => {},
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => 300,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });

    fireEvent.click(screen.getByText("外部リロード開始"));
    fireEvent.click(screen.getByText("新着ありで完了"));

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(onNewResponses).not.toHaveBeenCalled();
  });

  it("書き込みなど外部起因のリロードでも最下部にいれば追従スクロールする", () => {
    const onRequestRefresh = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} />);

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => scrollHeightValue,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });

    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      scrollTopValue += top ?? 0;
    });
    mockScrollBy(scrollContainer, scrollBy);

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");

    // hook のインターバルを経由しないリロード（書き込み成功後の RELOAD 相当）
    fireEvent.click(screen.getByText("外部リロード開始"));

    scrollHeightValue = 360;
    fireEvent.click(screen.getByText("新着ありで完了"));

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).toHaveBeenCalledWith({ top: 60, behavior: "auto" });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
  });

  it("更新処理外のコンテンツ高さ増加でも自動追従する", () => {
    const onRequestRefresh = vi.fn();
    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    render(
      <AutoRefreshHarness
        onRequestRefresh={onRequestRefresh}
        configureScrollContainer={(scrollContainer) => {
          Object.defineProperty(scrollContainer, "clientHeight", {
            configurable: true,
            get: () => 100,
          });
          Object.defineProperty(scrollContainer, "scrollTop", {
            configurable: true,
            get: () => scrollTopValue,
            set: (value: number) => {
              scrollTopValue = value;
            },
          });
          Object.defineProperty(scrollContainer, "scrollHeight", {
            configurable: true,
            get: () => scrollHeightValue,
          });
        }}
      />,
    );

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });
    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      scrollTopValue += top ?? 0;
    });
    mockScrollBy(scrollContainer, scrollBy);

    act(() => {
      vi.runOnlyPendingTimers();
    });

    scrollHeightValue = 360;
    act(() => {
      resizeObservers[0].trigger();
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).toHaveBeenCalledWith({ top: 60, behavior: "auto" });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
  });

  it("refreshKey変更時に更新前の追従位置を保存し、同じ高さ変更を二重補正しない", () => {
    const onRequestRefresh = vi.fn();
    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    const { rerender } = render(
      <AutoRefreshHarness refreshKey={0} onRequestRefresh={onRequestRefresh} />,
    );

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => scrollHeightValue,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    // 境界はレス一覧の末尾にあるため、スクロール前は高さの増加分だけ下へ移動する。
    boundary.getBoundingClientRect = () =>
      createRect({ top: 80, bottom: scrollHeightValue - scrollTopValue });
    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      scrollTopValue += top ?? 0;
    });
    mockScrollBy(scrollContainer, scrollBy);

    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");

    // ThreadPage ではこの変更と同じ render の後に useThreadData が取得を開始する。
    // その前に layout effect が更新前の scrollHeight と追従意図を保存できることを確認する。
    act(() => {
      rerender(<AutoRefreshHarness refreshKey={1} onRequestRefresh={onRequestRefresh} />);
    });
    scrollHeightValue = 360;
    fireEvent.click(screen.getByText("新着ありで完了"));

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).toHaveBeenCalledWith({ top: 60, behavior: "auto" });
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");

    // 更新完了後に ResizeObserver が通知されても、同じレス描画を再度補正しない。
    act(() => {
      resizeObservers[0].trigger();
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).toHaveBeenCalledTimes(1);
  });

  it("コンテンツ高さが縮小しても境界への追従位置を補正する", () => {
    const onRequestRefresh = vi.fn();
    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    render(
      <AutoRefreshHarness
        onRequestRefresh={onRequestRefresh}
        configureScrollContainer={(scrollContainer) => {
          Object.defineProperty(scrollContainer, "clientHeight", {
            configurable: true,
            get: () => 100,
          });
          Object.defineProperty(scrollContainer, "scrollTop", {
            configurable: true,
            get: () => scrollTopValue,
            set: (value: number) => {
              scrollTopValue = value;
            },
          });
          Object.defineProperty(scrollContainer, "scrollHeight", {
            configurable: true,
            get: () => scrollHeightValue,
          });
        }}
      />,
    );

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });
    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      scrollTopValue += top ?? 0;
    });
    mockScrollBy(scrollContainer, scrollBy);

    act(() => {
      vi.runOnlyPendingTimers();
    });

    scrollHeightValue = 240;
    act(() => {
      resizeObservers[0].trigger();
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).toHaveBeenCalledWith({ top: -60, behavior: "auto" });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
  });

  it("サイドタブバー開閉など中身の高さが変わらず容器だけ縮んでも追従を維持する", () => {
    const onRequestRefresh = vi.fn();
    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    let clientHeightValue = 100;
    render(
      <AutoRefreshHarness
        onRequestRefresh={onRequestRefresh}
        configureScrollContainer={(scrollContainer) => {
          Object.defineProperty(scrollContainer, "clientHeight", {
            configurable: true,
            get: () => clientHeightValue,
          });
          Object.defineProperty(scrollContainer, "scrollTop", {
            configurable: true,
            get: () => scrollTopValue,
            set: (value: number) => {
              scrollTopValue = value;
            },
          });
          Object.defineProperty(scrollContainer, "scrollHeight", {
            configurable: true,
            get: () => scrollHeightValue,
          });
        }}
      />,
    );

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: clientHeightValue });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: clientHeightValue });
    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      scrollTopValue += top ?? 0;
    });
    mockScrollBy(scrollContainer, scrollBy);

    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");

    // 変更理由: 下部パネル表示などで容器だけが縮むと、中身の高さ差分だけでは底面へ戻せない。
    // 底面距離で補正して追従判定を維持する。
    clientHeightValue = 70;
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: clientHeightValue });
    boundary.getBoundingClientRect = () => createRect({ top: 50, bottom: clientHeightValue });
    act(() => {
      resizeObservers[0].trigger();
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).toHaveBeenCalledWith({ top: 30, behavior: "auto" });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
  });

  it("ウィンドウリサイズでも追従位置を維持して追従判定を外さない", () => {
    const onRequestRefresh = vi.fn();
    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    let clientHeightValue = 100;
    render(
      <AutoRefreshHarness
        onRequestRefresh={onRequestRefresh}
        configureScrollContainer={(scrollContainer) => {
          Object.defineProperty(scrollContainer, "clientHeight", {
            configurable: true,
            get: () => clientHeightValue,
          });
          Object.defineProperty(scrollContainer, "scrollTop", {
            configurable: true,
            get: () => scrollTopValue,
            set: (value: number) => {
              scrollTopValue = value;
            },
          });
          Object.defineProperty(scrollContainer, "scrollHeight", {
            configurable: true,
            get: () => scrollHeightValue,
          });
        }}
      />,
    );

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: clientHeightValue });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: clientHeightValue });
    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      scrollTopValue += top ?? 0;
    });
    mockScrollBy(scrollContainer, scrollBy);

    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");

    // 変更理由: 従来は window リサイズが単なる再判定で先に追従OFFへ倒れ、
    // ResizeObserver の補正が効かず追従が終わっていた。同じ補正経路へ一本化したため、
    // リサイズ経由でも底面へ維持される。
    scrollHeightValue = 360;
    clientHeightValue = 100;
    act(() => {
      window.dispatchEvent(new Event("resize"));
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).toHaveBeenCalledWith({ top: 60, behavior: "auto" });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
  });

  it("容器拡大でブラウザが既に底面へ寄せていれば二重補正しない", () => {
    const onRequestRefresh = vi.fn();
    let scrollTopValue = 200;
    const scrollHeightValue = 300;
    let clientHeightValue = 100;
    render(
      <AutoRefreshHarness
        onRequestRefresh={onRequestRefresh}
        configureScrollContainer={(scrollContainer) => {
          Object.defineProperty(scrollContainer, "clientHeight", {
            configurable: true,
            get: () => clientHeightValue,
          });
          Object.defineProperty(scrollContainer, "scrollTop", {
            configurable: true,
            get: () => scrollTopValue,
            set: (value: number) => {
              scrollTopValue = value;
            },
          });
          Object.defineProperty(scrollContainer, "scrollHeight", {
            configurable: true,
            get: () => scrollHeightValue,
          });
        }}
      />,
    );

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: clientHeightValue });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: clientHeightValue });
    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      scrollTopValue += top ?? 0;
    });
    mockScrollBy(scrollContainer, scrollBy);

    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");

    // 変更理由: 容器拡大時はブラウザが scrollTop を自動でクランプして底面へ残す。
    // 差分だけで動かすと逆方向へずれるため、底面距離が0なら動かさない。
    clientHeightValue = 150;
    scrollTopValue = 150;
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: clientHeightValue });
    boundary.getBoundingClientRect = () => createRect({ top: 130, bottom: clientHeightValue });
    act(() => {
      resizeObservers[0].trigger();
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).not.toHaveBeenCalled();
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
  });

  it("内容と容器の両方を監視してサイズ変更全般へ追従できる", () => {
    const onRequestRefresh = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} />);

    act(() => {
      vi.runOnlyPendingTimers();
    });

    // 変更理由: root だけでは容器自体の高さ変化を検知できない。
    // スクロールコンテナ自体も監視してサイズ変更全般を同じ補正へ流す。
    expect(resizeObservers).toHaveLength(1);
    expect(resizeObservers[0].observe).toHaveBeenCalledTimes(2);
  });

  it("高さ変更後もユーザーのホイール操作を優先して追従しない", () => {
    const onRequestRefresh = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} />);

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;
    let scrollHeightValue = 300;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => 200,
      set: () => {},
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => scrollHeightValue,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });
    const scrollBy = vi.fn();
    scrollContainer.scrollBy = scrollBy;

    act(() => {
      vi.runOnlyPendingTimers();
    });

    fireEvent.wheel(scrollContainer);
    scrollHeightValue = 360;
    act(() => {
      resizeObservers[0].trigger();
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("アンマウント時に高さ変更の監視を解除する", () => {
    const onRequestRefresh = vi.fn();
    const { unmount } = render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} />);

    expect(resizeObservers).toHaveLength(1);
    unmount();

    expect(resizeObservers[0].disconnect).toHaveBeenCalledOnce();
  });

  it("非アクティブなパネルの高さ変更を監視しない", () => {
    const onRequestRefresh = vi.fn();
    render(<AutoRefreshHarness active={false} onRequestRefresh={onRequestRefresh} />);

    expect(resizeObservers).toHaveLength(0);
    expect(onRequestRefresh).not.toHaveBeenCalled();
  });

  it("自動更新を有効化した瞬間に最下部へ移動して即時 refresh する", () => {
    const onRequestRefresh = vi.fn();
    const { rerender } = render(
      <AutoRefreshHarness enabled={false} onRequestRefresh={onRequestRefresh} />,
    );

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    let scrollTopValue = 12;
    const scrollHeightValue = 300;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => scrollHeightValue,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(onRequestRefresh).not.toHaveBeenCalled();

    act(() => {
      rerender(<AutoRefreshHarness enabled={true} onRequestRefresh={onRequestRefresh} />);
    });

    expect(scrollTopValue).toBe(300);
    expect(onRequestRefresh).toHaveBeenCalledOnce();
  });

  it("有効なまま次スレを表示したときは再取得せず最下部から追従する", () => {
    const onRequestRefresh = vi.fn();
    let scrollTopValue = 12;
    const scrollHeightValue = 300;

    const { getByTestId } = render(
      <AutoRefreshHarness
        startAtBottom
        onRequestRefresh={onRequestRefresh}
        configureScrollContainer={(scrollContainer) => {
          Object.defineProperty(scrollContainer, "clientHeight", {
            configurable: true,
            get: () => 100,
          });
          Object.defineProperty(scrollContainer, "scrollTop", {
            configurable: true,
            get: () => scrollTopValue,
            set: (value: number) => {
              scrollTopValue = value;
            },
          });
          Object.defineProperty(scrollContainer, "scrollHeight", {
            configurable: true,
            get: () => scrollHeightValue,
          });
          scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
        }}
      />,
    );

    const boundary = getByTestId("boundary") as HTMLDivElement;
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });

    expect(scrollTopValue).toBe(300);
    expect(getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
    expect(onRequestRefresh).not.toHaveBeenCalled();

    act(() => {
      vi.runOnlyPendingTimers();
    });
  });

  it("次スレの初回取得完了後に一度だけ最下部へ同期する", () => {
    const onRequestRefresh = vi.fn();
    let scrollTopValue = 0;
    let scrollHeightValue = 80;
    const configureScrollContainer = (scrollContainer: HTMLDivElement) => {
      // 初回取得の描画も共通の底面補正を通るため、jsdomにないスクロール操作を再現する。
      mockScrollBy(scrollContainer, ({ top }: ScrollToOptions) => {
        scrollTopValue += top ?? 0;
      });
      Object.defineProperty(scrollContainer, "clientHeight", {
        configurable: true,
        get: () => 100,
      });
      Object.defineProperty(scrollContainer, "scrollTop", {
        configurable: true,
        get: () => scrollTopValue,
        set: (value: number) => {
          scrollTopValue = value;
        },
      });
      Object.defineProperty(scrollContainer, "scrollHeight", {
        configurable: true,
        get: () => scrollHeightValue,
      });
      scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    };

    const { rerender, getByTestId } = render(
      <AutoRefreshHarness
        startAtBottom
        loading
        onRequestRefresh={onRequestRefresh}
        configureScrollContainer={configureScrollContainer}
      />,
    );

    expect(scrollTopValue).toBe(0);

    scrollHeightValue = 300;
    rerender(
      <AutoRefreshHarness
        startAtBottom
        loading={false}
        onRequestRefresh={onRequestRefresh}
        configureScrollContainer={configureScrollContainer}
      />,
    );

    expect(scrollTopValue).toBe(300);
    expect(getByTestId("can-auto-scroll")).toHaveTextContent("enabled");

    scrollTopValue = 12;
    // 実際の手動移動では操作イベントも届くため、次の描画より先に追従への割り込みを伝える。
    fireEvent.wheel(getByTestId("scroll-container"));
    scrollHeightValue = 400;
    rerender(
      <AutoRefreshHarness
        startAtBottom
        loading={false}
        onRequestRefresh={onRequestRefresh}
        configureScrollContainer={configureScrollContainer}
      />,
    );

    expect(scrollTopValue).toBe(12);
  });

  it("開始前に判明したdat落ちを記録し、開始を繰り返しても取得しない", () => {
    const onRequestRefresh = vi.fn();
    const onThreadExpired = vi.fn();
    const onThreadExpiredDetected = vi.fn();
    const view = render(
      <AutoRefreshHarness
        enabled={false}
        expired
        onRequestRefresh={onRequestRefresh}
        onThreadExpired={onThreadExpired}
        onThreadExpiredDetected={onThreadExpiredDetected}
      />,
    );
    expect(onThreadExpiredDetected).toHaveBeenCalledOnce();
    expect(onThreadExpired).not.toHaveBeenCalled();

    for (let attempt = 0; attempt < 10; attempt++) {
      view.rerender(
        <AutoRefreshHarness
          enabled={attempt % 2 === 0}
          expired
          onRequestRefresh={onRequestRefresh}
          onThreadExpired={onThreadExpired}
          onThreadExpiredDetected={onThreadExpiredDetected}
        />,
      );
      act(() => {
        vi.advanceTimersByTime(3000);
      });
    }
    expect(onThreadExpiredDetected).toHaveBeenCalledOnce();
    expect(onThreadExpired).toHaveBeenCalledOnce();
    expect(onRequestRefresh).not.toHaveBeenCalled();
  });

  it("dat落ち検知で自動更新を止め、再描画やタブ切替では通知を重ねない", () => {
    const onRequestRefresh = vi.fn();
    const onThreadExpired = vi.fn();
    const { rerender } = render(
      <AutoRefreshHarness
        expired={false}
        onRequestRefresh={onRequestRefresh}
        onThreadExpired={onThreadExpired}
      />,
    );

    act(() => {
      rerender(
        <AutoRefreshHarness
          expired={true}
          onRequestRefresh={onRequestRefresh}
          onThreadExpired={onThreadExpired}
        />,
      );
    });

    expect(onThreadExpired).toHaveBeenCalledOnce();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onRequestRefresh).not.toHaveBeenCalled();

    act(() => {
      // 非アクティブ化・再アクティブ化と再取得による状態の揺れを再現する。
      rerender(
        <AutoRefreshHarness
          enabled={false}
          expired={true}
          onRequestRefresh={onRequestRefresh}
          onThreadExpired={onThreadExpired}
        />,
      );
      rerender(
        <AutoRefreshHarness
          enabled={true}
          expired={false}
          onRequestRefresh={onRequestRefresh}
          onThreadExpired={onThreadExpired}
        />,
      );
      rerender(
        <AutoRefreshHarness
          enabled={true}
          expired={true}
          onRequestRefresh={onRequestRefresh}
          onThreadExpired={onThreadExpired}
        />,
      );
    });

    expect(onThreadExpired).toHaveBeenCalledOnce();
  });

  it.each(["expired", "stopped"] as const)(
    "ライブチャットの非表示中に届いた新着は溜めずに表示し、復帰時の%sで停止する",
    (expirySource) => {
      const onRequestRefresh = vi.fn();
      const onThreadExpired = vi.fn();
      const onThreadExpiredDetected = vi.fn();
      const props = {
        liveChatMode: true,
        onRequestRefresh,
        onThreadExpired,
        onThreadExpiredDetected,
      };
      const view = render(<AutoRefreshHarness {...props} />);
      view.rerender(<AutoRefreshHarness {...props} enabled={false} active={false} />);
      fireEvent.click(screen.getByText("新着ありで完了"));
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      // 非表示の間は流す相手がいないため、新着を保留せずにすぐ表示する。
      expect(screen.getByTestId("live-chat-pending")).toHaveTextContent("0");

      view.rerender(<AutoRefreshHarness {...props} {...{ [expirySource]: true }} />);

      // 復帰時も溜まった新着を流し直さず、停止と停止理由の保存を完了する。
      expect(screen.getByTestId("live-chat-pending")).toHaveTextContent("0");
      expect(onThreadExpired).toHaveBeenCalledOnce();
      expect(onThreadExpiredDetected).toHaveBeenCalledOnce();
      expect(onRequestRefresh).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(onThreadExpired).toHaveBeenCalledOnce();
      expect(onRequestRefresh).not.toHaveBeenCalled();
    },
  );

  it("ライブチャットの1000レス到達は末尾を表示してから停止する", () => {
    const onThreadExpired = vi.fn();
    const props = { liveChatMode: true, onRequestRefresh: vi.fn(), onThreadExpired };
    const view = render(<AutoRefreshHarness {...props} />);
    fireEvent.click(screen.getByText("新着ありで完了"));
    view.rerender(<AutoRefreshHarness {...props} hasReachedThreadLimit />);
    expect(onThreadExpired).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByTestId("live-chat-pending")).toHaveTextContent("0");
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(onThreadExpired).toHaveBeenCalledOnce();
  });

  it("次スレ探索中はdat落ち停止を保留し、探索終了後に停止できる", () => {
    const onRequestRefresh = vi.fn();
    const onThreadExpired = vi.fn();
    const onThreadExpiredDetected = vi.fn();
    const { rerender } = render(
      <AutoRefreshHarness
        expired={false}
        deferExpiredStop
        onRequestRefresh={onRequestRefresh}
        onThreadExpired={onThreadExpired}
        onThreadExpiredDetected={onThreadExpiredDetected}
      />,
    );

    act(() => {
      rerender(
        <AutoRefreshHarness
          expired
          deferExpiredStop
          onRequestRefresh={onRequestRefresh}
          onThreadExpired={onThreadExpired}
          onThreadExpiredDetected={onThreadExpiredDetected}
        />,
      );
    });

    expect(onThreadExpired).not.toHaveBeenCalled();
    expect(onThreadExpiredDetected).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onRequestRefresh).not.toHaveBeenCalled();

    act(() => {
      rerender(
        <AutoRefreshHarness
          expired
          deferExpiredStop={false}
          onRequestRefresh={onRequestRefresh}
          onThreadExpired={onThreadExpired}
          onThreadExpiredDetected={onThreadExpiredDetected}
        />,
      );
    });

    expect(onThreadExpired).toHaveBeenCalledOnce();
    expect(onThreadExpiredDetected).toHaveBeenCalledOnce();
  });

  it("同一スレの後続不確定応答と予約済みtickでは再取得せず、別スレへ移ると再開する", () => {
    const onRequestRefresh = vi.fn();
    const onThreadExpiredDetected = vi.fn();
    const intervalCallbacks: Array<() => void> = [];
    const setIntervalSpy = vi.spyOn(window, "setInterval").mockImplementation((callback) => {
      intervalCallbacks.push(callback as () => void);
      return 1 as unknown as ReturnType<typeof window.setInterval>;
    });
    const { rerender } = render(
      <AutoRefreshHarness
        scopeUrl="https://example.com/test/read.cgi/board/thread-a/"
        onRequestRefresh={onRequestRefresh}
        onThreadExpiredDetected={onThreadExpiredDetected}
      />,
    );
    const scheduledTick = intervalCallbacks.at(-1);
    expect(scheduledTick).toBeDefined();

    act(() => {
      rerender(
        <AutoRefreshHarness
          scopeUrl="https://example.com/test/read.cgi/board/thread-a/"
          expired
          onRequestRefresh={onRequestRefresh}
          onThreadExpiredDetected={onThreadExpiredDetected}
        />,
      );
    });
    expect(onThreadExpiredDetected).toHaveBeenCalledOnce();

    act(() => {
      // subject通信失敗後の本文取得成功を模し、生の失効情報だけがfalseへ戻る状態にする。
      rerender(
        <AutoRefreshHarness
          scopeUrl="https://example.com/test/read.cgi/board/thread-a/"
          stopped
          onRequestRefresh={onRequestRefresh}
          onThreadExpiredDetected={onThreadExpiredDetected}
        />,
      );
      scheduledTick?.();
      vi.advanceTimersByTime(3000);
    });
    expect(onRequestRefresh).not.toHaveBeenCalled();

    act(() => {
      // FOLLOW_NEXT_THREADは新URLをscopeにするため、旧スレの停止キーを引き継がない。
      rerender(
        <AutoRefreshHarness
          scopeUrl="https://example.com/test/read.cgi/board/thread-b/"
          onRequestRefresh={onRequestRefresh}
        />,
      );
    });
    act(() => {
      intervalCallbacks.at(-1)?.();
    });
    expect(onRequestRefresh).toHaveBeenCalledOnce();
    setIntervalSpy.mockRestore();
  });

  it("最初の通信失敗だけでは失効停止せず自動更新を続ける", () => {
    const onRequestRefresh = vi.fn();
    const onThreadExpiredDetected = vi.fn();
    const intervalCallbacks: Array<() => void> = [];
    const setIntervalSpy = vi.spyOn(window, "setInterval").mockImplementation((callback) => {
      intervalCallbacks.push(callback as () => void);
      return 1 as unknown as ReturnType<typeof window.setInterval>;
    });

    render(
      <AutoRefreshHarness
        // subject取得の通信失敗はdat落ち確定ではないため、停止条件へ渡さない。
        expired={false}
        onRequestRefresh={onRequestRefresh}
        onThreadExpiredDetected={onThreadExpiredDetected}
      />,
    );

    act(() => {
      intervalCallbacks.at(-1)?.();
    });

    expect(onRequestRefresh).toHaveBeenCalledOnce();
    expect(onThreadExpiredDetected).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });

  it("停止通知先が一時的に未設定でも、設定された後に失効停止を処理する", () => {
    const onRequestRefresh = vi.fn();
    const onThreadExpired = vi.fn();
    const { rerender } = render(
      <AutoRefreshHarness
        expired
        onRequestRefresh={onRequestRefresh}
        onThreadExpired={undefined}
      />,
    );

    expect(onThreadExpired).not.toHaveBeenCalled();
    act(() => {
      rerender(
        <AutoRefreshHarness
          expired
          onRequestRefresh={onRequestRefresh}
          onThreadExpired={onThreadExpired}
        />,
      );
    });

    expect(onThreadExpired).toHaveBeenCalledOnce();
  });

  it("更新間隔が未設定でも既定の20秒で自動更新する", () => {
    configMock = {
      get: vi.fn((key: string) => {
        if (key === "auto_load_idle_stop_timeout") return "auto";
        return "0";
      }),
      set: vi.fn(),
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    container.config = configMock;

    const onRequestRefresh = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} />);

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    let scrollTopValue = 200;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => 300,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });
    scrollContainer.scrollBy = vi.fn();

    act(() => {
      vi.advanceTimersByTime(19999);
    });

    expect(onRequestRefresh).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(onRequestRefresh).toHaveBeenCalledOnce();
  });

  it("自動追従前に wheel 割り込みが入ったらユーザー操作を優先する", () => {
    const onRequestRefresh = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} />);

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => scrollHeightValue,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });

    const scrollBy = vi.fn();
    scrollContainer.scrollBy = scrollBy;

    act(() => {
      vi.runOnlyPendingTimers();
      vi.advanceTimersByTime(3000);
    });

    fireEvent.wheel(scrollContainer);
    scrollHeightValue = 360;
    fireEvent.click(screen.getByText("新着ありで完了"));

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(onRequestRefresh).toHaveBeenCalled();
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("自動スクロール表示の切り替わりで scroll/wheel リスナーを付け直さない", () => {
    const { panel, setExtraHeight, scrollBy } = renderScrollableHarness();
    const addEventListener = vi.spyOn(panel, "addEventListener");
    const removeEventListener = vi.spyOn(panel, "removeEventListener");

    // 高さが伸びて追従スクロールが走り、インジケータが点灯→消灯するまで進める。
    setExtraHeight(60);
    act(() => {
      resizeObservers[0].trigger();
      vi.advanceTimersByTime(0);
    });
    expect(scrollBy).toHaveBeenCalled();
    expect(screen.getByTestId("is-auto-scrolling")).toHaveTextContent("running");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("is-auto-scrolling")).toHaveTextContent("idle");

    // 以前は表示状態を依存配列に持っていたため、点灯・消灯のたびに解除と再登録をしていた。
    expect(addEventListener).not.toHaveBeenCalled();
    expect(removeEventListener).not.toHaveBeenCalled();
  });

  it("自動スクロール状態を短時間維持してステータス表示に使える", () => {
    const onRequestRefresh = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} />);

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => scrollHeightValue,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });

    scrollContainer.scrollBy = vi.fn();

    act(() => {
      vi.runOnlyPendingTimers();
      vi.advanceTimersByTime(3000);
    });

    scrollHeightValue = 360;
    fireEvent.click(screen.getByText("新着ありで完了"));

    expect(screen.getByTestId("is-auto-scrolling")).toHaveTextContent("running");

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(screen.getByTestId("is-auto-scrolling")).toHaveTextContent("idle");
  });

  it("ポップアップ表示中は自動更新を継続しつつ自動スクロールだけ停止する", () => {
    const onRequestRefresh = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} pauseAutoScroll={true} />);

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => scrollHeightValue,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });

    const scrollBy = vi.fn();
    scrollContainer.scrollBy = scrollBy;

    act(() => {
      vi.runOnlyPendingTimers();
      vi.advanceTimersByTime(3000);
    });

    expect(onRequestRefresh).toHaveBeenCalledOnce();

    scrollHeightValue = 360;
    fireEvent.click(screen.getByText("新着ありで完了"));

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).not.toHaveBeenCalled();
    expect(screen.getByTestId("is-auto-scrolling")).toHaveTextContent("idle");
  });

  it.each([false, true])(
    "ポップアップの一時停止と再開を連続しても取得を増やさず通信中は重複させない（ライブ=%s）",
    (liveChatMode) => {
      const onRequestRefresh = vi.fn();
      const view = render(
        <AutoRefreshHarness liveChatMode={liveChatMode} onRequestRefresh={onRequestRefresh} />,
      );
      const scrollContainer = screen.getByTestId("scroll-container");
      scrollContainer.scrollBy = vi.fn();

      const togglePopupRepeatedly = () => {
        // 各変更を別の描画として確定し、Reactの一括更新で連続操作が省略されないようにする。
        for (let attempt = 0; attempt < 20; attempt++) {
          view.rerender(
            <AutoRefreshHarness
              liveChatMode={liveChatMode}
              onRequestRefresh={onRequestRefresh}
              pauseAutoScroll={attempt % 2 === 0}
            />,
          );
          act(() => {
            vi.advanceTimersByTime(50);
          });
        }
      };

      togglePopupRepeatedly();
      togglePopupRepeatedly();
      expect(onRequestRefresh).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(999);
      });
      expect(onRequestRefresh).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onRequestRefresh).toHaveBeenCalledOnce();

      // 取得が長引いても、一時停止の切替や次の周期でリクエストを重ねない。
      togglePopupRepeatedly();
      act(() => {
        vi.advanceTimersByTime(8000);
      });
      expect(onRequestRefresh).toHaveBeenCalledOnce();

      fireEvent.click(screen.getByText("新着なしで完了"));
      togglePopupRepeatedly();
      expect(onRequestRefresh).toHaveBeenCalledOnce();
      act(() => {
        vi.advanceTimersByTime(1999);
      });
      expect(onRequestRefresh).toHaveBeenCalledOnce();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onRequestRefresh).toHaveBeenCalledTimes(2);
    },
  );

  it("新着が連続で来ない更新が一定回数に達したら自動停止する", () => {
    const onRequestRefresh = vi.fn();
    const onAutoStop = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} onAutoStop={onAutoStop} />);

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => 200,
      set: () => {},
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => 300,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });
    scrollContainer.scrollBy = vi.fn();

    act(() => {
      vi.runOnlyPendingTimers();
    });

    // 1 回ぶんの「新着なし更新」を完了させるヘルパ。
    const runIdleRefreshCycle = () => {
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      fireEvent.click(screen.getByText("新着なしで完了"));
      act(() => {
        vi.runOnlyPendingTimers();
      });
    };

    // 閾値の手前までは停止しない。
    for (let i = 0; i < THREAD_AUTO_REFRESH_IDLE_STOP_COUNT - 1; i += 1) {
      runIdleRefreshCycle();
    }
    expect(onAutoStop).not.toHaveBeenCalled();

    // 閾値ちょうどに達した回で停止する。
    runIdleRefreshCycle();
    expect(onAutoStop).toHaveBeenCalledOnce();
  });

  it("次スレ探索中は新着停止通知を保留する", () => {
    const onRequestRefresh = vi.fn();
    const onAutoStop = vi.fn();
    render(
      <AutoRefreshHarness
        deferAutoStop
        onRequestRefresh={onRequestRefresh}
        onAutoStop={onAutoStop}
      />,
    );

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => 200,
      set: () => {},
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => 300,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });
    scrollContainer.scrollBy = vi.fn();

    act(() => {
      vi.runOnlyPendingTimers();
    });

    for (let i = 0; i < THREAD_AUTO_REFRESH_IDLE_STOP_COUNT; i += 1) {
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      fireEvent.click(screen.getByText("新着なしで完了"));
      act(() => {
        vi.runOnlyPendingTimers();
      });
    }

    expect(onAutoStop).not.toHaveBeenCalled();
  });

  // 累積や経過時間の判定そのものは auto-refresh-idle-stop.test.ts で純関数として検証する。
  // ここではフックへの配線（ON/OFFでの基準時刻の扱い、次スレ探索中の保留）だけを確認する。
  describe("時間ベースの自動停止", () => {
    const IDLE_STOP_TIMEOUT_MS = 9000;

    beforeEach(() => {
      vi.mocked(configMock.get).mockImplementation((key: string) => {
        if (key === "auto_load_idle_stop_timeout") return String(IDLE_STOP_TIMEOUT_MS);
        return "3000";
      });
    });

    // タイマー起点の更新を1回発火させ、指定のボタンで完了させる。
    const runTimerRefreshCycle = (completeButtonLabel: string) => {
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      fireEvent.click(screen.getByText(completeButtonLabel));
      act(() => {
        vi.advanceTimersByTime(0);
      });
    };

    it("ON後に一度も新着がなくても、指定時間が経てば自動停止する", () => {
      const onAutoStop = vi.fn();
      render(<AutoRefreshHarness onRequestRefresh={vi.fn()} onAutoStop={onAutoStop} />);

      // 以前は「最後の新着時刻」が未設定のままだと時間判定自体が行われず、
      // 新着の来ないスレへ通信し続けていた。
      for (let i = 0; i < 3; i += 1) {
        runTimerRefreshCycle("新着なしで完了");
      }
      expect(onAutoStop).not.toHaveBeenCalled();

      for (let i = 0; i < 3; i += 1) {
        runTimerRefreshCycle("新着なしで完了");
      }
      expect(onAutoStop).toHaveBeenCalledOnce();
    });

    it("OFFの間に経過した時間を、再ON後の停止判定へ持ち越さない", () => {
      const onAutoStop = vi.fn();
      const onRequestRefresh = vi.fn();
      const { rerender } = render(
        <AutoRefreshHarness onRequestRefresh={onRequestRefresh} onAutoStop={onAutoStop} />,
      );

      runTimerRefreshCycle("新着ありで完了");

      rerender(
        <AutoRefreshHarness
          enabled={false}
          onRequestRefresh={onRequestRefresh}
          onAutoStop={onAutoStop}
        />,
      );
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      rerender(
        <AutoRefreshHarness enabled onRequestRefresh={onRequestRefresh} onAutoStop={onAutoStop} />,
      );
      // ON 直後の即時更新を完了させる（放置判定の対象外）。
      fireEvent.click(screen.getByText("新着なしで完了"));
      act(() => {
        vi.advanceTimersByTime(0);
      });

      // 前回 ON 中の新着時刻から 60 秒以上経っていても、再 ON 直後の空振りでは止めない。
      runTimerRefreshCycle("新着なしで完了");
      expect(onAutoStop).not.toHaveBeenCalled();
    });
  });
});
