import { act, cleanup, renderHook } from "@testing-library/react";
import { useBoardListDisplay } from "src/view/browser/pages/board-list/use-board-list-display";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { updateViewState } = vi.hoisted(() => ({ updateViewState: vi.fn() }));
vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabViewState: () => ({ state: {}, update: updateViewState }),
}));

afterEach(cleanup);

describe("板一覧の検索と開閉状態の復元", () => {
  it("検索終了の更新が遅れて実行されても、検索前の開閉状態を返す", () => {
    const saved = { メニュー: true, "メニュー:カテゴリ": false };
    const updates: ((prev: Record<string, boolean>) => Record<string, boolean>)[] = [];
    const { result } = renderHook(() =>
      useBoardListDisplay({
        tabId: "tab-1",
        categories: [
          {
            name: "メニュー",
            categories: [
              {
                name: "カテゴリ",
                boards: [{ name: "サンプル板", url: "https://example.com/sample/" }],
              },
            ],
          },
        ],
        openStates: saved,
        removedBoardUrls: new Set(),
        removedMenuNames: new Set(),
        removedCategoryIds: new Set(),
        openedBoardEntries: [],
        updateOpenStates: (updater) => updates.push(updater),
      }),
    );
    act(() => result.current.setSearchQuery("サンプル"));
    const expanded = updates.at(-1)!(saved);
    expect(expanded).toEqual({ メニュー: true, "メニュー:カテゴリ": true });
    act(() => result.current.setSearchQuery(""));
    // Reactが更新関数を処理する時点では、検索用refがすでに解除されていても復元できる。
    expect(updates.at(-1)!(expanded)).toEqual(saved);
    expect(JSON.stringify(updates.at(-1)!(expanded))).not.toBe("null");
  });
});
