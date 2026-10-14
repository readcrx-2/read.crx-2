import { act, cleanup, renderHook } from "@testing-library/react";
import type { IRes } from "src/service-container/interfaces";
import { useOwnResTracking } from "src/view/browser/pages/thread/use-own-res-tracking";
import {
  notifyThreadWriteCompleted,
  notifyThreadWriteStarted,
} from "src/view/browser/utils/thread-write-sync";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { addHistory, updateHistory } = vi.hoisted(() => ({
  addHistory: vi.fn(),
  updateHistory: vi.fn(),
}));
vi.mock("src/service-container/index", () => ({
  container: {
    config: { get: () => "" },
    // core/history/WriteHistory はサービスコンテナの writeHistory から使う。
    writeHistory: { getByUrl: async () => [], add: addHistory, update: updateHistory },
  },
}));

const threadUrl = "https://example.com/test/read.cgi/board/123/";
const firstResponse: IRes = {
  num: 1,
  name: "名無しさん",
  mail: "",
  date: "2026/09/30 12:00:00",
  message: "既存レス",
};
const postedResponse: IRes = { ...firstResponse, num: 2, message: "投稿した本文" };

describe("投稿直後の自分レス表示", () => {
  beforeEach(() => {
    // 変更理由: DBが遅くても表示の確定を妨げないことを確認するため、保存を保留する。
    addHistory.mockReset().mockImplementation(() => new Promise(() => {}));
    updateHistory.mockReset();
  });
  afterEach(cleanup);

  it.each([false, true])(
    "自動更新の先着有無にかかわらず保存を待たず自分レスを表示する（先着: %s）",
    async (responseArrivesFirst) => {
      const { result, rerender } = renderHook(
        ({ responses }) =>
          useOwnResTracking({
            threadUrl,
            threadTitle: "テストスレ",
            responses,
          }),
        { initialProps: { responses: [firstResponse] } },
      );
      await act(async () => {});
      act(() => notifyThreadWriteStarted({ threadUrl, submittedAt: 123 }));
      if (responseArrivesFirst) {
        rerender({ responses: [firstResponse, postedResponse] });
        expect(result.current.ownResNums.has(2)).toBe(false);
      }
      act(() =>
        notifyThreadWriteCompleted({
          threadUrl,
          submittedAt: 123,
          message: postedResponse.message,
          inputName: "",
          inputMail: "",
        }),
      );
      if (!responseArrivesFirst) rerender({ responses: [firstResponse, postedResponse] });
      expect(result.current.ownResNums.has(2)).toBe(true);
      expect(addHistory).toHaveBeenCalledTimes(1);
      expect(updateHistory).not.toHaveBeenCalled();
    },
  );
});
