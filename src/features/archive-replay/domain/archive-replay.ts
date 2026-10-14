import type { CommentCandidate } from "src/features/comment-overlay/domain";

/** 実況ログの日時は掲示板にタイムゾーンが含まれないため、日本時間として解釈する。 */
export const ARCHIVE_REPLAY_TIME_ZONE_OFFSET_MINUTES = 9 * 60;

export interface ArchiveReplaySource {
  /** URLは表示用ではなく、同じレス番号を区別する識別子としても使う。 */
  threadUrl: string;
  comments: readonly CommentCandidate[];
}

export interface ArchiveReplayWindow {
  startAt: number;
  durationSeconds: number;
}

export type ArchiveReplaySkipReason = "invalid-date" | "outside-range" | "duplicate";

export interface ArchiveReplaySkippedComment {
  threadUrl: string;
  responseNumber: number;
  reason: ArchiveReplaySkipReason;
  date?: string;
}

export interface ArchiveReplayTimelineComment extends CommentCandidate {
  sourceThreadUrl: string;
  /** 投稿時刻をUTCのepoch millisecondsで保持し、表示用の文字列と混同しない。 */
  occurredAt: number;
  /** 放送開始からの相対秒。同期補正を含めない基準値。 */
  replayOffsetSeconds: number;
  sourceOrder: number;
  sourceCommentOrder: number;
}

export interface ArchiveReplayTimeline {
  startAt: number;
  endAt: number;
  durationSeconds: number;
  comments: readonly ArchiveReplayTimelineComment[];
  skipped: readonly ArchiveReplaySkippedComment[];
}

export interface ArchiveReplaySeekTarget {
  threadUrl: string;
  responseNumber: number;
}

/**
 * datの日時文字列から、実況再生に使う絶対時刻を作る。
 * Date.parseへ任せるとOSやブラウザのロケール差で解釈が変わるため、掲示板形式を明示的に読む。
 */
export function parseArchiveReplayTimestamp(value: string): number | null {
  const match =
    /(?:^|\D)(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\([^)]*\))?\s+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?/.exec(
      value,
    );
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  const millisecond = Number((match[7] ?? "").padEnd(3, "0"));

  if (
    year < 1_000 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    millisecond > 999
  ) {
    return null;
  }

  // Date.UTCの0〜99年補正を避けるため、年だけはsetUTCFullYearで設定する。
  const utcCalendar = new Date(0);
  utcCalendar.setUTCHours(hour, minute, second, millisecond);
  utcCalendar.setUTCFullYear(year, month - 1, day);
  if (
    utcCalendar.getUTCFullYear() !== year ||
    utcCalendar.getUTCMonth() !== month - 1 ||
    utcCalendar.getUTCDate() !== day ||
    utcCalendar.getUTCHours() !== hour ||
    utcCalendar.getUTCMinutes() !== minute ||
    utcCalendar.getUTCSeconds() !== second ||
    utcCalendar.getUTCMilliseconds() !== millisecond
  ) {
    return null;
  }

  return utcCalendar.getTime() - ARCHIVE_REPLAY_TIME_ZONE_OFFSET_MINUTES * 60_000;
}

/** datetime-localの値を日本時間の絶対時刻へ変換する。 */
export function parseArchiveReplayStartInput(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return parseArchiveReplayTimestamp(
    `${match[1]}/${match[2]}/${match[3]} ${match[4]}:${match[5]}:00`,
  );
}

