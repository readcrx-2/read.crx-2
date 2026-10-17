import "./OverlayControlPanel.css";

import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createLogger } from "src/app/logger";

import {
  fitCommentOverlayGeometryToAspectRatio,
  normalizeCommentOverlayGeometry,
} from "../platform/geometry";
import {
  COMMENT_OVERLAY_ASPECT_RATIO,
  type CommentOverlayGeometry,
  type CommentOverlayMonitor,
  type CommentOverlayPreviewFrame,
  DEFAULT_COMMENT_OVERLAY_GEOMETRY,
} from "../platform/types";

const logger = createLogger("comment-overlay");

const MIN_WIDTH = 320;
const MIN_HEIGHT = 80;
// 変更理由: プレビューを実画面の動きに合わせて見せるため、約15fpsで連続更新する。
// 撮影が終わってから次を予約し、撮影が遅いときは待たずに続けて、重い撮影を重複させない。
const PREVIEW_FRAME_INTERVAL_MS = 66;

interface DesktopBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

type DragMode = "select" | "move" | "resize";
type ResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

interface DragState {
  mode: DragMode;
  pointerId: number;
  start: { x: number; y: number };
  origin: CommentOverlayGeometry;
  direction?: ResizeDirection;
}

const RESIZE_HANDLES: ReadonlyArray<{
  direction: ResizeDirection;
  cursor: string;
}> = [
  { direction: "NorthWest", cursor: "nwse-resize" },
  { direction: "North", cursor: "ns-resize" },
  { direction: "NorthEast", cursor: "nesw-resize" },
  { direction: "East", cursor: "ew-resize" },
  { direction: "SouthEast", cursor: "nwse-resize" },
  { direction: "South", cursor: "ns-resize" },
  { direction: "SouthWest", cursor: "nesw-resize" },
  { direction: "West", cursor: "ew-resize" },
];

export interface OverlayControlPanelProps {
  monitors: readonly CommentOverlayMonitor[];
  geometry?: CommentOverlayGeometry | null;
  lockAspectRatio: boolean;
  onLockAspectRatioChange: (locked: boolean) => void;
  onGeometryChange: (geometry: CommentOverlayGeometry) => void;
  captureMonitorPreview?: (
    monitor: CommentOverlayMonitor,
  ) => Promise<CommentOverlayPreviewFrame | null>;
  /** ドラッグの開始・終了を通知する。実画面にも同じ範囲の枠を出すために使う。 */
  onDragActiveChange?: (active: boolean) => void;
  /** 利用者が画面を切り替えるまで、最初にプレビューするモニターのid。 */
  initialMonitorId?: string | null;
}

function getMonitorBounds(monitor: CommentOverlayMonitor | null): DesktopBounds {
  if (monitor == null) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  return {
    x: monitor.x,
    y: monitor.y,
    width: Math.max(1, monitor.width),
    height: Math.max(1, monitor.height),
  };
}

function clampGeometry(
  geometry: CommentOverlayGeometry,
  bounds: DesktopBounds,
  lockAspectRatio = false,
): CommentOverlayGeometry {
  const normalized = normalizeCommentOverlayGeometry(geometry);
  let width = Math.min(Math.max(MIN_WIDTH, normalized.width), Math.max(MIN_WIDTH, bounds.width));
  let height = Math.min(
    Math.max(MIN_HEIGHT, normalized.height),
    Math.max(MIN_HEIGHT, bounds.height),
  );
  if (lockAspectRatio) {
    // 画面端でも一方の寸法だけを切り詰めず、画面内に収まる16:9のサイズへ揃える。
    width = Math.max(MIN_WIDTH, Math.round(Math.min(width, height * COMMENT_OVERLAY_ASPECT_RATIO)));
    height = Math.round(width / COMMENT_OVERLAY_ASPECT_RATIO);
  }
  return {
    x: Math.min(Math.max(normalized.x, bounds.x), bounds.x + bounds.width - width),
    y: Math.min(Math.max(normalized.y, bounds.y), bounds.y + bounds.height - height),
    width,
    height,
  };
}

