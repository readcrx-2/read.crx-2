import type { Meta, StoryObj } from "@storybook/react-vite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ArchiveReplaySource,
  ArchiveReplayTimeline,
} from "src/features/archive-replay/domain";
import {
  createArchiveReplayTimeline,
  getArchiveReplayCommentsThroughPosition,
  parseArchiveReplayStartInput,
  parseArchiveReplayTimestamp,
} from "src/features/archive-replay/domain";

import {
  type ChLensStorybookSource,
  createChLensStorybookSource,
} from "../../../../.storybook/thread-source.ts";
import { projectCommentResponse } from "../domain";
import type { CommentCandidate } from "../domain/comment-types";
import {
  DEFAULT_COMMENT_HISTORY_LIMIT,
  OverlayStage,
  type OverlayStageProps,
} from "./OverlayStage";

const INITIAL_COMMENTS: readonly CommentCandidate[] = [
  { responseNumber: 1, text: "実況開始", author: "名無し" },
  { responseNumber: 2, text: "短いコメント", author: "名無し" },
  {
    responseNumber: 3,
    text: "Danmakuの速度モデルで流れる長めのコメントを確認するレスです",
    author: "名無し",
  },
  { responseNumber: 4, text: "改行を含む\nコメント", author: "名無し" },
];

interface LoadedThreadStoryData {
  url: string;
  title: string;
  comments: readonly CommentCandidate[];
}

interface LoadedArchiveReplayData {
  timeline: ArchiveReplayTimeline;
  titles: readonly string[];
  errors: readonly string[];
}

async function loadThreadStoryData(
  source: ChLensStorybookSource,
  rawUrl: string,
): Promise<LoadedThreadStoryData> {
  const url = rawUrl.trim();
  if (!url) throw new Error("スレッドURLを入力してください");

  const thread = await source.loadThread(url);
  const comments = thread.posts
    .map((post) =>
      projectCommentResponse({
        num: post.number,
        name: post.name,
        message: post.message,
        date: post.date,
        id: post.id,
      }),
    )
    .filter((comment): comment is CommentCandidate => comment !== null);

  return {
    url,
    title: thread.title?.trim() || url,
    comments,
  };
}

interface ThreadUrlFormProps {
  url: string;
  loading: boolean;
  error: string | null;
  title: string | null;
  onUrlChange: (url: string) => void;
  onSubmit: () => void;
}

function ThreadUrlForm({ url, loading, error, title, onUrlChange, onSubmit }: ThreadUrlFormProps) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}
    >
      <label style={{ display: "flex", flex: "1 1 480px", gap: 8, alignItems: "center" }}>
        <span style={{ color: "#a9c1db", fontSize: 13, whiteSpace: "nowrap" }}>スレURL</span>
        <input
          aria-label="スレッドURL"
          type="url"
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
          placeholder="https://example.com/test/read.cgi/liveedge/スレ番号/"
          style={{
            minWidth: 240,
            flex: "1 1 auto",
            border: "1px solid #426189",
            borderRadius: 4,
            padding: "7px 9px",
            color: "#eff6ff",
            background: "#111d30",
          }}
        />
      </label>
      <button type="submit" disabled={loading || !url.trim()}>
        {loading ? "取得中…" : "URLから読み込み"}
      </button>
      {title ? <span style={{ color: "#d8e7f7", fontSize: 13 }}>{title}</span> : null}
      {error ? (
        <span role="alert" style={{ width: "100%", color: "#ff9e9e", fontSize: 13 }}>
          {error}
        </span>
      ) : null}
    </form>
  );
}

interface ArchiveReplayFormProps {
  urls: string;
  startInput: string;
  durationMinutes: string;
  loading: boolean;
  onUrlsChange: (value: string) => void;
  onStartInputChange: (value: string) => void;
  onDurationMinutesChange: (value: string) => void;
  onSubmit: () => void;
}

