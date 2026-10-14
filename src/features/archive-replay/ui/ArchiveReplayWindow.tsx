import "./ArchiveReplayWindow.css";

import { Pause, Play, RotateCcw, SkipBack, SkipForward, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTauriRuntime } from "src/app/platform/runtime";
import {
  mapWithConcurrency,
  MAX_CONCURRENT_BATCH_REQUESTS,
} from "src/core/util/map-with-concurrency";
import type { CommentCandidate } from "src/features/comment-overlay/domain";
import { projectCommentResponse } from "src/features/comment-overlay/domain";
import {
  type CommentOverlayWindowPlatform,
  commentOverlayWindowPlatform,
} from "src/features/comment-overlay/platform";
import { container } from "src/service-container";
import type { IThreadDetail } from "src/service-container/interfaces";
import { useTheme } from "src/view/browser/hooks/use-theme";
import { Button } from "src/view/browser/ui/Button";

import {
  type ArchiveReplaySource,
  type ArchiveReplayTimeline,
  createArchiveReplayTimeline,
  getArchiveReplaySeekPosition,
  parseArchiveReplayStartInput,
  parseArchiveReplayTimestamp,
} from "../domain";
import {
  type ArchiveReplayMainThreadRequest,
  type ArchiveReplayOverlayEventBus,
  type ArchiveReplaySeekRequest,
  createArchiveReplayOverlayEventBus,
  hideArchiveReplayWindow,
  requestArchiveReplayMainThread,
  subscribeArchiveReplaySeekRequests,
  subscribeArchiveReplayWindowClose,
} from "../platform";

interface ArchiveReplayWindowProps {
  archiveReplayEventBus?: ArchiveReplayOverlayEventBus;
  mainThreadSyncPublisher?: (request: ArchiveReplayMainThreadRequest) => Promise<void>;
  overlayPlatform?: CommentOverlayWindowPlatform;
  seekRequestSubscriber?: typeof subscribeArchiveReplaySeekRequests;
}

interface LoadedArchiveReplayData {
  timeline: ArchiveReplayTimeline;
  threadTitles: Readonly<Record<string, string>>;
  titles: readonly string[];
  errors: readonly string[];
}

interface LoadedThreadData {
  source: ArchiveReplaySource;
  title: string;
}

interface ArchiveReplayThreadSelection {
  threadUrl: string;
  responseNumber: number;
  title: string;
}

const DEFAULT_DURATION_MINUTES = "30";
const DEFAULT_REPLAY_RATE = "1";

/**
 * Tauriの過去実況操作窓。コメント本体は表示せず、既存のコメントOverlayへ時刻付きで通知する。
 * 変更理由: 再生UIと弾幕表示を同じWebViewに置くと、操作窓を見ている間だけコメントが
 * 表示されるため、アニメ画面の上に重ねる既存Overlayを唯一の表示面として使う。
 */
