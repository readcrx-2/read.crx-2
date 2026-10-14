import type {
  BinaryHttpResponse,
  HttpClient,
  HttpRequestOptions,
  HttpResponse,
} from "src/app/platform/types";

export const MAX_CONCURRENT_HTTP_REQUESTS = 8;

interface QueuedRequest {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

/** プラットフォームをまたいで通信数を制限するHttpClientデコレーター。 */
export class QueuedHttpClient implements HttpClient {
  private readonly queue: QueuedRequest[] = [];
  private activeCount = 0;

  readonly fetchBinary?: (url: string, options?: HttpRequestOptions) => Promise<BinaryHttpResponse>;

  constructor(
    private readonly client: HttpClient,
    private readonly concurrency = MAX_CONCURRENT_HTTP_REQUESTS,
  ) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new RangeError("HTTP同時実行数は1以上の整数で指定してください");
    }
    if (client.fetchBinary) {
      const fetchBinary = client.fetchBinary;
      this.fetchBinary = (url, options) =>
        this.schedule(() => fetchBinary.call(client, url, options));
    }
  }

  fetch(url: string, options?: HttpRequestOptions): Promise<HttpResponse> {
    return this.schedule(() => this.client.fetch(url, options));
  }

  setupWriteHeaders(url: string): Promise<void> {
    return this.client.setupWriteHeaders(url);
  }

  private schedule<T>(run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        run,
        resolve: (value) => resolve(value as T),
        reject,
      });
      this.drain();
    });
  }

  private drain(): void {
    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const request = this.queue.shift();
      if (!request) return;

      this.activeCount += 1;
      void request
        .run()
        .then(request.resolve, request.reject)
        .finally(() => {
          this.activeCount -= 1;
          this.drain();
        });
    }
  }
}
