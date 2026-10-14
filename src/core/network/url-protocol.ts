import { ChURL } from "packages/chlib/src/index";

// URL のプロトコル判定だけを、他の core モジュールに依存しない葉のモジュールとして置く。
// URL.ts は短縮URLの展開のために storage/Cache を import しており、Cache が URL.ts から
// isHttps を import すると URL ↔ Cache の循環になるため（Phase E）。

export function getProtocol(urlStr: string): string {
  return new ChURL(urlStr).protocol;
}

export function isHttps(urlStr: string): boolean {
  return getProtocol(urlStr) === "https:";
}
