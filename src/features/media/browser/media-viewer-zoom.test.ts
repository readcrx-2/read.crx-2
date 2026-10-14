// @vitest-environment node
import { describe, expect, it } from "vite-plus/test";

import { approachViewerTransform, type ViewerTransform } from "./media-viewer-zoom";

// 画像上の点 (u, v) が画面上のどこに描画されるかを返す（transform-origin: 0 0 前提）。
function project(view: ViewerTransform, u: number, v: number) {
  return { x: view.x + u * view.scale, y: view.y + v * view.scale };
}

function zoomAround(
  view: ViewerTransform,
  pivot: { x: number; y: number },
  nextScale: number,
): ViewerTransform {
  const ratio = nextScale / view.scale;
  return {
    scale: nextScale,
    x: pivot.x - (pivot.x - view.x) * ratio,
    y: pivot.y - (pivot.y - view.y) * ratio,
  };
}

describe("approachViewerTransform", () => {
  it("画像端でズームしても、補間中にズーム中心の点が動かない", () => {
    const start: ViewerTransform = { scale: 2, x: -1200, y: -800 };
    // 左上から遠い右下寄りの点をズーム中心にする。
    const pivot = { x: 900, y: 700 };
    const goal = zoomAround(start, pivot, 6);
    const anchor = { u: (pivot.x - start.x) / start.scale, v: (pivot.y - start.y) / start.scale };

    let view = start;
    for (let frame = 0; frame < 30; frame += 1) {
      view = approachViewerTransform(view, goal, 16);
      const projected = project(view, anchor.u, anchor.v);
      expect(projected.x).toBeCloseTo(pivot.x, 6);
      expect(projected.y).toBeCloseTo(pivot.y, 6);
    }
  });

  it("補間途中で中心が変わっても、現在から目標までの間で固定点を保つ", () => {
    const start: ViewerTransform = { scale: 1, x: 0, y: 0 };
    const midway = approachViewerTransform(start, zoomAround(start, { x: 100, y: 100 }, 4), 16);
    const goal = zoomAround({ scale: 4, x: -300, y: -300 }, { x: 800, y: 600 }, 8);

    // 現在と目標から、画面上で動かない画像上の点を求める。
    const u = (goal.x - midway.x) / (midway.scale - goal.scale);
    const v = (goal.y - midway.y) / (midway.scale - goal.scale);
    const fixed = project(midway, u, v);

    let view = midway;
    for (let frame = 0; frame < 10; frame += 1) {
      view = approachViewerTransform(view, goal, 16);
      const projected = project(view, u, v);
      expect(projected.x).toBeCloseTo(fixed.x, 6);
      expect(projected.y).toBeCloseTo(fixed.y, 6);
    }
  });

  it("倍率が変わらない移動は位置だけを補間する", () => {
    const next = approachViewerTransform(
      { scale: 2, x: 0, y: 0 },
      { scale: 2, x: 100, y: -50 },
      45,
    );
    const progress = 1 - Math.exp(-1);
    expect(next.scale).toBe(2);
    expect(next.x).toBeCloseTo(100 * progress, 9);
    expect(next.y).toBeCloseTo(-50 * progress, 9);
  });

  it("十分な時間が経つと目標に収束する", () => {
    const goal: ViewerTransform = { scale: 0.5, x: 40, y: 30 };
    const next = approachViewerTransform({ scale: 3, x: -500, y: -200 }, goal, 2000);
    expect(next.scale).toBeCloseTo(goal.scale, 9);
    expect(next.x).toBeCloseTo(goal.x, 6);
    expect(next.y).toBeCloseTo(goal.y, 6);
  });
});