function pointFromEvent(
  event: { clientX: number; clientY: number },
  svg: SVGSVGElement,
  bounds: DesktopBounds,
): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  return {
    x: bounds.x + ((event.clientX - rect.left) / Math.max(1, rect.width)) * bounds.width,
    y: bounds.y + ((event.clientY - rect.top) / Math.max(1, rect.height)) * bounds.height,
  };
}

function selectionGeometry(
  start: { x: number; y: number },
  current: { x: number; y: number },
  bounds: DesktopBounds,
  lockAspectRatio: boolean,
): CommentOverlayGeometry {
  const deltaX = current.x - start.x;
  const deltaY = current.y - start.y;
  const rawWidth = Math.max(1, Math.abs(deltaX));
  const rawHeight = Math.max(1, Math.abs(deltaY));
  if (!lockAspectRatio) {
    return clampGeometry(
      {
        x: Math.min(start.x, current.x),
        y: Math.min(start.y, current.y),
        width: rawWidth,
        height: rawHeight,
      },
      bounds,
    );
  }
  let width = Math.max(MIN_WIDTH, rawWidth);
  let height = width / COMMENT_OVERLAY_ASPECT_RATIO;
  if (rawHeight < height) {
    height = Math.max(MIN_HEIGHT, rawHeight);
    width = height * COMMENT_OVERLAY_ASPECT_RATIO;
  }
  return clampGeometry(
    {
      x: deltaX < 0 ? start.x - width : start.x,
      y: deltaY < 0 ? start.y - height : start.y,
      width,
      height,
    },
    bounds,
    lockAspectRatio,
  );
}

function movedGeometry(
  origin: CommentOverlayGeometry,
  start: { x: number; y: number },
  current: { x: number; y: number },
  bounds: DesktopBounds,
): CommentOverlayGeometry {
  return clampGeometry(
    {
      ...origin,
      x: origin.x + current.x - start.x,
      y: origin.y + current.y - start.y,
    },
    bounds,
  );
}

function resizedGeometry(
  origin: CommentOverlayGeometry,
  start: { x: number; y: number },
  current: { x: number; y: number },
  direction: ResizeDirection,
  bounds: DesktopBounds,
  lockAspectRatio: boolean,
): CommentOverlayGeometry {
  const deltaX = current.x - start.x;
  const deltaY = current.y - start.y;
  const resized: CommentOverlayGeometry = {
    x: direction.includes("West") ? origin.x + deltaX : origin.x,
    y: direction.includes("North") ? origin.y + deltaY : origin.y,
    width:
      origin.width +
      (direction.includes("West") ? -deltaX : direction.includes("East") ? deltaX : 0),
    height:
      origin.height +
      (direction.includes("North") ? -deltaY : direction.includes("South") ? deltaY : 0),
  };
  if (!lockAspectRatio) {
    // 固定OFFでは各辺を独立して動かし、最小サイズに達しても反対側の辺を移動しない。
    const width = Math.max(MIN_WIDTH, resized.width);
    const height = Math.max(MIN_HEIGHT, resized.height);
    return clampGeometry(
      {
        x: direction.includes("West") ? origin.x + origin.width - width : resized.x,
        y: direction.includes("North") ? origin.y + origin.height - height : resized.y,
        width,
        height,
      },
      bounds,
    );
  }
  const hasHorizontalHandle = direction.includes("East") || direction.includes("West");
  const hasVerticalHandle = direction.includes("North") || direction.includes("South");
  // 変更理由: 角のハンドルは動かした距離が大きい軸を基準にし、辺のハンドルは
  // その辺だけを基準にする。複雑な補正を重ねず、選択範囲と同じ16:9規則へ揃える。
  const useWidth =
    hasHorizontalHandle && (!hasVerticalHandle || Math.abs(deltaX) >= Math.abs(deltaY));
  let width = useWidth ? resized.width : resized.height * COMMENT_OVERLAY_ASPECT_RATIO;
  let height = useWidth ? resized.width / COMMENT_OVERLAY_ASPECT_RATIO : resized.height;
  width = Math.max(MIN_WIDTH, width);
  height = Math.max(MIN_HEIGHT, height);
  const next = {
    x: direction.includes("West") ? origin.x + origin.width - width : resized.x,
    y: direction.includes("North") ? origin.y + origin.height - height : resized.y,
    width,
    height,
  };
  return clampGeometry(next, bounds, lockAspectRatio);
}

