import { useEffect, useRef, useState } from "react";
import { createLogger } from "src/app/logger";
import {
  type ArchiveReplayOverlayEvent,
  type ArchiveReplayOverlayEventBus,
  createArchiveReplayOverlayEventBus,
} from "src/features/archive-replay/platform";
import {
  calculateNaturalCommentFlowCount,
  calculateNaturalCommentFlowInterval,
  type CommentCandidate,
  commentIdentity,
  type CommentOverlaySettings,
  DEFAULT_COMMENT_OVERLAY_SETTINGS,
  normalizeCommentOverlaySettings,
} from "src/features/comment-overlay/domain";
import {
  type CommentOverlayEvent,
  type CommentOverlayEventBus,
  type CommentOverlayGeometry,
  type CommentOverlayWindowPlatform,
  commentOverlayWindowPlatform,
  createCommentOverlayEventBus,
  DEFAULT_COMMENT_OVERLAY_GEOMETRY,
} from "src/features/comment-overlay/platform";
import { publishCommentOverlayJump } from "src/features/comment-overlay/platform/jump-events";
import {
  DEFAULT_COMMENT_HISTORY_LIMIT,
  OverlayStage,
} from "src/features/comment-overlay/ui/OverlayStage";
import { useOverlayPointerCapture } from "src/features/comment-overlay/ui/use-overlay-pointer-capture";

const logger = createLogger("view/comment-overlay");

const MAX_COMMENT_HISTORY = DEFAULT_COMMENT_HISTORY_LIMIT;

export interface OverlayAppProps {
  archiveReplayEventBus?: ArchiveReplayOverlayEventBus;
  eventBus?: CommentOverlayEventBus;
  platform?: CommentOverlayWindowPlatform;
}

