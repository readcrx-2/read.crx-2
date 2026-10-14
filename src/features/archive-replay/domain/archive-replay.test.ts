import type { CommentCandidate } from "src/features/comment-overlay/domain";
import { describe, expect, it } from "vite-plus/test";

import {
  createArchiveReplayTimeline,
  getArchiveReplayCommentsThroughPosition,
  getArchiveReplaySeekPosition,
  parseArchiveReplayStartInput,
  parseArchiveReplayTimestamp,
} from "./archive-replay";

function comment(
  responseNumber: number,
  date: string,
  text = `レス${responseNumber}`,
): CommentCandidate {
  return {
    responseNumber,
    text,
    author: "名無し",
    date,
  };
}

describe("過去実況の日時解析", () => {
  it("曜日とIDが付いたdat日時を日本時間として解析する", () => {
    expect(parseArchiveReplayTimestamp("2026/09/16(水) 23:30:00 ID:abc")).toBe(
      Date.UTC(2026, 8, 16, 14, 30),
    );
  });

  it("秒なし日時とdatetime-localの開始値を扱う", () => {
    expect(parseArchiveReplayTimestamp("2026/09/16(水) 23:30")).toBe(Date.UTC(2026, 8, 16, 14, 30));
    expect(parseArchiveReplayStartInput("2026-09-16T23:30")).toBe(Date.UTC(2026, 8, 16, 14, 30));
  });

  it("存在しない日付や形式外の値を推測しない", () => {
    expect(parseArchiveReplayTimestamp("2026/02/30(月) 23:30:00")).toBeNull();
    expect(parseArchiveReplayTimestamp("2026-09-16 23:30:00")).toBeNull();
    expect(parseArchiveReplayStartInput("2026-09-16 23:30")).toBeNull();
  });
});

describe("過去実況タイムライン", () => {
  const startAt = Date.UTC(2026, 8, 16, 14, 30);

  it("複数スレを投稿時刻順に混ぜ、同時刻は入力順で安定させる", () => {
    const timeline = createArchiveReplayTimeline(
      [
        {
          threadUrl: "https://example.com/thread-a",
          comments: [comment(1, "2026/09/16(水) 23:30:05"), comment(2, "2026/09/16(水) 23:30:10")],
        },
        {
          threadUrl: "https://example.com/thread-b",
          comments: [comment(1, "2026/09/16(水) 23:30:05"), comment(2, "2026/09/16(水) 23:30:08")],
        },
      ],
      { startAt, durationSeconds: 1_800 },
    );

    expect(
      timeline.comments.map((item) => `${item.sourceThreadUrl}:${item.responseNumber}`),
    ).toEqual([
      "https://example.com/thread-a:1",
      "https://example.com/thread-b:1",
      "https://example.com/thread-b:2",
      "https://example.com/thread-a:2",
    ]);
    expect(timeline.comments.map((item) => item.replayOffsetSeconds)).toEqual([5, 5, 8, 10]);
  });

  it("終了時刻を含めず、日時不正と重複を別理由で記録する", () => {
    const timeline = createArchiveReplayTimeline(
      [
        {
          threadUrl: "https://example.com/thread-a",
          comments: [
            comment(1, "2026/09/16(水) 23:30:00"),
            comment(2, "2026/09/17(木) 00:00:00"),
            comment(3, "日時なし"),
          ],
        },
        {
          threadUrl: "https://example.com/thread-a",
          comments: [comment(1, "2026/09/16(水) 23:30:01")],
        },
      ],
      { startAt, durationSeconds: 1_800 },
    );

    expect(timeline.comments.map((item) => item.responseNumber)).toEqual([1]);
    expect(timeline.skipped.map((item) => item.reason)).toEqual([
      "outside-range",
      "invalid-date",
      "duplicate",
    ]);
  });

  it("レス指定シークへ同期補正を反映し、範囲外なら移動先を返さない", () => {
    const timeline = createArchiveReplayTimeline(
      [
        {
          threadUrl: "https://example.com/thread-a",
          comments: [comment(1, "2026/09/16(水) 23:30:05")],
        },
      ],
      { startAt, durationSeconds: 30 },
    );

    expect(
      getArchiveReplaySeekPosition(
        timeline,
        { threadUrl: "https://example.com/thread-a/", responseNumber: 1 },
        2,
      ),
    ).toBe(7);
    expect(
      getArchiveReplaySeekPosition(timeline, {
        threadUrl: "https://example.com/other",
        responseNumber: 1,
      }),
    ).toBeNull();
    expect(
      getArchiveReplaySeekPosition(
        timeline,
        { threadUrl: "https://example.com/thread-a", responseNumber: 1 },
        -10,
      ),
    ).toBeNull();
  });

  it("シーク後に表示対象となるレスを現在位置から再構築する", () => {
    const timeline = createArchiveReplayTimeline(
      [
        {
          threadUrl: "https://example.com/thread-a",
          comments: [comment(1, "2026/09/16(水) 23:30:05"), comment(2, "2026/09/16(水) 23:30:10")],
        },
      ],
      { startAt, durationSeconds: 30 },
    );

    expect(
      getArchiveReplayCommentsThroughPosition(timeline, 6).map((item) => item.responseNumber),
    ).toEqual([1]);
    expect(
      getArchiveReplayCommentsThroughPosition(timeline, 9, -2).map((item) => item.responseNumber),
    ).toEqual([1, 2]);
  });
});
