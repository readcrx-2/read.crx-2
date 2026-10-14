export interface ViewerTransform {
  scale: number;
  x: number;
  y: number;
}

// 倍率差がこれ未満なら拡大縮小を伴わない移動とみなす（比率の分母が0に近づくのを避ける）。
const SCALE_EPSILON = 1e-6;

export function approachViewerTransform(
  current: ViewerTransform,
  target: ViewerTransform,
  elapsedMs: number,
): ViewerTransform {
  // 経過時間と45msの時定数で補間し、フレームレートが違っても同じ速さで目標へ追従させる。
  const progress = 1 - Math.exp(-elapsedMs / 45);
  // 対数空間で補間すると、拡大と縮小で倍率の変化を対称に感じられる。
  const scale = Math.exp(
    Math.log(current.scale) + (Math.log(target.scale) - Math.log(current.scale)) * progress,
  );

  const scaleSpan = target.scale - current.scale;
  if (Math.abs(scaleSpan) < SCALE_EPSILON * target.scale) {
    return {
      scale: target.scale,
      x: current.x + (target.x - current.x) * progress,
      y: current.y + (target.y - current.y) * progress,
    };
  }

  // 位置を時間ではなく倍率の進み具合に比例させる。transform-originが左上のため、
  // 位置と倍率を別々の曲線で補間すると途中でズーム中心の点が流れて戻り、
  // 左上から遠い画像端ほど大きくガクつく。位置を倍率の一次式にすると、
  // 現在と目標の間で画面上の同じ点に留まる画像上の点が必ず存在し、そこを中心に拡縮できる。
  const scaleProgress = (scale - current.scale) / scaleSpan;
  return {
    scale,
    x: current.x + (target.x - current.x) * scaleProgress,
    y: current.y + (target.y - current.y) * scaleProgress,
  };
}

export function isViewerTransformSettled(
  current: ViewerTransform,
  target: ViewerTransform,
): boolean {
  return (
    Math.abs(current.scale / target.scale - 1) < 0.001 &&
    Math.abs(current.x - target.x) < 0.25 &&
    Math.abs(current.y - target.y) < 0.25
  );
}
