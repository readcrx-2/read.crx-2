import { createLogger } from "src/app/logger";
import type { HttpResponse } from "src/app/platform/types";

const logger = createLogger("platform");

interface TauriWriteTransportRequest {
  action: string;
  bootstrapUrl?: string;
  referer: string;
  userAgent: string | null | undefined;
  excludedCookies?: readonly string[];
  body: ArrayBuffer;
  charset: string;
}

interface TauriWriteTransportResponse {
  status: number;
  url: string;
  contentType: string | null;
  body: number[];
}

function extractResponseCharset(contentType: string | null): string | null {
  const match = contentType?.match(/charset\s*=\s*"?([^";\s]+)"?/i);
  const charset = match?.[1];
  // x-sjisは掲示板が返す古い表記だが、TextDecoderではShift_JISとして扱える。
  return charset?.toLowerCase() === "x-sjis" ? "Shift_JIS" : (charset ?? null);
}

function decodeResponseBody(bytes: number[], charset: string, fallbackCharset: string): string {
  try {
    return new TextDecoder(charset).decode(new Uint8Array(bytes));
  } catch (error) {
    logger.error(`Tauri版の書き込み応答を${charset}としてデコードできませんでした:`, error);
    try {
      return new TextDecoder(fallbackCharset).decode(new Uint8Array(bytes));
    } catch (fallbackError) {
      logger.error(
        `Tauri版の書き込み応答を${fallbackCharset}としてもデコードできませんでした:`,
        fallbackError,
      );
      return new TextDecoder().decode(new Uint8Array(bytes));
    }
  }
}

export async function fetchTauriWrite(request: TauriWriteTransportRequest): Promise<HttpResponse> {
  // 変更理由: Tauri WebViewのJavaScript Headersは日本語を含む値で例外になるため、
  // 書き込みだけはRust側のHTTPクライアントへ渡し、拡張機能版のiframe送信経路と分離する。
  const { invoke } = await import("@tauri-apps/api/core");
  const response = await invoke<TauriWriteTransportResponse>("write_request", {
    request: {
      action: request.action,
      bootstrapUrl: request.bootstrapUrl,
      referer: request.referer,
      userAgent: request.userAgent,
      excludedCookies: request.excludedCookies,
      body: Array.from(new Uint8Array(request.body)),
    },
  });

  return {
    status: response.status,
    url: response.url,
    headers: response.contentType ? { "content-type": response.contentType } : {},
    // サーバーが結果ページの文字コードを明示していれば、フォームの送信文字コードより優先する。
    body: decodeResponseBody(
      response.body,
      extractResponseCharset(response.contentType) ?? request.charset,
      request.charset,
    ),
  };
}