function monitorContainsPoint(
  monitor: CommentOverlayMonitor,
  point: { x: number; y: number },
): boolean {
  return (
    point.x >= monitor.x &&
    point.x <= monitor.x + monitor.width &&
    point.y >= monitor.y &&
    point.y <= monitor.y + monitor.height
  );
}

function monitorGeometry(
  monitor: CommentOverlayMonitor,
  lockAspectRatio: boolean,
): CommentOverlayGeometry {
  return clampGeometry(
    {
      x: monitor.x,
      y: monitor.y,
      width: monitor.width,
      height: monitor.height,
    },
    getMonitorBounds(monitor),
    lockAspectRatio,
  );
}

export function OverlayControlPanel({
  monitors,
  geometry = DEFAULT_COMMENT_OVERLAY_GEOMETRY,
  lockAspectRatio,
  onLockAspectRatioChange,
  onGeometryChange,
  captureMonitorPreview,
  onDragActiveChange,
  initialMonitorId = null,
}: OverlayControlPanelProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<CommentOverlayGeometry | null>(null);
  const [previewMonitorId, setPreviewMonitorId] = useState<string | null>(null);
  const geometryMonitor = useMemo(() => {
    const source = geometry ?? DEFAULT_COMMENT_OVERLAY_GEOMETRY;
    const center = {
      x: source.x + source.width / 2,
      y: source.y + source.height / 2,
    };
    return monitors.find((monitor) => monitorContainsPoint(monitor, center)) ?? null;
  }, [geometry, monitors]);
  // 変更理由: 全モニターを1枚のSVGへ押し込むと横長の座標系で各画面が縦に潰れるため、
  // 操作対象を1画面へ限定し、その画面本来の縦横比でプレビューする。
  const previewMonitor =
    monitors.find((monitor) => monitor.id === previewMonitorId) ??
    monitors.find((monitor) => monitor.id === initialMonitorId) ??
    geometryMonitor ??
    monitors[0] ??
    null;
  const previewMonitorIndex = previewMonitor == null ? -1 : monitors.indexOf(previewMonitor);
  const bounds = useMemo(() => getMonitorBounds(previewMonitor), [previewMonitor]);
  const currentGeometry = useMemo(() => {
    const source = geometry ?? DEFAULT_COMMENT_OVERLAY_GEOMETRY;
    const center = {
      x: source.x + source.width / 2,
      y: source.y + source.height / 2,
    };
    return previewMonitor && monitorContainsPoint(previewMonitor, center)
      ? clampGeometry(source, bounds, lockAspectRatio)
      : null;
  }, [bounds, geometry, lockAspectRatio, previewMonitor]);
  const displayedGeometry = dragPreview ?? currentGeometry;
  // フレームそのものはcanvasへ直接描き、約15fpsでReactを再描画しない。stateは表示状態だけを持つ。
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [screenPreview, setScreenPreview] = useState<{
    monitor: CommentOverlayMonitor;
    hasImage: boolean;
    error: boolean;
  } | null>(null);
  const currentPreview = screenPreview?.monitor === previewMonitor ? screenPreview : null;
  const isPreviewLoading =
    captureMonitorPreview != null && previewMonitor != null && !currentPreview;

  useEffect(() => {
    if (!captureMonitorPreview || !previewMonitor) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const updateStatus = (hasImage: boolean, error: boolean): void => {
      // 毎フレーム同じ状態を設定してもReactを再描画しない。
      setScreenPreview((current) =>
        current?.monitor === previewMonitor &&
        current.hasImage === hasImage &&
        current.error === error
          ? current
          : { monitor: previewMonitor, hasImage, error },
      );
    };
    const drawFrame = (frame: CommentOverlayPreviewFrame): void => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      if (canvas.width !== frame.width || canvas.height !== frame.height) {
        canvas.width = frame.width;
        canvas.height = frame.height;
      }
      context.putImageData(new ImageData(frame.pixels, frame.width, frame.height), 0, 0);
    };
    const scheduleNext = (startedAt: number): void => {
      if (disposed) return;
      const wait = Math.max(0, PREVIEW_FRAME_INTERVAL_MS - (performance.now() - startedAt));
      timer = setTimeout(() => void captureOnce(), wait);
    };
    const captureOnce = async (): Promise<void> => {
      const startedAt = performance.now();
      // 窓が最小化・背面タブなどで見えない間は撮影せず、表示されたら再開する。
      if (svgRef.current?.ownerDocument.visibilityState === "hidden") {
        scheduleNext(startedAt);
        return;
      }
      try {
        const frame = await captureMonitorPreview(previewMonitor);
        if (disposed) return;
        if (frame) drawFrame(frame);
        updateStatus(frame != null, false);
        // 撮影に対応しない環境（null）では、同じ結果を繰り返し要求しない。
        if (frame != null) scheduleNext(startedAt);
      } catch (error: unknown) {
        logger.error("ディスプレイのプレビュー取得に失敗しました:", error);
        if (disposed) return;
        // 一時的な失敗で直前の画像を消さず、次の周期で自動的に再試行する。
        setScreenPreview((current) => ({
          monitor: previewMonitor,
          hasImage: current?.monitor === previewMonitor && current.hasImage,
          error: true,
        }));
        scheduleNext(startedAt);
      }
    };
    void captureOnce();
    return () => {
      // 画面切り替え後に前の撮影が完了しても、別画面の画像を表示しない。
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [captureMonitorPreview, previewMonitor]);

  const startDrag = (
    event: ReactPointerEvent<SVGElement>,
    mode: DragMode,
    direction?: ResizeDirection,
  ): void => {
    if (event.button !== 0 || !svgRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const start = pointFromEvent(event, svgRef.current, bounds);
    const next: DragState = {
      mode,
      pointerId: event.pointerId,
      start,
      origin:
        currentGeometry ??
        clampGeometry(
          {
            ...DEFAULT_COMMENT_OVERLAY_GEOMETRY,
            x: bounds.x + DEFAULT_COMMENT_OVERLAY_GEOMETRY.x,
            y: bounds.y + DEFAULT_COMMENT_OVERLAY_GEOMETRY.y,
          },
          bounds,
          lockAspectRatio,
        ),
      ...(direction ? { direction } : {}),
    };
    dragRef.current = next;
    onDragActiveChange?.(true);
    if (typeof svgRef.current.setPointerCapture === "function") {
      svgRef.current.setPointerCapture(event.pointerId);
    }
    setDragPreview(currentGeometry);
  };

  const updateDrag = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const drag = dragRef.current;
    if (!drag || !svgRef.current || event.pointerId !== drag.pointerId) return;
    const current = pointFromEvent(event, svgRef.current, bounds);
    const next =
      drag.mode === "select"
        ? selectionGeometry(drag.start, current, bounds, lockAspectRatio)
        : drag.mode === "move"
          ? movedGeometry(drag.origin, drag.start, current, bounds)
          : resizedGeometry(
              drag.origin,
              drag.start,
              current,
              drag.direction ?? "SouthEast",
              bounds,
              lockAspectRatio,
            );
    setDragPreview(next);
    // 変更理由: パネル内の選択範囲とnative Overlayを同時に追従させ、離した瞬間だけ
    // 反映される遅延感をなくす。呼び出し元でIPCを適宜まとめられる契約にする。
    onGeometryChange(next);
  };

  const finishDrag = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (
      svgRef.current &&
      typeof svgRef.current.hasPointerCapture === "function" &&
      svgRef.current.hasPointerCapture(event.pointerId)
    ) {
      svgRef.current.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragPreview(null);
    onDragActiveChange?.(false);
  };

  const handleMonitorDoubleClick = (
    event: ReactMouseEvent<SVGSVGElement>,
    monitor: CommentOverlayMonitor,
  ): void => {
    // 変更理由: Overlay自身は常時クリック透過なので、ディスプレイ単位の操作は
    // この仮想画面からgeometryを直接作り、実ウィンドウへ遠隔反映する。
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
    setDragPreview(null);
    onGeometryChange(monitorGeometry(monitor, lockAspectRatio));
  };

  const handleReset = (): void => {
    // 変更理由: 別モニターをプレビュー中の初期化で主画面へ飛ばさず、現在選んでいる
    // 画面の左上を基準に同じ既定サイズへ戻す。
    onGeometryChange(
      clampGeometry(
        {
          ...DEFAULT_COMMENT_OVERLAY_GEOMETRY,
          x: bounds.x + DEFAULT_COMMENT_OVERLAY_GEOMETRY.x,
          y: bounds.y + DEFAULT_COMMENT_OVERLAY_GEOMETRY.y,
        },
        bounds,
        lockAspectRatio,
      ),
    );
  };

  const selectAdjacentMonitor = (offset: number): void => {
    if (previewMonitorIndex < 0 || monitors.length < 2) return;
    const nextIndex = (previewMonitorIndex + offset + monitors.length) % monitors.length;
    // 変更理由: 矢印操作はプレビュー先だけを変え、選んだだけで実Overlayを移動しない。
    // 移動は範囲指定かダブルクリックで利用者が確定した時だけ反映する。
    setPreviewMonitorId(monitors[nextIndex]?.id ?? null);
    dragRef.current = null;
    setDragPreview(null);
  };

  return (
    <section className="overlay-control-panel" data-testid="overlay-control-panel">
      <header className="overlay-control-panel__header">
        <div>
          <h2>コメント表示領域</h2>
          <p>ディスプレイのプレビュー上で範囲を指定します。</p>
        </div>
        <button type="button" onClick={handleReset}>
          初期位置
        </button>
      </header>

      <label className="overlay-control-panel__aspect-ratio">
        <input
          type="checkbox"
          checked={lockAspectRatio}
          onChange={(event) => {
            const locked = event.target.checked;
            dragRef.current = null;
            setDragPreview(null);
            onLockAspectRatioChange(locked);
            if (locked && currentGeometry) {
              onGeometryChange(
                clampGeometry(
                  fitCommentOverlayGeometryToAspectRatio(currentGeometry),
                  bounds,
                  true,
                ),
              );
            }
          }}
        />
        縦横比を固定（16:9）
      </label>

      {monitors.length === 0 ? (
        <p className="overlay-control-panel__empty" role="status">
          ディスプレイ情報を取得できません。
        </p>
      ) : (
        <>
          <div className="overlay-control-panel__monitor-navigation">
            <button
              type="button"
              aria-label="前のディスプレイをプレビュー"
              disabled={monitors.length < 2}
              onClick={() => selectAdjacentMonitor(-1)}
            >
              ←
            </button>
            <div aria-live="polite">
              <strong>{previewMonitor?.name}</strong>
              <span>
                {previewMonitorIndex + 1} / {monitors.length} ・ {previewMonitor?.width} ×{" "}
                {previewMonitor?.height}
              </span>
            </div>
            <button
              type="button"
              aria-label="次のディスプレイをプレビュー"
              disabled={monitors.length < 2}
              onClick={() => selectAdjacentMonitor(1)}
            >
              →
            </button>
          </div>
          {captureMonitorPreview && (
            <div className="overlay-control-panel__preview-status">
              <span role="status">
                {isPreviewLoading
                  ? "画面を取得中…"
                  : currentPreview?.error
                    ? "画面を取得できませんでした。自動で再試行します。"
                    : currentPreview?.hasImage
                      ? "プレビューを自動更新中"
                      : "この環境では画面の撮影に対応していません。"}
              </span>
            </div>
          )}
          {/* 窓の高さに合わせてプレビューを縮められるよう、縦横比をCSSへ渡す枠で包む。 */}
          <div
            className="overlay-control-panel__desktop-frame"
            style={
              {
                "--overlay-preview-ratio": String(bounds.width / bounds.height),
              } as CSSProperties
            }
          >
            <svg
              ref={svgRef}
              className="overlay-control-panel__desktop"
              data-testid="overlay-control-panel-desktop"
              viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
              preserveAspectRatio="xMidYMid meet"
              style={{ aspectRatio: `${bounds.width} / ${bounds.height}` }}
              role="img"
              aria-label={`${previewMonitor?.name ?? "ディスプレイ"}のプレビュー`}
              onPointerMove={updateDrag}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
              onDoubleClick={(event) => {
                if (previewMonitor) handleMonitorDoubleClick(event, previewMonitor);
              }}
            >
              <rect
                className="overlay-control-panel__desktop-background"
                x={bounds.x}
                y={bounds.y}
                width={bounds.width}
                height={bounds.height}
                data-overlay-control-background="true"
                onPointerDown={(event) => startDrag(event, "select")}
              />
              {previewMonitor && (
                <g
                  className="overlay-control-panel__monitor overlay-control-panel__monitor--selected"
                  data-monitor-id={previewMonitor.id}
                >
                  <rect
                    x={previewMonitor.x}
                    y={previewMonitor.y}
                    width={previewMonitor.width}
                    height={previewMonitor.height}
                    className="overlay-control-panel__monitor-screen"
                    onPointerDown={(event) => startDrag(event, "select")}
                  />
                  {captureMonitorPreview && (
                    // SVGはピクセル列を直接描けないため、foreignObjectのcanvasへフレームを描く。
                    // クリックは下の画面の矩形へ通し、範囲指定の操作を妨げない。
                    <foreignObject
                      x={bounds.x}
                      y={bounds.y}
                      width={bounds.width}
                      height={bounds.height}
                      className="overlay-control-panel__screen-preview"
                      visibility={currentPreview?.hasImage ? "visible" : "hidden"}
                    >
                      <canvas
                        ref={canvasRef}
                        className="overlay-control-panel__screen-canvas"
                        aria-hidden="true"
                      />
                    </foreignObject>
                  )}
                  {!currentPreview?.hasImage && (
                    <text
                      x={previewMonitor.x + previewMonitor.width / 2}
                      y={previewMonitor.y + previewMonitor.height / 2}
                      className="overlay-control-panel__monitor-label"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {previewMonitor.name}
                    </text>
                  )}
                </g>
              )}
              {displayedGeometry && (
                <rect
                  className="overlay-control-panel__selection"
                  data-testid="overlay-control-panel-selection"
                  x={displayedGeometry.x}
                  y={displayedGeometry.y}
                  width={displayedGeometry.width}
                  height={displayedGeometry.height}
                  onPointerDown={(event) => startDrag(event, "move")}
                />
              )}
              {displayedGeometry &&
                RESIZE_HANDLES.map(({ direction, cursor }) => {
                  const x = direction.includes("West")
                    ? displayedGeometry.x
                    : direction.includes("East")
                      ? displayedGeometry.x + displayedGeometry.width
                      : displayedGeometry.x + displayedGeometry.width / 2;
                  const y = direction.includes("North")
                    ? displayedGeometry.y
                    : direction.includes("South")
                      ? displayedGeometry.y + displayedGeometry.height
                      : displayedGeometry.y + displayedGeometry.height / 2;
                  return (
                    <g key={direction}>
                      {/* 縮小表示でもクリック領域を画面上の太さで確保し、細い枠を狙わせない。 */}
                      <rect
                        className="overlay-control-panel__handle-target"
                        style={{ cursor }}
                        x={x - Math.max(8, bounds.width * 0.006)}
                        y={y - Math.max(8, bounds.height * 0.012)}
                        width={Math.max(16, bounds.width * 0.012)}
                        height={Math.max(16, bounds.height * 0.024)}
                        aria-label={`${direction}方向へリサイズ`}
                        onPointerDown={(event) => startDrag(event, "resize", direction)}
                      />
                      <rect
                        className="overlay-control-panel__handle"
                        x={x}
                        y={y}
                        width={0.01}
                        height={0.01}
                        aria-hidden="true"
                      />
                    </g>
                  );
                })}
            </svg>
          </div>
          <div className="overlay-control-panel__help">
            <span>ドラッグ: 範囲指定 / 移動</span>
            <span>ダブルクリック: ディスプレイ全体</span>
          </div>
          {displayedGeometry ? (
            <dl className="overlay-control-panel__geometry" aria-label="選択中のサイズ">
              <div>
                <dt>位置</dt>
                <dd>
                  {Math.round(displayedGeometry.x)}, {Math.round(displayedGeometry.y)}
                </dd>
              </div>
              <div>
                <dt>サイズ</dt>
                <dd>
                  {Math.round(displayedGeometry.width)} × {Math.round(displayedGeometry.height)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="overlay-control-panel__unselected">
              このディスプレイには表示領域がありません。ドラッグまたはダブルクリックで指定します。
            </p>
          )}
        </>
      )}
    </section>
  );
}
