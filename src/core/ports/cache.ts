export interface ICacheItem {
  get(): Promise<unknown>;
  // 既存実装では、事前に data/lastUpdated を設定済みなら put() を引数なしで呼べる。
  // 呼び出し側（Board/Thread/URL 等）との整合を保つため data は optional にする。
  put(data?: string, options?: { lastModified?: number; etag?: string }): Promise<void>;
  // Cache 実装 (src/core/storage/Cache.ts) は文字列データを保持する。unknown だと
  // put() や parse 系に渡せず型エラーになるため実態に合わせる。
  data: string | null;
  lastUpdated: number;
  lastModified?: number;
  etag?: string;
  resLength?: number;
  parsed?: unknown;
  readcgiVer?: number;
  datSize?: number;
  // 確認済みのdat落ちをsubject再取得なしで復元するためのスレッド状態。
  expired?: boolean | null;
  // 閲覧ログ用メタ情報
  title?: string | null;
  threadUrl?: string | null;
  boardUrl?: string | null;
  boardTitle?: string | null;
  kind?: string | null;
}