function ArchiveReplayForm({
  urls,
  startInput,
  durationMinutes,
  loading,
  onUrlsChange,
  onStartInputChange,
  onDurationMinutesChange,
  onSubmit,
}: ArchiveReplayFormProps) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      style={{ display: "grid", gap: 8, minWidth: 0 }}
    >
      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ color: "#a9c1db", fontSize: 13 }}>実況スレッドURL（1行に1件）</span>
        <textarea
          aria-label="実況スレッドURL"
          value={urls}
          onChange={(event) => onUrlsChange(event.target.value)}
          placeholder="https://example.com/thread-a/\nhttps://example.com/thread-b/"
          rows={3}
          style={{
            minWidth: 0,
            width: "100%",
            boxSizing: "border-box",
            resize: "vertical",
            border: "1px solid #426189",
            borderRadius: 4,
            padding: "7px 9px",
            color: "#eff6ff",
            background: "#111d30",
          }}
        />
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
        {/* 数値入力の既定幅が親の幅を超えて隣のボタンへ重なるため、入力幅と折り返し幅を揃える。 */}
        <label style={{ display: "grid", gap: 4, flex: "0 1 220px", minWidth: 0 }}>
          <span style={{ color: "#a9c1db", fontSize: 13 }}>開始日時（日本時間・任意）</span>
          <input
            aria-label="放送開始日時"
            type="datetime-local"
            value={startInput}
            onChange={(event) => onStartInputChange(event.target.value)}
            style={{
              width: "100%",
              minWidth: 0,
              boxSizing: "border-box",
              border: "1px solid #426189",
              borderRadius: 4,
              padding: "7px 9px",
              color: "#eff6ff",
              background: "#111d30",
            }}
          />
        </label>
        <label style={{ display: "grid", gap: 4, flex: "0 1 120px", minWidth: 0 }}>
          <span style={{ color: "#a9c1db", fontSize: 13 }}>再生時間（分）</span>
          <input
            aria-label="再生時間（分）"
            type="number"
            min={1}
            step={1}
            value={durationMinutes}
            onChange={(event) => onDurationMinutesChange(event.target.value)}
            style={{
              width: "100%",
              minWidth: 0,
              boxSizing: "border-box",
              border: "1px solid #426189",
              borderRadius: 4,
              padding: "7px 9px",
              color: "#eff6ff",
              background: "#111d30",
            }}
          />
        </label>
        <button type="submit" disabled={loading || !urls.trim()} style={{ flexShrink: 0 }}>
          {loading ? "取得中…" : "複数スレを読み込む"}
        </button>
      </div>
      <span style={{ color: "#a9c1db", fontSize: 12 }}>
        開始日時は空欄でOK。ログの最初の投稿から開始します（放送開始の自動判定ではありません）。
      </span>
    </form>
  );
}

const meta = {
  title: "ChLens/コメントOverlay/OverlayStage",
  // 回帰テスト用に公開した画面関数を、独立したStoryとして登録しない。
  excludeStories: ["PastThreadReplayStory"],
  component: OverlayStage,
  parameters: {
    docs: {
      description: {
        component:
          "Danmakuの速度モデルを使い、Tauriを起動せずにコメントの速度・lane・queueを確認する表示部品です。",
      },
    },
  },
  argTypes: {
    comments: { table: { disable: true } },
    estimateWidth: { table: { disable: true } },
    onQueueOverflow: { table: { disable: true } },
    className: { table: { disable: true } },
    fitToContainer: { table: { disable: true } },
    stageWidth: { control: { type: "number", min: 320, step: 40 } },
    stageHeight: { control: { type: "number", min: 80, step: 20 } },
    maxLaneCount: { control: { type: "number", min: 1, max: 40, step: 1 } },
    laneHeight: { control: { type: "number", min: 16, step: 2 } },
    durationSeconds: { control: { type: "number", min: 2, max: 15, step: 0.5 } },
    baseSpeedPxPerSecond: { control: { type: "number", min: 20, step: 10 } },
    maxQueueSize: { control: { type: "number", min: 0, step: 1 } },
    collisionMode: {
      control: "select",
      options: ["strict", "adaptive", "none"],
    },
    backlogPolicy: {
      control: "select",
      options: ["queue", "drop"],
    },
    maxActiveCount: { control: { type: "number", min: 1, step: 1 } },
    commentOpacity: { control: { type: "number", min: 0, max: 1, step: 0.05 } },
    backgroundColor: { control: "color" },
    playing: { control: "boolean" },
    interactive: { control: "boolean" },
    showCommentInfo: { control: "boolean" },
  },
} satisfies Meta<typeof OverlayStage>;

