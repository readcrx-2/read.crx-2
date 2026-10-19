// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DEFAULT_COMMENT_OVERLAY_SETTINGS } from "../domain";

const configMock = vi.hoisted(() => ({
  get: vi.fn(),
}));
const runtimeMock = vi.hoisted(() => ({
  isTauri: false,
}));
const messageMock = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn(),
}));
const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
}));

vi.mock("src/app/logger", () => ({
  createLogger: () => loggerMock,
}));

vi.mock("src/app/platform/runtime", () => ({
  isTauriRuntime: () => runtimeMock.isTauri,
}));

vi.mock("src/service-container/index", () => ({
  container: {
    config: configMock,
    message: messageMock,
  },
}));

import { readCommentOverlaySettings, subscribeToCommentOverlaySettings } from "./settings";

describe("ConfigからのコメントOverlay設定読み出し", () => {
  beforeEach(() => {
    configMock.get.mockReset();
    messageMock.on.mockReset();
    messageMock.off.mockReset();
    runtimeMock.isTauri = false;
  });

  it("通過時間・不透明度・待機queue上限は保存値を読まず既定値を使う", () => {
    configMock.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        comment_overlay_speed: "15",
        comment_overlay_opacity: "0.6",
        comment_overlay_max_queue: "120",
      };
      return values[key] ?? null;
    });

    expect(readCommentOverlaySettings()).toEqual({
      durationSeconds: DEFAULT_COMMENT_OVERLAY_SETTINGS.durationSeconds,
      opacity: DEFAULT_COMMENT_OVERLAY_SETTINGS.opacity,
      maxQueueSize: DEFAULT_COMMENT_OVERLAY_SETTINGS.maxQueueSize,
      fetchAllCandidateThreads: false,
    });
  });

  it("分裂スレ取得設定を読み込む", () => {
    configMock.get.mockImplementation((key: string) =>
      key === "comment_overlay_fetch_all_threads" ? "on" : null,
    );

    expect(readCommentOverlaySettings().fetchAllCandidateThreads).toBe(true);
  });

  it("Config読み出し自体が失敗した場合は既定値を返す", () => {
    const error = new Error("Config unavailable");
    configMock.get.mockImplementation(() => {
      throw error;
    });
    loggerMock.error.mockClear();

    expect(readCommentOverlaySettings()).toEqual(DEFAULT_COMMENT_OVERLAY_SETTINGS);
    expect(loggerMock.error).toHaveBeenCalledWith(
      "コメントOverlay設定の読み込みに失敗しました:",
      error,
    );
  });

  it("Browser版では設定変更を購読しない", () => {
    const listener = vi.fn();

    const cleanup = subscribeToCommentOverlaySettings(listener);

    cleanup();
    expect(messageMock.on).not.toHaveBeenCalled();
    expect(messageMock.off).not.toHaveBeenCalled();
  });

  it("Tauri版では分裂スレ取得設定の変更だけを通知する", () => {
    runtimeMock.isTauri = true;
    let registeredHandler: ((data: { key?: string }) => void) | undefined;
    messageMock.on.mockImplementationOnce(
      (_type: string, handler: (data: { key?: string }) => void) => {
        registeredHandler = handler;
      },
    );
    const listener = vi.fn();

    const cleanup = subscribeToCommentOverlaySettings(listener);
    registeredHandler?.({ key: "comment_overlay_fetch_all_threads" });
    registeredHandler?.({ key: "theme_id" });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(messageMock.on).toHaveBeenCalledWith("config_updated", expect.any(Function));

    cleanup();
    expect(messageMock.off).toHaveBeenCalledWith("config_updated", registeredHandler);
  });
});
