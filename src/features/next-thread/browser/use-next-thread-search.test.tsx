import { act, cleanup, renderHook } from "@testing-library/react";
import {
  type NextThreadSearchState,
  useNextThreadSearch,
} from "src/features/next-thread/browser/use-next-thread-search";
import { container } from "src/service-container/index";
import type { IThread } from "src/service-container/interfaces";
import type { ScopedTabAction } from "src/view/browser/state/tabs/use-tab-store";
import type { Page } from "src/view/browser/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

function createThread(
  overrides: Pick<IThread, "title" | "url"> & Partial<Pick<IThread, "resCount" | "createdAt">>,
): IThread {
  return {
    title: overrides.title,
    url: overrides.url,
    resCount: overrides.resCount ?? 20,
    createdAt: overrides.createdAt ?? 1_700_000_000_000,
  };
}

const viewPage: Page = {
  type: "thread",
  title: "番組実況 2026",
  threadUrl: "https://example.com/test/read.cgi/live/1700000220/",
};
const getThreadsMock = vi.fn();

describe("useNextThreadSearch", () => {
  beforeEach(() => {
    getThreadsMock.mockResolvedValue({
      threads: [
        createThread({
          title: "番組実況 2026 後編A",
          url: "https://example.com/test/read.cgi/live/1700000221/",
        }),
        createThread({
          title: "番組実況 2026 後編B",
          url: "https://example.com/test/read.cgi/live/1700000222/",
        }),
      ],
      message: null,
    });
    container.board = {
      getThreads: getThreadsMock,
      getCachedResCount: vi.fn(),
    };
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("subject.txtを取得して積極判定の候補をすべて表示状態にする", async () => {
    const dispatch = vi.fn<(action: ScopedTabAction) => void>();
    const { result } = renderHook(() =>
      useNextThreadSearch({
        viewPage,
        isActive: true,
        keepAutoRefresh: true,
        dispatch,
      }),
    );

    await act(async () => {
      await result.current.searchNextThread();
    });

    expect(getThreadsMock).toHaveBeenCalledWith("https://example.com/live/");
    expect(result.current.state).toMatchObject<Partial<NextThreadSearchState>>({
      status: "ready",
    });
    expect(result.current.state.candidates).toHaveLength(2);
  });

  it("候補を選ぶと現在タブの次スレ追従actionを送る", async () => {
    const dispatch = vi.fn<(action: ScopedTabAction) => void>();
    const { result } = renderHook(() =>
      useNextThreadSearch({
        viewPage,
        isActive: true,
        keepAutoRefresh: true,
        dispatch,
      }),
    );

    await act(async () => {
      await result.current.searchNextThread();
    });
    const candidate = result.current.state.candidates[0];

    act(() => {
      result.current.selectCandidate(candidate);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "FOLLOW_NEXT_THREAD",
      keepAutoRefresh: true,
      page: {
        type: "thread",
        title: "番組実況 2026 後編A",
        threadUrl: "https://example.com/test/read.cgi/live/1700000221/",
      },
    });
    expect(result.current.state.status).toBe("idle");
  });
});
