// @vitest-environment node
import fc from "fast-check";
import { QueuedHttpClient } from "src/app/platform/QueuedHttpClient";
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

          const results = await Promise.all(
            Array.from({ length: requestCount }, (_, index) =>
              queuedClient.fetch(`https://example.com/${index}`),
            ),
          );

          expect(maximumActiveCount).toBeLessThanOrEqual(concurrency);
          expect(results).toHaveLength(requestCount);
          expect(results.map(({ url }) => url)).toEqual(
            Array.from({ length: requestCount }, (_, index) => `https://example.com/${index}`),
          );
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