export function ArchiveReplayWindow({
  archiveReplayEventBus: providedArchiveReplayEventBus,
  mainThreadSyncPublisher = requestArchiveReplayMainThread,
  overlayPlatform = commentOverlayWindowPlatform,
  seekRequestSubscriber = subscribeArchiveReplaySeekRequests,
}: ArchiveReplayWindowProps = {}) {
  const isTauri = isTauriRuntime();
  const theme = useTheme();
  const [defaultArchiveReplayEventBus] = useState(createArchiveReplayOverlayEventBus);
  const archiveReplayEventBus = providedArchiveReplayEventBus ?? defaultArchiveReplayEventBus;

  const [urls, setUrls] = useState("");
  const [startInput, setStartInput] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_DURATION_MINUTES);
  const [replayRateInput, setReplayRateInput] = useState(DEFAULT_REPLAY_RATE);
  const [loadedReplay, setLoadedReplay] = useState<LoadedArchiveReplayData | null>(null);
  const [position, setPosition] = useState(0);
  const [seekStartPosition, setSeekStartPosition] = useState(0);
  const positionRef = useRef(0);
  const [syncOffset, setSyncOffset] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [followMainThread, setFollowMainThread] = useState(false);
  const playingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stageKey, setStageKey] = useState(0);
  const replaySessionIdRef = useRef(createReplaySessionId());
  const overlaySessionActiveRef = useRef(false);
  const emittedCommentKeysRef = useRef(new Set<string>());
  const pendingSeekRequestRef = useRef<ArchiveReplaySeekRequest | null>(null);
  const lastMainThreadUrlRef = useRef<string | null>(null);
  const mainThreadSyncGenerationRef = useRef(0);
  const closeWindowRef = useRef<() => void>(() => {});

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  const replayRate = useMemo(() => {
    const parsed = Number(replayRateInput);
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 10) : 1;
  }, [replayRateInput]);

  const stopOverlay = useCallback(() => {
    if (!overlaySessionActiveRef.current) return;
    overlaySessionActiveRef.current = false;
    emittedCommentKeysRef.current.clear();
    void archiveReplayEventBus
      .publish({ version: 1, type: "stop", sessionId: replaySessionIdRef.current })
      .catch((publishError: unknown) => {
        console.error("[ArchiveReplay] Overlay停止通知に失敗しました", publishError);
      });
  }, [archiveReplayEventBus]);

  const resetPlayback = useCallback(() => {
    stopOverlay();
    void overlayPlatform.hide().catch((hideError: unknown) => {
      console.error("[ArchiveReplay] コメントOverlayの非表示に失敗しました", hideError);
    });
    replaySessionIdRef.current = createReplaySessionId();
    emittedCommentKeysRef.current.clear();
    pendingSeekRequestRef.current = null;
    setPlaying(false);
    setLoadedReplay(null);
    setPosition(0);
    setSeekStartPosition(0);
    positionRef.current = 0;
    setSyncOffset(0);
    lastMainThreadUrlRef.current = null;
    mainThreadSyncGenerationRef.current = 0;
    setStageKey((current) => current + 1);
  }, [overlayPlatform, stopOverlay]);

  const resetOverlaySession = useCallback(() => {
    if (!loadedReplay) return;

    // 再生窓を閉じて再表示した場合も、停止済みのsessionを使い回さずOverlayを再接続する。
    if (!overlaySessionActiveRef.current) {
      replaySessionIdRef.current = createReplaySessionId();
      overlaySessionActiveRef.current = true;
    }
    emittedCommentKeysRef.current.clear();
    void overlayPlatform
      .show()
      .then(() =>
        archiveReplayEventBus.publish({
          version: 1,
          type: "reset",
          sessionId: replaySessionIdRef.current,
        }),
      )
      .then(() =>
        archiveReplayEventBus.publish({
          version: 1,
          type: "playback",
          sessionId: replaySessionIdRef.current,
          playing: playingRef.current,
        }),
      )
      .catch((publishError: unknown) => {
        console.error("[ArchiveReplay] コメントOverlayの再接続に失敗しました", publishError);
      });
  }, [archiveReplayEventBus, loadedReplay, overlayPlatform]);

  const load = useCallback(async () => {
    const requestedStartAt = startInput ? parseArchiveReplayStartInput(startInput) : null;
    const parsedDurationMinutes = Number(durationMinutes);
    const inputUrls = [
      ...new Set(
        urls
          .split(/\r?\n/)
          .map((url) => url.trim())
          .filter(Boolean),
      ),
    ];

    if (startInput && requestedStartAt === null) {
      setError("開始日時を確認してください（日本時間）");
      return;
    }
    if (!Number.isFinite(parsedDurationMinutes) || parsedDurationMinutes <= 0) {
      setError("再生時間は1分以上で入力してください");
      return;
    }
    if (inputUrls.length === 0) {
      setError("実況スレッドURLを1件以上入力してください");
      return;
    }

    setLoading(true);
    setError(null);
    resetPlayback();

    try {
      const settled = await mapWithConcurrency(
        inputUrls,
        MAX_CONCURRENT_BATCH_REQUESTS,
        async (threadUrl): Promise<LoadedThreadData | string> => {
          try {
            const thread = await container.thread.getThread(threadUrl);
            return {
              source: {
                threadUrl,
                comments: projectThreadComments(thread),
              },
              title: thread.title?.trim() || threadUrl,
            };
          } catch (loadError: unknown) {
            // URL単位の失敗は他スレの取得を止めず、画面に残して利用者が確認できるようにする。
            console.error("[ArchiveReplay] スレッドの取得に失敗しました", {
              threadUrl,
              error: loadError,
            });
            return `${threadUrl}: ${
              loadError instanceof Error ? loadError.message : "取得に失敗しました"
            }`;
          }
        },
      );
      const loadedThreads = settled.filter(
        (result): result is LoadedThreadData => typeof result !== "string",
      );
      if (loadedThreads.length === 0) {
        throw new Error("取得できたスレッドがありません");
      }

      // 毎回の日付入力を省けるよう、未指定なら取得結果の最初の投稿を開始候補にする。
      // 自動判定ではなくログの最古時刻なので、必要なら後から日時欄で明示的に調整できる。
      const startAt =
        requestedStartAt ??
        loadedThreads.reduce<number | null>(
          (earliest, item) =>
            item.source.comments.reduce<number | null>((candidate, comment) => {
              const timestamp = parseArchiveReplayTimestamp(comment.date ?? "");
              return timestamp === null
                ? candidate
                : candidate === null
                  ? timestamp
                  : Math.min(candidate, timestamp);
            }, earliest),
          null,
        );
      if (startAt === null) {
        throw new Error(
          "投稿日時を読み取れるレスがありません。開始日時と取得したログを確認してください",
        );
      }

      const timeline = createArchiveReplayTimeline(
        loadedThreads.map(({ source }) => source),
        {
          startAt,
          durationSeconds: parsedDurationMinutes * 60,
        },
      );
      setLoadedReplay({
        timeline,
        threadTitles: Object.fromEntries(
          loadedThreads.map(({ source, title }) => [source.threadUrl, title]),
        ),
        titles: loadedThreads.map(({ title }) => title),
        errors: settled.filter((result): result is string => typeof result === "string"),
      });
      setStageKey((current) => current + 1);
    } catch (loadError: unknown) {
      console.error("[ArchiveReplay] 過去ログの読み込みに失敗しました", loadError);
      setError(loadError instanceof Error ? loadError.message : "スレッドの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [durationMinutes, resetPlayback, startInput, urls]);

  useEffect(() => {
    if (!playing || !loadedReplay) return;

    // 実時間との差から位置を計算し、タブ切り替えや負荷によるframe遅延が累積しないようにする。
    const startedAt = performance.now();
    const startedPosition = positionRef.current;
    let frameId = 0;
    const tick = (now: number) => {
      const nextPosition = Math.min(
        loadedReplay.timeline.durationSeconds,
        startedPosition + ((now - startedAt) / 1_000) * replayRate,
      );
      positionRef.current = nextPosition;
      setPosition(nextPosition);
      if (nextPosition >= loadedReplay.timeline.durationSeconds) {
        setPlaying(false);
        return;
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [loadedReplay, playing, replayRate, stageKey]);

  const seek = useCallback(
    (nextPosition: number) => {
      if (!loadedReplay) return;
      const clamped = Math.min(Math.max(0, nextPosition), loadedReplay.timeline.durationSeconds);
      positionRef.current = clamped;
      setPosition(clamped);
      // schedulerは時計の逆行を扱わないため、シークでは表示世代を作り直す。
      // 移動先より前のレスを再投入しない境界も同時に更新し、短い往復で二重表示しない。
      setSeekStartPosition(clamped);
      setStageKey((current) => current + 1);
    },
    [loadedReplay],
  );

  const seekToRequest = useCallback(
    (request: ArchiveReplaySeekRequest) => {
      if (!loadedReplay) {
        pendingSeekRequestRef.current = request;
        return;
      }
      const nextPosition = getArchiveReplaySeekPosition(
        loadedReplay.timeline,
        { threadUrl: request.threadUrl, responseNumber: request.responseNumber },
        syncOffset,
      );
      if (nextPosition === null) {
        setError("このレスは読み込み済みの再生範囲にありません");
        return;
      }
      setError(null);
      seek(nextPosition);
    },
    [loadedReplay, seek, syncOffset],
  );

  const currentReplayThread = useMemo(
    () =>
      loadedReplay
        ? resolveArchiveReplayThreadSelection(
            loadedReplay.timeline,
            position,
            syncOffset,
            loadedReplay.threadTitles,
          )
        : null,
    [loadedReplay, position, syncOffset],
  );

  const publishMainThreadSync = useCallback(
    (selection: ArchiveReplayThreadSelection | null, force = false) => {
      if (!loadedReplay || !selection) return;
      // スレURLだけでは同一スレ内を追従できないため、レスとログ時刻も通知の識別子に含める。
      const playbackAt = loadedReplay.timeline.startAt + (position - syncOffset) * 1_000;
      const positionKey = `${selection.threadUrl}:${selection.responseNumber}:${Math.floor(playbackAt / 1_000)}`;
      if (!force && lastMainThreadUrlRef.current === positionKey) return;

      const request: ArchiveReplayMainThreadRequest = {
        version: 1,
        sessionId: replaySessionIdRef.current,
        generation: mainThreadSyncGenerationRef.current++,
        threadUrl: selection.threadUrl,
        responseNumber: selection.responseNumber,
        title: selection.title,
        playbackAt,
      };
      lastMainThreadUrlRef.current = positionKey;
      void mainThreadSyncPublisher(request).catch((publishError: unknown) => {
        if (lastMainThreadUrlRef.current === positionKey) {
          lastMainThreadUrlRef.current = null;
        }
        console.error("[ArchiveReplay] MainのThreadView同期に失敗しました", publishError);
      });
    },
    [loadedReplay, mainThreadSyncPublisher, position, syncOffset],
  );

  useEffect(() => {
    if (!followMainThread) return;
    // レス境界と秒単位の位置を共有し、同じ位置のフレームだけ通知を抑制する。
    publishMainThreadSync(currentReplayThread);
  }, [currentReplayThread, followMainThread, publishMainThreadSync]);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    void seekRequestSubscriber(seekToRequest)
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }
        unsubscribe = cleanup;
      })
      .catch((subscribeError: unknown) => {
        console.error("[ArchiveReplay] シーク要求の購読に失敗しました", subscribeError);
      });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [seekRequestSubscriber, seekToRequest]);

  useEffect(() => {
    if (!loadedReplay || pendingSeekRequestRef.current === null) return;
    const request = pendingSeekRequestRef.current;
    pendingSeekRequestRef.current = null;
    seekToRequest(request);
  }, [loadedReplay, seekToRequest]);

  useEffect(() => {
    if (!loadedReplay) return;
    resetOverlaySession();
  }, [loadedReplay, resetOverlaySession, stageKey]);

  useEffect(() => {
    if (!loadedReplay) return;
    if (!overlaySessionActiveRef.current) {
      if (!playing) return;
      resetOverlaySession();
      return;
    }
    void archiveReplayEventBus
      .publish({
        version: 1,
        type: "playback",
        sessionId: replaySessionIdRef.current,
        playing,
      })
      .catch((publishError: unknown) => {
        console.error("[ArchiveReplay] コメントOverlayの再生状態通知に失敗しました", publishError);
      });
  }, [archiveReplayEventBus, loadedReplay, playing, resetOverlaySession]);

  useEffect(() => {
    if (!loadedReplay) return;
    const currentPosition = position;
    const lowerBound = seekStartPosition - 0.000_001;
    for (const comment of loadedReplay.timeline.comments) {
      const effectiveOffset = comment.replayOffsetSeconds + syncOffset;
      if (effectiveOffset < lowerBound || effectiveOffset > currentPosition + 0.000_001) continue;
      const identity = `${comment.sourceThreadUrl}\u0000${comment.responseNumber}`;
      if (emittedCommentKeysRef.current.has(identity)) continue;
      emittedCommentKeysRef.current.add(identity);
      void archiveReplayEventBus
        .publish({
          version: 1,
          type: "comment",
          sessionId: replaySessionIdRef.current,
          comment,
        })
        .catch((publishError: unknown) => {
          console.error("[ArchiveReplay] コメントOverlayへの投入に失敗しました", publishError);
        });
    }
  }, [archiveReplayEventBus, loadedReplay, position, seekStartPosition, stageKey, syncOffset]);

  useEffect(() => {
    return () => {
      stopOverlay();
      void overlayPlatform.hide().catch((hideError: unknown) => {
        console.error("[ArchiveReplay] コメントOverlayの非表示に失敗しました", hideError);
      });
    };
  }, [overlayPlatform, stopOverlay]);

  const closeWindow = useCallback(() => {
    setPlaying(false);
    stopOverlay();
    void overlayPlatform.hide().catch((hideError: unknown) => {
      console.error("[ArchiveReplay] コメントOverlayの非表示に失敗しました", hideError);
    });
    void hideArchiveReplayWindow().catch((hideError: unknown) => {
      console.error("[ArchiveReplay] 再生窓の非表示に失敗しました", hideError);
    });
  }, [overlayPlatform, stopOverlay]);

  useEffect(() => {
    closeWindowRef.current = closeWindow;
  }, [closeWindow]);

  useEffect(() => {
    if (!isTauri) return;
    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    void subscribeArchiveReplayWindowClose(() => closeWindowRef.current())
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }
        unsubscribe = cleanup;
      })
      .catch((subscribeError: unknown) => {
        console.error("[ArchiveReplay] 再生窓の閉じる操作監視に失敗しました", subscribeError);
      });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [isTauri]);

  const replayTime = loadedReplay
    ? formatReplayClock(loadedReplay.timeline.startAt + position * 1_000)
    : "--:--:--";

  // コマンド以外の将来の呼び出し経路でも、Tauri専用機能をブラウザへ露出させない。
  if (!isTauri) return null;

  return (
    <main
      className="browser-shell archive-replay-window"
      data-theme={theme}
      data-testid="archive-replay-window"
    >
      <header className="archive-replay-window__header">
        <div>
          <h1 className="archive-replay-window__title">過去実況再生</h1>
          <p className="archive-replay-window__description">
            複数スレッドのログを投稿時刻順につないで、コメントOverlayへ流します。
          </p>
        </div>
        <Button
          className="archive-replay-window__close"
          variant="subtle"
          aria-label="過去実況再生を閉じる"
          title="閉じる"
          onClick={closeWindow}
        >
          <X size={17} />
        </Button>
      </header>

      <form
        className="archive-replay-window__form"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <label className="archive-replay-window__field archive-replay-window__field--urls">
          <span>実況スレッドURL（1行に1件）</span>
          <textarea
            aria-label="実況スレッドURL"
            value={urls}
            onChange={(event) => setUrls(event.currentTarget.value)}
            placeholder="https://example.com/thread-a/\nhttps://example.com/thread-b/"
            rows={4}
          />
        </label>
        <div className="archive-replay-window__options">
          <label className="archive-replay-window__field">
            <span>放送開始日時（日本時間・任意）</span>
            <input
              aria-label="放送開始日時"
              type="datetime-local"
              value={startInput}
              onChange={(event) => setStartInput(event.currentTarget.value)}
            />
          </label>
          <label className="archive-replay-window__field archive-replay-window__field--small">
            <span>再生時間（分）</span>
            <input
              aria-label="再生時間（分）"
              type="number"
              min={1}
              step={1}
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(event.currentTarget.value)}
            />
          </label>
          <label className="archive-replay-window__field archive-replay-window__field--small">
            <span>再生倍率</span>
            <input
              aria-label="再生倍率"
              type="number"
              min={0.1}
              max={10}
              step={0.1}
              value={replayRateInput}
              onChange={(event) => setReplayRateInput(event.currentTarget.value)}
            />
          </label>
          <Button type="submit" loading={loading} disabled={!urls.trim()}>
            複数スレを読み込む
          </Button>
        </div>
        <span className="archive-replay-window__note">
          開始日時を空欄にすると、取得したログの最初の投稿から開始します。ThreadViewのレスを右クリックして、この位置まで再生できます。
        </span>
      </form>

      {error ? (
        <p
          className="archive-replay-window__message archive-replay-window__message--error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {loadedReplay?.errors.map((loadError) => (
        <p
          key={loadError}
          className="archive-replay-window__message archive-replay-window__message--warning"
          role="status"
        >
          一部取得失敗: {loadError}
        </p>
      ))}
      {loadedReplay ? (
        <div className="archive-replay-window__summary">
          {loadedReplay.titles.map((title, index) => (
            <span key={`${index}-${title}`}>
              スレ{index + 1}: {title}
            </span>
          ))}
          <span>
            対象{loadedReplay.timeline.comments.length}件 / 除外
            {loadedReplay.timeline.skipped.length}件
          </span>
        </div>
      ) : null}

      <div className="archive-replay-window__main-thread-controls">
        <Button
          className="archive-replay-window__secondary-button"
          onClick={() => publishMainThreadSync(currentReplayThread, true)}
          disabled={!currentReplayThread}
        >
          現在の実況スレをメインで開く
        </Button>
        <label className="archive-replay-window__follow-toggle">
          <input
            aria-label="メインを実況スレに追従"
            type="checkbox"
            checked={followMainThread}
            disabled={!loadedReplay}
            onChange={(event) => {
              lastMainThreadUrlRef.current = null;
              setFollowMainThread(event.currentTarget.checked);
            }}
          />
          メインを実況スレに追従
        </label>
      </div>

      <div className="archive-replay-window__controls">
        <Button onClick={() => setPlaying((current) => !current)} disabled={!loadedReplay}>
          {playing ? <Pause size={15} /> : <Play size={15} />}
          {playing ? "停止" : "再生"}
        </Button>
        <Button
          className="archive-replay-window__secondary-button"
          onClick={() => seek(0)}
          disabled={!loadedReplay}
        >
          <RotateCcw size={15} />
          最初から
        </Button>
        <Button
          className="archive-replay-window__secondary-button"
          onClick={() => seek(position - 10)}
          disabled={!loadedReplay}
        >
          <SkipBack size={15} />
          10秒戻す
        </Button>
        <Button
          className="archive-replay-window__secondary-button"
          onClick={() => seek(position + 10)}
          disabled={!loadedReplay}
        >
          <SkipForward size={15} />
          10秒進める
        </Button>
        <span className="archive-replay-window__position">
          {loadedReplay ? `${formatReplayDuration(position)} / ` : ""}
          実況時刻 {replayTime}
        </span>
      </div>

      <div className="archive-replay-window__seek-row">
        <input
          aria-label="過去実況の再生位置"
          type="range"
          min={0}
          max={loadedReplay?.timeline.durationSeconds ?? 1}
          step={0.1}
          value={position}
          disabled={!loadedReplay}
          onChange={(event) => seek(Number(event.currentTarget.value))}
        />
        <Button
          className="archive-replay-window__sync-button"
          variant="subtle"
          onClick={() => {
            setSyncOffset((current) => current - 1);
            seek(position);
          }}
          disabled={!loadedReplay}
        >
          コメントを1秒早く
        </Button>
        <Button
          className="archive-replay-window__sync-button"
          variant="subtle"
          onClick={() => {
            setSyncOffset((current) => current + 1);
            seek(position);
          }}
          disabled={!loadedReplay}
        >
          コメントを1秒遅く
        </Button>
      </div>

      <p className="archive-replay-window__overlay-note" role="status">
        コメントはこの窓ではなく、コメントOverlayに表示されます。追従を有効にすると、
        Mainの専用タブが再生中の実況スレへ切り替わります。
      </p>
    </main>
  );
}