/** 複数スレッドのレスを指定枠へ絞り、投稿時刻順の再生タイムラインへ変換する。 */
export function createArchiveReplayTimeline(
  sources: readonly ArchiveReplaySource[],
  window: ArchiveReplayWindow,
): ArchiveReplayTimeline {
  assertFinite(window.startAt, "startAt");
  if (!Number.isFinite(window.durationSeconds) || window.durationSeconds <= 0) {
    throw new RangeError("durationSeconds must be greater than zero");
  }

  const endAt = window.startAt + window.durationSeconds * 1_000;
  const seen = new Set<string>();
  const comments: ArchiveReplayTimelineComment[] = [];
  const skipped: ArchiveReplaySkippedComment[] = [];

  sources.forEach((source, sourceOrder) => {
    const threadUrl = source.threadUrl.trim();
    source.comments.forEach((comment, sourceCommentOrder) => {
      const identity = `${normalizeArchiveReplayThreadUrl(threadUrl)}\u0000${comment.responseNumber}`;
      if (seen.has(identity)) {
        skipped.push({
          threadUrl,
          responseNumber: comment.responseNumber,
          reason: "duplicate",
          ...(comment.date ? { date: comment.date } : {}),
        });
        return;
      }
      seen.add(identity);

      const occurredAt = comment.date ? parseArchiveReplayTimestamp(comment.date) : null;
      if (occurredAt === null) {
        skipped.push({
          threadUrl,
          responseNumber: comment.responseNumber,
          reason: "invalid-date",
          ...(comment.date ? { date: comment.date } : {}),
        });
        return;
      }
      if (occurredAt < window.startAt || occurredAt >= endAt) {
        skipped.push({
          threadUrl,
          responseNumber: comment.responseNumber,
          reason: "outside-range",
          ...(comment.date ? { date: comment.date } : {}),
        });
        return;
      }

      comments.push({
        ...comment,
        sourceThreadUrl: threadUrl,
        occurredAt,
        replayOffsetSeconds: (occurredAt - window.startAt) / 1_000,
        sourceOrder,
        sourceCommentOrder,
      });
    });
  });

  comments.sort(
    (left, right) =>
      left.occurredAt - right.occurredAt ||
      left.sourceOrder - right.sourceOrder ||
      left.responseNumber - right.responseNumber ||
      left.sourceCommentOrder - right.sourceCommentOrder,
  );

  return {
    startAt: window.startAt,
    endAt,
    durationSeconds: window.durationSeconds,
    comments,
    skipped,
  };
}

/** レス一覧から選んだ元レスを、現在の同期補正込みの再生位置へ変換する。 */
export function getArchiveReplaySeekPosition(
  timeline: ArchiveReplayTimeline,
  target: ArchiveReplaySeekTarget,
  syncOffsetSeconds = 0,
): number | null {
  if (!Number.isFinite(syncOffsetSeconds)) return null;
  const threadUrl = normalizeArchiveReplayThreadUrl(target.threadUrl);
  const comment = timeline.comments.find(
    (candidate) =>
      normalizeArchiveReplayThreadUrl(candidate.sourceThreadUrl) === threadUrl &&
      candidate.responseNumber === target.responseNumber,
  );
  if (!comment) return null;

  const position = comment.replayOffsetSeconds + syncOffsetSeconds;
  return position >= 0 && position <= timeline.durationSeconds ? position : null;
}

/** 現在位置までに投稿されたレスを求める。シーク時の表示再構築にも利用する。 */
export function getArchiveReplayCommentsThroughPosition(
  timeline: ArchiveReplayTimeline,
  positionSeconds: number,
  syncOffsetSeconds = 0,
): readonly ArchiveReplayTimelineComment[] {
  if (!Number.isFinite(positionSeconds) || !Number.isFinite(syncOffsetSeconds)) return [];
  return timeline.comments.filter((comment) => {
    const effectiveOffset = comment.replayOffsetSeconds + syncOffsetSeconds;
    return (
      effectiveOffset >= 0 &&
      effectiveOffset <= timeline.durationSeconds &&
      effectiveOffset <= positionSeconds
    );
  });
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
}

export function normalizeArchiveReplayThreadUrl(value: string): string {
  // アドレスバーから貼ったURLは末尾slashの有無が揺れるため、レス指定時だけ同一スレとして照合する。
  return value.trim().replace(/\/+$/, "");
}
