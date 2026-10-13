import { act, cleanup, renderHook } from "@testing-library/react";
import { buildReplyIndexes } from "src/core/thread/reply-index";
import { useLiveChatReplyIndex } from "src/features/live-chat/browser/use-live-chat-reply-index";
import { useLiveChatResponses } from "src/features/live-chat/browser/use-live-chat-responses";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const rows = (...nums: number[]) =>
  nums.map((num) => ({ num, message: num === 1 ? "起点" : ">>1" }));
const initial = {
  responses: rows(1, 2),
  scopeKey: "tab-a/thread-a",
  enabled: true,
  isActive: true,
  isAutoRefreshEnabled: true,
  isFetching: false,
  intervalMs: 20000,
  paused: false,
};

function useProbe(props: typeof initial) {
  const playback = useLiveChatResponses(props);
  const replies = useLiveChatReplyIndex({
    scopeKey: props.scopeKey,
    isFlowing: playback.isFlowing,
    baseline: playback.baseline,
    responses: props.responses,
    repIndex: buildReplyIndexes(props.responses).repIndex,
  });
  return { playback, replies };
}

const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

describe("ライブチャットの表示完了と返信数", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("キューから出た後も入場完了までは返信数を増やさず、完了した行だけを反映する", () => {
    const { result, rerender } = renderHook(useProbe, { initialProps: initial });
    expect(result.current.replies.repIndex.get(1)).toEqual(new Set([2]));
    rerender({ ...initial, responses: rows(1, 2, 3, 4) });
    advance(600);
    expect(result.current.playback.responses).toEqual(rows(1, 2, 3));
    expect(result.current.replies.repIndex.get(1)).toEqual(new Set([2]));
    act(() => result.current.replies.onEntryDisplayed(3));
    expect(result.current.replies.repIndex.get(1)).toEqual(new Set([2, 3]));
    advance(600);
    expect(result.current.playback.responses).toEqual(rows(1, 2, 3, 4));
    expect(result.current.replies.repIndex.get(1)).toEqual(new Set([2, 3]));
    act(() => result.current.replies.onEntryDisplayed(4));
    act(() => result.current.replies.onEntryDisplayed(4));
    expect(result.current.replies.repIndex.get(1)).toEqual(new Set([2, 3, 4]));
  });

  it("最初の返信リンクも入場完了後にだけ現れる", () => {
    const { result, rerender } = renderHook(useProbe, {
      initialProps: { ...initial, responses: rows(1) },
    });
    rerender({ ...initial, responses: rows(1, 2) });
    advance(600);
    expect(result.current.replies.repIndex.has(1)).toBe(false);
    act(() => result.current.replies.onEntryDisplayed(2));
    expect(result.current.replies.repIndex.get(1)).toEqual(new Set([2]));
  });

  it("キューを一時停止している間は返信数も据え置き、再開後の入場完了で増やす", () => {
    const { result, rerender } = renderHook(useProbe, { initialProps: initial });
    const batch = { ...initial, responses: rows(1, 2, 3), paused: true };
    rerender(batch);
    advance(60_000);
    expect(result.current.replies.repIndex.get(1)).toEqual(new Set([2]));
    rerender({ ...batch, paused: false });
    advance(600);
    expect(result.current.replies.repIndex.get(1)).toEqual(new Set([2]));
    act(() => result.current.replies.onEntryDisplayed(3));
    expect(result.current.replies.repIndex.get(1)).toEqual(new Set([2, 3]));
  });

  it("通常表示は取得済み全件の返信数を使い、別スレの入場完了を持ち込まない", () => {
    const { result, rerender } = renderHook(useProbe, { initialProps: initial });
    const staleComplete = result.current.replies.onEntryDisplayed;
    rerender({ ...initial, enabled: false, responses: rows(1, 2, 3, 4) });
    expect(result.current.replies.repIndex.get(1)).toEqual(new Set([2, 3, 4]));
    expect(result.current.replies.replySourceNums).toBeUndefined();

    const next = { ...initial, scopeKey: "tab-a/thread-b", responses: rows(1) };
    rerender(next);
    rerender({ ...next, responses: rows(1, 2) });
    advance(600);
    act(() => staleComplete(2));
    expect(result.current.replies.repIndex.has(1)).toBe(false);
    act(() => result.current.replies.onEntryDisplayed(2));
    expect(result.current.replies.repIndex.get(1)).toEqual(new Set([2]));
  });

  it("大量取得で入場を省略した既存分は即反映し、末尾の入場待ちは数えない", () => {
    const { result, rerender } = renderHook(useProbe, { initialProps: initial });
    rerender({ ...initial, responses: rows(...Array.from({ length: 102 }, (_, i) => i + 1)) });
    expect(result.current.replies.repIndex.get(1)?.size).toBe(91);
    advance(600);
    expect(result.current.playback.responses.at(-1)?.num).toBe(93);
    expect(result.current.replies.repIndex.get(1)?.size).toBe(91);
    act(() => result.current.replies.onEntryDisplayed(93));
    expect(result.current.replies.repIndex.get(1)?.size).toBe(92);
  });
});
