import { cleanup, renderHook } from "@testing-library/react";
import type { IRes } from "src/service-container/interfaces";
import { useThreadStatusSync } from "src/view/browser/pages/thread/use-thread-status-sync";
import { afterEach, describe, expect, it } from "vite-plus/test";

const createRes = (num: number, overrides: Partial<IRes> = {}): IRes => ({
  num,
  name: "名無しさん",
  mail: "",
  date: "2026/09/30 12:00:00",
  message: `レス${num}`,
  ...overrides,
});

describe("useThreadStatusSync", () => {
  afterEach(() => {
    cleanup();
  });

  it("NG判定されたレス番号だけを返す", () => {
    const responses = [createRes(1), createRes(2, { class: ["ng"] }), createRes(3)];

    const { result } = renderHook(() =>
      useThreadStatusSync({
        tabId: "tab-1",
        threadUrl: "https://example.com/test/read.cgi/board/123/",
        loading: false,
        responses,
        ownResNums: new Set(),
        replyToOwnResNums: new Set(),
      }),
    );

    expect([...result.current.ngResNums]).toEqual([2]);
  });

  it("レスがなければNG番号は空になる", () => {
    const { result } = renderHook(() =>
      useThreadStatusSync({
        tabId: "tab-1",
        threadUrl: "https://example.com/test/read.cgi/board/123/",
        loading: true,
        responses: [],
        ownResNums: new Set(),
        replyToOwnResNums: new Set(),
      }),
    );

    expect(result.current.ngResNums.size).toBe(0);
  });
});