export default meta;
type Story = StoryObj<typeof meta>;

function HardcodedStory(args: OverlayStageProps) {
  const [comments, setComments] = useState<readonly CommentCandidate[]>(INITIAL_COMMENTS);
  const [playing, setPlaying] = useState(args.playing ?? true);
  const [stageKey, setStageKey] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);

  const addComments = (count: number) => {
    setComments((current) => {
      const firstResponseNumber = (current.at(-1)?.responseNumber ?? 0) + 1;
      const additions = Array.from({ length: count }, (_, index) => {
        const responseNumber = firstResponseNumber + index;
        return {
          responseNumber,
          text: `追加レス ${responseNumber}：queueとlaneの動きを確認`,
          author: "名無し",
        };
      });
      return [...current, ...additions].slice(-DEFAULT_COMMENT_HISTORY_LIMIT);
    });
  };

  const reset = () => {
    setComments(INITIAL_COMMENTS);
    setSkippedCount(0);
    setStageKey((current) => current + 1);
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        minHeight: 320,
        flexDirection: "column",
        gap: 16,
        padding: 24,
        background: "#0d1524",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button type="button" onClick={() => setPlaying((current) => !current)}>
          {playing ? "停止" : "再生"}
        </button>
        <button type="button" onClick={() => addComments(1)}>
          1レス追加
        </button>
        <button type="button" onClick={() => addComments(20)}>
          20レス追加
        </button>
        <button type="button" onClick={reset}>
          リセット
        </button>
        <span style={{ color: "#a9c1db", fontSize: 13 }}>
          固定レス {comments.length}件 / skip {skippedCount}件 / Tauriなし
        </span>
      </div>
      <div style={{ flex: "1 1 auto", minHeight: 0, width: "100%" }}>
        <OverlayStage
          key={stageKey}
          {...args}
          comments={comments}
          fitToContainer
          playing={playing}
          onQueueOverflow={() => setSkippedCount((current) => current + 1)}
        />
      </div>
    </div>
  );
}

