// @vitest-environment node
import fc from "fast-check";
import {
  MAX_CONCURRENT_HTTP_REQUESTS,
  MAX_QUEUED_HTTP_REQUESTS,
  QueuedHttpClient,
} from "src/app/platform/QueuedHttpClient";
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

  it("一度に1000件呼ばれても同時実行数と待ち行列の上限を守る", async () => {
    let activeCount = 0;
    let maximumActiveCount = 0;
    const fetch = vi.fn<HttpClient["fetch"]>(async (url) => {
      activeCount += 1;
      maximumActiveCount = Math.max(maximumActiveCount, activeCount);
      await Promise.resolve();
      activeCount -= 1;
      return { ...response, url };
    });
    const queuedClient = new QueuedHttpClient(createClient(fetch));

    const results = await Promise.allSettled(
      Array.from({ length: 1_000 }, (_, index) =>
        queuedClient.fetch(`https://example.com/${index}`),
      ),
    );

    expect(maximumActiveCount).toBeLessThanOrEqual(MAX_CONCURRENT_HTTP_REQUESTS);
    expect(fetch).toHaveBeenCalledTimes(MAX_CONCURRENT_HTTP_REQUESTS + MAX_QUEUED_HTTP_REQUESTS);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      MAX_CONCURRENT_HTTP_REQUESTS + MAX_QUEUED_HTTP_REQUESTS,
    );
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
      1_000 - MAX_CONCURRENT_HTTP_REQUESTS - MAX_QUEUED_HTTP_REQUESTS,
    );
  });

  it("継続的な大量投入でも上限を保ち、処理可能な要求を順に完了する", async () => {
    let activeCount = 0;
    let maximumActiveCount = 0;
    const fetch = vi.fn<HttpClient["fetch"]>(async (url) => {
      activeCount += 1;
      maximumActiveCount = Math.max(maximumActiveCount, activeCount);
      await Promise.resolve();
      activeCount -= 1;
      return { ...response, url };
    });
    const queuedClient = new QueuedHttpClient(createClient(fetch));
    let acceptedCount = 0;
    let rejectedCount = 0;
    const batchCount = 20;
    const requestsPerBatch = 500;

    // 無限入力そのものはテストを終了できないため、連続20バッチ（計1万件）で
    // 過負荷時の即時拒否と、次のバッチへ進めることを確認する。
    for (let batch = 0; batch < batchCount; batch += 1) {
      const results = await Promise.allSettled(
        Array.from({ length: requestsPerBatch }, (_, index) =>
          queuedClient.fetch(`https://example.com/${batch}/${index}`),
        ),
      );
      acceptedCount += results.filter(({ status }) => status === "fulfilled").length;
      rejectedCount += results.filter(({ status }) => status === "rejected").length;
    }

    expect(acceptedCount + rejectedCount).toBe(batchCount * requestsPerBatch);
    expect(acceptedCount).toBe(
      batchCount * (MAX_CONCURRENT_HTTP_REQUESTS + MAX_QUEUED_HTTP_REQUESTS),
    );
    expect(rejectedCount).toBe(
      batchCount * (requestsPerBatch - MAX_CONCURRENT_HTTP_REQUESTS - MAX_QUEUED_HTTP_REQUESTS),
    );
    expect(maximumActiveCount).toBeLessThanOrEqual(MAX_CONCURRENT_HTTP_REQUESTS);
    expect(fetch).toHaveBeenCalledTimes(acceptedCount);
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

  it("既定値を適用し、バイナリ非対応とヘッダー設定をそのまま扱う", async () => {
    const setupWriteHeaders = vi.fn(async () => {});
    const queuedClient = new QueuedHttpClient({
      ...createClient(vi.fn(async () => response)),
      setupWriteHeaders,
    });

    expect(queuedClient.fetchBinary).toBeUndefined();
    await queuedClient.fetch("https://example.com/");
    await queuedClient.setupWriteHeaders("https://example.com/write");
    expect(setupWriteHeaders).toHaveBeenCalledWith("https://example.com/write");
    expect(() => new QueuedHttpClient(createClient(vi.fn()), 0)).toThrow(RangeError);
    expect(() => new QueuedHttpClient(createClient(vi.fn()), 1, -1)).toThrow(RangeError);
  });

  it.each([408, 500])("HTTP %i 応答後に同じホストへの要求を遅らせる", async (status) => {
    vi.useFakeTimers();
    try {
      const fetch = vi
        .fn<HttpClient["fetch"]>()
        .mockResolvedValueOnce({ ...response, status })
        .mockResolvedValueOnce(response);
      const queuedClient = new QueuedHttpClient(createClient(fetch), 1);

      await queuedClient.fetch("https://example.com/failed");
      const nextRequest = queuedClient.fetch("https://example.com/retry");
      await vi.advanceTimersByTimeAsync(FAILURE_WAIT_MS - 1);
      expect(fetch).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);
      await expect(nextRequest).resolves.toEqual(response);
    } finally {
      vi.useRealTimers();
    }
  });

  it("Retry-Afterの日付形式も使い、別ホストの要求は止めない", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T00:00:00.000Z"));
    try {
      const limitedResponse = {
        ...response,
        status: 429,
        headers: { "retry-after": "Wed, 14 Oct 2026 00:00:02 GMT" },
      };
      const fetch = vi
        .fn<HttpClient["fetch"]>()
        .mockResolvedValueOnce(limitedResponse)
        .mockResolvedValueOnce({ ...response, url: "https://other.example/" })
        .mockResolvedValueOnce(response);
      const queuedClient = new QueuedHttpClient(createClient(fetch), 1);

      await queuedClient.fetch("https://example.com/limited");
      const sameHostRequest = queuedClient.fetch("https://example.com/later");
      const otherHostRequest = queuedClient.fetch("https://other.example/now");
      await expect(otherHostRequest).resolves.toMatchObject({ url: "https://other.example/" });
      expect(fetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(2_000);
      await expect(sameHostRequest).resolves.toEqual(response);
      expect(fetch).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("不正なRetry-Afterは通常の失敗待機へフォールバックする", async () => {
    vi.useFakeTimers();
    try {
      const limitedResponse = { ...response, status: 429, headers: { "Retry-After": "later" } };
      const fetch = vi
        .fn<HttpClient["fetch"]>()
        .mockResolvedValueOnce(limitedResponse)
        .mockResolvedValueOnce(response);
      const queuedClient = new QueuedHttpClient(createClient(fetch), 1);

      await queuedClient.fetch("https://example.com/limited");
      const nextRequest = queuedClient.fetch("https://example.com/later");
      await vi.advanceTimersByTimeAsync(FAILURE_WAIT_MS - 1);
      expect(fetch).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);
      await expect(nextRequest).resolves.toEqual(response);
    } finally {
      vi.useRealTimers();
    }
  });

  it("不正なURLで失敗した場合はホスト待機を設定しない", async () => {
    const fetch = vi
      .fn<HttpClient["fetch"]>()
      .mockRejectedValueOnce(new Error("通信失敗"))
      .mockResolvedValueOnce(response);
    const queuedClient = new QueuedHttpClient(createClient(fetch), 1);

    await expect(queuedClient.fetch("/relative")).rejects.toThrow("通信失敗");
    await expect(queuedClient.fetch("/relative")).resolves.toEqual(response);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("冷却中に待ち行列が満杯なら同じホストの追加要求を拒否する", async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi
        .fn<HttpClient["fetch"]>()
        .mockResolvedValueOnce({ ...response, status: 429, headers: { "Retry-After": "5" } })
        .mockResolvedValue(response);
      const queuedClient = new QueuedHttpClient(createClient(fetch), 1, 1);
      await queuedClient.fetch("https://example.com/limited");
      await Promise.resolve();

      const waiting = queuedClient.fetch("https://example.com/waiting");
      await expect(queuedClient.fetch("https://example.com/overflow")).rejects.toThrow(
        "HTTP待ち行列が上限に達しました",
      );
      expect(fetch).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(5_000);
      await expect(waiting).resolves.toEqual(response);
    } finally {
      vi.useRealTimers();
    }
  });

  it("進行中の別通信が429を返したら短い待機期限へタイマーを調整する", async () => {
    vi.useFakeTimers();
    const bResolvers: Array<(value: HttpResponse) => void> = [];
    try {
      const fetch = vi.fn<HttpClient["fetch"]>((url) => {
        if (url.endsWith("/limited-a")) {
          return Promise.resolve({ ...response, status: 429, headers: { "Retry-After": "3" } });
        }
        if (url.endsWith("/limited-b")) {
          return new Promise((resolve) => bResolvers.push(resolve));
        }
        return Promise.resolve(response);
      });
      const queuedClient = new QueuedHttpClient(createClient(fetch), 2);

      await queuedClient.fetch("https://a.example/limited-a");
      await Promise.resolve();
      const requestB = queuedClient.fetch("https://b.example/limited-b");
      const waitingA = queuedClient.fetch("https://a.example/waiting-a");
      const requestB429 = queuedClient.fetch("https://b.example/limited-b");
      const waitingB = queuedClient.fetch("https://b.example/waiting-b");
      expect(fetch).toHaveBeenCalledTimes(3);

      bResolvers[1]?.({
        ...response,
        status: 429,
        headers: { "Retry-After": "1" },
      });
      await expect(requestB429).resolves.toMatchObject({ status: 429 });
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(waitingB).resolves.toEqual(response);

      bResolvers[0]?.(response);
      await expect(requestB).resolves.toEqual(response);
      await vi.advanceTimersByTimeAsync(2_000);
      await expect(waitingA).resolves.toEqual(response);
    } finally {
      vi.useRealTimers();
    }
  });

  it("429でRetry-Afterヘッダーがない場合は通常の待機時間を使う", async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi
        .fn<HttpClient["fetch"]>()
        .mockResolvedValueOnce({ ...response, status: 429 })
        .mockResolvedValueOnce(response);
      const queuedClient = new QueuedHttpClient(createClient(fetch), 1);

      await queuedClient.fetch("https://example.com/limited");
      const nextRequest = queuedClient.fetch("https://example.com/later");
      await vi.advanceTimersByTimeAsync(FAILURE_WAIT_MS);
      await expect(nextRequest).resolves.toEqual(response);
    } finally {
      vi.useRealTimers();
    }
  });

  it("429と同時進行だった成功応答では有効な冷却期限を解除しない", async () => {
    vi.useFakeTimers();
    let resolveSuccess: ((value: HttpResponse) => void) | undefined;
    try {
      const fetch = vi.fn<HttpClient["fetch"]>((url) =>
        url.endsWith("/limited")
          ? Promise.resolve({ ...response, status: 429, headers: { "Retry-After": "3" } })
          : url.endsWith("/started-before-429")
            ? new Promise((resolve) => (resolveSuccess = resolve))
            : Promise.resolve(response),
      );
      const queuedClient = new QueuedHttpClient(createClient(fetch), 2);

      const limited = queuedClient.fetch("https://example.com/limited");
      const inFlightSuccess = queuedClient.fetch("https://example.com/started-before-429");
      await limited;
      expect(fetch).toHaveBeenCalledTimes(2);
      const queued = queuedClient.fetch("https://example.com/waiting");
      resolveSuccess?.(response);
      await expect(inFlightSuccess).resolves.toEqual(response);
      await vi.advanceTimersByTimeAsync(2_999);
      expect(fetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      await expect(queued).resolves.toEqual(response);
    } finally {
      vi.useRealTimers();
    }
  });
});

const FAILURE_WAIT_MS = 500;
