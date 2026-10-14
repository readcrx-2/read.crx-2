// Storybook でスレッドを読み込む補助。特定の機能に属さず .storybook の proxy に依存するため、ここに置く。
import {
  ChFetcher,
  createHttpResponseMetadata,
  type HttpClient,
  type HttpRequest,
  type HttpResponse,
  type ThreadData,
} from "@chlen/chlib";

import { CHLENS_STORYBOOK_THREAD_PROXY_PATH } from "./thread-proxy-path.ts";

export interface ChLensStorybookSource {
  loadThread(url: string): Promise<ThreadData>;
}

class StorybookProxyHttpClient implements HttpClient {
  async get(url: string, request: HttpRequest = {}): Promise<HttpResponse> {
    const proxyUrl = `${CHLENS_STORYBOOK_THREAD_PROXY_PATH}?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl, {
      headers: request.headers,
      signal: request.signal,
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const body = await response.arrayBuffer();
    return {
      status: response.status,
      headers,
      body,
      metadata: createHttpResponseMetadata(headers, body),
    };
  }
}

/**
 * StorybookではブラウザのCORS制約を避けるため、ChFetcherだけを中継対応clientへ差し替える。
 * 旧Liveアプリのsource境界を参照するとアプリ削除後も依存が残るため、Storybookが必要とする
 * スレッド取得だけをこのファイルで定義し、URL正規化・文字コード変換・解析はChFetcherへ委譲する。
 */
export function createChLensStorybookSource(): ChLensStorybookSource {
  const fetcher = new ChFetcher(new StorybookProxyHttpClient());
  return {
    loadThread: (url) => fetcher.fetchThread(url),
  };
}
