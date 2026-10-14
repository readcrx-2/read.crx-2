import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IkioiStatusItem } from "src/features/thread/ui/IkioiStatusItem";
import { container } from "src/service-container/index";
import { StatusBar, StatusBarProvider } from "src/view/browser/components/StatusBar";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  viewTab: {
    reloadKey: 0,
  },
  viewPage: {
    type: "thread",
    title: "スレッド",
    threadUrl: "https://example.com/test/read.cgi/software/1/",
  },
}));

vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabStore: () => ({
    viewTab: mocks.viewTab,
    viewPage: mocks.viewPage,
  }),
}));

function renderItem(): void {
  render(
    <StatusBarProvider>
      <IkioiStatusItem />
      <StatusBar />
    </StatusBarProvider>,
  );
}

function createRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 120,
    bottom: 144,
    left: 48,
    right: 160,
    width: 112,
    height: 24,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("IkioiStatusItem", () => {
  beforeEach(() => {
    mocks.viewTab = {
      reloadKey: 0,
    };
    mocks.viewPage = {
      type: "thread",
      title: "スレッド",
      threadUrl: "https://example.com/test/read.cgi/software/1/",
    };

    container.thread = {
      getThread: vi.fn(async () => ({
        url: mocks.viewPage.type === "thread" ? mocks.viewPage.threadUrl : "",
        title: "スレッド",
        res: [
          {
            num: 1,
            name: "a",
            mail: "",
            date: "",
            other: "2026/05/01(金) 10:00:00",
            message: "x",
          },
          {
            num: 2,
            name: "b",
            mail: "",
            date: "",
            other: "2026/05/01(金) 10:10:00",
            message: "y",
          },
        ],
      })),
    };
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("スレッドページでは炎アイコンと勢い数値を表示する", async () => {
    renderItem();

    await waitFor(() => {
      const label = screen.getByLabelText(/勢い/).getAttribute("aria-label") ?? "";
      expect(label).not.toContain("...");
    });

    expect(screen.getByLabelText(/勢い/)).toBeInTheDocument();
  });

  it("勢いをクリックするとミニウィンドウに勢いグラフを表示する", async () => {
    renderItem();

    const button = screen.getByRole("button", { name: /勢い/ });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: () => createRect(),
    });

    fireEvent.click(button);

    expect(screen.getByText("勢いグラフ")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "勢い推移グラフ" })).toBeInTheDocument();
  });

  it("スレッド以外では表示しない", () => {
    mocks.viewPage = {
      type: "boardList",
      title: "ホーム",
      threadUrl: "",
    };

    renderItem();

    expect(screen.queryByLabelText(/勢い/)).toBeNull();
  });
});
