import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { historyRecords, favoriteBoards, removeBookmarkMock, copyTextMock, toastErrorMock } =
  vi.hoisted(() => ({
    removeBookmarkMock: vi.fn(async (_url: string) => true),
    copyTextMock: vi.fn(async (_text: string) => undefined),
    toastErrorMock: vi.fn(),
    historyRecords: [
      {
        url: "https://example.com/test/read.cgi/sample/1/",
        boardTitle: "サンプル板",
        date: 1,
      },
    ],
    favoriteBoards: [{ url: "https://example.com/sample/", title: "サンプル板" }],
  }));

vi.mock("src/core/history/History", () => ({ getAll: vi.fn(async () => historyRecords) }));
const { openedBoards, askBoardTitleMock, getCachedTitlesMock, listeners } = vi.hoisted(() => ({
  openedBoards: { raw: "[]" },
  askBoardTitleMock: vi.fn(async (_url: string): Promise<string | null> => "表示用の板名"),
  getCachedTitlesMock: vi.fn(async () => new Map<string, string>()),
  listeners: new Map<string, Set<(payload: { key?: string }) => void>>(),
}));
vi.mock("src/core/board/BoardTitleSolver.js", () => ({
  askByUrl: askBoardTitleMock,
  getCachedTitles: getCachedTitlesMock,
}));
vi.mock("src/core/board/BoardUrlNormalizer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("src/core/board/BoardUrlNormalizer")>();
  // 架空の掲示板ホストを使い、実在の板URLをテストへ持ち込まず保存データを検証する。
  return {
    ...actual,
    normalizeBoardUrl: (url: string) => actual.normalizeBoardUrl(url),
    getBoardUrlKey: (url: string) => actual.getBoardUrlKey(url),
  };
});
vi.mock("src/view/browser/utils/legacy-app", () => ({
  getLegacyBookmarkService: () => ({ getAllBoards: () => favoriteBoards }),
  waitForLegacyBookmarkReady: vi.fn(async () => undefined),
}));
vi.mock("src/service-container/index", () => ({
  container: {
    config: { get: vi.fn(() => openedBoards.raw) },
    message: {
      on: vi.fn((type: string, handler: (payload: { key?: string }) => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(handler);
      }),
      off: vi.fn((type: string, handler: (payload: { key?: string }) => void) =>
        listeners.get(type)?.delete(handler),
      ),
    },
    bookmark: { remove: removeBookmarkMock },
    toast: { notify: vi.fn(), info: vi.fn(), success: vi.fn(), error: toastErrorMock },
  },
}));
vi.mock("src/view/browser/utils/clipboard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("src/view/browser/utils/clipboard")>()),
  copyText: copyTextMock,
}));
vi.mock("src/app/platform", () => ({
  platform: { window: { setTitle: vi.fn(async () => undefined) } },
}));
vi.mock("webextension-polyfill", () => ({
  default: { runtime: { onMessage: { addListener: vi.fn(), removeListener: vi.fn() } } },
}));

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe("ホームの板項目のミドルクリック", () => {
  beforeEach(() => {
    openedBoards.raw = "[]";
    listeners.clear();
    askBoardTitleMock.mockReset().mockResolvedValue("表示用の板名");
    getCachedTitlesMock
      .mockReset()
      .mockResolvedValue(new Map([["example.com/sample/", "表示用の板名"]]));
    removeBookmarkMock.mockReset().mockResolvedValue(true);
    copyTextMock.mockReset().mockResolvedValue(undefined);
    toastErrorMock.mockReset();
    const storage = createMemoryStorage();
    vi.stubGlobal("localStorage", storage);
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
    historyRecords.splice(0, historyRecords.length, {
      url: "https://example.com/test/read.cgi/sample/1/",
      boardTitle: "サンプル板",
      date: 1,
    });
    favoriteBoards.splice(0, favoriteBoards.length, {
      url: "https://example.com/sample/",
      title: "サンプル板",
    });
  });

  afterEach(() => {
    cleanup();
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function renderPage(newTab = false) {
    vi.resetModules();
    const { TabProvider, useTabStore } = await import("src/view/browser/state/tabs/use-tab-store");
    const { HomeTabPage } = await import("src/view/browser/pages/HomeTabPage");
    function StartPage() {
      return <HomeTabPage />;
    }
    function State() {
      const { state, viewPage, dispatch } = useTabStore();
      return (
        <>
          <button onClick={() => dispatch({ type: "SELECT_TAB", tabId: state.tabs[0].id })}>
            ホームを選ぶ
          </button>
          <button
            onClick={() =>
              dispatch({ type: "OPEN_IN_NEW_TAB", page: { type: "boardList", title: "板一覧" } })
            }
          >
            板一覧を選ぶ
          </button>
          <output data-testid="tab-count">{state.tabs.length}</output>
          <button onClick={() => dispatch({ type: "ADD_TAB" })}>新しいタブを追加</button>
          <output data-testid="active-tab-id">{state.selectedTabId}</output>
          <output data-testid="active-page-type">{viewPage.type}</output>
          <output data-testid="home-history">
            {state.tabs
              .at(0)
              ?.history.map((page) => page.type)
              .join("|")}
          </output>
          <output data-testid="new-tab-history">
            {state.tabs
              .at(-1)
              ?.history.map((page) => page.type)
              .join("|")}
          </output>
        </>
      );
    }
    render(
      <TabProvider>
        <State />
        <StartPage />
      </TabProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "ホームを選ぶ" }));
    if (newTab) fireEvent.click(screen.getByRole("button", { name: "新しいタブを追加" }));
  }

  async function openFavoriteMenu() {
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /サンプル板/ })).toHaveLength(2),
    );
    const favorite = screen.getAllByRole("button", { name: /サンプル板/ })[0];
    expect(fireEvent.contextMenu(favorite, { clientX: 40, clientY: 80 })).toBe(false);
    return favorite;
  }

  it.each([0, 1])(
    "新しいタブの板項目%dは通常クリックでそのタブに開き、追加取得しない",
    async (index) => {
      await renderPage(true);
      expect(screen.getByRole("button", { name: "URLを入力" }).closest("p")).toHaveTextContent(
        "URLを入力するか、下の板を選んでください。",
      );
      await waitFor(() =>
        expect(screen.getAllByRole("button", { name: /サンプル板/ })).toHaveLength(2),
      );
      const boards = screen.getAllByRole("button", { name: /サンプル板/ });
      const originalId = screen.getByTestId("active-tab-id").textContent;
      fireEvent.click(boards[index]);
      expect(screen.getByTestId("active-tab-id")).toHaveTextContent(originalId!);
      expect(screen.getByTestId("active-page-type")).toHaveTextContent("threadList");
      expect(screen.getByTestId("tab-count")).toHaveTextContent("2");
      expect(screen.getByTestId("home-history").textContent).toBe("home");
      expect(askBoardTitleMock).not.toHaveBeenCalled();
    },
  );

  it.each([0, 1])(
    "新しいタブの板項目%dを中クリックすると背景で開き、新しいタブを保つ",
    async (index) => {
      await renderPage(true);
      await waitFor(() =>
        expect(screen.getAllByRole("button", { name: /サンプル板/ })).toHaveLength(2),
      );
      const board = screen.getAllByRole("button", { name: /サンプル板/ })[index];
      const originalId = screen.getByTestId("active-tab-id").textContent;
      fireEvent(board, new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));
      expect(screen.getByTestId("active-tab-id")).toHaveTextContent(originalId!);
      expect(screen.getByTestId("active-page-type")).toHaveTextContent("home");
      expect(screen.getByTestId("tab-count")).toHaveTextContent("3");
    },
  );

  it("新しいタブのURL入力リンクはnavigationモードでomnibarを開く", async () => {
    await renderPage(true);
    const { commandPalette, commandPaletteStore } =
      await import("src/view/browser/commands/command-palette-store");
    fireEvent.click(screen.getByRole("button", { name: "URLを入力" }));
    expect(commandPaletteStore.getState()).toMatchObject({ opened: true, mode: "navigation" });
    commandPalette.close();
  });

  it("新しいタブの板一覧ボタンは同じタブで開き、他のホームを保つ", async () => {
    await renderPage(true);
    fireEvent.click(screen.getByRole("button", { name: "板一覧を開く" }));
    expect(screen.getByTestId("active-page-type")).toHaveTextContent("boardList");
    expect(screen.getByTestId("tab-count")).toHaveTextContent("2");
    expect(screen.getByTestId("home-history").textContent).toBe("home");
    expect(screen.getByTestId("new-tab-history").textContent).toBe("home|boardList");
  });

  it.each(["現在のタブで開く", "新しいタブで開く"])(
    "新しいタブのお気に入りメニューの%sは指定した場所で開く",
    async (action) => {
      await renderPage(true);
      await openFavoriteMenu();
      fireEvent.click(screen.getByRole("button", { name: action }));
      expect(screen.getByTestId("active-page-type")).toHaveTextContent("threadList");
      expect(screen.getByTestId("tab-count")).toHaveTextContent(
        action === "現在のタブで開く" ? "2" : "3",
      );
    },
  );

  it("板キーだけの旧履歴を保存済みの表示名で補い、開くタブにも引き継ぐ", async () => {
    historyRecords[0].boardTitle = "sample";
    await renderPage();
    const board = await screen.findByRole("button", { name: /表示用の板名/ });
    expect(getCachedTitlesMock).toHaveBeenCalled();
    expect(askBoardTitleMock).not.toHaveBeenCalled();
    fireEvent.click(board);
    expect(screen.getByTestId("new-tab-history")).toHaveTextContent("threadList");
  });

  it("板を開いた保存通知で旧履歴の板が今日へ移り、スレ履歴のない板も表示する", async () => {
    await renderPage();
    await screen.findByRole("heading", { name: "それ以前" });
    openedBoards.raw = JSON.stringify([
      { url: "http://example.com/sample/", title: "サンプル板", lastVisited: Date.now() },
      { url: "https://example.com/another/", title: "別の板", lastVisited: Date.now() },
    ]);
    act(() =>
      listeners
        .get("config_updated")
        ?.forEach((handler) => handler({ key: "opened_board_entries" })),
    );
    const today = await screen.findByRole("heading", { name: "今日" });
    const group = within(today.parentElement!);
    expect(group.getAllByRole("button", { name: /サンプル板/ })).toHaveLength(1);
    expect(group.getByRole("button", { name: /別の板/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "それ以前" })).not.toBeInTheDocument();
  });

  it("スレ閲覧の保存通知とホームへの復帰でも一覧を再読込する", async () => {
    await renderPage();
    await screen.findByRole("heading", { name: "それ以前" });
    historyRecords[0].date = Date.now();
    act(() => listeners.get("history_updated")?.forEach((handler) => handler({})));
    await screen.findByRole("heading", { name: "今日" });
    fireEvent.click(screen.getByRole("button", { name: "板一覧を選ぶ" }));
    await screen.findByRole("heading", { name: "今日" });
    historyRecords[0].date = 1;
    fireEvent.click(screen.getByRole("button", { name: "ホームを選ぶ" }));
    await screen.findByRole("heading", { name: "それ以前" });
  });

  it("古い板名の取得を待たず今日へ移し、遅い読み込みで日時や表示名を巻き戻さない", async () => {
    const pending = Promise.withResolvers<Map<string, string>>();
    getCachedTitlesMock.mockImplementation(() => pending.promise);
    historyRecords[0].boardTitle = "sample";
    await renderPage();
    await screen.findByRole("heading", { name: "それ以前" });
    await waitFor(() => expect(getCachedTitlesMock).toHaveBeenCalled());
    openedBoards.raw = JSON.stringify([
      { url: "https://example.com/sample/", title: "サンプル板", lastVisited: Date.now() },
    ]);
    act(() =>
      listeners
        .get("config_updated")
        ?.forEach((handler) => handler({ key: "opened_board_entries" })),
    );
    await screen.findByRole("heading", { name: "今日" });
    await act(async () =>
      pending.resolve(new Map([["example.com/sample/", "古い読み込みの板名"]])),
    );
    expect(screen.getByRole("heading", { name: "今日" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "それ以前" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /古い読み込みの板名/ })).not.toBeInTheDocument();
  });

  it("板名キャッシュがなくても表示・通知・ホーム復帰・再起動で通信へ進まない", async () => {
    getCachedTitlesMock.mockResolvedValue(new Map());
    historyRecords[0].boardTitle = "sample";
    await renderPage();
    await screen.findByRole("heading", { name: "それ以前" });
    act(() => listeners.get("history_updated")?.forEach((handler) => handler({})));
    fireEvent.click(screen.getByRole("button", { name: "板一覧を選ぶ" }));
    fireEvent.click(screen.getByRole("button", { name: "ホームを選ぶ" }));
    await screen.findByRole("button", { name: /^sample/ });
    cleanup();
    await renderPage();
    await screen.findByRole("button", { name: /^sample/ });
    expect(getCachedTitlesMock).toHaveBeenCalled();
    expect(askBoardTitleMock).not.toHaveBeenCalled();
  });

  it("ホームの右クリックは遷移せず、メニューで開く先を選べる", async () => {
    await renderPage();
    const initialCount = Number(screen.getByTestId("tab-count").textContent);
    await openFavoriteMenu();
    expect(screen.getByRole("button", { name: "現在のタブで開く" })).toBeInTheDocument();
    expect(Number(screen.getByTestId("tab-count").textContent)).toBe(initialCount);
    fireEvent.click(screen.getByRole("button", { name: "新しいタブで開く" }));
    expect(Number(screen.getByTestId("tab-count").textContent)).toBe(initialCount + 1);
    expect(screen.getByTestId("home-history").textContent).toBe("home");
    expect(screen.getByTestId("new-tab-history").textContent).toBe("home|threadList");
  });

  it.each([
    ["タイトルをコピー", "サンプル板"],
    ["URLをコピー", "https://example.com/sample/"],
    ["タイトル&URLをコピー", "サンプル板\nhttps://example.com/sample/"],
    ["タイトル&URLをMarkdownでコピー", "[サンプル板](https://example.com/sample/)"],
  ])("ホームの%sで対象板をコピーする", async (label, expected) => {
    await renderPage();
    await openFavoriteMenu();
    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() =>
      expect(copyTextMock).toHaveBeenCalledWith(
        expected,
        expect.objectContaining({ window, document }),
      ),
    );
    expect(screen.getByTestId("home-history").textContent).toBe("home");
  });

  it("ホームからお気に入りを削除しても最近開いた板は残す", async () => {
    await renderPage();
    await openFavoriteMenu();
    fireEvent.click(screen.getByRole("button", { name: "ブックマークを削除" }));
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /サンプル板/ })).toHaveLength(1),
    );
    expect(removeBookmarkMock).toHaveBeenCalledWith("https://example.com/sample/");
    expect(screen.getByTestId("home-history").textContent).toBe("home");
  });

  it("削除の例外を通知し、お気に入り板を画面に残す", async () => {
    removeBookmarkMock.mockRejectedValueOnce(new Error("保存失敗"));
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await renderPage();
    await openFavoriteMenu();
    fireEvent.click(screen.getByRole("button", { name: "ブックマークを削除" }));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(logger).toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: /サンプル板/ })).toHaveLength(2);
  });

  it("タブを切り替えたらメニューを閉じ、ホームへ戻っても再表示しない", async () => {
    await renderPage();
    await openFavoriteMenu();
    fireEvent.click(screen.getByRole("button", { name: "板一覧を選ぶ" }));
    expect(screen.queryByRole("button", { name: "ブックマークを削除" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ホームを選ぶ" }));
    expect(screen.queryByRole("button", { name: "ブックマークを削除" })).not.toBeInTheDocument();
  });

  it("メニュー項目の中クリックでもホームを保ち、背景タブで板を開く", async () => {
    await renderPage();
    await openFavoriteMenu();
    fireEvent(
      screen.getByRole("button", { name: "新しいタブで開く" }),
      new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }),
    );
    expect(screen.getByTestId("active-page-type").textContent).toBe("home");
    expect(screen.getByTestId("new-tab-history").textContent).toBe("home|threadList");
  });

  it.each(["最近開いた板", "お気に入り板"] as const)(
    "%s でmousedownの既定動作を止め、背景タブだけを追加する",
    async (kind) => {
      await renderPage();
      await screen.findAllByRole("button", { name: /サンプル板/ });
      await waitFor(() =>
        expect(screen.getAllByRole("button", { name: /サンプル板/ })).toHaveLength(2),
      );
      const board = screen.getAllByRole("button", { name: /サンプル板/ })[
        kind === "お気に入り板" ? 0 : 1
      ];
      const initialTabCount = Number(screen.getByTestId("tab-count").textContent);

      // 実ブラウザーは中ボタンのmousedownからオートスクロールを始めるため、
      // イベント順を再現して、その既定動作がキャンセルされることを確認する。
      expect(fireEvent.mouseDown(board, { button: 1 })).toBe(false);
      fireEvent(board, new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));

      await waitFor(() =>
        expect(Number(screen.getByTestId("tab-count").textContent)).toBe(initialTabCount + 1),
      );
      expect(screen.getByTestId("active-page-type")).toHaveTextContent("home");
      expect(screen.getByTestId("new-tab-history")).toHaveTextContent("threadList");
    },
  );

  it.each(["最近開いた板", "お気に入り板"] as const)(
    "%sの通常クリックは同じタブで開き、ホームを戻る先にする",
    async (kind) => {
      await renderPage();
      await waitFor(() =>
        expect(screen.getAllByRole("button", { name: /サンプル板/ })).toHaveLength(2),
      );
      const board = screen.getAllByRole("button", { name: /サンプル板/ })[
        kind === "お気に入り板" ? 0 : 1
      ];
      const initialTabCount = Number(screen.getByTestId("tab-count").textContent);
      fireEvent.click(board);
      expect(Number(screen.getByTestId("tab-count").textContent)).toBe(initialTabCount);
      expect(screen.getByTestId("home-history").textContent).toBe("home|threadList");
      expect(screen.getByTestId("new-tab-history").textContent).toBe("home|threadList");
    },
  );

  it("板一覧ボタンは同じタブ内で切り替え、押し直してもタブを増やさない", async () => {
    await renderPage();
    const initialTabCount = Number(screen.getByTestId("tab-count").textContent);
    const boardList = screen.getByRole("button", { name: "板一覧を開く" });
    fireEvent.click(boardList);
    expect(screen.getByTestId("active-page-type")).toHaveTextContent("boardList");
    expect(screen.getByTestId("home-history").textContent).toBe("home|boardList");
    expect(Number(screen.getByTestId("tab-count").textContent)).toBe(initialTabCount);
  });
});