/** Tauriのnative windowと、Storybookでも検証できるOverlayStageを接続する。 */
export function OverlayApp({
  archiveReplayEventBus: providedArchiveReplayEventBus,
  eventBus: providedEventBus,
  platform = commentOverlayWindowPlatform,
}: OverlayAppProps = {}) {
  const [defaultArchiveReplayEventBus] = useState(createArchiveReplayOverlayEventBus);
  const [defaultEventBus] = useState(createCommentOverlayEventBus);
  const archiveReplayEventBus = providedArchiveReplayEventBus ?? defaultArchiveReplayEventBus;
  const eventBus = providedEventBus ?? defaultEventBus;
  const [comments, setComments] = useState<readonly CommentCandidate[]>([]);
  const [stageKey, setStageKey] = useState(0);
  const [overlayGeometry, setOverlayGeometry] = useState<CommentOverlayGeometry>(
    DEFAULT_COMMENT_OVERLAY_GEOMETRY,
  );
  const [settings, setSettings] = useState<CommentOverlaySettings>(() => ({
    ...DEFAULT_COMMENT_OVERLAY_SETTINGS,
  }));
  const activeThreadUrlRef = useRef<string | null>(null);
  const seenResponseNumbersRef = useRef(new Set<string>());
  const seenResponseOrderRef = useRef<string[]>([]);
  const archiveReplaySessionRef = useRef<string | null>(null);
  const [isArchiveReplay, setIsArchiveReplay] = useState(false);
  const liveQueueEpochRef = useRef(0);
  const [archiveReplayPlaying, setArchiveReplayPlaying] = useState(true);
  const overlayRootRef = useRef<HTMLElement>(null);
  useOverlayPointerCapture(overlayRootRef);
  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    let flowTimer: ReturnType<typeof setTimeout> | null = null;
    const commentQueue: CommentCandidate[] = [];
    let currentBatchSize = 0;

    const handleEvent = (event: CommentOverlayEvent): void => {
      if (event.type === "settings") {
        // 設定更新では既存コメントを消さず、実行中の速度と表示条件だけを次の描画へ反映する。
        setSettings(normalizeCommentOverlaySettings(event.settings));
        return;
      }

      if (event.type === "source-filter") {
        if (archiveReplaySessionRef.current !== null) return;
        if (activeThreadUrlRef.current !== event.threadUrl) return;

        // 本流確定時は、すでに画面へ出たコメントは自然に流し切り、
        // まだ待機中の非本流コメントだけを捨てる。EdgeLiveViewerの
        // 「表示中は継続・queueだけ整理」という切り替えを維持するための境界。
        for (let index = commentQueue.length - 1; index >= 0; index -= 1) {
          const comment = commentQueue[index];
          if (comment?.sourceThreadUrl && comment.sourceThreadUrl !== event.keepSourceThreadUrl) {
            commentQueue.splice(index, 1);
          }
        }
        if (commentQueue.length === 0 && flowTimer) {
          // 非本流だけを捨てた後に古いtimerを残すと、空queueを待つだけの
          // callbackが発生するため、次の本流コメント到着時にすぐ再利用できるよう解除する。
          clearTimeout(flowTimer);
          flowTimer = null;
        }
        setComments((current) =>
          current.filter(
            (comment) =>
              !comment.sourceThreadUrl || comment.sourceThreadUrl === event.keepSourceThreadUrl,
          ),
        );
        return;
      }

      if (event.type === "system") {
        if (archiveReplaySessionRef.current !== null) return;
        const identity = commentIdentity(event.comment);
        if (seenResponseNumbersRef.current.has(identity)) return;
        seenResponseNumbersRef.current.add(identity);
        seenResponseOrderRef.current.push(identity);
        while (seenResponseOrderRef.current.length > MAX_COMMENT_HISTORY) {
          const expiredIdentity = seenResponseOrderRef.current.shift();
          if (expiredIdentity !== undefined) {
            seenResponseNumbersRef.current.delete(expiredIdentity);
          }
        }

        // EdgeLiveViewerの通知コメントは取得レスとは別の即時表示として扱い、
        // 次スレのresetが届いても「表示中のコメントを残す」境界を越えないようにする。
        setComments((current) => {
          const next = [...current, event.comment];
          return next.length > MAX_COMMENT_HISTORY ? next.slice(-MAX_COMMENT_HISTORY) : next;
        });
        return;
      }

      // 再生窓が表示を占有している間は、Main側のlive batchを混ぜない。
      // 別event名だけでは既に投入済みのlive queueを止められないため、timer側でもepochを検証する。
      if (archiveReplaySessionRef.current !== null) return;

      const { batch } = event;
      const preserveVisibleComments =
        event.type === "reset" && event.preserveVisibleComments === true;
      if (event.type === "reset" || activeThreadUrlRef.current !== batch.threadUrl) {
        // 変更理由: スレが変わった時に前スレのlane・レス番号を再利用すると、別スレの
        // コメントが混ざるため、表示履歴と重複判定を同時に初期化する。resetは同じ
        // スレッドの実況を再開した場合にもこの境界を明示的に通過させる。
        activeThreadUrlRef.current = batch.threadUrl;
        seenResponseNumbersRef.current.clear();
        seenResponseOrderRef.current = [];
        if (flowTimer) clearTimeout(flowTimer);
        flowTimer = null;
        commentQueue.length = 0;
        if (!preserveVisibleComments) {
          setComments([]);
          setStageKey((current) => current + 1);
        }
        if (event.type === "reset") {
          // 設定は実況開始時にだけ反映し、表示中のコメントを毎batch再配置しない。
          setSettings(normalizeCommentOverlaySettings(event.settings));
        }
      }

      const additions = batch.comments.filter((comment) => {
        const identity = commentIdentity(comment);
        if (seenResponseNumbersRef.current.has(identity)) return false;
        seenResponseNumbersRef.current.add(identity);
        seenResponseOrderRef.current.push(identity);
        return true;
      });
      if (additions.length === 0) return;

      while (seenResponseOrderRef.current.length > MAX_COMMENT_HISTORY) {
        const expiredIdentity = seenResponseOrderRef.current.shift();
        if (expiredIdentity !== undefined) {
          seenResponseNumbersRef.current.delete(expiredIdentity);
        }
      }

      const queueWasEmpty = commentQueue.length === 0;
      currentBatchSize = additions.length;
      commentQueue.push(...additions);
      if (queueWasEmpty && commentQueue.length > 0) {
        // 変更理由: 最初の新着だけは即時に反映し、残りは取得バッチを人為的な
        // 等間隔に見せない揺らぎ付きで投入して実況らしい流れを保つ。
        setComments((current) => {
          const next = [...current, ...commentQueue.splice(0, 1)];
          return next.length > MAX_COMMENT_HISTORY ? next.slice(-MAX_COMMENT_HISTORY) : next;
        });
      }

      const queueEpoch = liveQueueEpochRef.current;
      const scheduleNextComment = (): void => {
        if (commentQueue.length === 0 || flowTimer) return;
        const interval = calculateNaturalCommentFlowInterval({
          queueSize: commentQueue.length,
          batchSize: currentBatchSize,
          updateIntervalMilliseconds: 10_000,
        });
        flowTimer = setTimeout(() => {
          flowTimer = null;
          if (
            queueEpoch !== liveQueueEpochRef.current ||
            archiveReplaySessionRef.current !== null
          ) {
            commentQueue.length = 0;
            return;
          }
          const count = calculateNaturalCommentFlowCount(commentQueue.length);
          setComments((current) => {
            const next = [...current, ...commentQueue.splice(0, count)];
            return next.length > MAX_COMMENT_HISTORY ? next.slice(-MAX_COMMENT_HISTORY) : next;
          });
          scheduleNextComment();
        }, interval);
      };
      scheduleNextComment();
    };

    void eventBus
      .subscribe(handleEvent)
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }
        unsubscribe = cleanup;
      })
      .catch((error: unknown) => {
        logger.error("コメントOverlay eventの購読に失敗しました:", error);
      });

    return () => {
      disposed = true;
      if (flowTimer) clearTimeout(flowTimer);
      flowTimer = null;
      commentQueue.length = 0;
      unsubscribe?.();
    };
  }, [eventBus]);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    const archiveSeenRef = new Set<string>();

    const handleArchiveReplayEvent = (event: ArchiveReplayOverlayEvent): void => {
      if (event.type === "reset") {
        archiveReplaySessionRef.current = event.sessionId;
        setIsArchiveReplay(true);
        setArchiveReplayPlaying(false);
        liveQueueEpochRef.current += 1;
        archiveSeenRef.clear();
        setComments([]);
        setStageKey((current) => current + 1);
        return;
      }

      if (archiveReplaySessionRef.current !== event.sessionId) return;
      if (event.type === "stop") {
        archiveReplaySessionRef.current = null;
        setIsArchiveReplay(false);
        setArchiveReplayPlaying(true);
        liveQueueEpochRef.current += 1;
        archiveSeenRef.clear();
        setComments([]);
        setStageKey((current) => current + 1);
        return;
      }

      if (event.type === "playback") {
        setArchiveReplayPlaying(event.playing);
        return;
      }

      const identity = commentIdentity(event.comment);
      if (archiveSeenRef.has(identity)) return;
      archiveSeenRef.add(identity);
      setComments((current) => {
        const next = [...current, event.comment];
        return next.length > MAX_COMMENT_HISTORY ? next.slice(-MAX_COMMENT_HISTORY) : next;
      });
    };

    void archiveReplayEventBus
      .subscribe(handleArchiveReplayEvent)
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }
        unsubscribe = cleanup;
      })
      .catch((error: unknown) => {
        logger.error("過去実況Overlay eventの購読に失敗しました:", error);
      });

    return () => {
      disposed = true;
      unsubscribe?.();
      archiveSeenRef.clear();
    };
  }, [archiveReplayEventBus]);

  useEffect(() => {
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let unwatchGeometry: (() => void) | null = null;
    let unwatchVisibility: (() => void) | null = null;
    let disposed = false;
    void platform
      .loadGeometry()
      .then(async (geometry) => {
        if (geometry) {
          setOverlayGeometry(geometry);
          return;
        }
        // 保存値がない初回だけnativeの現在値を読む。
        const currentGeometry = await platform.getGeometry();
        if (!disposed && currentGeometry) {
          setOverlayGeometry(currentGeometry);
        }
      })
      .catch((error: unknown) => {
        logger.error("コメントOverlayのgeometry復元に失敗しました:", error);
      });
    void platform
      .watchGeometry((geometry: CommentOverlayGeometry) => {
        if (disposed) return;
        // 位置変更だけではStageを再描画せず、コメントのCSSアニメーションを維持する。
        setOverlayGeometry((current) =>
          current.width === geometry.width && current.height === geometry.height
            ? current
            : geometry,
        );
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          saveTimer = null;
          void platform.saveGeometry(geometry).catch((error: unknown) => {
            logger.error("コメントOverlayのgeometry自動保存に失敗しました:", error);
          });
        }, 250);
      })
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }
        unwatchGeometry = cleanup;
      })
      .catch((error: unknown) => {
        logger.error("コメントOverlayのgeometry監視開始に失敗しました:", error);
      });

    void platform
      .watchVisibility(() => {})
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }
        unwatchVisibility = cleanup;
      })
      .catch((error: unknown) => {
        logger.error("コメントOverlayの表示状態監視開始に失敗しました:", error);
      });

    return () => {
      disposed = true;
      if (saveTimer) clearTimeout(saveTimer);
      unwatchGeometry?.();
      unwatchVisibility?.();
    };
  }, [platform]);

  return (
    <main
      ref={overlayRootRef}
      className="comment-overlay-window"
      data-testid="comment-overlay-window"
    >
      <OverlayStage
        key={stageKey}
        className="comment-overlay-window__comment-layer"
        comments={comments}
        stageWidth={DEFAULT_COMMENT_OVERLAY_GEOMETRY.width}
        stageHeight={DEFAULT_COMMENT_OVERLAY_GEOMETRY.height}
        containerWidth={overlayGeometry.width}
        containerHeight={overlayGeometry.height}
        durationSeconds={settings.durationSeconds}
        commentOpacity={settings.opacity}
        maxQueueSize={settings.maxQueueSize}
        // 変更理由: Tauriの横長・低い初期Overlayではadaptiveの循環laneが同時に
        // 同じ行へ入るため、実機では文字が重なる。実況の遅延より重なり防止を優先し、
        // 空きlaneができるまでqueueで待たせる。
        collisionMode="strict"
        backlogPolicy={settings.maxQueueSize > 0 ? "queue" : "drop"}
        scaleToContainer
        scaleReferenceWidth={DEFAULT_COMMENT_OVERLAY_GEOMETRY.width}
        scaleReferenceHeight={DEFAULT_COMMENT_OVERLAY_GEOMETRY.height}
        playing={isArchiveReplay ? archiveReplayPlaying : true}
        interactive
        // 過去ログの再生位置を確認する操作なので、通常実況ではジャンプ項目を表示しない。
        onCommentJump={
          isArchiveReplay
            ? (comment) => {
                if (!comment.sourceThreadUrl || comment.responseNumber <= 0) return;
                void publishCommentOverlayJump({
                  threadUrl: comment.sourceThreadUrl,
                  responseNumber: comment.responseNumber,
                }).catch((error: unknown) => {
                  logger.error("コメントOverlayからのレスジャンプ要求に失敗しました:", error);
                });
              }
            : undefined
        }
        showCommentInfo={false}
        backgroundColor="transparent"
      />
    </main>
  );
}
