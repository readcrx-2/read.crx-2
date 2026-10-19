import { encodeBase64 } from "src/app/platform/binary";
import type { HttpRequestOptions, HttpResponse } from "src/app/platform/types";

export const SHARED_HTTP_MESSAGE_TYPE = "shared-http-request";

export interface SharedHttpRequestMessage {
  type: typeof SHARED_HTTP_MESSAGE_TYPE;
  url: string;
  options?: Omit<HttpRequestOptions, "body"> & { body?: string; bodyBase64?: string };
}

export type SharedHttpResponseMessage =
  | { ok: true; response: HttpResponse }
  | { ok: false; error: string };

export function serializeSharedHttpRequest(
  url: string,
  options?: HttpRequestOptions,
): SharedHttpRequestMessage {
  return {
    type: SHARED_HTTP_MESSAGE_TYPE,
    url,
    options: options
      ? {
          method: options.method,
          headers: options.headers,
          timeout: options.timeout,
          mimeType: options.mimeType,
          httpsMode: options.httpsMode,
          ...(typeof options.body === "string"
            ? { body: options.body }
            : options.body instanceof ArrayBuffer
              ? { bodyBase64: encodeBase64(new Uint8Array(options.body)) }
              : {}),
        }
      : undefined,
  };
}

export function isSharedHttpRequestMessage(value: unknown): value is SharedHttpRequestMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === SHARED_HTTP_MESSAGE_TYPE &&
    "url" in value &&
    typeof value.url === "string"
  );
}
