import { fetchHttpsFirst } from "packages/chlib/src/fetcher/https-first";
import { createLogger } from "src/app/logger";
import { decodeBase64ArrayBuffer } from "src/app/platform/binary";
import { QueuedHttpClient } from "src/app/platform/QueuedHttpClient";
import type { HttpClient, HttpRequestOptions, HttpResponse } from "src/app/platform/types";

import { isSharedHttpRequestMessage, type SharedHttpResponseMessage } from "./shared-http-protocol";

const logger = createLogger("platform");

const transport: HttpClient = {
  async fetch(url, options = {}): Promise<HttpResponse> {
    return fetchHttpsFirst(
      url,
      options.method,
      async (requestUrl) => {
        const controller = new AbortController();
        const timeout = options.timeout
          ? setTimeout(() => controller.abort(), options.timeout)
          : undefined;
        try {
          const response = await fetch(requestUrl, {
            method: options.method ?? "GET",
            headers: options.headers,
            body:
              typeof options.body === "string"
                ? options.body
                : options.body == null
                  ? undefined
                  : options.body,
            signal: controller.signal,
          });
          const bytes = await response.arrayBuffer();
          const mimeCharset = /charset=([^;\s]+)/i.exec(options.mimeType ?? "")?.[1];
          const charset =
            mimeCharset?.toLowerCase() === "x-sjis" ? "Shift_JIS" : (mimeCharset ?? "utf-8");
          let body: string;
          try {
            body = new TextDecoder(charset).decode(bytes);
          } catch (error) {
            logger.error("バックグラウンドHTTP応答のデコードに失敗しました:", error);
            body = new TextDecoder().decode(bytes);
          }
          return {
            status: response.status,
            headers: Object.fromEntries(
              [...response.headers.entries()].map(([name, value]) => [
                name === "etag" ? "ETag" : name === "last-modified" ? "Last-Modified" : name,
                value,
              ]),
            ),
            body,
            url: response.url || requestUrl,
          };
        } finally {
          if (timeout) clearTimeout(timeout);
        }
      },
      options.headers,
      options.httpsMode,
    );
  },
  async setupWriteHeaders() {},
};

const queuedTransport = new QueuedHttpClient(transport);

/** 全拡張機能ウィンドウで共有するHTTP要求ハンドラー。 */
export async function handleSharedHttpRequest(
  message: unknown,
): Promise<SharedHttpResponseMessage | undefined> {
  if (!isSharedHttpRequestMessage(message)) return undefined;

  try {
    const serializedOptions = message.options;
    const options: HttpRequestOptions | undefined = serializedOptions
      ? {
          method: serializedOptions.method,
          headers: serializedOptions.headers,
          timeout: serializedOptions.timeout,
          mimeType: serializedOptions.mimeType,
          httpsMode: serializedOptions.httpsMode,
          body:
            serializedOptions.bodyBase64 !== undefined
              ? decodeBase64ArrayBuffer(serializedOptions.bodyBase64)
              : serializedOptions.body,
        }
      : undefined;
    const response = await queuedTransport.fetch(message.url, options);
    return { ok: true, response };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
