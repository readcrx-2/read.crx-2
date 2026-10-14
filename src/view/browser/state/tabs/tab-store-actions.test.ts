// @vitest-environment node
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { describe, expect, it } from "vite-plus/test";

describe("tabActions", () => {
  it("履歴操作を型付きアクションとして生成する", () => {
    expect(tabActions.goBack()).toEqual({ type: "GO_BACK" });
    expect(tabActions.goForward()).toEqual({ type: "GO_FORWARD" });
    expect(tabActions.goToHistoryIndex(2)).toEqual({
      type: "GO_TO_HISTORY_INDEX",
      index: 2,
    });
  });

  it("ペイロード付き操作の引数をアクションへ渡す", () => {
    const page = { type: "boardList" as const, title: "ホーム" };

    expect(tabActions.navigate(page)).toEqual({ type: "NAVIGATE", page });
    expect(tabActions.openInNewTab(page, { background: true })).toEqual({
      type: "OPEN_IN_NEW_TAB",
      page,
      background: true,
    });
    expect(tabActions.closeTab("tab-1", { replaceLastTab: true })).toEqual({
      type: "CLOSE_TAB",
      tabId: "tab-1",
      replaceLastTab: true,
    });
  });

  it("呼び出しごとに新しいアクションオブジェクトを返す", () => {
    expect(tabActions.reload()).not.toBe(tabActions.reload());
  });

  it("ペインの選択中タブ交換アクションを生成する", () => {
    expect(tabActions.swapPaneTabs()).toEqual({ type: "SWAP_PANE_TABS" });
  });
});
