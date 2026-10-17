import { container } from "src/service-container";
import {
  COMMAND_REQUEST_IDS,
  type CommandRuntime,
  executeCommandRequest,
  runCommandRequest,
} from "src/view/browser/commands/command-runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("src/app/logger", () => ({ createLogger: () => loggerMock }));

const copyTextMock = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock("src/view/browser/utils/clipboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("src/view/browser/utils/clipboard")>();
  return { ...actual, copyText: copyTextMock };
});

const target = {
  kind: "thread" as const,
  title: "テストスレッド",
  url: "https://example.com/test/read.cgi/software/123/",
};

function createRuntime(): CommandRuntime {
  return {
    surface: { window, document },
    toast: {
      notify: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    },
  };
}

describe("command-runtime", () => {
  beforeEach(() => {
    copyTextMock.mockResolvedValue(undefined);
    container.bookmark = {
      promiseFirstScan: Promise.resolve(true),
      ready: vi.fn(async () => undefined),
      getAll: vi.fn(() => []),
      import: vi.fn(async () => true),
      get: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
      updateResCount: vi.fn(),
      updateExpired: vi.fn(),
      getByBoard: vi.fn(),
      getAllBoards: vi.fn(() => []),
    };
  });

  afterEach(() => {
    copyTextMock.mockReset();
  });

  it("対象付きコピーは表示環境を渡して指定形式を変換する", async () => {
    const runtime = createRuntime();

    await executeCommandRequest(
      { id: COMMAND_REQUEST_IDS.TARGET_COPY, args: { target, format: "markdown" } },
      runtime,
    );

    expect(copyTextMock).toHaveBeenCalledWith(`[${target.title}](${target.url})`, runtime.surface);
  });

  it("任意文字列コピーも同じ表示環境へ委譲する", async () => {
    const runtime = createRuntime();

    await executeCommandRequest(
      { id: COMMAND_REQUEST_IDS.CLIPBOARD_COPY_TEXT, args: { text: "レス本文" } },
      runtime,
    );

    expect(copyTextMock).toHaveBeenCalledWith("レス本文", runtime.surface);
  });

  it("タイトルやURLのコピーが成功したら内容に応じたtoastを出す", async () => {
    const runtime = createRuntime();
    const toastSuccess = vi.fn();
    runtime.toast.success = toastSuccess;

    await expect(
      runCommandRequest(
        { id: COMMAND_REQUEST_IDS.TARGET_COPY, args: { target, format: "url" } },
        runtime,
      ),
    ).resolves.toBe(true);

    expect(toastSuccess).toHaveBeenCalledWith("URLをコピーしました");
  });

  it("レス本文などのコピーが成功したら共通toastを出す", async () => {
    const runtime = createRuntime();
    const toastSuccess = vi.fn();
    runtime.toast.success = toastSuccess;

    await expect(
      runCommandRequest(
        { id: COMMAND_REQUEST_IDS.CLIPBOARD_COPY_TEXT, args: { text: "レス本文" } },
        runtime,
      ),
    ).resolves.toBe(true);

    expect(toastSuccess).toHaveBeenCalledWith("クリップボードにコピーしました");
  });

  it("ブックマークsetは実行時の状態を確認して必要な場合だけ保存する", async () => {
    const add = vi.fn();
    const remove = vi.fn();
    const get = vi.fn().mockReturnValue(undefined);
    container.bookmark = {
      promiseFirstScan: Promise.resolve(true),
      ready: vi.fn(async () => undefined),
      getAll: vi.fn(() => []),
      import: vi.fn(async () => true),
      get,
      add,
      remove,
      updateResCount: vi.fn(),
      updateExpired: vi.fn(),
      getByBoard: vi.fn(),
      getAllBoards: vi.fn(() => []),
    };

    await executeCommandRequest(
      {
        id: COMMAND_REQUEST_IDS.TARGET_BOOKMARK_SET,
        args: { target, bookmarked: true },
      },
      createRuntime(),
    );
    expect(add).toHaveBeenCalledWith({
      url: target.url,
      title: target.title,
      type: "thread",
    });

    get.mockReturnValue(target);
    await executeCommandRequest(
      {
        id: COMMAND_REQUEST_IDS.TARGET_BOOKMARK_SET,
        args: { target, bookmarked: true },
      },
      createRuntime(),
    );
    expect(add).toHaveBeenCalledTimes(1);

    await executeCommandRequest(
      { id: COMMAND_REQUEST_IDS.TARGET_BOOKMARK_TOGGLE, args: { target } },
      createRuntime(),
    );
    expect(remove).toHaveBeenCalledWith(target.url);
  });

  it("UI向け入口は失敗をログと通知へ集約する", async () => {
    const error = new Error("コピーに失敗しました");
    copyTextMock.mockRejectedValue(error);
    const runtime = createRuntime();
    const toastErrorMock = vi.fn();
    runtime.toast.error = toastErrorMock;
    loggerMock.error.mockClear();

    await expect(
      runCommandRequest(
        { id: COMMAND_REQUEST_IDS.TARGET_COPY, args: { target, format: "title" } },
        runtime,
      ),
    ).resolves.toBe(false);

    expect(loggerMock.error).toHaveBeenCalledWith(
      "コマンドの実行に失敗しました",
      expect.objectContaining({ commandId: COMMAND_REQUEST_IDS.TARGET_COPY, error }),
    );
    expect(toastErrorMock).toHaveBeenCalledWith("コピーに失敗しました");
  });

  it("任意文字列コピーの失敗ログには本文を含めない", async () => {
    const error = new Error("コピーに失敗しました");
    copyTextMock.mockRejectedValue(error);
    const runtime = createRuntime();
    loggerMock.error.mockClear();

    await expect(
      runCommandRequest(
        { id: COMMAND_REQUEST_IDS.CLIPBOARD_COPY_TEXT, args: { text: "秘匿本文" } },
        runtime,
      ),
    ).resolves.toBe(false);

    expect(loggerMock.error).toHaveBeenCalledWith(
      "コマンドの実行に失敗しました",
      expect.objectContaining({ commandId: COMMAND_REQUEST_IDS.CLIPBOARD_COPY_TEXT, error }),
    );
    const details = loggerMock.error.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(details).not.toHaveProperty("target");
    expect(details).not.toHaveProperty("text");
  });
});
