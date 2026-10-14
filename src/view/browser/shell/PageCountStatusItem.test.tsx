import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { StatusBar, StatusBarProvider } from "src/view/browser/components/StatusBar";
import {
  getThreadListPageCountKey,
  getThreadPageCountKey,
  PageCountStatusProvider,
  usePageCountStatus,
} from "src/view/browser/hooks/use-page-count-status";
import type { Page } from "src/view/browser/types";
import { THREAD_FILTER_TOOLBAR_TOGGLE_EVENT } from "src/view/browser/utils/filter-toolbar-events";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { PageCountStatusItem } from "./PageCountStatusItem";

const { activePageRef } = vi.hoisted(() => ({
  activePageRef: {
    current: {
      type: "threadList" as const,
      boardUrl: "https://example.com/board/",
      title: "板",
      boardTitle: "板",
    } as Page,
  },
}));

vi.mock("src/features/tabs/browser/use-tab-store", () => ({
  useTabStore: () => ({
    viewTab: { id: "tab-1" },
    viewPage: activePageRef.current,
  }),
}));

function CountWriter({ kind, count }: { kind: "thread" | "threadList"; count: number }): null {
  const { setPageCount } = usePageCountStatus();
  const key =
    kind === "threadList"
      ? getThreadListPageCountKey("tab-1", "https://example.com/board/")
      : getThreadPageCountKey("tab-1", "https://example.com/test/read.cgi/board/1/");

  useEffect(() => {
    setPageCount(key, { kind, count });
    return () => setPageCount(key, null);
  }, [count, key, kind, setPageCount]);

  return null;
}

function renderStatusBar(kind: "thread" | "threadList", count: number): void {
  activePageRef.current =
    kind === "threadList"
      ? {
          type: "threadList",
          boardUrl: "https://example.com/board/",
          title: "板",
          boardTitle: "板",
        }
      : {
          type: "thread",
          threadUrl: "https://example.com/test/read.cgi/board/1/",
          title: "スレ",
        };

  render(
    <StatusBarProvider>
      <PageCountStatusProvider>
        <CountWriter kind={kind} count={count} />
        <PageCountStatusItem />
        <StatusBar />
      </PageCountStatusProvider>
    </StatusBarProvider>,
  );
}

describe("PageCountStatusItem", () => {
  afterEach(() => cleanup());

  it("スレ一覧では表示中のスレ数を表示する", async () => {
    renderStatusBar("threadList", 42);

    await waitFor(() => {
      expect(screen.getByText("42スレ")).toBeInTheDocument();
      expect(screen.getByLabelText("現在のスレ数: 42スレ")).toBeInTheDocument();
    });
  });

  it("スレでは取得済みのレス数を表示する", async () => {
    renderStatusBar("thread", 128);

    await waitFor(() => {
      expect(screen.getByText("128レス")).toBeInTheDocument();
      expect(screen.getByLabelText("現在のレス数: 128レス")).toBeInTheDocument();
    });
  });

  it("スレのレス数をクリックすると対象タブのフィルタバーを開く", async () => {
    renderStatusBar("thread", 128);

    const listener = vi.fn<(event: Event) => void>();
    window.addEventListener(THREAD_FILTER_TOOLBAR_TOGGLE_EVENT, listener);

    try {
      const countButton = await screen.findByRole("button", { name: "現在のレス数: 128レス" });
      fireEvent.click(countButton);

      const receivedEvent = listener.mock.calls[0]?.[0];
      if (receivedEvent == null) {
        throw new Error("フィルタバーを開くイベントが発生しませんでした");
      }
      expect(receivedEvent).toBeInstanceOf(CustomEvent);
      expect((receivedEvent as CustomEvent<{ tabId: string }>).detail).toEqual({ tabId: "tab-1" });
    } finally {
      window.removeEventListener(THREAD_FILTER_TOOLBAR_TOGGLE_EVENT, listener);
    }
  });
});
