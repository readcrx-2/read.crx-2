// @vitest-environment node
import fc from "fast-check";
import { MAX_QUEUED_HTTP_REQUESTS, QueuedHttpClient } from "src/app/platform/QueuedHttpClient";
import type { HttpClient, HttpResponse } from "src/app/platform/types";
import { describe, expect, it, vi } from "vite-plus/test";

function createClient(fetch: HttpClient["fetch"]): HttpClient {
  return {
    fetch,
    setupWriteHeaders: vi.fn(async () => {}),
  };
}

const response: HttpResponse = {
  status: 200,
  headers: {},
  body: "ok",
  url: "https://example.com/",
};

describe("QueuedHttpClient", () => {
  it("fast-checkで要求数と同時実行上限を変えても上限を守る", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 60 }),
        fc.integer({ min: 1, max: 10 }),
        async (requestCount, concurrency) => {
          let activeCount = 0;
          let maximumActiveCount = 0;
          const client = createClient(async (url) => {
            activeCount += 1;
            maximumActiveCount = Math.max(maximumActiveCount, activeCount);
            await Promise.resolve();
            activeCount -= 1;
            return { ...response, url };
          });
          const queuedClient = new QueuedHttpClient(client, concurrency);

          const results = await Promise.allSettled(
            Array.from({ length: requestCount }, (_, index) =>
              queuedClient.fetch(`https://example.com/${index}`),
            ),
          );

          expect(maximumActiveCount).toBeLessThanOrEqual(concurrency);
          const acceptedCount = Math.min(requestCount, concurrency + MAX_QUEUED_HTTP_REQUESTS);
          const acceptedResults = results.filter(
            (result): result is PromiseFulfilledResult<HttpResponse> =>
              result.status === "fulfilled",
          );
          const rejectedResults = results.filter(
            (result): result is PromiseRejectedResult => result.status === "rejected",
          );
          expect(acceptedResults.map(({ value }) => value.url)).toEqual(
            Array.from({ length: acceptedCount }, (_, index) => `https://example.com/${index}`),
          );
          expect(rejectedResults).toHaveLength(requestCount - acceptedCount);
          expect(
            rejectedResults.every(
              ({ reason }) =>
                reason instanceof Error && reason.message === "HTTP待ち行列が上限に達しました",
            ),
          ).toBe(true);
        },
      ),
    );
  });

  it("失敗した通信の後もキューを進める", async () => {
    const fetch = vi
      .fn<HttpClient["fetch"]>()
      .mockRejectedValueOnce(new Error("通信失敗"))
      .mockResolvedValueOnce(response);
    const queuedClient = new QueuedHttpClient(createClient(fetch), 1);

    const failed = queuedClient.fetch("https://example.com/failed");
    const succeeded = queuedClient.fetch("https://example.com/succeeded");

    await expect(failed).rejects.toThrow("通信失敗");
    await expect(succeeded).resolves.toEqual(response);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("通信例外の後は同じホストへの次の要求を待たせる", async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi
        .fn<HttpClient["fetch"]>()
        .mockRejectedValueOnce(new Error("通信失敗"))
        .mockResolvedValueOnce(response);
      const queuedClient = new QueuedHttpClient(createClient(fetch), 1);

      await expect(queuedClient.fetch("https://example.com/failed")).rejects.toThrow("通信失敗");
      const nextRequest = queuedClient.fetch("https://example.com/retry");
      await vi.advanceTimersByTimeAsync(FAILURE_WAIT_MS - 1);
      expect(fetch).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(1);
      await expect(nextRequest).resolves.toEqual(response);
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("429応答ではRetry-Afterの秒数だけ同じホストを待たせる", async () => {
    vi.useFakeTimers();
    try {
      const limitedResponse = { ...response, status: 429, headers: { "Retry-After": "3" } };
      const fetch = vi
        .fn<HttpClient["fetch"]>()
        .mockResolvedValueOnce(limitedResponse)
        .mockResolvedValueOnce(response);
      const queuedClient = new QueuedHttpClient(createClient(fetch), 1);

      await expect(queuedClient.fetch("https://example.com/limited")).resolves.toEqual(
        limitedResponse,
      );
      const nextRequest = queuedClient.fetch("https://example.com/after-limit");
      await vi.advanceTimersByTimeAsync(2_999);
      expect(fetch).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(1);
      await expect(nextRequest).resolves.toEqual(response);
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("待ち行列が上限に達したら超過分を拒否する", async () => {
    const resolvers: Array<(value: HttpResponse) => void> = [];
    const fetch = vi.fn<HttpClient["fetch"]>(
      () => new Promise((resolve) => resolvers.push(resolve)),
    );
    const queuedClient = new QueuedHttpClient(createClient(fetch), 1, 1);

    const first = queuedClient.fetch("https://example.com/first");
    const second = queuedClient.fetch("https://example.com/second");
    await expect(queuedClient.fetch("https://example.com/third")).rejects.toThrow(
      "HTTP待ち行列が上限に達しました",
    );
    expect(fetch).toHaveBeenCalledOnce();

    resolvers[0]?.(response);
    await expect(first).resolves.toEqual(response);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    resolvers[1]?.(response);
    await expect(second).resolves.toEqual(response);
    expect(MAX_QUEUED_HTTP_REQUESTS).toBe(10);
  });

  it("HTTPクライアントが対応する場合はバイナリ通信も同じ上限を使う", async () => {
    let resolveText: ((value: HttpResponse) => void) | undefined;
    const fetch = vi.fn(() => new Promise<HttpResponse>((resolve) => (resolveText = resolve)));
    const fetchBinary = vi.fn(async () => ({ ...response, body: new ArrayBuffer(0) }));
    const queuedClient = new QueuedHttpClient({ ...createClient(fetch), fetchBinary }, 1);

    const textRequest = queuedClient.fetch("https://example.com/text");
    const binaryRequest = queuedClient.fetchBinary?.("https://example.com/image");
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetchBinary).not.toHaveBeenCalled();

    resolveText?.(response);
    await Promise.all([textRequest, binaryRequest]);
    expect(fetchBinary).toHaveBeenCalledOnce();
  });
});

const FAILURE_WAIT_MS = 500;
