import { invoke } from "@tauri-apps/api/core";
import { decodeBase64, decodeBase64ArrayBuffer, encodeBase64 } from "src/app/platform/binary";
import type {
  BinaryHttpResponse,
  HttpClient,
  HttpRequestOptions,
  HttpResponse,
} from "src/app/platform/types";

interface SharedHttpResponse {
  status: number;
  headers: Record<string, string>;
  bodyBase64: string;
  url: string;
}

function extractCharset(mimeType: string | undefined): string | null {
  const charset = /charset=([^\s;]+)/i.exec(mimeType ?? "")?.[1];
  return charset?.toLowerCase() === "x-sjis" ? "Shift_JIS" : (charset ?? null);
}

function decodeText(bytes: Uint8Array, mimeType: string | undefined): string {
  try {
    return new TextDecoder(extractCharset(mimeType) ?? "utf-8").decode(bytes);
  } catch (error) {
    console.error("Tauri共有HTTP応答のデコードに失敗しました:", error);
    return new TextDecoder().decode(bytes);
  }
}

async function request(url: string, options: HttpRequestOptions = {}): Promise<SharedHttpResponse> {
  return invoke<SharedHttpResponse>("shared_http_request", {
    request: {
      url,
      method: options.method,
      headers: options.headers,
      body: typeof options.body === "string" ? options.body : undefined,
      bodyBase64:
        options.body instanceof ArrayBuffer
          ? encodeBase64(new Uint8Array(options.body))
          : undefined,
      timeout: options.timeout,
      mimeType: options.mimeType,
    },
  });
}

export async function fetchTauriBinary(
  url: string,
  options: HttpRequestOptions = {},
): Promise<BinaryHttpResponse> {
  const response = await request(url, options);
  return {
    ...response,
    body: decodeBase64ArrayBuffer(response.bodyBase64),
  };
}

export const TauriHttpClient: HttpClient = {
  async fetch(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    const safeOptions = {
      ...options,
      ...(options.headers
        ? {
            headers: Object.fromEntries(
              Object.entries(options.headers).map(([key, value]) => [
                key,
                key.toLowerCase() === "authorization" || key.toLowerCase() === "cookie"
                  ? "[redacted]"
                  : value,
              ]),
            ),
          }
        : {}),
      ...(options.body != null ? { body: "[redacted]" } : {}),
    };
    console.log("[TauriHttpClient] Fetching: " + url, safeOptions);
    const response = await request(url, options);
    console.log("[TauriHttpClient] Response status: " + response.status);

    return {
      status: response.status,
      headers: response.headers,
      body: decodeText(decodeBase64(response.bodyBase64), options.mimeType),
      url: response.url,
    };
  },

  fetchBinary: fetchTauriBinary,

  async setupWriteHeaders(_formAction: string): Promise<void> {
    // Tauri版の書き込みは専用のRust transportがヘッダーを生成するため、
    // 通常のHTTPクライアントへ書き込み用の状態を持ち込まない。
  },
};
