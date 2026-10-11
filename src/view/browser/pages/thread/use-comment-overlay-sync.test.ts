import { cleanup, renderHook } from "@testing-library/react";
import {
  createIdleCommentOverlayState,
  startCommentOverlay,
} from "src/features/comment-overlay/domain";
import type { IRes } from "src/service-container/interfaces";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { useCommentOverlaySync } from "./use-comment-overlay-sync";

const THREAD_URL = "https://example.test/test/read.cgi/live/1/";

function createController(targetThreadUrl?: string) {
  return {
    syncThread: vi.fn(),
    getSnapshot: vi.fn(() => ({
      state: targetThreadUrl
        ? startCommentOverlay(targetThreadUrl, [])
        : createIdleCommentOverlayState(),
      visible: targetThreadUrl != null,
      error: null,
    })),
    stop: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}

function response(num: number): IRes {
  return {
    num,
    name: "名無し",
    mail: "",
    date: "2026/08/30(日) 12:00:00",
    message: `レス${num}`,
  };
}

describe("useCommentOverlaySync", () => {
  afterEach(() => {
    cleanup();
  });

  it("有効なThreadPageのsnapshotをcontrollerへ共有する", () => {
    const controller = createController();

    renderHook(() =>
      useCommentOverlaySync({
        controller,
        threadUrl: THREAD_URL,
        responses: [response(1)],
        isActive: true,
        isAutoRefreshEnabled: false,
      }),
    );

    expect(controller.syncThread).toHaveBeenCalledWith(THREAD_URL, [response(1)]);
  });

  it("無効なThreadPageからはsnapshotを共有しない", () => {
    const controller = createController();

    renderHook(() =>
      useCommentOverlaySync({
        controller,
        threadUrl: THREAD_URL,
        responses: [response(1)],
        isActive: false,
        isAutoRefreshEnabled: false,
      }),
    );

    expect(controller.syncThread).not.toHaveBeenCalled();
  });

  it("snapshot更新だけでは実況の開始や停止を要求しない", () => {
    const controller = createController();
    const { rerender } = renderHook(
      ({ responses }) =>
        useCommentOverlaySync({
          controller,
          threadUrl: THREAD_URL,
          responses,
          isActive: true,
          isAutoRefreshEnabled: false,
        }),
      { initialProps: { responses: [response(1)] } },
    );

    rerender({ responses: [response(1), response(2)] });

    expect(controller.syncThread).toHaveBeenLastCalledWith(THREAD_URL, [response(1), response(2)]);
  });

  it("自分のレス番号を同じsnapshotと一緒にcontrollerへ共有する", () => {
    const controller = createController();
    const ownResponseNumbers = new Set([2]);

    renderHook(() =>
      useCommentOverlaySync({
        controller,
        threadUrl: THREAD_URL,
        responses: [response(1), response(2)],
        isActive: true,
        isAutoRefreshEnabled: false,
        ownResponseNumbers,
      }),
    );

    expect(controller.syncThread).toHaveBeenCalledWith(THREAD_URL, [response(1), response(2)], {
      ownResponseNumbers,
    });
  });

  it.each([true, false])(
    "表示状態が%sでも自動更新をOFFにすると対象の実況を停止する",
    (isActive) => {
      const controller = createController(THREAD_URL);
      const { rerender } = renderHook(
        ({ enabled }) =>
          useCommentOverlaySync({
            controller,
            threadUrl: THREAD_URL,
            responses: [],
            isActive,
            isAutoRefreshEnabled: enabled,
          }),
        { initialProps: { enabled: true } },
      );

      rerender({ enabled: false });
      rerender({ enabled: false });

      expect(controller.stop).toHaveBeenCalledOnce();
    },
  );

  it("自動更新が初期状態でOFFでも実況を停止しない", () => {
    const controller = createController(THREAD_URL);
    renderHook(() =>
      useCommentOverlaySync({
        controller,
        threadUrl: THREAD_URL,
        responses: [],
        isActive: true,
        isAutoRefreshEnabled: false,
      }),
    );

    expect(controller.stop).not.toHaveBeenCalled();
  });

  it("別スレッドの自動更新をOFFにしても実況を停止しない", () => {
    const controller = createController("https://example.test/test/read.cgi/live/2/");
    const { rerender } = renderHook(
      ({ enabled }) =>
        useCommentOverlaySync({
          controller,
          threadUrl: THREAD_URL,
          responses: [],
          isActive: true,
          isAutoRefreshEnabled: enabled,
        }),
      { initialProps: { enabled: true } },
    );

    rerender({ enabled: false });

    expect(controller.stop).not.toHaveBeenCalled();
  });

  it("別ページへの移動で自動更新が解除されても旧スレッドの実況を停止しない", () => {
    const controller = createController(THREAD_URL);
    const { rerender } = renderHook(
      ({ threadUrl, enabled }) =>
        useCommentOverlaySync({
          controller,
          threadUrl,
          responses: [],
          isActive: true,
          isAutoRefreshEnabled: enabled,
        }),
      { initialProps: { threadUrl: THREAD_URL, enabled: true } },
    );

    rerender({ threadUrl: "https://example.test/test/read.cgi/live/2/", enabled: false });

    expect(controller.stop).not.toHaveBeenCalled();
  });
});
