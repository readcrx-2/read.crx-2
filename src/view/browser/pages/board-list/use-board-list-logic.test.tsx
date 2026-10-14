import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useBoardListDisplay } from "src/view/browser/pages/board-list/use-board-list-display";
import { useBoardListLogic } from "src/view/browser/pages/board-list/use-board-list-logic";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { config, setConfig, updateViewState, warn, persistedViewState } = vi.hoisted(() => ({
  config: new Map<string, string>(),
  setConfig: vi.fn(),
  updateViewState: vi.fn(),
  warn: vi.fn(),
  persistedViewState: { searchQuery: "" },
}));
vi.mock("src/app/logger", () => ({ createLogger: () => ({ warn, error: vi.fn() }) }));
vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabViewState: () => ({ state: persistedViewState, update: updateViewState }),
}));
vi.mock("src/service-container/index", () => ({
  container: {
    config: { get: (key: string) => config.get(key) ?? null, set: setConfig },
    message: { on: vi.fn(), off: vi.fn() },
    bbsMenu: {
      get: vi.fn(async () => ({
        status: "success",
        menu: [
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
      })),
    },
  },
}));

describe("板一覧の保存設定とフィルタの復元", () => {
  beforeEach(() => {
    config.clear();
    persistedViewState.searchQuery = "";
    warn.mockClear();
    setConfig.mockReset().mockImplementation((key: string, value: string) => {
      config.set(key, value);
    });
  });
  afterEach(cleanup);

  function useBoardList() {
    const logic = useBoardListLogic();
    const display = useBoardListDisplay({ ...logic, tabId: "tab-1" });
    return { ...logic, ...display };
  }

  it.each(["null", "[]", "true", '"開く"', "破損JSON"])(
    "保存済みの不正な開閉設定からでも板一覧を開いて検索できる: %s",
    async (raw) => {
      config.set("board_list_open_states", raw);
      const { result } = renderHook(useBoardList);
      await waitFor(() => expect(result.current.displayMenus).toHaveLength(1));
      expect(result.current.openStates).toEqual({});
      expect(warn).toHaveBeenCalled();
      act(() => result.current.setSearchQuery("サンプル"));
      await waitFor(() => expect(result.current.openedMenuValues).toEqual(["メニュー"]));
      act(() => result.current.setSearchQuery(""));
      await waitFor(() => expect(result.current.openStates).toEqual({}));
      expect(JSON.parse(config.get("board_list_open_states")!)).toEqual({});
    },
  );

  it("フィルタを繰り返しても元の開閉設定を保存し、再起動後も一覧を表示する", async () => {
    const saved = { メニュー: true, "メニュー:カテゴリ": false };
    config.set("board_list_open_states", JSON.stringify(saved));
    const first = renderHook(useBoardList);
    await waitFor(() => expect(first.result.current.displayMenus).toHaveLength(1));
    for (const query of ["サンプル", "カテゴリ", "一致しない検索"]) {
      act(() => first.result.current.setSearchQuery(query));
      act(() => first.result.current.setSearchQuery(""));
      await waitFor(() => expect(first.result.current.openStates).toEqual(saved));
      expect(JSON.parse(config.get("board_list_open_states")!)).toEqual(saved);
    }
    first.unmount();
    const restarted = renderHook(useBoardList);
    await waitFor(() => expect(restarted.result.current.openedMenuValues).toEqual(["メニュー"]));
    expect(restarted.result.current.openStates).toEqual(saved);
  });

  it("開閉設定の真偽値だけを復元し、不正な項目をログへ出す", async () => {
    config.set(
      "board_list_open_states",
      JSON.stringify({ メニュー: true, "メニュー:カテゴリ": false, 不正: "false" }),
    );
    const { result } = renderHook(useBoardList);
    await waitFor(() => expect(result.current.displayMenus).toHaveLength(1));
    expect(result.current.openStates).toEqual({ メニュー: true, "メニュー:カテゴリ": false });
    expect(warn).toHaveBeenCalled();
  });

  it("検索中のセッションから起動しても、フィルタ解除で保存済みの開閉状態へ戻る", async () => {
    const saved = { メニュー: true, "メニュー:カテゴリ": false };
    config.set("board_list_open_states", JSON.stringify(saved));
    persistedViewState.searchQuery = "サンプル";
    const { result } = renderHook(useBoardList);
    await waitFor(() => expect(result.current.openedMenuValues).toEqual(["メニュー"]));
    act(() => result.current.setSearchQuery(""));
    await waitFor(() => expect(result.current.openStates).toEqual(saved));
    expect(JSON.parse(config.get("board_list_open_states")!)).toEqual(saved);
  });
});
