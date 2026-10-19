import "@testing-library/jest-dom/vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThreadPageTopBar } from "src/view/browser/pages/thread/ThreadPageTopBar";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const COUNTS = { popular: 2, image: 3, video: 0, link: 9 };

const threadPageCss = readFileSync(resolve("src/view/browser/styles/pages/ThreadPage.css"), "utf8");

describe("ThreadPageTopBar", () => {
  afterEach(() => {
    cleanup();
  });

  it("検索欄の左端に検索対象を表示し、初期値をすべてにする", () => {
    render(
      <ThreadPageTopBar
        activeTopBar="filter"
        filter="all"
        filterCounts={COUNTS}
        onClose={vi.fn()}
        onFilterChange={vi.fn()}
        onSearchTargetChange={vi.fn()}
        onSearchQueryChange={vi.fn()}
        searchFocusKey={0}
        searchQuery=""
        searchTarget="all"
      />,
    );

    const searchTarget = screen.getByRole("combobox", { name: "検索対象" });
    expect(searchTarget).toHaveValue("all");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "すべて",
      "本文",
      "名前",
      "ID",
    ]);
  });

  it("検索対象の変更を親へ通知する", () => {
    const onSearchTargetChange = vi.fn();
    render(
      <ThreadPageTopBar
        activeTopBar="filter"
        filter="all"
        filterCounts={COUNTS}
        onClose={vi.fn()}
        onFilterChange={vi.fn()}
        onSearchTargetChange={onSearchTargetChange}
        onSearchQueryChange={vi.fn()}
        searchFocusKey={0}
        searchQuery=""
        searchTarget="all"
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "検索対象" }), {
      target: { value: "name" },
    });

    expect(onSearchTargetChange).toHaveBeenCalledWith("name");
  });

  it("ミニマップの予約幅で検索フィルタを狭めない", () => {
    const minimapReservationSelectors =
      threadPageCss.match(/\.thread-page--with-minimap[^{}]*(?=\{)/)?.[0] ?? "";

    expect(minimapReservationSelectors).toContain(".thread-page__notice");
    expect(minimapReservationSelectors).toContain(".thread-page__responses");
    expect(minimapReservationSelectors).toContain(".thread-page__auto-scroll-threshold");
    expect(minimapReservationSelectors).not.toContain(".thread-page__top-bar");
    expect(minimapReservationSelectors).not.toContain(".thread-page__toolbar");
  });

  it("フィルタ項目に件数を添え、該当なしの項目は薄く表示する", () => {
    render(
      <ThreadPageTopBar
        activeTopBar="filter"
        filter="all"
        filterCounts={COUNTS}
        onClose={vi.fn()}
        onFilterChange={vi.fn()}
        onSearchTargetChange={vi.fn()}
        onSearchQueryChange={vi.fn()}
        searchFocusKey={0}
        searchQuery=""
        searchTarget="all"
      />,
    );

    expect(screen.getByRole("button", { name: /^画像\s*3$/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^外部\s*9$/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^動画\s*0$/u })).toHaveClass(
      "thread-page__filter-btn--empty",
    );
    expect(screen.queryByRole("button", { name: /全て/u })).not.toBeInTheDocument();
  });

  it("選択中のフィルタ項目をもう一度押すと解除する", () => {
    const onFilterChange = vi.fn();
    render(
      <ThreadPageTopBar
        activeTopBar="filter"
        filter="image"
        filterCounts={COUNTS}
        onClose={vi.fn()}
        onFilterChange={onFilterChange}
        onSearchTargetChange={vi.fn()}
        onSearchQueryChange={vi.fn()}
        searchFocusKey={0}
        searchQuery=""
        searchTarget="all"
      />,
    );

    const image = screen.getByRole("button", { name: /^画像\s*3$/u });
    expect(image).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(image);
    expect(onFilterChange).toHaveBeenLastCalledWith("all");

    fireEvent.click(screen.getByRole("button", { name: /^人気\s*2$/u }));
    expect(onFilterChange).toHaveBeenLastCalledWith("popular");
  });

  it("文字入力欄でEscapeを押すとバーを閉じる", () => {
    const onClose = vi.fn();
    render(
      <ThreadPageTopBar
        activeTopBar="filter"
        filter="all"
        filterCounts={COUNTS}
        onClose={onClose}
        onFilterChange={vi.fn()}
        onSearchTargetChange={vi.fn()}
        onSearchQueryChange={vi.fn()}
        searchFocusKey={0}
        searchQuery=""
        searchTarget="all"
      />,
    );

    fireEvent.keyDown(screen.getByPlaceholderText("フィルタする文字を入力"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
