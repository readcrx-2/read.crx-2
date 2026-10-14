import type {
  BinaryHttpResponse,
  HttpClient,
  HttpRequestOptions,
  HttpResponse,
} from "src/app/platform/types";

export const MAX_CONCURRENT_HTTP_REQUESTS = 3;
export const MAX_QUEUED_HTTP_REQUESTS = 10;

const FAILURE_BACKOFF_BASE_MS = 500;
const FAILURE_BACKOFF_MAX_MS = 30_000;
const MAX_RETRY_AFTER_MS = 2_147_000_000;

interface QueuedRequest {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  host: string | null;
}

/** プラットフォームをまたいで通信数を制限するHttpClientデコレーター。 */
export class QueuedHttpClient implements HttpClient {
  private readonly queue: QueuedRequest[] = [];
  private readonly hostFailureCounts = new Map<string, number>();
  private readonly hostCooldownUntil = new Map<string, number>();
  private activeCount = 0;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  private drainTimerAt = Number.POSITIVE_INFINITY;

  readonly fetchBinary?: (url: string, options?: HttpRequestOptions) => Promise<BinaryHttpResponse>;

  constructor(
    private readonly client: HttpClient,
    private readonly concurrency = MAX_CONCURRENT_HTTP_REQUESTS,
    private readonly maxQueued = MAX_QUEUED_HTTP_REQUESTS,
  ) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new RangeError("HTTP同時実行数は1以上の整数で指定してください");
    }
    if (!Number.isInteger(maxQueued) || maxQueued < 0) {
      throw new RangeError("HTTP待ち行列の上限は0以上の整数で指定してください");
    }
    if (client.fetchBinary) {
      const fetchBinary = client.fetchBinary;
      this.fetchBinary = (url, options) =>
        this.schedule(url, () => fetchBinary.call(client, url, options));
    }
  }

  fetch(url: string, options?: HttpRequestOptions): Promise<HttpResponse> {
    return this.schedule(url, () => this.client.fetch(url, options));
  }

  setupWriteHeaders(url: string): Promise<void> {
    return this.client.setupWriteHeaders(url);
  }

  private schedule<T>(url: string, run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const host = this.getHost(url);
      const isHostCoolingDown =
        host != null && (this.hostCooldownUntil.get(host) ?? 0) > Date.now();
      if (
        this.queue.length >= this.maxQueued &&
        (this.activeCount >= this.concurrency || isHostCoolingDown)
      ) {
        reject(new Error("HTTP待ち行列が上限に達しました"));
        return;
      }

      this.queue.push({
        run,
        resolve: (value) => resolve(value as T),
        reject,
        host,
      });
      this.drain();
    });
  }

  private getHost(url: string): string | null {
    try {
      return new URL(url).host.toLowerCase();
    } catch {
      return null;
    }
  }

  private drain(): void {
    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const now = Date.now();
      const nextIndex = this.queue.findIndex(
        ({ host }) => host == null || (this.hostCooldownUntil.get(host) ?? 0) <= now,
      );
      if (nextIndex < 0) {
        // nextIndex < 0ならキュー内は全件ホスト待機中なので、hostと期限は必ず存在する。
        const nextAllowedAt = Math.min(
          ...this.queue.map(({ host }) => this.hostCooldownUntil.get(host!)!),
        );
        this.scheduleDrain(nextAllowedAt);
        return;
      }

      const request = this.queue.splice(nextIndex, 1)[0]!;

      this.activeCount += 1;
      let result: Promise<unknown>;
      try {
        result = request.run();
      } catch (error: unknown) {
        result = Promise.reject(error);
      }
      void Promise.resolve(result)
        .then(
          (value) => {
            this.recordResponse(request.host, value);
            request.resolve(value);
          },
          (error: unknown) => {
            this.recordFailure(request.host, FAILURE_BACKOFF_BASE_MS);
            request.reject(error);
          },
        )
        .finally(() => {
          this.activeCount -= 1;
          this.drain();
        });
    }
  }

  private scheduleDrain(at: number): void {
    if (this.drainTimer && this.drainTimerAt <= at) return;
    if (this.drainTimer) clearTimeout(this.drainTimer);
    this.drainTimerAt = at;
    this.drainTimer = setTimeout(
      () => {
        this.drainTimer = null;
        this.drainTimerAt = Number.POSITIVE_INFINITY;
        this.drain();
      },
      Math.max(0, at - Date.now()),
    );
  }

  private recordResponse(host: string | null, value: unknown): void {
    if (!host || typeof value !== "object" || value == null || !("status" in value)) return;

    const response = value as { status: number; headers?: Record<string, string> };
    if (response.status === 429) {
      const retryAfter = this.getRetryAfterMs(response.headers ?? {});
      this.recordFailure(host, retryAfter ?? this.getNextFailureDelay(host));
      return;
    }
    if (response.status === 408 || response.status >= 500) {
      this.recordFailure(host, this.getNextFailureDelay(host));
      return;
    }

    this.hostFailureCounts.delete(host);
    if ((this.hostCooldownUntil.get(host) ?? 0) <= Date.now()) {
      this.hostCooldownUntil.delete(host);
    }
  }

  private recordFailure(host: string | null, delayMs: number): void {
    if (!host) return;
    this.hostFailureCounts.set(host, (this.hostFailureCounts.get(host) ?? 0) + 1);
    this.hostCooldownUntil.set(
      host,
      Math.max(this.hostCooldownUntil.get(host) ?? 0, Date.now() + delayMs),
    );
  }

  private getNextFailureDelay(host: string): number {
    const failureCount = this.hostFailureCounts.get(host) ?? 0;
    return Math.min(FAILURE_BACKOFF_BASE_MS * 2 ** failureCount, FAILURE_BACKOFF_MAX_MS);
  }

  private getRetryAfterMs(headers: Record<string, string>): number | null {
    const retryAfter = Object.entries(headers).find(
      ([name]) => name.toLowerCase() === "retry-after",
    )?.[1];
    if (!retryAfter) return null;

    if (/^\d+$/.test(retryAfter.trim())) {
      return Math.min(Number(retryAfter.trim()) * 1_000, MAX_RETRY_AFTER_MS);
    }
    const retryAt = Date.parse(retryAfter);
    return Number.isNaN(retryAt)
      ? null
      : Math.min(Math.max(0, retryAt - Date.now()), MAX_RETRY_AFTER_MS);
  }
}
