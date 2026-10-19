import { container } from "src/service-container";
import type { IBoardTitleService } from "src/service-container/interfaces";
import { stubService } from "src/service-container/test-stubs";
import {
  type BrowserCommandContext,
  executeBrowserCommand,
  getDatUrlForCommand,
  getSubjectUrlForCommand,
  resolveBrowserCommands,
} from "src/view/browser/commands/browser-commands";
import { TAB_COMMAND_IDS } from "src/view/browser/commands/tab-command-runtime";
import { getAutoRefreshPageKey } from "src/view/browser/state/tabs/auto-refresh-pages";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import type { ScopedTabAction } from "src/view/browser/state/tabs/use-tab-store";
import type { Page, Tab } from "src/view/browser/types";
import { setItestServerMapForTesting } from "src/view/browser/utils/itest-server-map";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const browserCommandMocks = vi.hoisted(() => {
  const removeTabsMock = vi.fn();
  const queryTabsMock = vi.fn();
  return {
    askBoardTitleByUrlMock: vi.fn(),
    copyTextMock: vi.fn<() => Promise<void>>(),
    encodeThreadAsToonMock: vi.fn(),
    estimateToonTokenCountMock: vi.fn<() => number>(),
    getThreadMock: vi.fn(),
    openNextThreadSearchDialogMock: vi.fn<() => Promise<void>>(),
    parseSikiLogFileMock: vi.fn(),
    registerSikiLogThreadMock: vi.fn(),
    requestThreadResJumpMock: vi.fn(),
    selectSikiLogFileMock: vi.fn(),
    removeTabsMock,
    queryTabsMock,
    toastErrorMock: vi.fn(),
    toastInfoMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    extensionBrowserApiMock: {
      runtime: { id: "test-extension" },
      tabs: { query: queryTabsMock, remove: removeTabsMock },
    },
  };
});

const {
  askBoardTitleByUrlMock,
  copyTextMock,
  encodeThreadAsToonMock,
  estimateToonTokenCountMock,
  getThreadMock,
  openNextThreadSearchDialogMock,
  parseSikiLogFileMock,
  registerSikiLogThreadMock,
  requestThreadResJumpMock,
  selectSikiLogFileMock,
  removeTabsMock,
  queryTabsMock,
  toastErrorMock,
  toastInfoMock,
  toastSuccessMock,
  extensionBrowserApiMock,
} = browserCommandMocks;

vi.mock("webextension-polyfill", () => ({
  default: browserCommandMocks.extensionBrowserApiMock,
}));

// 実装は src/core/board/BoardTitleSolver.js ではなくサービスコンテナの boardTitle から使うため、テスト用のサービスを登録する。
container.boardTitle = stubService<IBoardTitleService>("boardTitle", {
  askByUrl: browserCommandMocks.askBoardTitleByUrlMock,
});

vi.mock("src/view/browser/utils/clipboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("src/view/browser/utils/clipboard")>();
  return { ...actual, copyText: browserCommandMocks.copyTextMock };
});

vi.mock("src/view/browser/utils/thread-toon", () => ({
  encodeThreadAsToon: browserCommandMocks.encodeThreadAsToonMock,
  estimateToonTokenCount: browserCommandMocks.estimateToonTokenCountMock,
}));

vi.mock("src/view/browser/utils/siki-log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("src/view/browser/utils/siki-log")>();
  return {
    ...actual,
    parseSikiLogFile: browserCommandMocks.parseSikiLogFileMock,
    registerSikiLogThread: browserCommandMocks.registerSikiLogThreadMock,
    selectSikiLogFile: browserCommandMocks.selectSikiLogFileMock,
  };
});

vi.mock("src/view/browser/utils/thread-read-state", () => ({
  requestThreadResJump: browserCommandMocks.requestThreadResJumpMock,
}));

function createTab(page: Page): Tab {
  return {
    id: "tab-1",
    history: [page],
    currentIndex: 0,
    pinned: false,
    reloadKey: 0,
    autoRefreshEnabled: false,
    autoRefreshPageKey: null,
  };
}

function createContext(
  page: Page,
  closedTabs: readonly Tab[] = [],
): {
  context: BrowserCommandContext;
  dispatch: ReturnType<typeof vi.fn<(action: ScopedTabAction) => void>>;
} {
  const viewTab = createTab(page);
  const dispatch = vi.fn<(action: ScopedTabAction) => void>();
  return {
    context: {
      viewPage: page,
      viewTab,
      tabs: [viewTab],
      closedTabs,
      isTwoPane: false,
      isWritePanelOpen: false,
      dispatch,
      toggleWritePanel: vi.fn(),
      openResponseJumpDialog: vi.fn(),
      openNextThreadSearchDialog: openNextThreadSearchDialogMock,
      openArchiveReplayWindow: vi.fn(),
    },
    dispatch,
  };
}