export function PastThreadReplayStory(args: OverlayStageProps) {
  const source = useMemo(() => createChLensStorybookSource(), []);
  const [urls, setUrls] = useState("");
  const [startInput, setStartInput] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [loadedReplay, setLoadedReplay] = useState<LoadedArchiveReplayData | null>(null);
  const [position, setPosition] = useState(0);
  const [seekStartPosition, setSeekStartPosition] = useState(0);
  const positionRef = useRef(0);
  const [syncOffset, setSyncOffset] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stageKey, setStageKey] = useState(0);
  const stageHostRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState({ active: 0, pending: 0 });
  const [replayRate, setReplayRate] = useState(60);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

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
    setPlaying(false);
    setLoadedReplay(null);
    setPosition(0);
    setSeekStartPosition(0);
    positionRef.current = 0;
    setSyncOffset(0);
    setStageKey((current) => current + 1);

    try {
      const settled = await Promise.all(
        inputUrls.map(async (threadUrl) => {
          try {
            const thread = await source.loadThread(threadUrl);
            const comments = thread.posts
              .map((post) =>
                projectCommentResponse({
                  num: post.number,
                  name: post.name,
                  message: post.message,
                  date: post.date,
                  id: post.id,
                }),
              )
              .filter((comment): comment is CommentCandidate => comment !== null);
            return {
              source: { threadUrl, comments } satisfies ArchiveReplaySource,
              title: thread.title?.trim() || threadUrl,
              error: null,
            };
          } catch (loadError: unknown) {
            console.error("[Storybook] archive replay thread load failed:", threadUrl, loadError);
            return {
              source: null,
              title: threadUrl,
              error:
                loadError instanceof Error
                  ? `${threadUrl}: ${loadError.message}`
                  : `${threadUrl}: 取得に失敗しました`,
            };
          }
        }),
      );
      const loadedSources = settled.flatMap((result) => (result.source ? [result.source] : []));
      if (loadedSources.length === 0) throw new Error("取得できたスレッドがありません");
      // 毎回の日付入力を省けるよう、未指定なら今回の取得結果から開始候補を求める。
      // 入力欄へ書き戻さず空欄を保つことで、別番組の読み込みに前回の日付を流用しない。
      const startAt =
        requestedStartAt ??
        loadedSources.reduce<number | null>(
          (earliest, item) =>
            item.comments.reduce<number | null>((candidate, comment) => {
              const timestamp = parseArchiveReplayTimestamp(comment.date ?? "");
              return timestamp === null
                ? candidate
                : candidate === null
                  ? timestamp
                  : Math.min(candidate, timestamp);
            }, earliest),
          null,
        );
      if (startAt === null)
        throw new Error(
          "投稿日時を読み取れるレスがありません。開始日時と取得したログを確認してください",
        );
      const timeline = createArchiveReplayTimeline(loadedSources, {
        startAt,
        durationSeconds: parsedDurationMinutes * 60,
      });
      setLoadedReplay({
        timeline,
        titles: settled.map((result) => result.title),
        errors: settled.flatMap((result) => (result.error ? [result.error] : [])),
      });
      setStageKey((current) => current + 1);
    } catch (loadError: unknown) {
      console.error("[Storybook] past thread load failed:", loadError);
      setError(loadError instanceof Error ? loadError.message : "スレッドの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [durationMinutes, source, startInput, urls]);

  useEffect(() => {
    if (!playing || !loadedReplay) return;

    // 変更理由: タイマーの呼び出し回数を加算せず、実時間との差から位置を求めることで
    // Storybookの負荷やバックグラウンド化によるcallback遅延が累積しないようにする。
    const startedAt = performance.now();
    const startedPosition = positionRef.current;
    let frameId = 0;
    const tick = (now: number) => {
      const nextPosition = Math.min(
        loadedReplay.timeline.durationSeconds,
        startedPosition + ((now - startedAt) / 1_000) * Math.max(0.1, replayRate),
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
    // シークで表示だけを初期化すると旧startedPositionが次のframeで位置を戻してしまう。
    // 表示世代の変更時には時計も張り直し、移動先を新しい再生基準にする。
  }, [loadedReplay, playing, replayRate, stageKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const stage = stageHostRef.current?.querySelector<HTMLElement>(
        '[data-testid="comment-overlay-stage"]',
      );
      if (!stage) return;
      setStats({
        active: Number(stage.dataset.activeCount ?? 0),
        pending: Number(stage.dataset.pendingCount ?? 0),
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  const seek = useCallback(
    (nextPosition: number) => {
      if (!loadedReplay) return;
      const clamped = Math.min(Math.max(0, nextPosition), loadedReplay.timeline.durationSeconds);
      // 変更理由: OverlayStageのschedulerは時計の逆行を拒否するため、シークでは
      // 表示中コメントとlaneをまとめて新しい世代へ作り直し、前位置のレスを残さない。
      positionRef.current = clamped;
      setPosition(clamped);
      // 描画世代を作り直した際に全履歴を新着として再投入しないよう、
      // 移動先を投入範囲の下限にする。巻き戻した区間は投稿時刻に達してから再表示する。
      setSeekStartPosition(clamped);
      setStageKey((current) => current + 1);
    },
    [loadedReplay],
  );

  const restart = () => {
    if (!loadedReplay) return;
    seek(0);
    setPlaying(true);
  };

  const visibleComments = loadedReplay
    ? getArchiveReplayCommentsThroughPosition(loadedReplay.timeline, position, syncOffset)
        .filter((comment) => comment.replayOffsetSeconds + syncOffset >= seekStartPosition)
        .slice(-DEFAULT_COMMENT_HISTORY_LIMIT)
    : [];
  const replayTime = loadedReplay
    ? formatReplayClock(loadedReplay.timeline.startAt + position * 1_000)
    : "--:--:--";

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        minHeight: 360,
        flexDirection: "column",
        gap: 12,
        padding: 20,
        background: "#0d1524",
      }}
    >
      <ArchiveReplayForm
        urls={urls}
        startInput={startInput}
        durationMinutes={durationMinutes}
        loading={loading}
        onUrlsChange={setUrls}
        onStartInputChange={setStartInput}
        onDurationMinutesChange={setDurationMinutes}
        onSubmit={() => void load()}
      />
      {error ? (
        <span role="alert" style={{ color: "#ff9e9e", fontSize: 13 }}>
          {error}
        </span>
      ) : null}
      {loadedReplay?.errors.map((loadError) => (
        <span key={loadError} role="status" style={{ color: "#ffc777", fontSize: 13 }}>
          一部取得失敗: {loadError}
        </span>
      ))}
      {loadedReplay ? (
        <div style={{ display: "grid", gap: 2, color: "#a9c1db", fontSize: 12 }}>
          {loadedReplay.titles.map((title, index) => (
            <span key={`${index}-${title}`}>
              スレ{index + 1}: {title}
            </span>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button type="button" onClick={() => setPlaying((current) => !current)}>
          {playing ? "停止" : "再生"}
        </button>
        <button type="button" onClick={restart} disabled={!loadedReplay}>
          最初から
        </button>
        <button type="button" onClick={() => seek(position - 10)} disabled={!loadedReplay}>
          10秒戻す
        </button>
        <button type="button" onClick={() => seek(position + 10)} disabled={!loadedReplay}>
          10秒進める
        </button>
        <label
          style={{ display: "flex", gap: 4, alignItems: "center", color: "#a9c1db", fontSize: 13 }}
        >
          試作倍率
          <input
            aria-label="試作再生倍率"
            type="number"
            min={1}
            max={300}
            step={1}
            value={replayRate}
            onChange={(event) => setReplayRate(Number(event.target.value) || 1)}
            style={{ width: 58 }}
          />
          倍
        </label>
        <span style={{ color: "#a9c1db", fontSize: 13 }}>
          {loadedReplay
            ? `対象${loadedReplay.timeline.comments.length}件 / 除外${loadedReplay.timeline.skipped.length}件`
            : "過去ログ未読込"}{" "}
          / {formatReplayDuration(position)} / 実況時刻 {replayTime} / active {stats.active} /
          pending {stats.pending}
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <input
          aria-label="過去実況の再生位置"
          type="range"
          min={0}
          max={loadedReplay?.timeline.durationSeconds ?? 1}
          step={0.1}
          value={position}
          disabled={!loadedReplay}
          onChange={(event) => seek(Number(event.target.value))}
          style={{ flex: "1 1 auto" }}
        />
        <button
          type="button"
          onClick={() => {
            setSyncOffset((current) => current - 1);
            seek(position);
          }}
          disabled={!loadedReplay}
        >
          コメントを1秒早く
        </button>
        <button
          type="button"
          onClick={() => {
            setSyncOffset((current) => current + 1);
            seek(position);
          }}
          disabled={!loadedReplay}
        >
          コメントを1秒遅く
        </button>
      </div>
      <div ref={stageHostRef} style={{ flex: "1 1 auto", minHeight: 0, width: "100%" }}>
        <OverlayStage
          key={stageKey}
          {...args}
          comments={visibleComments}
          fitToContainer
          playing={playing}
        />
      </div>
    </div>
  );
}

function formatReplayDuration(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
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

function CurrentThreadStory(args: OverlayStageProps) {
  const source = useMemo(() => createChLensStorybookSource(), []);
  const [url, setUrl] = useState("");
  const [loadedThread, setLoadedThread] = useState<LoadedThreadStoryData | null>(null);
  const [comments, setComments] = useState<readonly CommentCandidate[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stageKey, setStageKey] = useState(0);
  const stageHostRef = useRef<HTMLDivElement>(null);
  const lastResponseNumber = useRef(0);
  const requestInFlight = useRef(false);
  const [stats, setStats] = useState({ active: 0, pending: 0 });

  const load = useCallback(async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setLoading(true);
    setError(null);
    setStreaming(false);
    setLoadedThread(null);
    setComments([]);
    lastResponseNumber.current = 0;
    setStageKey((current) => current + 1);

    try {
      const nextThread = await loadThreadStoryData(source, url);
      setLoadedThread(nextThread);
      setComments(nextThread.comments.slice(-DEFAULT_COMMENT_HISTORY_LIMIT));
      lastResponseNumber.current = latestCommentNumber(nextThread.comments);
      setStreaming(true);
      setStageKey((current) => current + 1);
    } catch (loadError: unknown) {
      console.error("[Storybook] current thread load failed:", loadError);
      setError(loadError instanceof Error ? loadError.message : "スレッドの取得に失敗しました");
    } finally {
      requestInFlight.current = false;
      setLoading(false);
    }
  }, [source, url]);

  const refresh = useCallback(async () => {
    if (!loadedThread || requestInFlight.current) return;
    requestInFlight.current = true;
    setLoading(true);
    setError(null);

    try {
      const nextThread = await loadThreadStoryData(source, loadedThread.url);
      const newComments = nextThread.comments.filter(
        (comment) => comment.responseNumber > lastResponseNumber.current,
      );
      if (newComments.length > 0) {
        lastResponseNumber.current = latestCommentNumber(newComments);
        setComments((current) =>
          [...current, ...newComments].slice(-DEFAULT_COMMENT_HISTORY_LIMIT),
        );
      }
      setLoadedThread(nextThread);
    } catch (refreshError: unknown) {
      console.error("[Storybook] current thread refresh failed:", refreshError);
      setError(
        refreshError instanceof Error ? refreshError.message : "新着レスの取得に失敗しました",
      );
    } finally {
      requestInFlight.current = false;
      setLoading(false);
    }
  }, [loadedThread, source]);

  useEffect(() => {
    if (!streaming || !loadedThread) return;

    // 変更理由: 現行スレは入力されたURLを固定して再取得し、次スレ探索を行わずに
    // 同じスレッドの新着レスだけをOverlayへ追加する。
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [loadedThread, refresh, streaming]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const stage = stageHostRef.current?.querySelector<HTMLElement>(
        '[data-testid="comment-overlay-stage"]',
      );
      if (!stage) return;
      setStats({
        active: Number(stage.dataset.activeCount ?? 0),
        pending: Number(stage.dataset.pendingCount ?? 0),
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  const reset = () => {
    if (!loadedThread) return;
    setComments(loadedThread.comments.slice(-DEFAULT_COMMENT_HISTORY_LIMIT));
    lastResponseNumber.current = latestCommentNumber(loadedThread.comments);
    setStageKey((current) => current + 1);
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        minHeight: 360,
        flexDirection: "column",
        gap: 12,
        padding: 20,
        background: "#0d1524",
      }}
    >
      <ThreadUrlForm
        url={url}
        loading={loading}
        error={error}
        title={loadedThread?.title ?? null}
        onUrlChange={setUrl}
        onSubmit={() => void load()}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button type="button" onClick={() => setStreaming((current) => !current)}>
          {streaming ? "新着停止" : "新着再開"}
        </button>
        <button type="button" onClick={() => void refresh()} disabled={!loadedThread || loading}>
          今すぐ更新
        </button>
        <button type="button" onClick={reset} disabled={!loadedThread}>
          リセット
        </button>
        <span style={{ color: "#a9c1db", fontSize: 13 }}>
          {loadedThread ? `現行スレ ${comments.length}件` : "現行スレ未読込"} / active{" "}
          {stats.active} / pending {stats.pending} / 同じURLのみ更新・自動次スレなし
        </span>
      </div>
      <div ref={stageHostRef} style={{ flex: "1 1 auto", minHeight: 0, width: "100%" }}>
        <OverlayStage key={stageKey} {...args} comments={comments} fitToContainer playing />
      </div>
    </div>
  );
}

function latestCommentNumber(comments: readonly CommentCandidate[]): number {
  return comments.reduce((latest, comment) => Math.max(latest, comment.responseNumber), 0);
}

function StressStory(args: OverlayStageProps) {
  const [comments, setComments] = useState<readonly CommentCandidate[]>(INITIAL_COMMENTS);
  const [commentsPerSecond, setCommentsPerSecond] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [stats, setStats] = useState({ active: 0, pending: 0 });
  const [stageKey, setStageKey] = useState(0);
  const stageHostRef = useRef<HTMLDivElement>(null);
  const nextResponseNumber = useRef(INITIAL_COMMENTS.at(-1)?.responseNumber ?? 0);

  const addComments = useCallback((count: number) => {
    setComments((current) => {
      const additions = Array.from({ length: count }, () => {
        const responseNumber = ++nextResponseNumber.current;
        return {
          responseNumber,
          text: `実況 ${responseNumber}：DPlayer風の即時投入とadaptive衝突を確認する長めのレス`,
          author: "名無し",
        };
      });
      return [...current, ...additions].slice(-3000);
    });
  }, []);

  useEffect(() => {
    if (commentsPerSecond <= 0) return;

    const intervalMs = 100;
    const batchSize = Math.max(1, Math.round((commentsPerSecond * intervalMs) / 1000));
    const timer = window.setInterval(() => addComments(batchSize), intervalMs);
    return () => window.clearInterval(timer);
  }, [addComments, commentsPerSecond]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const stage = stageHostRef.current?.querySelector<HTMLElement>(
        '[data-testid="comment-overlay-stage"]',
      );
      if (!stage) return;
      setStats({
        active: Number(stage.dataset.activeCount ?? 0),
        pending: Number(stage.dataset.pendingCount ?? 0),
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  const reset = () => {
    setComments(INITIAL_COMMENTS);
    nextResponseNumber.current = INITIAL_COMMENTS.at(-1)?.responseNumber ?? 0;
    setSkippedCount(0);
    setStageKey((current) => current + 1);
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        minHeight: 360,
        flexDirection: "column",
        gap: 12,
        padding: 20,
        background: "#0d1524",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {[0, 10, 30, 60, 120, 300].map((rate) => (
          <button key={rate} type="button" onClick={() => setCommentsPerSecond(rate)}>
            {rate === 0 ? "停止" : `${rate}件/秒`}
          </button>
        ))}
        <button type="button" onClick={() => addComments(100)}>
          100件追加
        </button>
        <button type="button" onClick={reset}>
          リセット
        </button>
        <span style={{ color: "#a9c1db", fontSize: 13 }}>
          入力 {commentsPerSecond}件/秒 / active {stats.active} / pending {stats.pending} / skip{" "}
          {skippedCount} / mode {args.collisionMode ?? "adaptive"}
        </span>
      </div>
      <div ref={stageHostRef} style={{ flex: "1 1 auto", minHeight: 0, width: "100%" }}>
        <OverlayStage
          key={stageKey}
          {...args}
          comments={comments}
          fitToContainer
          onQueueOverflow={() => setSkippedCount((current) => current + 1)}
        />
      </div>
    </div>
  );
}

export const Hardcoded: Story = {
  render: (args) => <HardcodedStory {...args} />,
  args: {
    comments: INITIAL_COMMENTS,
    stageWidth: 800,
    stageHeight: 240,
    maxLaneCount: 24,
    durationSeconds: 6,
    maxQueueSize: 0,
    collisionMode: "adaptive",
    backlogPolicy: "drop",
    maxActiveCount: 3000,
    commentOpacity: 0.95,
    backgroundColor: "#172235",
    fitToContainer: true,
    playing: true,
    interactive: true,
    showCommentInfo: true,
  },
};

export const PastThreadReplay: Story = {
  render: (args) => <PastThreadReplayStory {...args} />,
  args: {
    comments: [],
    stageWidth: 900,
    stageHeight: 320,
    maxLaneCount: 24,
    durationSeconds: 6,
    maxQueueSize: 64,
    collisionMode: "strict",
    backlogPolicy: "queue",
    maxActiveCount: 3000,
    commentOpacity: 0.95,
    backgroundColor: "#172235",
    fitToContainer: true,
    playing: true,
    interactive: true,
    showCommentInfo: true,
  },
};

export const CurrentThread: Story = {
  render: (args) => <CurrentThreadStory {...args} />,
  args: {
    comments: [],
    stageWidth: 900,
    stageHeight: 320,
    maxLaneCount: 24,
    durationSeconds: 6,
    maxQueueSize: 0,
    collisionMode: "adaptive",
    backlogPolicy: "drop",
    maxActiveCount: 3000,
    commentOpacity: 0.95,
    backgroundColor: "#172235",
    fitToContainer: true,
    playing: true,
    interactive: true,
    showCommentInfo: true,
  },
};

export const Stress: Story = {
  render: (args) => <StressStory {...args} />,
  args: {
    comments: INITIAL_COMMENTS,
    stageWidth: 900,
    stageHeight: 320,
    maxLaneCount: 24,
    durationSeconds: 6,
    maxQueueSize: 0,
    collisionMode: "adaptive",
    backlogPolicy: "drop",
    maxActiveCount: 3000,
    commentOpacity: 0.95,
    backgroundColor: "#172235",
    fitToContainer: true,
    playing: true,
    interactive: false,
    showCommentInfo: false,
  },
};
