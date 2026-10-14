import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { type MediaViewerProps, useMediaViewerController } from "./use-media-viewer-controller";
import { useMediaViewerStore } from "./use-media-viewer-store";

function ViewerHarness() {
  const props = useMediaViewerController("thread-a");
  if (!props) return null;
  return <ViewerSurface {...props} />;
}

function ViewerSurface({
  viewerStageRef,
  viewerCanvasRef,
  viewerImageRef,
  viewer,
  onImageLoad,
}: MediaViewerProps) {
  return (
    <div ref={viewerStageRef}>
      <div ref={viewerCanvasRef}>
        <img ref={viewerImageRef} src={viewer.src} onLoad={onImageLoad} alt="" />
      </div>
    </div>
  );
}

describe("画像ビューアのズームアニメーション", () => {
  let now: number;
  let frameId: number;
  let frames: Map<number, FrameRequestCallback>;
  let reduceMotion: boolean;

  beforeEach(() => {
    now = 0;
    frameId = 0;
    frames = new Map();
    reduceMotion = false;
    vi.spyOn(window.performance, "now").mockImplementation(() => now);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames.delete(id);
    });
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: reduceMotion })),
    );
    useMediaViewerStore.setState({
      viewer: { src: "https://example.com/image.jpg", label: "画像" },
      viewerScopeId: "thread-a",
      viewerScale: 1,
      isLoading: false,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function advanceFrame(elapsedMs: number) {
    now += elapsedMs;
    const callbacks = [...frames.values()];
    frames.clear();
    act(() => callbacks.forEach((callback) => callback(now)));
  }

  function mountViewer() {
    const result = render(<ViewerHarness />);
    const stage = result.container.firstElementChild as HTMLDivElement;
    const canvas = stage.firstElementChild as HTMLDivElement;
    const image = canvas.firstElementChild as HTMLImageElement;
    stage.getBoundingClientRect = () => new DOMRect(0, 0, 600, 400);
    Object.defineProperties(image, {
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 400 },
      naturalHeight: { configurable: true, value: 200 },
    });
    fireEvent.load(image);
    return { ...result, stage, canvas, image };
  }

  function getTransform(canvas: HTMLDivElement) {
    const match = canvas.style.transform.match(
      /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/,
    );
    if (!match) throw new Error(`画像のtransformを解析できません: ${canvas.style.transform}`);
    return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) };
  }

  it("倍率を時間に応じて補間し、補間中もカーソル下の点を固定したまま目標へ収束する", () => {
    const { stage, canvas } = mountViewer();
    const initial = canvas.style.transform;
    fireEvent.wheel(stage, { deltaY: -100, clientX: 200, clientY: 150 });
    expect(canvas.style.transform).toBe(initial);

    advanceFrame(45);
    const intermediate = getTransform(canvas);
    const progress = 1 - Math.exp(-1);
    const targetScale = Math.exp(0.18);
    expect(intermediate.scale).toBeCloseTo(Math.exp(0.18 * progress), 10);
    // 位置を倍率と別の曲線で補間すると途中でカーソル下の点が流れるため、途中でも固定されていることを確かめる。
    expect((200 - intermediate.x) / intermediate.scale).toBeCloseTo(100, 10);
    expect((150 - intermediate.y) / intermediate.scale).toBeCloseTo(50, 10);

    advanceFrame(1000);
    const final = getTransform(canvas);
    expect(final.scale).toBe(targetScale);
    expect((200 - final.x) / final.scale).toBeCloseTo(100, 10);
    expect((150 - final.y) / final.scale).toBeCloseTo(50, 10);
    expect(frames.size).toBe(0);
  });

  it("アニメーション途中の連続入力を累積し、表示を飛ばさずに追従する", () => {
    const { stage, canvas } = mountViewer();
    fireEvent.wheel(stage, { deltaY: -100, clientX: 200, clientY: 150 });
    advanceFrame(16);
    const intermediate = canvas.style.transform;
    fireEvent.wheel(stage, { deltaY: -100, clientX: 200, clientY: 150 });
    expect(canvas.style.transform).toBe(intermediate);
    expect(frames.size).toBe(1);
    advanceFrame(1000);
    expect(getTransform(canvas).scale).toBeCloseTo(Math.exp(0.36), 10);

    fireEvent.wheel(stage, { deltaY: 200, clientX: 200, clientY: 150 });
    advanceFrame(1000);
    const restored = getTransform(canvas);
    expect(restored.scale).toBeCloseTo(1, 10);
    expect(restored.x).toBeCloseTo(100, 10);
    expect(restored.y).toBeCloseTo(100, 10);
  });

  it("動きを減らす設定では即時に描画し、ドラッグも遅延させない", () => {
    reduceMotion = true;
    const { stage, canvas } = mountViewer();
    fireEvent.wheel(stage, { deltaY: -100, clientX: 200, clientY: 150 });
    const zoomed = getTransform(canvas);
    expect(zoomed.scale).toBe(Math.exp(0.18));
    expect(frames.size).toBe(0);
    fireEvent.mouseDown(stage, { button: 0, clientX: 200, clientY: 150 });
    fireEvent.mouseMove(window, { clientX: 230, clientY: 170 });
    fireEvent.mouseUp(window, { button: 0 });
    const panned = getTransform(canvas);
    expect(panned.x).toBe(zoomed.x + 30);
    expect(panned.y).toBe(zoomed.y + 20);
    expect(frames.size).toBe(0);
  });

  it("画像切り替えと破棄で描画フレームを解除する", () => {
    const { stage, canvas, image, unmount } = mountViewer();
    fireEvent.wheel(stage, { deltaY: -100 });
    expect(frames.size).toBe(1);
    act(() => {
      useMediaViewerStore
        .getState()
        .openMediaFromUrl("https://example.com/next.jpg", undefined, "thread-a");
    });
    expect(frames.size).toBe(0);
    fireEvent.load(image);
    expect(getTransform(canvas).scale).toBe(1);
    fireEvent.wheel(stage, { deltaY: -100 });
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
  });
});