describe("browser commands", () => {
  beforeEach(() => {
    extensionBrowserApiMock.runtime.id = "test-extension";
    extensionBrowserApiMock.tabs.query = queryTabsMock;
    extensionBrowserApiMock.tabs.remove = removeTabsMock;
    removeTabsMock.mockResolvedValue(undefined);
    copyTextMock.mockResolvedValue();
    askBoardTitleByUrlMock.mockResolvedValue("Software");
    encodeThreadAsToonMock.mockReturnValue("title: Thread");
    estimateToonTokenCountMock.mockReturnValue(1234);
    selectSikiLogFileMock.mockResolvedValue(null);
    parseSikiLogFileMock.mockResolvedValue({
      title: "Sikiスレッド",
      threadUrl: "https://example.com/test/read.cgi/board/123/",
      responses: [],
    });
    registerSikiLogThreadMock.mockReturnValue({
      type: "thread",
      title: "Sikiスレッド",
      threadUrl: "https://example.com/test/read.cgi/board/123/?read_crx_siki=1",
    });
    getThreadMock.mockResolvedValue({
      url: "https://egg.5ch.net/test/read.cgi/software/123/",
      title: "Thread",
      res: [
        {
          num: 1,
          name: "名無しさん",
          mail: "",
          date: "2026/07/23(木) 12:34:56",
          message: "本文",
        },
      ],
    });
    container.thread = { getThread: getThreadMock };
    container.toast = {
      notify: vi.fn(),
      success: toastSuccessMock,
      error: toastErrorMock,
      info: toastInfoMock,
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    copyTextMock.mockReset();
    askBoardTitleByUrlMock.mockReset();
    encodeThreadAsToonMock.mockReset();
    estimateToonTokenCountMock.mockReset();
    getThreadMock.mockReset();
    openNextThreadSearchDialogMock.mockReset();
    parseSikiLogFileMock.mockReset();
    registerSikiLogThreadMock.mockReset();
    requestThreadResJumpMock.mockReset();
    selectSikiLogFileMock.mockReset();
    removeTabsMock.mockReset();
    queryTabsMock.mockReset();
    toastErrorMock.mockReset();
    toastInfoMock.mockReset();
    toastSuccessMock.mockReset();
    setItestServerMapForTesting([]);
  });

  it("ページ条件に合わないコマンドを一覧から除外する", () => {
    const { context } = createContext({ type: "boardList", title: "ホーム" });
    const ids = resolveBrowserCommands(context).map((command) => command.id);

    expect(ids).toContain("navigation.open-settings");
    expect(ids).toContain("layout.toggle-pane");
    expect(ids).not.toContain("page.reload");
    expect(ids).not.toContain("copy.page-url");
    expect(ids).not.toContain("copy.subject-url");
    expect(ids).not.toContain("copy.dat-url");
    expect(ids).not.toContain("copy.thread-toon");
    expect(ids).not.toContain("page.jump-to-response");
    expect(ids).not.toContain("page.search-next-thread");
    expect(ids).not.toContain("navigation.open-archive-replay");
    expect(ids).toContain("navigation.open-siki-log");
  });

  it("過去実況再生をコマンドパレットから開ける", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    const { context } = createContext({ type: "boardList", title: "ホーム" });
    const openArchiveReplayWindow = vi.fn();
    context.openArchiveReplayWindow = openArchiveReplayWindow;

    expect(resolveBrowserCommands(context)).toContainEqual(
      expect.objectContaining({
        id: "navigation.open-archive-replay",
        label: "過去実況再生を開く",
        enabled: true,
      }),
    );

    await expect(executeBrowserCommand("navigation.open-archive-replay", context)).resolves.toBe(
      true,
    );
    expect(openArchiveReplayWindow).toHaveBeenCalledOnce();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("Sikiログを選択すると本文を新しいタブで開く", async () => {
    const { context, dispatch } = createContext({ type: "boardList", title: "ホーム" });
    const file = {
      name: "thread.json",
      text: vi.fn<() => Promise<string>>(),
    } as unknown as File;
    const page = {
      type: "thread" as const,
      title: "Sikiスレッド",
      threadUrl: "https://example.com/test/read.cgi/board/123/?read_crx_siki=1",
    };
    selectSikiLogFileMock.mockResolvedValue(file);
    registerSikiLogThreadMock.mockReturnValue(page);

    await expect(executeBrowserCommand("navigation.open-siki-log", context)).resolves.toBe(true);

    expect(parseSikiLogFileMock).toHaveBeenCalledWith(file);
    expect(registerSikiLogThreadMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Sikiスレッド" }),
    );
    expect(dispatch).toHaveBeenCalledWith({ type: "OPEN_IN_NEW_TAB", page });
    expect(toastSuccessMock).toHaveBeenCalledWith("Sikiログ「Sikiスレッド」を開きました");
  });

  it("閉じたタブがないと再オープンを無効化し、履歴があれば既存actionを送る", async () => {
    const { context, dispatch } = createContext({ type: "boardList", title: "ホーム" });
    const findReopenCommand = () =>
      resolveBrowserCommands(context).find(({ id }) => id === "navigation.reopen-closed-tab");

    expect(findReopenCommand()).toMatchObject({
      label: "閉じたタブを開く",
      englishLabel: "Reopen Closed Tab",
      enabled: false,
    });

    context.closedTabs = [createTab({ type: "boardList", title: "復元するタブ" })];
    expect(findReopenCommand()).toMatchObject({ enabled: true });

    await expect(executeBrowserCommand("navigation.reopen-closed-tab", context)).resolves.toBe(
      true,
    );
    expect(dispatch).toHaveBeenCalledWith({ type: "REOPEN_CLOSED_TAB" });
  });

  it("スレッドではレス番号ジャンプ用の入力ダイアログを開ける", async () => {
    const { context } = createContext({
      type: "thread",
      title: "Thread",
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
    });
    const openResponseJumpDialog = vi.fn();
    context.openResponseJumpDialog = openResponseJumpDialog;

    const command = resolveBrowserCommands(context).find(
      ({ id }) => id === "page.jump-to-response",
    );
    expect(command).toMatchObject({
      label: "レス番号を指定してジャンプ",
      englishLabel: "Jump to Response Number",
      enabled: true,
    });

    await expect(executeBrowserCommand("page.jump-to-response", context)).resolves.toBe(true);
    expect(openResponseJumpDialog).toHaveBeenCalledOnce();
  });

  it("数字入力のレス番号ジャンプ候補は既存経路へ直接要求する", async () => {
    requestThreadResJumpMock.mockReturnValue({
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
      resNum: 42,
      token: "token",
    });
    const { context } = createContext({
      type: "thread",
      title: "Thread",
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
    });

    await expect(executeBrowserCommand("page.jump-to-response:42", context)).resolves.toBe(true);

    expect(requestThreadResJumpMock).toHaveBeenCalledWith(
      "https://egg.5ch.net/test/read.cgi/software/123/",
      42,
    );
    expect(context.openResponseJumpDialog).not.toHaveBeenCalled();
  });

  it("URL付きの開く候補は前居た場所へ戻れるよう単一遷移する", async () => {
    const { context, dispatch } = createContext({ type: "boardList", title: "ホーム" });

    await expect(
      executeBrowserCommand(
        "navigation.open-url:https://example.com/test/read.cgi/software/1788743729/",
        context,
      ),
    ).resolves.toBe(true);

    // 変更理由: 対象板を補完すると戻る先が前居た場所ではなくなるため、単一遷移にする。
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenNthCalledWith(1, {
      type: "NAVIGATE",
      page: {
        type: "thread",
        title: "https://example.com/test/read.cgi/software/1788743729/",
        threadUrl: "https://example.com/test/read.cgi/software/1788743729/",
      },
    });
  });

  it("URL付きの新しいタブで開く候補は新規タブへフォーカスして遷移する", async () => {
    const { context, dispatch } = createContext({ type: "boardList", title: "ホーム" });

    await expect(
      executeBrowserCommand(
        "navigation.open-url-in-new-tab:https://example.com/test/read.cgi/software/1788743729/",
        context,
      ),
    ).resolves.toBe(true);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenNthCalledWith(1, {
      type: "OPEN_IN_NEW_TAB_FORCE",
      focus: true,
      page: {
        type: "thread",
        title: "https://example.com/test/read.cgi/software/1788743729/",
        threadUrl: "https://example.com/test/read.cgi/software/1788743729/",
      },
    });
  });

  it("スレッドでは次スレ候補検索コマンドを実行できる", async () => {
    const { context } = createContext({
      type: "thread",
      title: "Thread",
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
    });

    expect(resolveBrowserCommands(context)).toContainEqual(
      expect.objectContaining({
        id: "page.search-next-thread",
        label: "次スレ候補を検索",
        enabled: true,
      }),
    );

    await expect(executeBrowserCommand("page.search-next-thread", context)).resolves.toBe(true);
    expect(openNextThreadSearchDialogMock).toHaveBeenCalledOnce();
  });

  it("板一覧では板名を再取得して対象板の履歴タイトルを更新する", async () => {
    const page = {
      type: "threadList" as const,
      title: "https://egg.5ch.io/software/",
      boardUrl: "https://egg.5ch.io/software/",
      boardTitle: "https://egg.5ch.io/software/",
    };
    const { context, dispatch } = createContext(page);

    expect(resolveBrowserCommands(context)).toContainEqual(
      expect.objectContaining({
        id: "page.retry-board-title",
        label: "板名を再取得",
        enabled: true,
      }),
    );

    await expect(executeBrowserCommand("page.retry-board-title", context)).resolves.toBe(true);

    expect(askBoardTitleByUrlMock).toHaveBeenCalledWith(page.boardUrl);
    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_TITLE_FOR_TAB",
      tabId: "tab-1",
      title: "Software",
      boardUrl: page.boardUrl,
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("板名を「Software」に更新しました");
  });

  it("板名を取得できなかった場合は詳細付きのエラーにする", async () => {
    askBoardTitleByUrlMock.mockResolvedValueOnce(null);
    const { context } = createContext({
      type: "threadList",
      title: "https://example.com/board/",
      boardUrl: "https://example.com/board/",
      boardTitle: "https://example.com/board/",
    });

    await expect(executeBrowserCommand("page.retry-board-title", context)).rejects.toThrow(
      "板名を取得できませんでした: https://example.com/board/",
    );
  });

  it("拡張機能でだけ開いているスレタブの取り込みコマンドを表示する", () => {
    const { context } = createContext({ type: "boardList", title: "ホーム" });

    expect(resolveBrowserCommands(context).map(({ id }) => id)).toContain(
      "navigation.import-open-thread-tabs",
    );

    extensionBrowserApiMock.runtime.id = "tauri";
    expect(resolveBrowserCommands(context).map(({ id }) => id)).not.toContain(
      "navigation.import-open-thread-tabs",
    );
  });

  it("ブラウザで開いている互換スレだけを重複排除して取り込む", async () => {
    queryTabsMock.mockResolvedValue([
      {
        id: 101,
        url: "https://egg.5ch.net/test/read.cgi/software/123/",
        title: "スレッドA",
      },
      {
        id: 102,
        url: "https://egg.5ch.net/test/read.cgi/software/123/50",
        title: "スレッドA（途中）",
      },
      {
        id: 103,
        url: "https://jbbs.shitaraba.net/bbs/read.cgi/computer/456/789/",
        title: "スレッドB",
      },
      { id: 104, url: "https://egg.5ch.net/software/", title: "板トップ" },
      { id: 105, url: "https://example.com/article", title: "一般ページ" },
      { id: 106, url: "chrome://extensions/", title: "拡張機能" },
    ]);
    const { context, dispatch } = createContext({
      type: "thread",
      title: "スレッドA",
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
    });

    await expect(
      executeBrowserCommand("navigation.import-open-thread-tabs", context),
    ).resolves.toBe(true);

    expect(queryTabsMock).toHaveBeenCalledWith({});
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "OPEN_IN_NEW_TAB",
      background: true,
      page: {
        type: "thread",
        title: "スレッドB",
        threadUrl: "https://jbbs.shitaraba.net/bbs/read.cgi/computer/456/789/",
      },
    });
    expect(removeTabsMock).toHaveBeenCalledTimes(1);
    expect(removeTabsMock).toHaveBeenCalledWith(103);
    expect(toastSuccessMock).toHaveBeenCalledWith("1件のスレタブを取り込みました");
  });

  it("同じURLの元タブをまとめて取り込み、取り込み後にすべて閉じる", async () => {
    queryTabsMock.mockResolvedValue([
      {
        id: 201,
        url: "https://egg.5ch.net/test/read.cgi/software/123/",
        title: "スレッドA",
      },
      {
        id: 202,
        url: "https://egg.5ch.net/test/read.cgi/software/123/50",
        title: "スレッドA（途中）",
      },
    ]);
    const { context, dispatch } = createContext({ type: "boardList", title: "ホーム" });

    await expect(
      executeBrowserCommand("navigation.import-open-thread-tabs", context),
    ).resolves.toBe(true);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "OPEN_IN_NEW_TAB",
      background: true,
      page: {
        type: "thread",
        title: "スレッドA",
        threadUrl: "https://egg.5ch.io/test/read.cgi/software/123/",
      },
    });
    expect(removeTabsMock.mock.calls.map(([tabId]) => tabId)).toEqual([201, 202]);
    expect(toastSuccessMock).toHaveBeenCalledWith("1件のスレタブを取り込みました");
  });

  it("元タブのクローズに部分失敗しても残りの取り込みを続ける", async () => {
    queryTabsMock.mockResolvedValue([
      {
        id: 301,
        url: "https://egg.5ch.net/test/read.cgi/software/123/",
        title: "スレッドA",
      },
      {
        id: 302,
        url: "https://jbbs.shitaraba.net/bbs/read.cgi/computer/456/789/",
        title: "スレッドB",
      },
    ]);
    removeTabsMock.mockRejectedValueOnce(new Error("タブは既に閉じられています"));
    const { context, dispatch } = createContext({ type: "boardList", title: "ホーム" });

    await expect(
      executeBrowserCommand("navigation.import-open-thread-tabs", context),
    ).resolves.toBe(true);

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(removeTabsMock.mock.calls.map(([tabId]) => tabId)).toEqual([301, 302]);
    expect(toastErrorMock).toHaveBeenCalledWith(
      "2件のスレタブを取り込みましたが、元ブラウザタブ1件を閉じられませんでした",
    );
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("元タブIDを取得できないページは取り込まず閉じない", async () => {
    queryTabsMock.mockResolvedValue([
      {
        url: "https://egg.5ch.net/test/read.cgi/software/123/",
        title: "スレッドA",
      },
    ]);
    const { context, dispatch } = createContext({ type: "boardList", title: "ホーム" });

    await expect(
      executeBrowserCommand("navigation.import-open-thread-tabs", context),
    ).resolves.toBe(true);

    expect(dispatch).not.toHaveBeenCalled();
    expect(removeTabsMock).not.toHaveBeenCalled();
    expect(toastInfoMock).toHaveBeenCalledWith("取り込める新しいスレタブはありません");
  });

  it("スレッドではsubject.txtとdat、板ではsubject.txtだけを表示する", () => {
    const thread = createContext({
      type: "thread",
      title: "Thread",
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
    }).context;
    const board = createContext({
      type: "threadList",
      title: "Software",
      boardTitle: "Software",
      boardUrl: "https://egg.5ch.net/software/",
    }).context;

    const threadIds = resolveBrowserCommands(thread).map(({ id }) => id);
    const boardIds = resolveBrowserCommands(board).map(({ id }) => id);

    expect(threadIds).toContain("copy.subject-url");
    expect(threadIds).toContain("copy.dat-url");
    expect(threadIds).toContain("copy.page-title-url-markdown");
    expect(threadIds).toContain("copy.thread-toon");
    expect(boardIds).toContain("copy.subject-url");
    expect(boardIds).not.toContain("copy.page-title-url-markdown");
    expect(boardIds).not.toContain("copy.dat-url");
    expect(boardIds).not.toContain("copy.thread-toon");
  });

  it("5ch・したらば・まちBBSのraw URLを導出する", () => {
    const fiveChThread: Page = {
      type: "thread",
      title: "Thread",
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
    };
    const shitarabaThread: Page = {
      type: "thread",
      title: "Thread",
      threadUrl: "https://jbbs.shitaraba.net/bbs/read.cgi/computer/1234/5678/",
    };
    const machiThread: Page = {
      type: "thread",
      title: "Thread",
      threadUrl: "https://kanto.machi.to/bbs/read.cgi/kana/123/",
    };

    expect(getSubjectUrlForCommand(fiveChThread)).toBe("https://egg.5ch.io/software/subject.txt");
    expect(getDatUrlForCommand(fiveChThread)).toBe("https://egg.5ch.io/software/dat/123.dat");
    expect(getSubjectUrlForCommand(shitarabaThread)).toBe(
      "https://jbbs.shitaraba.net/computer/1234/subject.txt",
    );
    expect(getDatUrlForCommand(shitarabaThread)).toBe(
      "https://jbbs.shitaraba.net/bbs/rawmode.cgi/computer/1234/5678/",
    );
    expect(getSubjectUrlForCommand(machiThread)).toBe(
      "https://kanto.machi.to/bbs/offlaw.cgi/kana/",
    );
    expect(getDatUrlForCommand(machiThread)).toBe(
      "https://kanto.machi.to/bbs/offlaw.cgi/kana/123/",
    );
  });

  it("itestは実サーバーへ解決できる場合だけraw URLを公開する", () => {
    const page: Page = {
      type: "thread",
      title: "Thread",
      threadUrl: "https://itest.5ch.io/test/read.cgi/software/123/",
    };

    expect(getSubjectUrlForCommand(page)).toBeNull();
    expect(getDatUrlForCommand(page)).toBeNull();

    setItestServerMapForTesting([["software", "egg.5ch.io"]]);
    expect(getSubjectUrlForCommand(page)).toBe("https://egg.5ch.io/software/subject.txt");
    expect(getDatUrlForCommand(page)).toBe("https://egg.5ch.io/software/dat/123.dat");
  });

  it("実行直前にも条件を確認し、条件外コマンドを実行しない", async () => {
    const { context } = createContext({
      type: "threadList",
      title: "Software",
      boardTitle: "Software",
      boardUrl: "https://egg.5ch.net/software/",
    });

    await expect(executeBrowserCommand("copy.dat-url", context)).resolves.toBe(false);
    expect(copyTextMock).not.toHaveBeenCalled();
  });

  it("コピーコマンドは導出したURLをコピーして成功を通知する", async () => {
    const { context } = createContext({
      type: "thread",
      title: "Thread",
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
    });

    await expect(executeBrowserCommand("copy.dat-url", context)).resolves.toBe(true);
    expect(copyTextMock).toHaveBeenCalledWith(
      "https://egg.5ch.io/software/dat/123.dat",
      expect.objectContaining({
        window: expect.any(Object),
        document: expect.any(Object),
      }),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith("datのURLをコピーしました");
  });

  it("表示環境から渡した通知サービスへ結果を送る", async () => {
    const { context } = createContext({
      type: "thread",
      title: "Thread",
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
    });
    const detachedSuccess = vi.fn();
    context.toast = {
      success: detachedSuccess,
      error: vi.fn(),
      info: vi.fn(),
      notify: vi.fn(),
    } as unknown as NonNullable<BrowserCommandContext["toast"]>;

    await expect(executeBrowserCommand("copy.dat-url", context)).resolves.toBe(true);

    expect(detachedSuccess).toHaveBeenCalledWith("datのURLをコピーしました");
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("Markdown形式のスレタイとURLを専用コマンドでコピーする", async () => {
    const { context } = createContext({
      type: "thread",
      title: "Title ] \\ note",
      threadUrl: "https://example.test/thread/(1)?next=2)",
    });

    await expect(executeBrowserCommand("copy.page-title-url-markdown", context)).resolves.toBe(
      true,
    );

    expect(copyTextMock).toHaveBeenCalledWith(
      "[Title \\] \\\\ note](https://example.test/thread/\\(1\\)?next=2\\))",
      expect.objectContaining({
        window: expect.any(Object),
        document: expect.any(Object),
      }),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith("Markdownリンクをコピーしました");
  });

  it("スレ全体をTOON形式でコピーし、推定トークン数を通知する", async () => {
    const threadUrl = "https://egg.5ch.net/test/read.cgi/software/123/";
    const { context } = createContext({
      type: "thread",
      title: "Thread",
      threadUrl,
    });

    await expect(executeBrowserCommand("copy.thread-toon", context)).resolves.toBe(true);

    expect(getThreadMock).toHaveBeenCalledWith(threadUrl);
    expect(encodeThreadAsToonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Thread",
        url: threadUrl,
      }),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      "title: Thread",
      expect.objectContaining({
        window: expect.any(Object),
        document: expect.any(Object),
      }),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "スレ全体をTOON形式でコピーしました（推定 1,234 トークン）",
    );
  });

  it("2ペイン切り替えは現在の表示状態に応じたactionを送る", async () => {
    const { context, dispatch } = createContext({
      type: "boardList",
      title: "ホーム",
    });

    await executeBrowserCommand("layout.toggle-pane", context);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "SPLIT_PANE" });

    context.isTwoPane = true;
    await executeBrowserCommand("layout.toggle-pane", context);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "CLOSE_PANE" });
  });

  it("ペインのタブ入れ替えコマンドは2ペイン時だけ表示し、actionを送る", async () => {
    const { context, dispatch } = createContext({ type: "boardList", title: "ホーム" });

    expect(resolveBrowserCommands(context).map(({ id }) => id)).not.toContain(
      "layout.swap-pane-tabs",
    );

    context.isTwoPane = true;
    expect(resolveBrowserCommands(context).map(({ id }) => id)).toContain("layout.swap-pane-tabs");

    await expect(executeBrowserCommand("layout.swap-pane-tabs", context)).resolves.toBe(true);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "SWAP_PANE_TABS" });
  });

  it("タブ操作コマンドはアクティブなタブを対象にactionを送る", async () => {
    const { context, dispatch } = createContext({ type: "boardList", title: "ホーム" });

    const ids = resolveBrowserCommands(context).map((command) => command.id);
    expect(ids).toContain("tab.close-other-tabs");
    expect(ids).toContain("tab.close-right-tabs");
    expect(ids).toContain("tab.close-all-tabs");
    expect(ids).toContain("tab.open-in-right-pane");

    await expect(executeBrowserCommand("tab.close-all-tabs", context)).resolves.toBe(true);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "CLOSE_ALL_TABS" });

    await expect(executeBrowserCommand("tab.open-in-right-pane", context)).resolves.toBe(true);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "OPEN_IN_RIGHT_PANE", tabId: "tab-1" });
  });

  it("他のタブ・右側のタブを閉じるは閉じられるタブがある時だけ有効になる", async () => {
    const homePage: Page = { type: "boardList", title: "ホーム" };
    const viewTab = createTab(homePage);
    const otherTab: Tab = { ...createTab(homePage), id: "tab-2" };
    const dispatch = vi.fn<(action: ScopedTabAction) => void>();
    const context: BrowserCommandContext = {
      viewPage: homePage,
      viewTab,
      tabs: [viewTab, otherTab],
      closedTabs: [],
      isTwoPane: false,
      isWritePanelOpen: false,
      dispatch,
      toggleWritePanel: vi.fn(),
      openResponseJumpDialog: vi.fn(),
      openNextThreadSearchDialog: openNextThreadSearchDialogMock,
      openArchiveReplayWindow: vi.fn(),
    };

    const findCommand = (id: string) =>
      resolveBrowserCommands(context).find((command) => command.id === id);
    expect(findCommand("tab.close-other-tabs")).toMatchObject({ enabled: true });
    expect(findCommand("tab.close-right-tabs")).toMatchObject({ enabled: true });

    await expect(executeBrowserCommand("tab.close-other-tabs", context)).resolves.toBe(true);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "CLOSE_OTHER_TABS", tabId: "tab-1" });

    await expect(executeBrowserCommand("tab.close-right-tabs", context)).resolves.toBe(true);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "CLOSE_RIGHT_TABS", tabId: "tab-1" });

    context.tabs = [viewTab];
    expect(findCommand("tab.close-other-tabs")).toMatchObject({ enabled: false });
    expect(findCommand("tab.close-right-tabs")).toMatchObject({ enabled: false });
  });

  it("対象指定の実行器がある時は一括閉鎖を実行器へ委譲する", async () => {
    const { context, dispatch } = createContext({ type: "boardList", title: "ホーム" });
    context.tabs = [context.viewTab, { ...createTab(context.viewPage), id: "tab-2" }];
    const runTabCommand = vi.fn(() => true);
    context.runTabCommand = runTabCommand;

    await expect(executeBrowserCommand("tab.close-other-tabs", context)).resolves.toBe(true);
    await expect(executeBrowserCommand("tab.close-right-tabs", context)).resolves.toBe(true);

    expect(runTabCommand).toHaveBeenNthCalledWith(1, TAB_COMMAND_IDS.CLOSE_OTHER);
    expect(runTabCommand).toHaveBeenNthCalledWith(2, TAB_COMMAND_IDS.CLOSE_RIGHT);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("復元と全タブ閉鎖も対象指定の実行器へ委譲する", async () => {
    const closedTab = createTab({ type: "boardList", title: "閉じたタブ" });
    const { context, dispatch } = createContext({ type: "boardList", title: "ホーム" }, [
      closedTab,
    ]);
    const runTabCommand = vi.fn(() => true);
    context.runTabCommand = runTabCommand;

    await expect(executeBrowserCommand("navigation.reopen-closed-tab", context)).resolves.toBe(
      true,
    );
    await expect(executeBrowserCommand("tab.close-all-tabs", context)).resolves.toBe(true);

    expect(runTabCommand).toHaveBeenNthCalledWith(1, TAB_COMMAND_IDS.REOPEN);
    expect(runTabCommand).toHaveBeenNthCalledWith(2, TAB_COMMAND_IDS.CLOSE_ALL);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("右ペイン移動も対象指定の実行器へ委譲する", async () => {
    const { context, dispatch } = createContext({ type: "boardList", title: "ホーム" });
    const runTabCommand = vi.fn(() => true);
    context.runTabCommand = runTabCommand;

    await expect(executeBrowserCommand("tab.open-in-right-pane", context)).resolves.toBe(true);

    expect(runTabCommand).toHaveBeenCalledWith(TAB_COMMAND_IDS.OPEN_RIGHT);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("タブバー方向切り替えコマンドは保存値に応じて反対方向へ切り替える", async () => {
    const { context } = createContext({ type: "boardList", title: "ホーム" });
    const configSetMock = vi.fn();
    let originalConfig: unknown;
    try {
      originalConfig = container.config;
    } catch {
      originalConfig = undefined;
    }
    container.config = {
      get: vi.fn(() => "horizontal"),
      set: configSetMock,
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };

    try {
      const ids = resolveBrowserCommands(context).map((command) => command.id);
      expect(ids).toContain("layout.toggle-tab-orientation");

      await expect(executeBrowserCommand("layout.toggle-tab-orientation", context)).resolves.toBe(
        true,
      );
      expect(configSetMock).toHaveBeenCalledWith("tab_bar_orientation", "vertical");
    } finally {
      if (originalConfig === undefined) {
        // 変更理由: もともと未登録だった場合は空に戻し、他のテストへ影響させない。
        (container as unknown as { _config: unknown })._config = undefined;
      } else {
        container.config = originalConfig as typeof container.config;
      }
    }
  });

  it("スレッドのフィルタモード切り替えは表示中タブのIDと選んだモードをイベントで渡す", async () => {
    const { context } = createContext({
      type: "thread",
      title: "テスト",
      threadUrl: "https://example.com/test/read.cgi/board/1/",
    });
    const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");

    try {
      const ids = resolveBrowserCommands(context).map((command) => command.id);
      expect(ids).toContain("page.toggle-filter-popular");
      expect(ids).toContain("page.toggle-filter-image");
      expect(ids).toContain("page.toggle-filter-video");
      expect(ids).toContain("page.toggle-filter-link");

      await expect(executeBrowserCommand("page.toggle-filter-image", context)).resolves.toBe(true);

      const event = dispatchEventSpy.mock.calls.at(-1)?.[0] as CustomEvent;
      expect(event.type).toBe("thread-filter-mode-toggle");
      expect(event.detail).toEqual({ tabId: "tab-1", filter: "image" });
    } finally {
      dispatchEventSpy.mockRestore();
    }
  });

  it("自動更新の切り替えは表示中ページの有効状態を反転したactionを送る", async () => {
    const page: Page = {
      type: "threadList",
      title: "板",
      boardUrl: "https://example.com/board/",
      boardTitle: "板",
    };
    const { context, dispatch } = createContext(page);

    // 停止中の板では「開始」として、有効化のactionを送る。
    const label = resolveBrowserCommands(context).find(
      (command) => command.id === "page.toggle-auto-refresh",
    )?.englishLabel;
    expect(label).toBe("Start Auto Refresh");

    await expect(executeBrowserCommand("page.toggle-auto-refresh", context)).resolves.toBe(true);
    expect(dispatch).toHaveBeenCalledWith(
      tabActions.setAutoRefreshEnabled(true, getAutoRefreshPageKey(page) ?? undefined),
    );
  });

  it("画像のぼかし切り替えは保存値を反転して保存する", async () => {
    const { context } = createContext({ type: "boardList", title: "ホーム" });
    const configSetMock = vi.fn();
    let originalConfig: unknown;
    try {
      originalConfig = container.config;
    } catch {
      originalConfig = undefined;
    }
    container.config = {
      get: vi.fn(() => "on"),
      set: configSetMock,
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };

    try {
      await expect(executeBrowserCommand("layout.toggle-image-blur", context)).resolves.toBe(true);
      expect(configSetMock).toHaveBeenCalledWith("image_blur", "off");
    } finally {
      if (originalConfig === undefined) {
        (container as unknown as { _config: unknown })._config = undefined;
      } else {
        container.config = originalConfig as typeof container.config;
      }
    }
  });
});
