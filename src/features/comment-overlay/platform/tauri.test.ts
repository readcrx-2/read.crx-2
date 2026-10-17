import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
}));

vi.mock("src/app/logger", () => ({
  createLogger: () => loggerMock,
}));

const tauriMocks = vi.hoisted(() => ({
  event: {
    emit: vi.fn(),
    listen: vi.fn(),
  },
  logicalPosition: class MockLogicalPosition {
    constructor(
      readonly x: number,
      readonly y: number,
    ) {}
  },
  logicalSize: class MockLogicalSize {
    constructor(
      readonly width: number,
      readonly height: number,
    ) {}
  },
  availableMonitors: vi.fn(),
  invoke: vi.fn(),
  window: {
    getByLabel: vi.fn(),
    outerPosition: vi.fn(),
    outerSize: vi.fn(),
    scaleFactor: vi.fn(),
    isVisible: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    unminimize: vi.fn(),
    setFocus: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    setPosition: vi.fn(),
    setSize: vi.fn(),
    onMoved: vi.fn(),
    onResized: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/event", () => ({
  emit: tauriMocks.event.emit,
  listen: tauriMocks.event.listen,
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: tauriMocks.invoke }));

vi.mock("@tauri-apps/api/window", () => ({
  availableMonitors: tauriMocks.availableMonitors,
  LogicalPosition: tauriMocks.logicalPosition,
  LogicalSize: tauriMocks.logicalSize,
  PhysicalPosition: tauriMocks.logicalPosition,
  PhysicalSize: tauriMocks.logicalSize,
  Window: {
    getByLabel: tauriMocks.window.getByLabel,
  },
}));

import { COMMENT_OVERLAY_GEOMETRY_STORAGE_KEY } from "./geometry";
import { COMMENT_OVERLAY_ATTACHMENT_STORAGE_KEY } from "./placement";
import { COMMENT_OVERLAY_VISIBILITY_EVENT_NAME, createTauriCommentOverlayPlatform } from "./tauri";

type VisibilityEventHandler = (event: { payload: unknown }) => void;

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("TauriコメントOverlay window platform", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    tauriMocks.invoke.mockReset();
    tauriMocks.window.setAlwaysOnTop.mockReset();
    tauriMocks.event.emit.mockReset();
    tauriMocks.event.emit.mockResolvedValue(undefined);
    tauriMocks.event.listen.mockReset();
    tauriMocks.event.listen.mockResolvedValue(vi.fn());
    tauriMocks.window.getByLabel.mockReset();
    tauriMocks.window.getByLabel.mockResolvedValue(tauriMocks.window);
    tauriMocks.window.outerPosition.mockReset();
    tauriMocks.window.outerPosition.mockResolvedValue({ x: 200, y: 100 });
    tauriMocks.window.outerSize.mockReset();
    tauriMocks.window.outerSize.mockResolvedValue({ width: 1_800, height: 320 });
    tauriMocks.window.scaleFactor.mockReset();
    tauriMocks.window.scaleFactor.mockResolvedValue(2);
    tauriMocks.availableMonitors.mockReset();
    tauriMocks.availableMonitors.mockResolvedValue([
      {
        name: "テストモニター",
        position: { x: 0, y: 0 },
        size: { width: 3_840, height: 2_160 },
        workArea: {
          position: { x: 0, y: 0 },
          size: { width: 3_840, height: 2_080 },
        },
        scaleFactor: 2,
      },
    ]);
    tauriMocks.window.isVisible.mockReset();
    tauriMocks.window.isVisible.mockResolvedValue(false);
    tauriMocks.window.setPosition.mockReset();
    tauriMocks.window.setPosition.mockResolvedValue(undefined);
    tauriMocks.window.setSize.mockReset();
    tauriMocks.window.setSize.mockResolvedValue(undefined);
    tauriMocks.window.onMoved.mockReset();
    tauriMocks.window.onMoved.mockResolvedValue(vi.fn());
    tauriMocks.window.onResized.mockReset();
    tauriMocks.window.onResized.mockResolvedValue(vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("物理pixelのwindow境界を論理geometryへ変換する", async () => {
    const platform = createTauriCommentOverlayPlatform();

    await expect(platform.getGeometry()).resolves.toEqual({
      x: 100,
      y: 50,
      width: 900,
      height: 160,
    });
  });

  it("最前面への固定を有効・無効にできる", async () => {
    const platform = createTauriCommentOverlayPlatform();
    await platform.setAlwaysOnTop!(true);
    await platform.setAlwaysOnTop!(false);
    expect(tauriMocks.window.setAlwaysOnTop.mock.calls).toEqual([[true], [false]]);
  });

  it("対象の移動と最小化に追従し、実況停止中は復元されても表示しない", async () => {
    vi.useFakeTimers();
    tauriMocks.window.show.mockClear();
    tauriMocks.window.hide.mockClear();
    const platform = createTauriCommentOverlayPlatform();
    tauriMocks.invoke.mockResolvedValue({ x: -1200, y: 80, width: 800, height: 600 });
    tauriMocks.invoke.mockResolvedValueOnce([]);
    await platform.attachment!.setTarget("10:20");
    expect(tauriMocks.window.setPosition).toHaveBeenLastCalledWith({ x: -1200, y: 80 });
    expect(tauriMocks.window.setSize).toHaveBeenLastCalledWith({ width: 800, height: 600 });
    await platform.show();
    tauriMocks.invoke.mockResolvedValue(null);
    await vi.advanceTimersByTimeAsync(100);
    expect(tauriMocks.window.hide).toHaveBeenCalledTimes(1);
    tauriMocks.invoke.mockResolvedValue({ x: 400, y: 80, width: 1200, height: 900 });
    await vi.advanceTimersByTimeAsync(100);
    expect(tauriMocks.window.show).toHaveBeenCalledTimes(2);
    expect(tauriMocks.window.setPosition).toHaveBeenLastCalledWith({ x: 400, y: 80 });
    tauriMocks.invoke.mockResolvedValue(null);
    await vi.advanceTimersByTimeAsync(100);
    await platform.hide();
    tauriMocks.invoke.mockResolvedValue({ x: 400, y: 80, width: 1200, height: 900 });
    await vi.advanceTimersByTimeAsync(100);
    expect(tauriMocks.window.show).toHaveBeenCalledTimes(2);
    await platform.attachment!.setTarget(null);
  });

  it("対象が閉じたらエラーを残して追従を止め、手動調整でも解除する", async () => {
    vi.useFakeTimers();
    loggerMock.error.mockClear();
    const platform = createTauriCommentOverlayPlatform();
    tauriMocks.invoke.mockResolvedValue({ x: 0, y: 0, width: 800, height: 600 });
    tauriMocks.invoke.mockResolvedValueOnce([]);
    await platform.attachment!.setTarget("10:20");
    tauriMocks.invoke.mockRejectedValue(new Error("対象が閉じました"));
    await vi.advanceTimersByTimeAsync(100);
    expect(platform.attachment!.getState()).toEqual({
      targetId: null,
      error: "Error: 対象が閉じました",
    });
    expect(loggerMock.error).toHaveBeenCalled();
    tauriMocks.invoke.mockResolvedValue({ x: 0, y: 0, width: 800, height: 600 });
    tauriMocks.invoke.mockResolvedValueOnce([]);
    await platform.attachment!.setTarget("10:21");
    await platform.setGeometry({ x: 100, y: 100, width: 640, height: 360 });
    expect(platform.attachment!.getState().targetId).toBeNull();
    tauriMocks.invoke.mockClear();
    await vi.advanceTimersByTimeAsync(500);
    expect(tauriMocks.invoke).not.toHaveBeenCalled();
  });

  it("最小化中に実況を止めて追従を解除しても、次回は手動領域を表示できる", async () => {
    vi.useFakeTimers();
    tauriMocks.window.show.mockClear();
    const platform = createTauriCommentOverlayPlatform();
    tauriMocks.invoke.mockResolvedValue(null);
    tauriMocks.invoke.mockResolvedValueOnce([]);
    await platform.attachment!.setTarget("10:20");
    await platform.hide();
    await platform.attachment!.setTarget(null);
    await platform.show();
    expect(tauriMocks.window.show).toHaveBeenCalledTimes(1);
  });

  it("geometry設定を論理座標のままnative windowへ適用する", async () => {
    const platform = createTauriCommentOverlayPlatform();

    await platform.setGeometry({ x: 24, y: 48, width: 1, height: 1 });

    expect(tauriMocks.window.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 24, y: 48 }),
    );
    expect(tauriMocks.window.setSize).toHaveBeenCalledWith(
      expect.objectContaining({ width: 320, height: 80 }),
    );
  });

  it("再起動後は保存した実行ファイルとタイトルから新しいウィンドウIDを取得する", async () => {
    vi.useFakeTimers();
    const manual = { x: 32, y: 64, width: 640, height: 128 };
    localStorage.setItem(COMMENT_OVERLAY_GEOMETRY_STORAGE_KEY, JSON.stringify(manual));
    localStorage.setItem(
      COMMENT_OVERLAY_ATTACHMENT_STORAGE_KEY,
      JSON.stringify({ processPath: "C:/Apps/player.exe", title: "動画プレイヤー" }),
    );
    tauriMocks.invoke.mockImplementation(async (command) => {
      if (command === "list_comment_overlay_windows") {
        return [
          { id: "30:40", title: "別の動画", processPath: "c:/apps/PLAYER.exe" },
          { id: "50:60", title: "動画プレイヤー", processPath: "c:/apps/PLAYER.exe" },
        ];
      }
      return { x: 400, y: 200, width: 1200, height: 800 };
    });
    const platform = createTauriCommentOverlayPlatform();
    await Promise.all([platform.restorePlacement!(), platform.show()]);

    expect(platform.attachment!.getState().targetId).toBe("50:60");
    expect(tauriMocks.invoke).toHaveBeenCalledWith("read_comment_overlay_target", { id: "50:60" });
    expect(localStorage.getItem(COMMENT_OVERLAY_GEOMETRY_STORAGE_KEY)).toBe(JSON.stringify(manual));
    expect(tauriMocks.window.setSize).toHaveBeenLastCalledWith({ width: 1200, height: 800 });

    await platform.attachment!.setTarget(null);
    expect(localStorage.getItem(COMMENT_OVERLAY_ATTACHMENT_STORAGE_KEY)).toBeNull();
    expect(tauriMocks.window.setSize).toHaveBeenLastCalledWith({ width: 640, height: 128 });
  });

  it("追従先アプリがない間は隠して待ち、起動・再起動後の窓へ自動で追従する", async () => {
    vi.useFakeTimers();
    tauriMocks.window.show.mockClear();
    localStorage.setItem(
      COMMENT_OVERLAY_ATTACHMENT_STORAGE_KEY,
      JSON.stringify({ processPath: "C:/Apps/player.exe", title: "動画プレイヤー" }),
    );
    let windows: { id: string; title: string; processPath: string }[] = [];
    let targetClosed = false;
    loggerMock.error.mockClear();
    tauriMocks.invoke.mockImplementation(async (command) => {
      if (command === "list_comment_overlay_windows") return windows;
      if (targetClosed) throw new Error("追従先が閉じられました");
      return { x: 400, y: 200, width: 1200, height: 800 };
    });
    const platform = createTauriCommentOverlayPlatform();
    await platform.show();
    expect(tauriMocks.window.show).not.toHaveBeenCalled();
    expect(platform.attachment!.getState().processPath).toBe("C:/Apps/player.exe");
    windows = [{ id: "30:40", title: "新しい動画", processPath: "C:/Apps/player.exe" }];
    await vi.advanceTimersByTimeAsync(1000);
    expect(platform.attachment!.getState().targetId).toBe("30:40");
    expect(tauriMocks.window.show).toHaveBeenCalledTimes(1);

    targetClosed = true;
    await vi.advanceTimersByTimeAsync(100);
    expect(platform.attachment!.getState().targetId).toBeNull();
    targetClosed = false;
    windows = [{ id: "70:80", title: "再起動後の動画", processPath: "C:/Apps/player.exe" }];
    await vi.advanceTimersByTimeAsync(1000);
    expect(platform.attachment!.getState().targetId).toBe("70:80");
    expect(platform.attachment!.getState().error).toBeNull();
    expect(tauriMocks.window.setSize).toHaveBeenCalledTimes(2);
    expect(loggerMock.error).toHaveBeenCalled();
    await platform.attachment!.setTarget(null);
  });

  it("選んだ追従先は実行ファイルで保存し、手動指定に戻すと記憶を解除する", async () => {
    vi.useFakeTimers();
    tauriMocks.invoke.mockResolvedValue({ x: 0, y: 0, width: 800, height: 600 });
    tauriMocks.invoke.mockResolvedValueOnce([
      { id: "10:20", title: "動画プレイヤー", processPath: "C:/Apps/player.exe" },
    ]);
    const platform = createTauriCommentOverlayPlatform();
    await platform.attachment!.setTarget("10:20");
    expect(JSON.parse(localStorage.getItem(COMMENT_OVERLAY_ATTACHMENT_STORAGE_KEY)!)).toEqual({
      processPath: "C:/Apps/player.exe",
      title: "動画プレイヤー",
    });
    await platform.setGeometry({ x: 100, y: 100, width: 640, height: 360 });
    expect(localStorage.getItem(COMMENT_OVERLAY_ATTACHMENT_STORAGE_KEY)).toBeNull();
  });

  it("表示専用窓と過去実況窓では配置の復元や追従ループを重複起動しない", async () => {
    localStorage.setItem(
      COMMENT_OVERLAY_ATTACHMENT_STORAGE_KEY,
      JSON.stringify({ processPath: "C:/Apps/player.exe", title: "動画プレイヤー" }),
    );
    const platform = createTauriCommentOverlayPlatform({ managePlacement: false });
    await platform.show();
    expect(tauriMocks.invoke).not.toHaveBeenCalled();
  });

  it("保存済みgeometryを読み込みnative windowへ復元する", async () => {
    localStorage.setItem(
      COMMENT_OVERLAY_GEOMETRY_STORAGE_KEY,
      JSON.stringify({ x: 32, y: 64, width: 640, height: 128 }),
    );
    const platform = createTauriCommentOverlayPlatform();

    await expect(platform.loadGeometry()).resolves.toEqual({
      x: 32,
      y: 64,
      width: 640,
      height: 128,
    });
    expect(tauriMocks.window.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 32, y: 64 }),
    );
    expect(tauriMocks.window.setSize).toHaveBeenCalledWith(
      expect.objectContaining({ width: 640, height: 128 }),
    );
  });

  it("保存位置が画面外ならwork area内へ戻して復元する", async () => {
    localStorage.setItem(
      COMMENT_OVERLAY_GEOMETRY_STORAGE_KEY,
      JSON.stringify({ x: 1_800, y: -100, width: 900, height: 240 }),
    );
    const platform = createTauriCommentOverlayPlatform();

    await expect(platform.loadGeometry()).resolves.toEqual({
      x: 1_020,
      y: 0,
      width: 900,
      height: 240,
    });
    expect(tauriMocks.window.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 1_020, y: 0 }),
    );
    expect(localStorage.getItem(COMMENT_OVERLAY_GEOMETRY_STORAGE_KEY)).toBe(
      JSON.stringify({ x: 1_020, y: 0, width: 900, height: 240 }),
    );
  });

  it("移動とリサイズのnative eventを論理geometryへ通知し、解除関数を返す", async () => {
    let movedHandler: (() => void) | undefined;
    let resizedHandler: (() => void) | undefined;
    const unlistenMoved = vi.fn();
    const unlistenResized = vi.fn();
    tauriMocks.window.onMoved.mockImplementationOnce(async (handler: () => void) => {
      movedHandler = handler;
      return unlistenMoved;
    });
    tauriMocks.window.onResized.mockImplementationOnce(async (handler: () => void) => {
      resizedHandler = handler;
      return unlistenResized;
    });
    const listener = vi.fn();
    const platform = createTauriCommentOverlayPlatform();

    const cleanup = await platform.watchGeometry(listener);
    movedHandler?.();
    resizedHandler?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(listener).toHaveBeenCalledWith({
      x: 100,
      y: 50,
      width: 900,
      height: 160,
    });
    expect(listener).toHaveBeenCalledTimes(2);

    cleanup();
    expect(unlistenMoved).toHaveBeenCalledTimes(1);
    expect(unlistenResized).toHaveBeenCalledTimes(1);
  });

  it("Overlayを閉じるとnative windowを隠し、全WebViewへ非表示を通知する", async () => {
    tauriMocks.window.hide.mockClear();
    const platform = createTauriCommentOverlayPlatform();

    await platform.close();

    expect(tauriMocks.window.hide).toHaveBeenCalledTimes(1);
    expect(tauriMocks.event.emit).toHaveBeenCalledWith(COMMENT_OVERLAY_VISIBILITY_EVENT_NAME, {
      visible: false,
    });
  });

  it("native monitor情報を操作パネル用の論理座標へ変換する", async () => {
    const platform = createTauriCommentOverlayPlatform();

    await expect(platform.getMonitors()).resolves.toEqual([
      expect.objectContaining({
        x: 0,
        y: 0,
        width: 1_920,
        height: 1_080,
        scaleFactor: 2,
      }),
    ]);
  });

  it("Main向けの表示状態eventを受け取り、解除関数を返す", async () => {
    let visibilityHandler: VisibilityEventHandler | undefined;
    const unlisten = vi.fn();
    tauriMocks.event.listen.mockImplementationOnce(
      async (_eventName: string, handler: VisibilityEventHandler) => {
        visibilityHandler = handler;
        return unlisten;
      },
    );
    const listener = vi.fn();
    const platform = createTauriCommentOverlayPlatform();

    const cleanup = await platform.watchVisibility(listener);
    visibilityHandler?.({ payload: { visible: false } });
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith(false));

    expect(listener).toHaveBeenCalledWith(false);
    cleanup();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("古い非表示eventと遅延した初期取得で現在の表示状態を上書きしない", async () => {
    let handler: VisibilityEventHandler | undefined;
    let finishInitial: ((visible: boolean) => void) | undefined;
    tauriMocks.event.listen.mockImplementationOnce(
      async (_name: string, next: VisibilityEventHandler) => {
        handler = next;
        return vi.fn();
      },
    );
    tauriMocks.window.isVisible
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            finishInitial = resolve;
          }),
      )
      .mockResolvedValue(true);
    const listener = vi.fn();
    const cleanup = await createTauriCommentOverlayPlatform().watchVisibility(listener);
    await vi.waitFor(() => expect(finishInitial).toBeDefined());
    handler?.({ payload: { visible: false } });
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith(true));
    finishInitial?.(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listener).toHaveBeenCalledTimes(1);
    cleanup();
    handler?.({ payload: { visible: false } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("負座標とDPI倍率を物理座標へ戻して選択画面の縮小画像を要求する", async () => {
    tauriMocks.invoke.mockResolvedValue("data:image/png;base64,preview");
    const platform = createTauriCommentOverlayPlatform();
    await expect(
      platform.captureMonitorPreview?.({
        id: "left",
        name: "左",
        x: -1536,
        y: -80,
        width: 1536,
        height: 864,
        scaleFactor: 1.25,
      }),
    ).resolves.toBe("data:image/png;base64,preview");
    expect(tauriMocks.invoke).toHaveBeenCalledWith("capture_comment_overlay_monitor_preview", {
      x: -1920,
      y: -100,
      width: 1920,
      height: 1080,
    });
  });
});
