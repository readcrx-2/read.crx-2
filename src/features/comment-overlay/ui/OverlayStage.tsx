import "./OverlayStage.css";

import type { CSSProperties } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toViewerImageUrl } from "src/core/util/url-media";
import { ExternalImage } from "src/features/media/ui/ExternalImage";
import { copyText } from "src/view/browser/utils/clipboard";

import {
  type CommentBacklogPolicy,
  type CommentCollisionMode,
  commentIdentity,
  CommentScheduler,
  type CommentSchedulerSnapshot,
  DEFAULT_COMMENT_BACKLOG_POLICY,
  DEFAULT_COMMENT_COLLISION_MODE,
  DEFAULT_MAX_ACTIVE_COUNT,
  DEFAULT_MAX_LANE_COUNT,
  DEFAULT_MAX_QUEUE_SIZE,
} from "../domain";
import type { CommentCandidate } from "../domain/comment-types";

const DEFAULT_STAGE_WIDTH = 800;
const DEFAULT_STAGE_HEIGHT = 240;
/**
 * コメント文字サイズは設定へ保存せず、StorybookとTauri実機が同じ基準値を使う。
 * 変更理由: 実機だけ古い保存値や別アプリの既定値を読むと表示倍率の基準がずれ、
 * 文字の重なりや「設定を変えても反映されない」状態を再発させるため。
 * 調整するときはこの値だけを変更し、各設定やStoryへ個別のpx値を追加しない。
 */
export const COMMENT_OVERLAY_FONT_SIZE = 25;
const DEFAULT_COMMENT_OPACITY = 0.95;
export const DEFAULT_COMMENT_HISTORY_LIMIT = 3_000;
const COMMENT_IMAGE_WIDTH = 180;
const COMMENT_IMAGE_HEIGHT = 120;

/** CSSのline-heightと行間を揃え、文字サイズ変更後もレスが上下から切れない高さにする。 */
export function calculateCommentLaneHeight(fontSize: number): number {
  return Math.max(1, Math.ceil(fontSize * 1.2 + 4));
}

/** 基準サイズに対する縦横の短い側を使い、縦横比が変わっても表示物を一様に拡縮する。 */
export function calculateOverlayDisplayScale(
  width: number,
  height: number,
  referenceWidth: number,
  referenceHeight: number,
): number {
  if (referenceWidth <= 0 || referenceHeight <= 0) return 1;
  return Math.max(0.01, Math.min(width / referenceWidth, height / referenceHeight));
}

export interface OverlayStageProps {
  comments: readonly CommentCandidate[];
  stageWidth?: number;
  stageHeight?: number;
  /** native windowから得た実寸。schedulerの基準サイズとは分離して渡す。 */
  containerWidth?: number;
  containerHeight?: number;
  laneHeight?: number;
  maxLaneCount?: number;
  durationSeconds?: number;
  baseSpeedPxPerSecond?: number;
  topPadding?: number;
  bottomPadding?: number;
  maxQueueSize?: number;
  collisionMode?: CommentCollisionMode;
  backlogPolicy?: CommentBacklogPolicy;
  maxActiveCount?: number;
  fontFamily?: string;
  fontWeight?: number;
  fontColor?: string;
  shadowSize?: number;
  shadowColor?: string;
  shadowDirections?: readonly ("top-left" | "top-right" | "bottom-left" | "bottom-right")[];
  commentOpacity?: number;
  backgroundColor?: string;
  playing?: boolean;
  fitToContainer?: boolean;
  scaleToContainer?: boolean;
  scaleReferenceWidth?: number;
  scaleReferenceHeight?: number;
  interactive?: boolean;
  showCommentInfo?: boolean;
  estimateWidth?: (comment: CommentCandidate, fontSize: number) => number;
  onQueueOverflow?: (comment: CommentCandidate) => void;
  onCommentClick?: (comment: CommentCandidate) => void;
  onCommentJump?: (comment: CommentCandidate) => void;
  className?: string;
}

