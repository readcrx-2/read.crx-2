import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import { useAutoNextThread } from "src/features/next-thread/browser/use-auto-next-thread";
import type { AutoNextThreadMode } from "src/features/next-thread/domain/next-thread-search";
import { container } from "src/service-container/index";
import type { IThread } from "src/service-container/interfaces";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

function createThread(
  overrides: Partial<IThread> & Pick<IThread, "title" | "url" | "resCount" | "createdAt">,
): IThread {
  return {
    title: overrides.title,
    url: overrides.url,
    resCount: overrides.resCount,
    createdAt: overrides.createdAt,
    ng: undefined,
    highlight: undefined,
    isNet: null,
    readState: undefined,
    threadNumber: overrides.threadNumber,
  };
}

function AutoNextThreadHarness({
  autoRefreshEnabled = true,
  featureEnabled = true,
  expired = false,
  responseCount = 1000,
  threadUrl = "https://example.com/test/read.cgi/live/1700000200/",
  threadTitle = "実況スレ Part.20",
  canAutoScroll = true,
  mode = "balanced",
  responseMessages = [],
  searchDurationSeconds,
  skipMoveDelay = true,
  onFollowThread,
  onSearchExhausted,
}: {
  autoRefreshEnabled?: boolean;
  featureEnabled?: boolean;
  expired?: boolean;
  responseCount?: number;
  threadUrl?: string;
  threadTitle?: string;
  canAutoScroll?: boolean;
  mode?: AutoNextThreadMode;
  responseMessages?: readonly string[];
  searchDurationSeconds?: number;
  skipMoveDelay?: boolean;
  onFollowThread: (thread: Pick<IThread, "title" | "url">) => void;
  onSearchExhausted?: () => void;
}) {
  const { status } = useAutoNextThread({
    autoRefreshEnabled,
    featureEnabled,
    threadUrl,
    threadTitle,
    responseCount,
    expired,
    mode,
    responseMessages,
    searchDurationSeconds,
    // 候補の判定テストは実況時と同じ即時移動を使い、確認待ち時間の検証は個別に行う。
    skipMoveDelay,
    canAutoScroll,
    followThread: onFollowThread,
    onSearchExhausted,
  });

  return <output data-testid="status">{status}</output>;
}

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("useAutoNextThread", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    container.toast = {
      notify: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    };
    container.board = {
      getThreads: vi.fn().mockResolvedValue({ threads: [], message: null }),
      getCachedResCount: vi.fn(),
    };
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("標準判定では同じ候補を2回確認してから次スレへ移動する", async () => {
    const onFollowThread = vi.fn();
    const boardGetThreads = vi
      .fn()
      .mockResolvedValueOnce({
        threads: [
          createThread({
            title: "実況スレ Part.20",
            url: "https://example.com/test/read.cgi/live/1700000200/",
            resCount: 1000,
            createdAt: 1_700_000_200_000,
          }),
        ],
        message: null,
      })
      .mockResolvedValue({
        threads: [
          createThread({
            title: "実況スレ Part.20",
            url: "https://example.com/test/read.cgi/live/1700000200/",
            resCount: 1000,
            createdAt: 1_700_000_200_000,
          }),
          createThread({
            title: "実況スレ Part.21",
            url: "https://example.com/test/read.cgi/live/1700000201/",
            resCount: 24,
            createdAt: 1_700_000_201_000,
          }),
        ],
        message: null,
      });

    container.board = {
      getThreads: boardGetThreads,
      getCachedResCount: vi.fn(),
    };

    render(<AutoNextThreadHarness onFollowThread={onFollowThread} />);

    await flushPromises();
    expect(screen.getByTestId("status")).toHaveTextContent("searching");
    expect(boardGetThreads).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    await flushPromises();

    expect(boardGetThreads).toHaveBeenCalledTimes(2);
    expect(onFollowThread).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    await flushPromises();

    expect(boardGetThreads).toHaveBeenCalledTimes(3);
    expect(onFollowThread).toHaveBeenCalledWith({
      title: "実況スレ Part.21",
      url: "https://example.com/test/read.cgi/live/1700000201/",
      resCount: 24,
      createdAt: 1_700_000_201_000,
      ng: undefined,
      highlight: undefined,
      isNet: null,
      readState: undefined,
      threadNumber: undefined,
    });
    // oxlint-disable-next-line unbound-method
    expect(container.toast.info).toHaveBeenCalledWith("次スレへ移動しました: 実況スレ Part.21");
  });

  it("標準の本流監視ではレス増加を2回確認してから移動する", async () => {
    const onFollowThread = vi.fn();
    const originalUrl = "https://example.com/test/read.cgi/live/1700000200/";
    const nextUrl = "https://example.com/test/read.cgi/live/1700000201/";
    const mainstreamUrl = "https://example.com/test/read.cgi/live/1700000202/";
    const originalThread = createThread({
      title: "実況スレ Part.20",
      url: originalUrl,
      resCount: 1000,
      createdAt: 1_700_000_200_000,
    });
    const nextThread = (resCount: number) =>
      createThread({
        title: "実況スレ Part.21",
        url: nextUrl,
        resCount,
        createdAt: 1_700_000_201_000,
      });
    const mainstreamThread = (resCount: number) =>
      createThread({
        title: "実況スレ Part.22",
        url: mainstreamUrl,
        resCount,
        createdAt: 1_700_000_202_000,
      });
    const boardGetThreads = vi
      .fn()
      .mockResolvedValueOnce({ threads: [originalThread], message: null })
      .mockResolvedValueOnce({ threads: [originalThread, nextThread(24)], message: null })
      .mockResolvedValueOnce({ threads: [originalThread, nextThread(24)], message: null })
      .mockResolvedValueOnce({ threads: [nextThread(24), mainstreamThread(20)], message: null })
      .mockResolvedValueOnce({ threads: [nextThread(25), mainstreamThread(35)], message: null })
      .mockResolvedValueOnce({ threads: [nextThread(26), mainstreamThread(50)], message: null });

    container.board = {
      getThreads: boardGetThreads,
      getCachedResCount: vi.fn(),
    };

    const view = render(<AutoNextThreadHarness onFollowThread={onFollowThread} />);

    await flushPromises();
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    await flushPromises();
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    await flushPromises();

    expect(onFollowThread).toHaveBeenCalledWith(expect.objectContaining({ url: nextUrl }));

    view.rerender(
      <AutoNextThreadHarness
        threadUrl={nextUrl}
        threadTitle="実況スレ Part.21"
        responseCount={24}
        onFollowThread={onFollowThread}
      />,
    );
    await flushPromises();

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    await flushPromises();
    expect(onFollowThread).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    await flushPromises();
    expect(onFollowThread).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    await flushPromises();
    expect(onFollowThread).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    await flushPromises();
    expect(onFollowThread).toHaveBeenCalledWith(expect.objectContaining({ url: mainstreamUrl }));
  });

  it("標準判定でも本文で案内された次スレは待たずに移動する", async () => {
    const onFollowThread = vi.fn();
    const nextThreadUrl = "https://example.com/test/read.cgi/live/1700000201/";
    const boardGetThreads = vi.fn().mockResolvedValue({
      threads: [
        createThread({
          title: "試合終了後の緊急特番",
          url: nextThreadUrl,
          resCount: 24,
          createdAt: 1_700_000_201_000,
        }),
      ],
      message: null,
    });

    container.board = {
      getThreads: boardGetThreads,
      getCachedResCount: vi.fn(),
    };

    render(
      <AutoNextThreadHarness
        mode="balanced"
        responseMessages={[`次スレはこちら <a href="${nextThreadUrl}">${nextThreadUrl}</a>`]}
        onFollowThread={onFollowThread}
      />,
    );

    await flushPromises();

    expect(boardGetThreads).toHaveBeenCalledTimes(1);
    expect(onFollowThread).toHaveBeenCalledWith(expect.objectContaining({ url: nextThreadUrl }));
    expect(screen.getByTestId("status")).toHaveTextContent("watching");
  });

  it("600レスでdat落ちしても明示された次スレへ移動する", async () => {
    const onFollowThread = vi.fn();
    const nextThreadUrl = "https://example.com/test/read.cgi/live/1700000201/";
    const boardGetThreads = vi.fn().mockResolvedValue({
      threads: [
        createThread({
          title: "実況スレ Part.20",
          url: "https://example.com/test/read.cgi/live/1700000200/",
          resCount: 1000,
          createdAt: 1_700_000_200_000,
        }),
        createThread({
          title: "緊急避難先",
          url: nextThreadUrl,
          resCount: 24,
          createdAt: 1_700_000_201_000,
        }),
      ],
      message: null,
    });

    container.board = {
      getThreads: boardGetThreads,
      getCachedResCount: vi.fn(),
    };

    render(
      <AutoNextThreadHarness
        expired
        mode="balanced"
        responseCount={600}
        responseMessages={[`次スレはこちら <a href="${nextThreadUrl}">${nextThreadUrl}</a>`]}
        onFollowThread={onFollowThread}
      />,
    );

    await flushPromises();

    expect(screen.getByTestId("status")).toHaveTextContent("watching");
    expect(boardGetThreads).toHaveBeenCalledOnce();
    expect(onFollowThread).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ url: nextThreadUrl }),
    );
  });

  it.each(["機能解除", "自動更新解除"])(
    "%s後に遅れて返った板一覧では探索を再開しない",
    async (stopReason) => {
      const onFollowThread = vi.fn();
      const onSearchExhausted = vi.fn();
      const nextThreadUrl = "https://example.com/test/read.cgi/live/1700000201/";
      let resolveBoardRequest: ((value: { threads: IThread[]; message: null }) => void) | undefined;
      const boardGetThreads = vi.fn(
        () =>
          new Promise<{ threads: IThread[]; message: null }>((resolve) => {
            resolveBoardRequest = resolve;
          }),
      );
      container.board = {
        getThreads: boardGetThreads,
        getCachedResCount: vi.fn(),
      };

      const view = render(
        <AutoNextThreadHarness
          onFollowThread={onFollowThread}
          onSearchExhausted={onSearchExhausted}
        />,
      );
      await flushPromises();
      expect(boardGetThreads).toHaveBeenCalledOnce();

      view.rerender(
        <AutoNextThreadHarness
          featureEnabled={stopReason !== "機能解除"}
          autoRefreshEnabled={stopReason !== "自動更新解除"}
          expired
          responseCount={600}
          onFollowThread={onFollowThread}
          onSearchExhausted={onSearchExhausted}
        />,
      );

      resolveBoardRequest?.({
        threads: [
          createThread({
            title: "実況スレ Part.21",
            url: nextThreadUrl,
            resCount: 24,
            createdAt: 1_700_000_201_000,
          }),
        ],
        message: null,
      });
      await flushPromises();
      await act(async () => vi.advanceTimersByTimeAsync(30_000));

      expect(boardGetThreads).toHaveBeenCalledOnce();
      expect(screen.getByTestId("status")).toHaveTextContent("idle");
      expect(onFollowThread).not.toHaveBeenCalled();
      expect(onSearchExhausted).not.toHaveBeenCalled();
    },
  );

  it.each([
    { duration: 60, responseCount: 600 },
    { duration: 180, responseCount: 600 },
    { duration: 180, responseCount: 1000 },
  ])(
    "$responseCountレスのdat落ち後は最初の30秒を3秒ごと、その後は10秒ごとに探索し、$duration秒で終了する",
    async ({ duration, responseCount }) => {
      const onFollowThread = vi.fn();
      const onSearchExhausted = vi.fn();
      const boardGetThreads = vi.fn().mockResolvedValue({ threads: [], message: null });
      container.board = { getThreads: boardGetThreads, getCachedResCount: vi.fn() };
      const view = render(
        <AutoNextThreadHarness
          expired
          responseCount={responseCount}
          searchDurationSeconds={duration === 180 ? undefined : duration}
          onFollowThread={onFollowThread}
          onSearchExhausted={onSearchExhausted}
        />,
      );
      await flushPromises();
      await act(async () => vi.advanceTimersByTimeAsync(duration * 1000 - 1));
      expect(screen.getByTestId("status")).toHaveTextContent("searching");
      const expectedRequestCount = 11 + Math.floor((duration - 31) / 10);
      expect(boardGetThreads).toHaveBeenCalledTimes(expectedRequestCount);
      expect(onSearchExhausted).not.toHaveBeenCalled();

      await act(async () => vi.advanceTimersByTimeAsync(1));
      expect(screen.getByTestId("status")).toHaveTextContent("idle");
      expect(onSearchExhausted).toHaveBeenCalledOnce();
      // 期限後に開始を繰り返しても、同じ満了スレの探索は再起動しない。
      for (let attempt = 0; attempt < 10; attempt++) {
        view.rerender(
          <AutoNextThreadHarness
            expired
            responseCount={responseCount}
            autoRefreshEnabled={attempt % 2 === 1}
            onFollowThread={onFollowThread}
            onSearchExhausted={onSearchExhausted}
          />,
        );
      }
      await act(async () => vi.advanceTimersByTimeAsync(60_000));
      expect(boardGetThreads).toHaveBeenCalledTimes(expectedRequestCount);
      expect(onSearchExhausted).toHaveBeenCalledOnce();
      expect(onFollowThread).not.toHaveBeenCalled();
    },
  );

  it("600レスの取得中にdat落ちへ変わったときから探索期限を数える", async () => {
    const onFollowThread = vi.fn();
    const onSearchExhausted = vi.fn();
    const props = { responseCount: 600, onFollowThread, onSearchExhausted };
    const view = render(<AutoNextThreadHarness {...props} />);
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(container.board.getThreads).not.toHaveBeenCalled();
    view.rerender(<AutoNextThreadHarness {...props} expired />);
    await flushPromises();
    expect(container.board.getThreads).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTimeAsync(179_999));
    expect(onSearchExhausted).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(onSearchExhausted).toHaveBeenCalledOnce();
  });

  it("満了前は探索せず、1000到達後のdat落ちやON連打でも間隔と期限を維持する", async () => {
    const onFollowThread = vi.fn();
    const onSearchExhausted = vi.fn();
    const boardGetThreads = vi.fn().mockResolvedValue({ threads: [], message: null });
    container.board = { getThreads: boardGetThreads, getCachedResCount: vi.fn() };
    const props = { onFollowThread, onSearchExhausted, searchDurationSeconds: 60 };
    const view = render(<AutoNextThreadHarness {...props} responseCount={999} />);
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(boardGetThreads).not.toHaveBeenCalled();
    view.rerender(<AutoNextThreadHarness {...props} />);
    await flushPromises();
    expect(boardGetThreads).toHaveBeenCalledOnce();

    for (let attempt = 0; attempt < 10; attempt++) {
      view.rerender(
        <AutoNextThreadHarness {...props} expired autoRefreshEnabled={attempt % 2 === 1} />,
      );
      await flushPromises();
    }
    expect(boardGetThreads).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    // 設定や表示条件が変わっても、実行中の探索の期限を延ばさない。
    view.rerender(<AutoNextThreadHarness {...props} canAutoScroll={false} />);
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    view.rerender(
      <AutoNextThreadHarness {...props} searchDurationSeconds={600} mode="aggressive" />,
    );
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    expect(onSearchExhausted).toHaveBeenCalledOnce();
    expect(screen.getByTestId("status")).toHaveTextContent("idle");
    expect(onFollowThread).not.toHaveBeenCalled();
  });

  it.each(["読書位置", "OFF操作"])(
    "%sで探索を一時停止したままでも、元の期限で終了する",
    async (pauseReason) => {
      const boardGetThreads = vi.fn().mockResolvedValue({ threads: [], message: null });
      container.board = { getThreads: boardGetThreads, getCachedResCount: vi.fn() };
      const onSearchExhausted = vi.fn();
      const onFollowThread = vi.fn();
      const props = { onSearchExhausted, onFollowThread, searchDurationSeconds: 60 };
      const view = render(<AutoNextThreadHarness {...props} />);
      await act(async () => vi.advanceTimersByTimeAsync(10_000));
      const requestCount = boardGetThreads.mock.calls.length;
      view.rerender(
        <AutoNextThreadHarness
          {...props}
          canAutoScroll={pauseReason !== "読書位置"}
          autoRefreshEnabled={pauseReason !== "OFF操作"}
        />,
      );
      await act(async () => vi.advanceTimersByTimeAsync(50_000));
      expect(onSearchExhausted).toHaveBeenCalledOnce();
      expect(screen.getByTestId("status")).toHaveTextContent("idle");
      expect(boardGetThreads).toHaveBeenCalledTimes(requestCount);
      view.rerender(<AutoNextThreadHarness {...props} />);
      await act(async () => vi.advanceTimersByTimeAsync(10_000));
      expect(boardGetThreads).toHaveBeenCalledTimes(requestCount);
      expect(onSearchExhausted).toHaveBeenCalledOnce();
    },
  );

  it("取得待ちの開始連打でリクエストを重ねず、期限後に返る候補でも移動しない", async () => {
    let resolveRequest: ((result: { threads: IThread[]; message: null }) => void) | undefined;
    const boardGetThreads = vi.fn(
      () =>
        new Promise<{ threads: IThread[]; message: null }>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    container.board = { getThreads: boardGetThreads, getCachedResCount: vi.fn() };
    const onFollowThread = vi.fn();
    const onSearchExhausted = vi.fn();
    const props = {
      onFollowThread,
      onSearchExhausted,
      searchDurationSeconds: 60,
      mode: "aggressive" as const,
    };
    const view = render(<AutoNextThreadHarness {...props} />);
    for (let attempt = 0; attempt < 20; attempt++) {
      view.rerender(<AutoNextThreadHarness {...props} autoRefreshEnabled={attempt % 2 === 1} />);
    }
    expect(boardGetThreads).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(onSearchExhausted).toHaveBeenCalledOnce();
    expect(screen.getByTestId("status")).toHaveTextContent("idle");
    resolveRequest?.({
      threads: [
        createThread({
          title: "実況スレ Part.21",
          url: "https://example.com/test/read.cgi/live/1700000201/",
          resCount: 20,
          createdAt: 1_700_000_201_000,
        }),
      ],
      message: null,
    });
    await flushPromises();
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(boardGetThreads).toHaveBeenCalledOnce();
    expect(onFollowThread).not.toHaveBeenCalled();
  });

  it("候補が期限内に見つかれば探索を終え、確認待ち中に探索期限で停止しない", async () => {
    const boardGetThreads = vi.fn().mockResolvedValue({
      threads: [
        createThread({
          title: "実況スレ Part.21",
          url: "https://example.com/test/read.cgi/live/1700000201/",
          resCount: 20,
          createdAt: 1_700_000_201_000,
        }),
      ],
      message: null,
    });
    container.board = { getThreads: boardGetThreads, getCachedResCount: vi.fn() };
    const onFollowThread = vi.fn();
    const onSearchExhausted = vi.fn();
    render(
      <AutoNextThreadHarness
        mode="aggressive"
        skipMoveDelay={false}
        searchDurationSeconds={60}
        onFollowThread={onFollowThread}
        onSearchExhausted={onSearchExhausted}
      />,
    );
    await flushPromises();
    expect(screen.getByTestId("status")).toHaveTextContent("confirming");
    expect(onFollowThread).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(onFollowThread).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(boardGetThreads).toHaveBeenCalledOnce();
    expect(onSearchExhausted).not.toHaveBeenCalled();
  });

  it("機能が無効な間は検索を開始しない", async () => {
    const onFollowThread = vi.fn();
    const boardGetThreads = vi.fn();

    container.board = {
      getThreads: boardGetThreads,
      getCachedResCount: vi.fn(),
    };

    render(<AutoNextThreadHarness featureEnabled={false} onFollowThread={onFollowThread} />);

    await flushPromises();

    expect(screen.getByTestId("status")).toHaveTextContent("idle");
    expect(boardGetThreads).not.toHaveBeenCalled();
    expect(onFollowThread).not.toHaveBeenCalled();
  });

  // スコア判定が正しくても、実際の探索では確認回数や非同期応答によって誤移動し得るため別に検証する。
  it.each([
    { mode: "balanced" as const, confirmations: 2 },
    { mode: "aggressive" as const, confirmations: 1 },
  ])("$modeでは同じ候補を$confirmations回確認して移動する", async ({ mode, confirmations }) => {
    const candidate = createThread({
      title: "架空の月面探検隊 ★2",
      url: "https://example.com/test/read.cgi/live/1700000201/",
      resCount: 20,
      createdAt: 1_700_000_201_000,
    });
    const getThreads = vi.fn().mockResolvedValue({ threads: [candidate], message: null });
    container.board = { getThreads, getCachedResCount: vi.fn() };
    const onFollowThread = vi.fn();
    render(
      <AutoNextThreadHarness
        mode={mode}
        threadTitle="架空の月面探検隊 ★1"
        onFollowThread={onFollowThread}
      />,
    );
    await flushPromises();
    for (let confirmation = 1; confirmation < confirmations; confirmation++) {
      expect(onFollowThread).not.toHaveBeenCalled();
      await act(async () => vi.advanceTimersByTimeAsync(3000));
    }
    expect(getThreads).toHaveBeenCalledTimes(confirmations);
    expect(onFollowThread).toHaveBeenCalledOnce();
    expect(onFollowThread).toHaveBeenCalledWith(expect.objectContaining({ url: candidate.url }));
  });

  it.each(["入れ替わる", "消える"])(
    "標準判定では途中で候補が%sと確認回数を引き継がない",
    async (change) => {
      const first = createThread({
        title: "架空の月面探検隊 ★2",
        url: "https://example.com/test/read.cgi/live/1700000201/",
        resCount: 20,
        createdAt: 1_700_000_201_000,
      });
      const second = { ...first, url: "https://example.com/test/read.cgi/live/1700000202/" };
      const expected = change === "入れ替わる" ? second : first;
      const getThreads = vi
        .fn()
        .mockResolvedValueOnce({ threads: [first], message: null })
        .mockResolvedValueOnce({ threads: change === "入れ替わる" ? [second] : [], message: null })
        .mockResolvedValue({ threads: [expected], message: null });
      container.board = { getThreads, getCachedResCount: vi.fn() };
      const onFollowThread = vi.fn();
      render(
        <AutoNextThreadHarness threadTitle="架空の月面探検隊 ★1" onFollowThread={onFollowThread} />,
      );
      await flushPromises();
      const requestsBeforeMove = change === "入れ替わる" ? 2 : 3;
      for (let request = 1; request < requestsBeforeMove; request++) {
        await act(async () => vi.advanceTimersByTimeAsync(3000));
        expect(onFollowThread).not.toHaveBeenCalled();
      }
      await act(async () => vi.advanceTimersByTimeAsync(3000));
      expect(onFollowThread).toHaveBeenCalledOnce();
      expect(onFollowThread).toHaveBeenCalledWith(expect.objectContaining({ url: expected.url }));
    },
  );

  it.each(["スレ変更", "画面破棄"])("取得待ち中の%s後に古い結果で移動しない", async (change) => {
    let resolveRequest: ((result: { threads: IThread[]; message: null }) => void) | undefined;
    const getThreads = vi.fn(
      () =>
        new Promise<{ threads: IThread[]; message: null }>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    container.board = { getThreads, getCachedResCount: vi.fn() };
    const onFollowThread = vi.fn();
    const view = render(
      <AutoNextThreadHarness mode="aggressive" onFollowThread={onFollowThread} />,
    );
    if (change === "スレ変更") {
      view.rerender(
        <AutoNextThreadHarness
          mode="aggressive"
          threadUrl="https://example.com/test/read.cgi/live/1700000300/"
          responseCount={10}
          onFollowThread={onFollowThread}
        />,
      );
    } else {
      view.unmount();
    }
    resolveRequest?.({
      threads: [
        createThread({
          title: "実況スレ Part.21",
          url: "https://example.com/test/read.cgi/live/1700000201/",
          resCount: 20,
          createdAt: 1_700_000_201_000,
        }),
      ],
      message: null,
    });
    await flushPromises();
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(onFollowThread).not.toHaveBeenCalled();
    expect(getThreads).toHaveBeenCalledOnce();
  });

  it("確認待ち中に上のレスを読みに戻ったら自動移動せず、追従位置で再開する", async () => {
    const candidate = createThread({
      title: "架空の月面探検隊 ★2",
      url: "https://example.com/test/read.cgi/live/1700000201/",
      resCount: 20,
      createdAt: 1_700_000_201_000,
    });
    container.board = {
      getThreads: vi.fn().mockResolvedValue({ threads: [candidate], message: null }),
      getCachedResCount: vi.fn(),
    };
    const onFollowThread = vi.fn();
    const props = {
      mode: "aggressive" as const,
      skipMoveDelay: false,
      threadTitle: "架空の月面探検隊 ★1",
      onFollowThread,
    };
    const view = render(<AutoNextThreadHarness {...props} />);
    await flushPromises();
    expect(screen.getByTestId("status")).toHaveTextContent("confirming");
    view.rerender(<AutoNextThreadHarness {...props} canAutoScroll={false} />);
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(onFollowThread).not.toHaveBeenCalled();
    view.rerender(<AutoNextThreadHarness {...props} canAutoScroll />);
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(onFollowThread).toHaveBeenCalledOnce();
  });
});
