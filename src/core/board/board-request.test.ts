// @vitest-environment node
import fc from "fast-check";
import { runBoardRequest } from "src/core/board/board-request";
import { describe, expect, it, vi } from "vite-plus/test";

describe("板取得リクエストの重複排除", () => {
  it("同じキーへの同時要求数によらず通信を1回にまとめる", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 30 }), async (requestCount) => {
        let resolveRequest: ((value: string) => void) | undefined;
        const request = vi.fn(() => new Promise<string>((resolve) => (resolveRequest = resolve)));
        const requests = Array.from({ length: requestCount }, () =>
          runBoardRequest("https://example.com/board/subject.txt", request),
        );

        expect(request).toHaveBeenCalledOnce();
        resolveRequest?.("subject data");
        await expect(Promise.all(requests)).resolves.toEqual(
          Array.from({ length: requestCount }, () => "subject data"),
        );
      }),
    );
  });

  it("別の板への要求は別々に実行し、失敗した要求は次回に再試行できる", async () => {
    const firstBoardRequest = vi.fn().mockResolvedValue("first");
    const secondBoardRequest = vi.fn().mockResolvedValue("second");

    await expect(
      Promise.all([
        runBoardRequest("https://example.com/first/subject.txt", firstBoardRequest),
        runBoardRequest("https://example.com/second/subject.txt", secondBoardRequest),
      ]),
    ).resolves.toEqual(["first", "second"]);
    expect(firstBoardRequest).toHaveBeenCalledOnce();
    expect(secondBoardRequest).toHaveBeenCalledOnce();

    const failedRequest = vi.fn().mockRejectedValueOnce(new Error("通信失敗"));
    await expect(
      runBoardRequest("https://example.com/retry/subject.txt", failedRequest),
    ).rejects.toThrow("通信失敗");
    await expect(
      runBoardRequest("https://example.com/retry/subject.txt", () => Promise.resolve("retry")),
    ).resolves.toBe("retry");
  });
});
