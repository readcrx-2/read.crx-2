import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { useThreadTopBar } from "src/view/browser/pages/thread/use-thread-top-bar";
import type { ThreadFilter } from "src/view/browser/types";
import { THREAD_FILTER_TOOLBAR_TOGGLE_EVENT } from "src/view/browser/utils/filter-toolbar-events";
import { afterEach, describe, expect, it } from "vite-plus/test";

function TopBarHarness({
  isActive = true,
  tabId = "tab-1",
  openByDefault = false,
}: {
  isActive?: boolean;
  tabId?: string;
  openByDefault?: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<ThreadFilter>("all");
  const {
    activeTopBar,
    closeTopBar,
    closeTopBarPreservingFilter,
    openFilterToolbar,
    searchFocusKey,
    suppressInitialFocus,
  } = useThreadTopBar({
    tabId,
    isActive,
    searchQuery,
    setSearchQuery,
    clearFilter: () => setFilter("all"),
    openByDefault,
  });

  return (
    <div>
      <output data-testid="active-top-bar">{activeTopBar}</output>
      <output data-testid="search-focus-key">{searchFocusKey}</output>
      <output data-testid="suppress-initial-focus">{String(suppressInitialFocus)}</output>
      <output data-testid="search-query">{searchQuery}</output>
      <output data-testid="filter">{filter}</output>
      <button onClick={() => setSearchQuery("abc")}>set query</button>
      <button onClick={() => setFilter("image")}>set filter</button>
      <button onClick={closeTopBar}>close</button>
      <button onClick={closeTopBarPreservingFilter}>wheel close</button>
      <button onClick={openFilterToolbar}>open filter</button>
    </div>
  );
}

describe("useThreadTopBar", () => {
  afterEach(() => {
    cleanup();
  });

  it("既定で開く設定のときは開いた状態で始まり、入力欄へのフォーカスを抑える", () => {
    render(<TopBarHarness openByDefault />);

    expect(screen.getByTestId("active-top-bar")).toHaveTextContent("filter");
    expect(screen.getByTestId("suppress-initial-focus")).toHaveTextContent("true");
  });

  it("既定で開く設定でも、閉じて開き直した後は通常どおりフォーカスする", () => {
    render(<TopBarHarness openByDefault />);

    fireEvent.click(screen.getByRole("button", { name: "close" }));
    fireEvent.click(screen.getByRole("button", { name: "open filter" }));

    expect(screen.getByTestId("active-top-bar")).toHaveTextContent("filter");
    expect(screen.getByTestId("suppress-initial-focus")).toHaveTextContent("false");
  });

  it("設定が無いときは閉じた状態で始まる", () => {
    render(<TopBarHarness />);

    expect(screen.getByTestId("active-top-bar")).toHaveTextContent("none");
  });

  it("検索イベントでフィルタバーを開いて検索focusキーを更新する", () => {
    render(<TopBarHarness />);

    act(() => {
      window.dispatchEvent(new window.CustomEvent("thread-search-toggle"));
    });

    expect(screen.getByTestId("active-top-bar")).toHaveTextContent("filter");
    expect(screen.getByTestId("search-focus-key")).toHaveTextContent("1");
  });

  it("バーを閉じた時に隠れた検索語をクリアする", () => {
    render(<TopBarHarness />);

    act(() => {
      window.dispatchEvent(new window.CustomEvent("thread-search-toggle"));
    });
    fireEvent.click(screen.getByRole("button", { name: "set query" }));
    fireEvent.click(screen.getByRole("button", { name: "set filter" }));

    expect(screen.getByTestId("search-query")).toHaveTextContent("abc");

    fireEvent.click(screen.getByRole("button", { name: "close" }));

    expect(screen.getByTestId("active-top-bar")).toHaveTextContent("none");
    expect(screen.getByTestId("search-query")).toBeEmptyDOMElement();
    expect(screen.getByTestId("filter")).toHaveTextContent("all");
  });

  it("明示openでは閉じ戻らずフィルタバーを開く", () => {
    render(<TopBarHarness />);

    fireEvent.click(screen.getByRole("button", { name: "open filter" }));
    fireEvent.click(screen.getByRole("button", { name: "open filter" }));

    expect(screen.getByTestId("active-top-bar")).toHaveTextContent("filter");
  });

  it("対象タブへのフィルタバートグルイベントでフィルタバーを開閉する", () => {
    render(<TopBarHarness />);

    fireEvent.click(screen.getByRole("button", { name: "set filter" }));

    act(() => {
      window.dispatchEvent(
        new window.CustomEvent(THREAD_FILTER_TOOLBAR_TOGGLE_EVENT, {
          detail: { tabId: "tab-1" },
        }),
      );
    });

    expect(screen.getByTestId("active-top-bar")).toHaveTextContent("filter");

    act(() => {
      window.dispatchEvent(
        new window.CustomEvent(THREAD_FILTER_TOOLBAR_TOGGLE_EVENT, {
          detail: { tabId: "tab-1" },
        }),
      );
    });

    expect(screen.getByTestId("active-top-bar")).toHaveTextContent("none");
    expect(screen.getByTestId("filter")).toHaveTextContent("all");
  });

  it("別タブや非アクティブなスレッドにはトグルイベントを届けない", () => {
    render(
      <>
        <TopBarHarness />
        <TopBarHarness isActive={false} tabId="tab-2" />
      </>,
    );

    act(() => {
      window.dispatchEvent(
        new window.CustomEvent(THREAD_FILTER_TOOLBAR_TOGGLE_EVENT, {
          detail: { tabId: "tab-2" },
        }),
      );
    });

    expect(screen.getAllByTestId("active-top-bar")[0]).toHaveTextContent("none");
    expect(screen.getAllByTestId("active-top-bar")[1]).toHaveTextContent("none");
  });

  it("ホイール相当のクローズでは検索語による絞り込みを維持する", () => {
    render(<TopBarHarness />);

    fireEvent.click(screen.getByRole("button", { name: "open filter" }));
    fireEvent.click(screen.getByRole("button", { name: "set query" }));
    fireEvent.click(screen.getByRole("button", { name: "wheel close" }));

    expect(screen.getByTestId("active-top-bar")).toHaveTextContent("none");
    expect(screen.getByTestId("search-query")).toHaveTextContent("abc");
  });
});
