import { container } from "src/service-container";
import { reportHistoryPersistenceError } from "src/view/browser/state/tabs/tab-store-history-visit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("src/app/logger", () => ({ createLogger: () => loggerMock }));

describe("reportHistoryPersistenceError", () => {
  beforeEach(() => {
    loggerMock.error.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("保存の失敗をログに残し、サービスコンテナの message で画面へ知らせる", () => {
    const send = vi.fn();
    container.message = { send, on: vi.fn(), off: vi.fn() };
    const error = new Error("書き込めません");

    reportHistoryPersistenceError("閲覧履歴の保存に失敗しました", error);

    expect(loggerMock.error).toHaveBeenCalledWith(
      "閲覧履歴の保存に失敗しました: 書き込めません",
      error,
    );
    expect(send).toHaveBeenCalledWith("notify", {
      message: "閲覧履歴の保存に失敗しました: 書き込めません",
      background_color: "red",
    });
  });

  it("知らせる処理が失敗しても例外を投げず、ログに残す", () => {
    const notifyError = new Error("送れません");
    container.message = {
      send: () => {
        throw notifyError;
      },
      on: vi.fn(),
      off: vi.fn(),
    };

    expect(() =>
      reportHistoryPersistenceError("閲覧履歴の保存に失敗しました", "原因"),
    ).not.toThrow();
    expect(loggerMock.error).toHaveBeenCalledWith(
      "閲覧履歴の保存エラーを画面に知らせられませんでした",
      notifyError,
    );
  });
});
