import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  readPersistedLogs: vi.fn(),
  clearPersistedLogs: vi.fn(),
  flushPersistedLogs: vi.fn(),
  copyText: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("src/app/debug/log-persistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("src/app/debug/log-persistence")>()),
  readPersistedLogs: mocks.readPersistedLogs,
  clearPersistedLogs: mocks.clearPersistedLogs,
  flushPersistedLogs: mocks.flushPersistedLogs,
}));
vi.mock("src/app/logger", () => ({
  createLogger: () => ({ error: mocks.loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));
vi.mock("src/service-container/index", () => ({
  container: { toast: { success: mocks.toastSuccess, error: mocks.toastError } },
}));
vi.mock("src/view/browser/utils/clipboard", () => ({ copyText: mocks.copyText }));

import { DebugLogPanel } from "src/view/browser/pages/settings/DebugLogPanel";

const ENTRY = {
  seq: 1,
  time: Date.UTC(2026, 9, 17, 0, 0, 0),
  level: "error" as const,
  category: "console",
  message: "保存に失敗しました",
  page: "/view/index.html",
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.flushPersistedLogs.mockResolvedValue(undefined);
  mocks.readPersistedLogs.mockResolvedValue([ENTRY]);
  mocks.clearPersistedLogs.mockResolvedValue(undefined);
  mocks.copyText.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DebugLogPanel", () => {
  it("開いたときに保存済みのログを読み込んで表示する", async () => {
    render(<DebugLogPanel />);

    const log = (await screen.findByLabelText("デバッグログ（直近）")) as HTMLTextAreaElement;
    await waitFor(() => expect(log.value).toContain("保存に失敗しました"));
    expect(log.value).toContain("2026-10-17T00:00:00.000Z [error] (/view/index.html) console:");
  });

  it("すべてコピーは表示件数ではなく保存済みの全件を対象にする", async () => {
    render(<DebugLogPanel />);
    await screen.findByLabelText("デバッグログ（直近）");

    fireEvent.click(screen.getByRole("button", { name: "すべてコピー" }));

    await waitFor(() => expect(mocks.copyText).toHaveBeenCalledOnce());
    expect(mocks.copyText).toHaveBeenCalledWith(expect.stringContaining("保存に失敗しました"));
    expect(mocks.readPersistedLogs).toHaveBeenLastCalledWith({ limit: 5000 });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("デバッグログをコピーしました");
  });

  it("確認を承諾したときだけログを削除する", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    render(<DebugLogPanel />);
    await screen.findByLabelText("デバッグログ（直近）");

    fireEvent.click(screen.getByRole("button", { name: "ログを削除" }));
    expect(mocks.clearPersistedLogs).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "ログを削除" }));
    await waitFor(() => expect(mocks.clearPersistedLogs).toHaveBeenCalledOnce());
    expect(mocks.toastSuccess).toHaveBeenCalledWith("デバッグログを削除しました");
  });

  it("読み込みに失敗したらロガーに詳細を残し、画面にも知らせる", async () => {
    const error = new Error("IndexedDBが使えません");
    mocks.readPersistedLogs.mockRejectedValue(error);

    render(<DebugLogPanel />);

    await waitFor(() =>
      expect(mocks.loggerError).toHaveBeenCalledWith("デバッグログの読み込みに失敗しました", error),
    );
    expect(mocks.toastError).toHaveBeenCalledWith("デバッグログの読み込みに失敗しました");
  });
});
