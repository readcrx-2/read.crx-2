import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  type CommentOverlayMonitor,
  type CommentOverlayPreviewFrame,
  DEFAULT_COMMENT_OVERLAY_GEOMETRY,
} from "../platform/types";
import { OverlayControlPanel } from "./OverlayControlPanel";

const monitor: CommentOverlayMonitor = {
  id: "main",
  name: "メインモニター",
  x: 0,
  y: 0,
  width: 1_920,
  height: 1_080,
  scaleFactor: 1,
};

const secondMonitor: CommentOverlayMonitor = {
  id: "sub",
  name: "サブモニター",
  x: 1_920,
  y: 0,
  width: 2_560,
  height: 1_440,
  scaleFactor: 1.25,
};

const previewFrame: CommentOverlayPreviewFrame = {
  width: 1,
  height: 1,
  pixels: new Uint8ClampedArray([1, 2, 3, 255]),
};

// jsdomはcanvasの描画を実装しないため、描画先のコンテキストを差し替えて描画回数を確認する。
function mockCanvasContext() {
  const putImageData = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    putImageData,
  } as unknown as CanvasRenderingContext2D);
  vi.stubGlobal(
    "ImageData",
    class {
      constructor(
        readonly data: Uint8ClampedArray,
        readonly width: number,
        readonly height: number,
      ) {}
    },
  );
  return putImageData;
}