function projectThreadComments(thread: IThreadDetail): readonly CommentCandidate[] {
  return thread.res
    .map((response) => projectCommentResponse(response))
    .filter((comment): comment is CommentCandidate => comment !== null);
}

function createReplaySessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function formatReplayDuration(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3_600);
  const minutes = Math.floor((wholeSeconds % 3_600) / 60);
  const remainder = wholeSeconds % 60;
  return hours > 0
    ? `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${remainder
        .toString()
        .padStart(2, "0")}`
    : `${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}

function formatReplayClock(timestamp: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function resolveArchiveReplayThreadSelection(
  timeline: ArchiveReplayTimeline,
  position: number,
  syncOffset: number,
  threadTitles: Readonly<Record<string, string>>,
): ArchiveReplayThreadSelection | null {
  let firstInRange: ArchiveReplayTimeline["comments"][number] | null = null;
  let current: ArchiveReplayTimeline["comments"][number] | null = null;

  for (const comment of timeline.comments) {
    const effectiveOffset = comment.replayOffsetSeconds + syncOffset;
    if (effectiveOffset < 0 || effectiveOffset > timeline.durationSeconds) continue;
    firstInRange ??= comment;
    if (effectiveOffset <= position) {
      current = comment;
      continue;
    }
    break;
  }

  const selected = current ?? firstInRange;
  if (!selected) return null;

  return {
    threadUrl: selected.sourceThreadUrl,
    responseNumber: selected.responseNumber,
    title: threadTitles[selected.sourceThreadUrl] ?? selected.sourceThreadUrl,
  };
}
