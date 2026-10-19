import { describe, expect, it, vi } from "vite-plus/test";

import type { CommentOverlayController, CommentOverlayControllerSnapshot } from "./controller";
import { toggleCommentOverlayFlow } from "./flow-toggle";

function createController() {
  const controller = {
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    setVisible: vi.fn(() => Promise.resolve()),
  };
  return {
    controller,
    asController: controller as unknown as CommentOverlayController,
  };
}

function createSnapshot(
  status: "running" | "stopped",
  visible: boolean,
): Pick<CommentOverlayControllerSnapshot, "state" | "visible"> {
  return {
    state: { status } as CommentOverlayControllerSnapshot["state"],
    visible,
  };
}

const THREAD_URL = "https://example.com/test/read.cgi/board/1/";

describe("toggleCommentOverlayFlow", () => {
  it("実況中で表示中なら停止する", async () => {
    const { controller, asController } = createController();

    await toggleCommentOverlayFlow(asController, createSnapshot("running", true), THREAD_URL);

    expect(controller.stop).toHaveBeenCalledTimes(1);
    expect(controller.start).not.toHaveBeenCalled();
  });

  it("実況中で非表示なら実況を止めずに表示だけ戻す", async () => {
    const { controller, asController } = createController();

    await toggleCommentOverlayFlow(asController, createSnapshot("running", false), null);

    expect(controller.setVisible).toHaveBeenCalledWith(true);
    expect(controller.stop).not.toHaveBeenCalled();
  });

  it("停止中で対象スレッドがあれば実況を開始する", async () => {
    const { controller, asController } = createController();

    await toggleCommentOverlayFlow(asController, createSnapshot("stopped", false), THREAD_URL);

    expect(controller.start).toHaveBeenCalledWith(THREAD_URL);
  });

  it("停止中で対象スレッドがなければ何もしない", async () => {
    const { controller, asController } = createController();

    await toggleCommentOverlayFlow(asController, createSnapshot("stopped", false), null);

    expect(controller.start).not.toHaveBeenCalled();
    expect(controller.stop).not.toHaveBeenCalled();
    expect(controller.setVisible).not.toHaveBeenCalled();
  });
});
