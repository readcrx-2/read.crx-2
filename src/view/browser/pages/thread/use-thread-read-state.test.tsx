import { act, cleanup, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { container } from "src/service-container/index";
import type {
  IBookmark,
  IReadState,
  IReadStateService,
  IRes,
  IUtil,
} from "src/service-container/interfaces";
import { useThreadReadState } from "src/view/browser/pages/thread/use-thread-read-state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const THREAD_URL = "https://bbs.eddibb.cc/test/read.cgi/liveedge/1742132339/";

function createResponse(num: number): IRes {
  return {
    num,
    name: `name-${num}`,
    mail: "",
    date: `2026/08/23(日) 12:00:${String(num).padStart(2, "0")}.000`,
    message: `message-${num}`,
  };
}

function createRect(top: number, bottom: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    bottom,
    left: 0,
    right: 100,
    width: 100,
    height: bottom - top,
    toJSON: () => ({}),
  } as DOMRect;
}

function createThreadRoot(): {
  host: HTMLDivElement;
  panel: HTMLDivElement;
  setResponseRects: (rects: Array<[number, number]>) => void;
} {
  const panel = document.createElement("div");
  panel.className = "content-area__tab-panel";
  panel.getBoundingClientRect = () => createRect(0, 100);
  Object.defineProperty(panel, "scrollTop", { configurable: true, value: 0, writable: true });
  panel.scrollTo = vi.fn() as typeof panel.scrollTo;

  const host = document.createElement("div");
  host.className = "thread-page";
  const responses = document.createElement("div");
  responses.className = "thread-page__responses";
  host.appendChild(responses);
  panel.appendChild(host);

  const setResponseRects = (rects: Array<[number, number]>) => {
    responses.replaceChildren(
      ...rects.map(([top, bottom], index) => {
        const article = document.createElement("article");
        article.dataset.resNum = String(index + 1);
        article.getBoundingClientRect = () => createRect(top, bottom);
        return article;
      }),
    );
  };

  return { host, panel, setResponseRects };
}

describe("useThreadReadState Phase 0 contracts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", ((callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(0), 0)) as typeof requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", ((id: number) =>
      window.clearTimeout(id)) as typeof cancelAnimationFrame);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("新着レス取得で表示位置が上へ移動しても既読番号を巻き戻さない", async () => {
    const readStateSet = vi.fn<IReadStateService["set"]>(async () => undefined);
    const initialReadState: IReadState = {
      url: THREAD_URL,
      last: 1,
      read: 2,
      received: 2,
      offset: 10,
    };
    const root = createThreadRoot();
    root.setResponseRects([
      [10, 40],
      [40, 70],
    ]);

    container.bookmark = {
      get: () => undefined,
    } as unknown as IBookmark;
    container.readState = {
      get: vi.fn(async () => initialReadState),
      getByBoard: vi.fn(async () => []),
      getAll: vi.fn(async () => []),
      set: readStateSet,
    } as IReadStateService;
    container.util = {
      isNewerReadState: () => false,
    } as unknown as IUtil;

    const { result, rerender } = renderHook(
      ({ responses }: { responses: IRes[] }) =>
        useThreadReadState({
          tabId: "thread-tab",
          threadUrl: THREAD_URL,
          isActive: true,
          responses,
          loading: false,
          rootRef: { current: root.host } as RefObject<HTMLDivElement | null>,
        }),
      { initialProps: { responses: [createResponse(1), createResponse(2)] } },
    );

    await act(async () => {
      await Promise.resolve();
      await vi.runAllTimersAsync();
      await Promise.resolve();
      await vi.runAllTimersAsync();
    });
    expect(result.current.isInitialReadStateResolved).toBe(true);
    expect(readStateSet).not.toHaveBeenCalled();

    // 変更理由: pollingでレスが増えた際にviewportが上へ戻るケースでも、
    // 既に保存したread値をMath.maxで維持する契約をfixtureで固定する。
    root.setResponseRects([
      [10, 40],
      [140, 170],
      [180, 210],
    ]);
    rerender({ responses: [createResponse(1), createResponse(2), createResponse(3)] });

    await act(async () => {
      await vi.runAllTimersAsync();
      await Promise.resolve();
    });

    expect(readStateSet).toHaveBeenCalled();
    expect(readStateSet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: THREAD_URL,
        last: 1,
        read: 2,
        received: 3,
      }),
    );
  });
});
