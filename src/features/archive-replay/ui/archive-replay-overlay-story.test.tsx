import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CommentCandidate } from "src/features/comment-overlay/domain";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { PastThreadReplayStory } from "./ArchiveReplayOverlay.stories";

vi.mock("../../../../.storybook/thread-source.ts", () => ({
  createChLensStorybookSource: () => ({
    loadThread: async () => ({
      title: "架空の実況",
      posts: [
        { number: 1, name: "名無し", message: "開始", date: "2026/09/16(水) 23:30:00" },
        { number: 2, name: "名無し", message: "途中", date: "2026/09/16(水) 23:30:10" },
      ],
    }),
  }),
}));

// 描画側の時計を切り離し、利用者が操作する再生時計の巻き戻しを検証する。
vi.mock("src/features/comment-overlay/ui/OverlayStage", () => ({
  DEFAULT_COMMENT_HISTORY_LIMIT: 3000,
  OverlayStage: ({ comments }: { comments: readonly CommentCandidate[] }) => (
    <output data-testid="投入レス">
      {comments.map((comment) => comment.responseNumber).join(",")}
    </output>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("過去実況の再生位置操作", () => {
  it("再生中のシークと先頭移動を次のフレームでも維持する", async () => {
    let now = 0;
    let nextId = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.set(++nextId, callback);
      return nextId;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames.delete(id);
    });
    const frame = (milliseconds: number) =>
      act(() => {
        now += milliseconds;
        const callbacks = [...frames.values()];
        frames.clear();
        callbacks.forEach((callback) => callback(now));
      });
    render(<PastThreadReplayStory comments={[]} />);
    fireEvent.change(screen.getByLabelText("実況スレッドURL"), {
      target: { value: "https://example.com/thread-a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "複数スレを読み込む" }));
    await screen.findByText("スレ1: 架空の実況");
    fireEvent.change(screen.getByLabelText("試作再生倍率"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "再生" }));
    frame(20_000);
    const slider = screen.getByRole("slider", { name: "過去実況の再生位置" });
    expect(slider).toHaveValue("20");
    expect(screen.getByTestId("投入レス")).toHaveTextContent("1,2");
    fireEvent.click(screen.getByRole("button", { name: "10秒進める" }));
    expect(screen.getByTestId("投入レス").textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "10秒戻す" }));
    expect(screen.getByTestId("投入レス").textContent).toBe("");
    fireEvent.change(slider, { target: { value: "5" } });
    frame(1_000);
    expect(slider).toHaveValue("6");
    expect(screen.getByTestId("投入レス").textContent).toBe("");
    frame(4_000);
    expect(screen.getByTestId("投入レス").textContent).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "最初から" }));
    frame(1_000);
    expect(slider).toHaveValue("1");
    expect(screen.getByTestId("投入レス").textContent).toBe("1");
  });
});