/** DOMを測定する前のfixtureでも同じ速度モデルを確認できる幅の近似値を作る。 */
export function estimateCommentWidth(comment: CommentCandidate, fontSize: number): number {
  // 変更理由: 表示は一行へ正規化するため、改行ごとの最大幅ではなく連結後の幅を
  // 使わないと、長いコメントが後続レスへ追いついて横方向に重なる。
  const singleLineText = comment.text.replace(/[\r\n]+/g, " ");
  const longestLineLength = Math.max(Array.from(singleLineText).length, 1);
  const textWidth = longestLineLength * fontSize * 0.95 + fontSize;
  const imageCount = Math.min(comment.imageUrls?.length ?? 0, 3);
  const imageWidth = imageCount * (COMMENT_IMAGE_WIDTH + fontSize * 0.35);
  return textWidth + imageWidth;
}

/** 改行を空白へ変換し、コメントの幅計算と実際の一行表示を一致させる。 */
export function normalizeCommentOverlayText(text: string): string {
  return text.replace(/[\r\n]+/g, " ");
}

export function OverlayStage({
  comments,
  stageWidth = DEFAULT_STAGE_WIDTH,
  stageHeight = DEFAULT_STAGE_HEIGHT,
  containerWidth,
  containerHeight,
  laneHeight: laneHeightProp,
  maxLaneCount = DEFAULT_MAX_LANE_COUNT,
  durationSeconds,
  baseSpeedPxPerSecond,
  topPadding = 0,
  bottomPadding = 0,
  maxQueueSize = DEFAULT_MAX_QUEUE_SIZE,
  collisionMode = DEFAULT_COMMENT_COLLISION_MODE,
  backlogPolicy = DEFAULT_COMMENT_BACKLOG_POLICY,
  maxActiveCount = DEFAULT_MAX_ACTIVE_COUNT,
  fontFamily = '"Segoe UI", sans-serif',
  fontWeight = 600,
  fontColor = "#f4f7fb",
  shadowSize = 1,
  shadowColor = "#07101d",
  shadowDirections = ["top-left", "top-right", "bottom-left", "bottom-right"],
  commentOpacity = DEFAULT_COMMENT_OPACITY,
  backgroundColor = "#172235",
  playing = true,
  fitToContainer = false,
  scaleToContainer = false,
  scaleReferenceWidth = stageWidth,
  scaleReferenceHeight = stageHeight,
  interactive = true,
  showCommentInfo = true,
  estimateWidth = estimateCommentWidth,
  onQueueOverflow,
  onCommentClick,
  onCommentJump,
  className,
}: OverlayStageProps) {
  const baseLaneHeight = laneHeightProp ?? calculateCommentLaneHeight(COMMENT_OVERLAY_FONT_SIZE);
  const requestedTopPadding = Math.max(0, topPadding);
  const requestedBottomPadding = Math.max(0, bottomPadding);
  const stageRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const effectiveStageWidth =
    containerWidth ?? (fitToContainer ? (containerSize?.width ?? stageWidth) : stageWidth);
  const effectiveStageHeight =
    containerHeight ?? (fitToContainer ? (containerSize?.height ?? stageHeight) : stageHeight);
  const displayScale = scaleToContainer
    ? calculateOverlayDisplayScale(
        effectiveStageWidth,
        effectiveStageHeight,
        scaleReferenceWidth,
        scaleReferenceHeight,
      )
    : 1;
  // 変更理由: Tauriの実ウィンドウだけサイズが変わっても、文字とlaneを同じ倍率で
  // 追従させれば、Storybookとの差やコメント同士の重なりを防げる。
  const effectiveFontSize = Math.max(1, Math.round(COMMENT_OVERLAY_FONT_SIZE * displayScale));
  const laneHeight = Math.max(1, Math.round(baseLaneHeight * displayScale));
  const effectiveShadowSize = Math.max(0, Math.round(shadowSize * displayScale));
  const effectiveTopPadding = Math.min(
    requestedTopPadding,
    Math.max(0, effectiveStageHeight - laneHeight),
  );
  const effectiveBottomPadding = Math.min(
    requestedBottomPadding,
    Math.max(0, effectiveStageHeight - effectiveTopPadding - laneHeight),
  );
  const schedulableStageHeight = Math.max(
    laneHeight,
    effectiveStageHeight - effectiveTopPadding - effectiveBottomPadding,
  );

  useLayoutEffect(() => {
    if (
      !fitToContainer ||
      containerWidth !== undefined ||
      containerHeight !== undefined ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }

    const stageElement = stageRef.current;
    if (!stageElement) return;

    const updateSize = (width: number, height: number) => {
      // 変更理由: flexレイアウトが確定する前の0px測定を採用すると、stageWidthが
      // 1pxになってコメントが一瞬で画面外へ出るため、実寸が得られるまでfallbackを使う。
      if (width <= 0 || height <= 0) return;

      const nextSize = {
        width: Math.round(width),
        height: Math.round(height),
      };
      setContainerSize((currentSize) =>
        currentSize?.width === nextSize.width && currentSize.height === nextSize.height
          ? currentSize
          : nextSize,
      );
    };
    const initialRect = stageElement.getBoundingClientRect();
    updateSize(initialRect.width, initialRect.height);

    const observer = new ResizeObserver(([entry]) => {
      if (entry) updateSize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(stageElement);
    return () => observer.disconnect();
  }, [containerHeight, containerWidth, fitToContainer]);

  const scheduler = useMemo(
    () =>
      new CommentScheduler({
        stageWidth,
        stageHeight: Math.max(
          baseLaneHeight,
          stageHeight - requestedTopPadding - requestedBottomPadding,
        ),
        laneHeight: baseLaneHeight,
        maxLaneCount,
        durationSeconds,
        baseSpeedPxPerSecond,
        maxQueueSize,
        collisionMode,
        backlogPolicy,
        maxActiveCount,
      }),
    [
      backlogPolicy,
      baseSpeedPxPerSecond,
      collisionMode,
      durationSeconds,
      baseLaneHeight,
      maxActiveCount,
      maxLaneCount,
      maxQueueSize,
      requestedBottomPadding,
      requestedTopPadding,
      stageHeight,
      stageWidth,
    ],
  );
  const [snapshot, setSnapshot] = useState<CommentSchedulerSnapshot>(() => scheduler.advance(0));
  const snapshotRef = useRef(snapshot);
  const schedulerRef = useRef(scheduler);
  const seenResponseNumbers = useRef(new Set<string>());
  const logicalTime = useRef(0);
  const previousFrameTime = useRef<number | null>(null);
  const layoutRef = useRef<{
    scheduler: CommentScheduler;
    width: number;
    height: number;
    laneHeight: number;
    fontSize: number;
  } | null>(null);
  const [menu, setMenu] = useState<{ comment: CommentCandidate; x: number; y: number } | null>(
    null,
  );
  const menuRef = useRef<HTMLDivElement>(null);
  // カーソルが通過しただけでは止めず、右クリックでメニューを開いたコメントだけを停止する。
  const selectedCommentKey = menu ? commentIdentity(menu.comment) : null;
  const previouslySelectedCommentKey = useRef<string | null>(null);
  const selectionSchedulerRef = useRef(scheduler);

  useEffect(() => {
    if (!menu) return;
    const ownerDocument = stageRef.current?.ownerDocument;
    const ownerWindow = ownerDocument?.defaultView;
    if (!ownerDocument || !ownerWindow) return;
    const closeMenu = () => setMenu(null);
    // 変更理由: stage内だけの判定では表示領域の外を押しても閉じず、コメント上も
    // 除外されていた。伝播を止めるUIでも閉じられるよう、documentのcaptureで
    // メニュー自身の操作だけを除外し、コメントを含む外側のクリックを拾う。
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const menuElement = menuRef.current;
      if (!menuElement || !event.composedPath().includes(menuElement)) closeMenu();
    };
    ownerDocument.addEventListener("pointerdown", handleOutsidePointerDown, true);
    ownerWindow.addEventListener("blur", closeMenu);
    return () => {
      ownerDocument.removeEventListener("pointerdown", handleOutsidePointerDown, true);
      ownerWindow.removeEventListener("blur", closeMenu);
    };
  }, [menu]);

  useLayoutEffect(() => {
    const currentLayout = layoutRef.current;
    if (
      currentLayout?.scheduler === scheduler &&
      currentLayout.width === effectiveStageWidth &&
      currentLayout.height === schedulableStageHeight &&
      currentLayout.laneHeight === laneHeight &&
      currentLayout.fontSize === effectiveFontSize
    ) {
      return;
    }

    layoutRef.current = {
      scheduler,
      width: effectiveStageWidth,
      height: schedulableStageHeight,
      laneHeight,
      fontSize: effectiveFontSize,
    };
    const nextSnapshot = scheduler.resizeLayout(
      {
        stageWidth: effectiveStageWidth,
        stageHeight: schedulableStageHeight,
        laneHeight,
        maxLaneCount,
        durationSeconds,
        baseSpeedPxPerSecond,
      },
      logicalTime.current,
      (comment) => estimateWidth(comment, effectiveFontSize),
    );
    snapshotRef.current = nextSnapshot;
    setSnapshot(nextSnapshot);
  }, [
    baseSpeedPxPerSecond,
    durationSeconds,
    effectiveFontSize,
    effectiveStageWidth,
    estimateWidth,
    laneHeight,
    maxLaneCount,
    schedulableStageHeight,
    scheduler,
  ]);

  useEffect(() => {
    // 変更理由: Controlsでステージ設定を変えたとき、旧ステージのlaneと時刻を
    // 新しい寸法へ持ち越すと表示位置と衝突判定が一致しなくなるため、fixtureを再baselineする。
    seenResponseNumbers.current.clear();
    logicalTime.current = 0;
    previousFrameTime.current = null;
    const nextSnapshot = scheduler.advance(0);
    snapshotRef.current = nextSnapshot;
    setSnapshot(nextSnapshot);
  }, [scheduler]);

  useEffect(() => {
    // 変更理由: 親が直近の履歴だけを保持している間、入力から外れたレス番号も
    // dedupe Setに残すと長時間実況でSetだけが無制限に増えるため、現在の入力範囲に揃える。
    const currentCommentIdentities = new Set(comments.map((comment) => commentIdentity(comment)));
    // 本流確定で親の入力から除かれた候補がschedulerのpendingへ残ると、
    // queue整理後にも遅れて表示されるため、待機中だけを同じ境界で取り除く。
    scheduler.removePending(
      (input) => !currentCommentIdentities.has(commentIdentity(input.comment)),
    );
    for (const identity of seenResponseNumbers.current) {
      if (!currentCommentIdentities.has(identity)) {
        seenResponseNumbers.current.delete(identity);
      }
    }

    for (const comment of comments) {
      const identity = commentIdentity(comment);
      if (seenResponseNumbers.current.has(identity)) continue;

      const displayComment = {
        ...comment,
        text: normalizeCommentOverlayText(comment.text),
      };
      const width = estimateWidth(displayComment, effectiveFontSize);
      const result = scheduler.enqueue({ comment: displayComment, width });
      if (result.dropped) {
        // 変更理由: queueが満杯のときに同じレスを毎回再投入すると、入力更新のたびに
        // 古いレスがqueueを奪うため、最古の待機レスをskipして一度だけ通知する。
        onQueueOverflow?.(result.dropped.comment);
      } else if (!result.accepted) {
        onQueueOverflow?.(comment);
      }
      seenResponseNumbers.current.add(identity);
    }

    if (schedulerRef.current !== scheduler) {
      // 変更理由: 文字サイズ変更でlane高が変わるとschedulerも再生成されるため、
      // 次のrequestAnimationFrameを待たずに再投入したコメントをDOMへ反映する。
      const nextSnapshot = scheduler.advance(logicalTime.current);
      snapshotRef.current = nextSnapshot;
      setSnapshot(nextSnapshot);
      schedulerRef.current = scheduler;
    }
  }, [comments, effectiveFontSize, estimateWidth, onQueueOverflow, scheduler]);

  useEffect(() => {
    if (!playing) {
      previousFrameTime.current = null;
      return;
    }

    let frameId = 0;
    const renderFrame = (frameTime: number) => {
      const previousTime = previousFrameTime.current;
      if (previousTime !== null) {
        logicalTime.current += Math.max(frameTime - previousTime, 0) / 1000;
      }
      previousFrameTime.current = frameTime;
      const nextSnapshot = scheduler.advance(logicalTime.current);
      // 変更理由: 移動はCSS animationが担当するため、active/pendingの構成が変わらない
      // frameではReactを再描画しない。終了・投入時だけDOM一覧を更新して弾幕数に応じた
      // React renderを避ける。
      if (!isSameSnapshot(snapshotRef.current, nextSnapshot)) {
        snapshotRef.current = nextSnapshot;
        setSnapshot(nextSnapshot);
      }
      frameId = requestAnimationFrame(renderFrame);
    };

    frameId = requestAnimationFrame(renderFrame);
    return () => {
      cancelAnimationFrame(frameId);
      previousFrameTime.current = null;
    };
  }, [playing, scheduler]);

  const stageStyle: CSSProperties = {
    width:
      containerWidth !== undefined
        ? `${containerWidth}px`
        : fitToContainer
          ? "100%"
          : `${stageWidth}px`,
    height:
      containerHeight !== undefined
        ? `${containerHeight}px`
        : fitToContainer
          ? "100%"
          : `${stageHeight}px`,
    backgroundColor,
    color: fontColor,
    fontFamily,
  };
  const shadowOffsets = {
    "top-left": `-${effectiveShadowSize}px -${effectiveShadowSize}px 0 ${shadowColor}`,
    "top-right": `${effectiveShadowSize}px -${effectiveShadowSize}px 0 ${shadowColor}`,
    "bottom-left": `-${effectiveShadowSize}px ${effectiveShadowSize}px 0 ${shadowColor}`,
    "bottom-right": `${effectiveShadowSize}px ${effectiveShadowSize}px 0 ${shadowColor}`,
  } as const;
  // 変更理由: EdgeLiveViewerでは影の向きを個別指定できるため、選ばれた方向だけをCSSへ渡す。
  const textShadow =
    effectiveShadowSize > 0
      ? shadowDirections.map((direction) => shadowOffsets[direction]).join(", ")
      : "none";
  const stageClassName = [
    "comment-overlay-stage",
    interactive ? "comment-overlay-stage--interactive" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    const previousKey = previouslySelectedCommentKey.current;
    const schedulerChanged = selectionSchedulerRef.current !== scheduler;
    if (previousKey === selectedCommentKey && !schedulerChanged) return;
    // 変更理由: メニューへポインターを移すとmouseleaveが起きても、選択中のレスは
    // 停止と前面表示を維持する。選択が変わる時だけschedulerへ通知する。
    const now = logicalTime.current;
    const resumed = previousKey && !schedulerChanged ? scheduler.resume(previousKey, now) : false;
    const paused = selectedCommentKey ? scheduler.pause(selectedCommentKey, now) : false;
    previouslySelectedCommentKey.current = selectedCommentKey;
    selectionSchedulerRef.current = scheduler;
    if (resumed || paused) {
      const nextSnapshot = scheduler.advance(now);
      snapshotRef.current = nextSnapshot;
      setSnapshot(nextSnapshot);
    }
  }, [scheduler, selectedCommentKey]);

  const openMenu = (event: React.MouseEvent<HTMLElement>, comment: CommentCandidate): void => {
    if (!interactive) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenu({
      comment,
      x: Math.max(0, Math.min(event.clientX - rect.left, rect.width - 190)),
      y: Math.max(0, Math.min(event.clientY - rect.top, rect.height - 120)),
    });
  };

  const copyToClipboard = (value: string): void => {
    void copyText(value).catch((error: unknown) => {
      console.error("[ChLens] コメントOverlayのコピーに失敗しました:", error);
    });
    setMenu(null);
  };

  return (
    <div
      className={stageClassName}
      ref={stageRef}
      data-testid="comment-overlay-stage"
      data-active-count={snapshot.active.length}
      data-pending-count={snapshot.pending.length}
      data-collision-mode={collisionMode}
      role="log"
      aria-label="コメントオーバーレイ"
      style={stageStyle}
      onKeyDown={(event) => {
        if (event.key === "Escape") setMenu(null);
      }}
    >
      {snapshot.active.map((scheduledComment) => {
        const commentStyle = {
          top: `${effectiveTopPadding + scheduledComment.laneIndex * laneHeight}px`,
          left: `${scheduledComment.stageWidth}px`,
          fontSize: `${effectiveFontSize}px`,
          fontWeight,
          textShadow,
          opacity: commentOpacity,
          zIndex:
            selectedCommentKey === commentIdentity(scheduledComment.comment)
              ? "var(--sys-z-popup-layer)"
              : "var(--sys-z-local)",
          animationDuration: `${scheduledComment.duration}s`,
          animationDelay: `${-scheduledComment.initialProgress * scheduledComment.duration}s`,
          animationPlayState:
            playing && !scheduledComment.paused ? ("running" as const) : ("paused" as const),
          "--comment-exit-translate": `-${scheduledComment.stageWidth + scheduledComment.width}px`,
        } as CSSProperties;
        const { comment } = scheduledComment;
        // 変更理由: 分裂スレを同時取得すると別スレで同じレス番号が存在するため、
        // レス番号だけをReact keyや説明要素のIDへ使うとDOMが再利用される。
        // 取得元を含むidentityで一意化し、同番号のコメントも独立して流す。
        const commentKey = commentIdentity(comment);
        const selected = selectedCommentKey === commentKey;
        const commentInfoId = `comment-overlay-stage__info-${encodeURIComponent(commentKey)}`;

        return (
          <div
            key={`${commentKey}-${scheduledComment.startAt}-${scheduledComment.layoutRevision}`}
            className={`comment-overlay-stage__comment${
              comment.isSystem ? " comment-overlay-stage__comment--system" : ""
            }${comment.isOwn ? " comment-overlay-stage__comment--own" : ""}`}
            data-response-number={comment.responseNumber}
            data-comment-key={commentKey}
            data-lane-index={scheduledComment.laneIndex}
            data-paused={scheduledComment.paused}
            data-selected={selected}
            aria-describedby={
              interactive && showCommentInfo && scheduledComment.paused ? commentInfoId : undefined
            }
            role={interactive ? "group" : undefined}
            tabIndex={interactive ? 0 : -1}
            style={commentStyle}
            aria-label={`レス${comment.responseNumber}: ${comment.text}`}
            onContextMenu={interactive ? (event) => openMenu(event, comment) : undefined}
            onClick={() => {
              // 変更理由: pointerdownを伴わないクリックでも閉じ、既存のレス操作も実行する。
              setMenu(null);
              onCommentClick?.(comment);
            }}
          >
            {comment.imageUrls?.slice(0, 3).map((imageUrl) => (
              <ExternalImage
                key={imageUrl}
                className="comment-overlay-stage__media"
                src={toViewerImageUrl(imageUrl) ?? imageUrl}
                alt=""
                width={COMMENT_IMAGE_WIDTH}
                height={COMMENT_IMAGE_HEIGHT}
                loading="eager"
                decoding="async"
              />
            ))}
            {comment.text}
            {interactive && showCommentInfo && scheduledComment.paused ? (
              <span
                id={commentInfoId}
                className="comment-overlay-stage__comment-info"
                role="tooltip"
              >
                <strong>レス{comment.responseNumber}</strong>
                <span>{comment.author}</span>
                {comment.id ? <span>ID: {comment.id}</span> : null}
                {comment.date ? <time>{comment.date}</time> : null}
                <span className="comment-overlay-stage__comment-info-text">{comment.text}</span>
              </span>
            ) : null}
          </div>
        );
      })}
      {interactive && menu ? (
        <div
          ref={menuRef}
          className="comment-overlay-stage__menu"
          data-comment-key={commentIdentity(menu.comment)}
          role="menu"
          style={{ left: menu.x, top: menu.y }}
        >
          {menu.comment.responseNumber > 0 && menu.comment.sourceThreadUrl && onCommentJump ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onCommentJump(menu.comment);
                setMenu(null);
              }}
            >
              このレスへジャンプ
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              copyToClipboard(
                menu.comment.isSystem
                  ? menu.comment.text
                  : `レス${menu.comment.responseNumber} ${menu.comment.author}\n${menu.comment.text}`,
              )
            }
          >
            レスをコピー
          </button>
          {menu.comment.responseNumber > 0 ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => copyToClipboard(String(menu.comment.responseNumber))}
            >
              レス番号をコピー
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function isSameSnapshot(
  current: CommentSchedulerSnapshot,
  next: CommentSchedulerSnapshot,
): boolean {
  if (current.active.length !== next.active.length) return false;
  if (current.pending.length !== next.pending.length) return false;
  return (
    current.active.every((comment, index) => comment === next.active[index]) &&
    current.pending.every((input, index) => input === next.pending[index])
  );
}