describe("OverlayControlPanel", () => {
  it("選択した実画面のプレビューを約15fpsで連続して撮影し、範囲を指定できる", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const putImageData = mockCanvasContext();
    const capture = vi.fn().mockResolvedValue(previewFrame);
    const onGeometryChange = vi.fn();
    render(
      <OverlayControlPanel
        monitors={[monitor, secondMonitor]}
        lockAspectRatio={false}
        onLockAspectRatioChange={vi.fn()}
        onGeometryChange={onGeometryChange}
        captureMonitorPreview={capture}
      />,
    );
    await waitFor(() => expect(screen.getByText("プレビューを自動更新中")).toBeInTheDocument());
    expect(capture).toHaveBeenCalledExactlyOnceWith(monitor);
    expect(screen.queryByRole("button", { name: "プレビューを更新" })).toBeNull();
    expect(putImageData).toHaveBeenCalledTimes(1);
    fireEvent.doubleClick(screen.getByTestId("overlay-control-panel-desktop"));
    expect(onGeometryChange).toHaveBeenCalledWith({ x: 0, y: 0, width: 1920, height: 1080 });
    // 前回の撮影が終わってから短い間隔で撮り直し、そのたびにcanvasへ描く。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await waitFor(() => expect(capture.mock.calls.length).toBeGreaterThanOrEqual(3));
    expect(putImageData.mock.calls.length).toBe(capture.mock.calls.length);
    fireEvent.click(screen.getByRole("button", { name: "次のディスプレイをプレビュー" }));
    await waitFor(() => expect(capture).toHaveBeenLastCalledWith(secondMonitor));
    await waitFor(() =>
      expect(document.querySelector("foreignObject")).toHaveAttribute("x", "1920"),
    );
  });

  it("前の画面の撮影が遅れて完了しても選択中の画面に混ざらない", async () => {
    const putImageData = mockCanvasContext();
    const firstFrame = { ...previewFrame, pixels: new Uint8ClampedArray([9, 9, 9, 255]) };
    const secondFrame = { ...previewFrame, pixels: new Uint8ClampedArray([7, 7, 7, 255]) };
    let finishFirst: ((frame: CommentOverlayPreviewFrame) => void) | undefined;
    const capture = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<CommentOverlayPreviewFrame>((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockResolvedValue(secondFrame);
    render(
      <OverlayControlPanel
        monitors={[monitor, secondMonitor]}
        lockAspectRatio={false}
        onLockAspectRatioChange={vi.fn()}
        onGeometryChange={vi.fn()}
        captureMonitorPreview={capture}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "次のディスプレイをプレビュー" }));
    await waitFor(() => expect(putImageData).toHaveBeenCalled());
    const drawnBefore = putImageData.mock.calls.length;
    await act(async () => {
      finishFirst?.(firstFrame);
    });
    // 遅れて届いた前の画面のフレームは描かない。
    expect(putImageData.mock.calls.length).toBe(drawnBefore);
    expect(
      putImageData.mock.calls.some(
        ([image]) => (image as { data: Uint8ClampedArray }).data[0] === 9,
      ),
    ).toBe(false);
  });

  it("撮影に失敗しても範囲指定を維持し、次の周期で自動的に再試行する", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockCanvasContext();
    const capture = vi
      .fn()
      .mockRejectedValueOnce(new Error("撮影失敗"))
      .mockResolvedValue(previewFrame);
    render(
      <OverlayControlPanel
        monitors={[monitor]}
        lockAspectRatio={false}
        onLockAspectRatioChange={vi.fn()}
        onGeometryChange={vi.fn()}
        captureMonitorPreview={capture}
      />,
    );
    await waitFor(() => expect(screen.getByText(/画面を取得できませんでした/)).toBeInTheDocument());
    expect(screen.getByTestId("overlay-control-panel-selection")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await waitFor(() => expect(screen.getByText("プレビューを自動更新中")).toBeInTheDocument());
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("撮影に対応しない環境では同じ撮影を繰り返し要求しない", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const capture = vi.fn().mockResolvedValue(null);
    render(
      <OverlayControlPanel
        monitors={[monitor]}
        lockAspectRatio={false}
        onLockAspectRatioChange={vi.fn()}
        onGeometryChange={vi.fn()}
        captureMonitorPreview={capture}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("この環境では画面の撮影に対応していません。")).toBeInTheDocument(),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("ディスプレイをダブルクリックすると全画面geometryを通知する", () => {
    const onGeometryChange = vi.fn();
    render(
      <OverlayControlPanel
        monitors={[monitor]}
        geometry={DEFAULT_COMMENT_OVERLAY_GEOMETRY}
        lockAspectRatio={false}
        onLockAspectRatioChange={vi.fn()}
        onGeometryChange={onGeometryChange}
      />,
    );

    fireEvent.doubleClick(screen.getByTestId("overlay-control-panel-desktop"));

    expect(onGeometryChange).toHaveBeenCalledWith({
      x: 0,
      y: 0,
      width: 1_920,
      height: 1_080,
    });
  });

  it("左右ボタンで1画面ずつ縦横比を保ったプレビューへ切り替える", () => {
    const onGeometryChange = vi.fn();
    render(
      <OverlayControlPanel
        monitors={[monitor, secondMonitor]}
        geometry={DEFAULT_COMMENT_OVERLAY_GEOMETRY}
        lockAspectRatio={false}
        onLockAspectRatioChange={vi.fn()}
        onGeometryChange={onGeometryChange}
      />,
    );

    const desktop = screen.getByTestId("overlay-control-panel-desktop");
    expect(document.querySelector('[data-monitor-id="main"]')).toBeInTheDocument();
    expect(document.querySelector('[data-monitor-id="sub"]')).not.toBeInTheDocument();
    expect(desktop).toHaveAttribute("viewBox", "0 0 1920 1080");

    fireEvent.click(screen.getByRole("button", { name: "次のディスプレイをプレビュー" }));

    expect(document.querySelector('[data-monitor-id="main"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-monitor-id="sub"]')).toBeInTheDocument();
    expect(desktop).toHaveAttribute("viewBox", "1920 0 2560 1440");
    expect(screen.getByText(/このディスプレイには表示領域がありません/)).toBeInTheDocument();

    fireEvent.doubleClick(desktop);

    expect(onGeometryChange).toHaveBeenLastCalledWith({
      x: 1_920,
      y: 0,
      width: 2_560,
      height: 1_440,
    });
  });

  it("ドラッグの開始と終了を通知する", () => {
    const onDragActiveChange = vi.fn();
    render(
      <OverlayControlPanel
        monitors={[monitor]}
        geometry={DEFAULT_COMMENT_OVERLAY_GEOMETRY}
        lockAspectRatio={false}
        onLockAspectRatioChange={vi.fn()}
        onGeometryChange={vi.fn()}
        onDragActiveChange={onDragActiveChange}
      />,
    );
    const desktop = screen.getByTestId("overlay-control-panel-desktop");

    fireEvent.pointerDown(desktop.querySelector("[data-overlay-control-background]")!, {
      button: 0,
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    expect(onDragActiveChange).toHaveBeenLastCalledWith(true);
    fireEvent.pointerUp(desktop, { pointerId: 1 });
    expect(onDragActiveChange).toHaveBeenLastCalledWith(false);
  });

  it("仮想デスクトップをドラッグすると選択geometryを追従させる", () => {
    const onGeometryChange = vi.fn();
    render(
      <OverlayControlPanel
        monitors={[monitor]}
        geometry={DEFAULT_COMMENT_OVERLAY_GEOMETRY}
        lockAspectRatio={false}
        onLockAspectRatioChange={vi.fn()}
        onGeometryChange={onGeometryChange}
      />,
    );
    const desktop = screen.getByTestId("overlay-control-panel-desktop");
    vi.spyOn(desktop, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 1_920,
      height: 1_080,
      top: 0,
      right: 1_920,
      bottom: 1_080,
      left: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(desktop.querySelector("[data-overlay-control-background]")!, {
      button: 0,
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(desktop, {
      pointerId: 1,
      clientX: 900,
      clientY: 550,
    });
    fireEvent.pointerUp(desktop, { pointerId: 1 });

    expect(onGeometryChange).toHaveBeenCalled();
    expect(onGeometryChange.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }),
    );
  });
});
