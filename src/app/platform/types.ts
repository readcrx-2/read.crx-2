import type { HttpsMode } from "packages/chlib/src/fetcher/https-first";
export interface WindowOptions {
  url: string;
  width?: number;
  height?: number;
  focused?: boolean;
}

export interface WindowManager {
  /**
   * プラットフォーム内で管理される静的アセットへのURLを解決する
   */
  getAssetUrl(path: string): string;

  /**
   * 外部ブラウザの新しいタブでURLを開く
   */
  openUrlInTab(url: string, active?: boolean): Promise<void>;

  /**
   * 新しいウィンドウでURLを開く
   */
  openWindow(options: WindowOptions): Promise<void>;

  /**
   * 同じアプリの表示元から名前付きポップアップを開く。
   *
   * 別窓へReactポータルを接続する機能は、ブラウザ拡張とTauriで窓の作り方が異なるため、
   * ビューから直接window.openを呼ばずにこの境界を通す。sourceWindowを渡すと、
   * 別窓内のクリックをポップアップの起点として扱える。
   */
  openPopup?(name: string, features: string, sourceWindow?: Window): Window | null;

  /** DOMのfocusだけで前面へ戻らない環境では、OS側の別窓も復元してフォーカスする。 */
  focusPopup?(popup: Window): Promise<void>;

  /**
   * 現在のウィンドウ/タブを閉じる
   */
  closeCurrent(): Promise<void>;

  /**
   * ウィンドウ/タブのタイトルを設定する
   */
  setTitle(title: string): Promise<void>;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  url: string;
}

export interface BinaryHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: ArrayBuffer;
  url: string;
}

export interface WriteFormData {
  action: string;
  charset: string;
  input: Record<string, string>;
  textarea: Record<string, string>;
  /** ブラウザ版のフォーム送信と同じRefererをTauri版で再現する。 */
  referer?: string;
}

export interface WriteFormField {
  name: string;
  value: string;
  type: "input" | "textarea";
}

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  // 実装 (XHR.send / tauriFetch) がそのまま受け取れる型に限定する。
  // unknown だと各実装側でキャストが必要になり型エラーの原因になっていた。
  // Tauri版の書き込みでは、Shift_JIS/EUC-JPのバイト列をそのまま送る必要がある。
  body?: string | ArrayBuffer;
  timeout?: number;
  mimeType?: string;
  /** HTTPで指定されたGETをHTTPSへ切り替える方針。未指定ならウィンドウで選んだ設定を使う。 */
  httpsMode?: HttpsMode;
}

export interface HttpClient {
  fetch(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
  /**
   * 画像などのバイナリ本文を取得する。ブラウザ拡張では未使用だが、
   * Tauri WebViewで外部リソースをblob URLへ変換するために実装する。
   */
  fetchBinary?: (url: string, options?: HttpRequestOptions) => Promise<BinaryHttpResponse>;
  /**
   * 書き込みリクエスト（POST）の前に、RefererやOriginヘッダーを制御するための
   * プラットフォーム固有の設定を行います（拡張機能の declarativeNetRequest 等）。
   */
  setupWriteHeaders(url: string): Promise<void>;
}

export interface DownloadManager {
  /** 指定URLの本文を、利用者が通常使うダウンロード先へ保存する。 */
  save(url: string, fileName: string): Promise<void>;
}

export interface CookieManager {
  /** 実行環境で管理しているすべての書き込みCookieが存在するか確認する。 */
  hasAnyCookies(): Promise<boolean>;
  /** 指定ホストの書き込みに使うCookieが存在するか確認する。 */
  hasSiteCookies(site: string): Promise<boolean>;
  /** 実行環境で管理しているすべての書き込みCookieを削除する。 */
  clearAllCookies(): Promise<void>;
  /** 指定ホストの書き込みに使うCookieを削除する。 */
  clearSiteCookies(site: string): Promise<void>;
}

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  getAll(): Promise<Record<string, string>>;
  onChanged(
    callback: (
      changes: Record<string, { oldValue: string | null; newValue: string | null }>,
    ) => void,
  ): void;
}

export interface ObjectStoreIndex {
  getAll(query?: unknown): Promise<unknown[]>;
  getAllKeys(query?: unknown): Promise<unknown[]>;
  getPage(options: {
    query?: unknown;
    direction?: IDBCursorDirection;
    offset?: number;
    limit: number;
    filter?: { key: string; value: unknown };
  }): Promise<{ values: unknown[]; hasMore: boolean }>;
}

export interface ObjectStore {
  get(key: string): Promise<unknown>;
  put(value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  getAll(): Promise<unknown[]>;
  clear(): Promise<void>;
  count(): Promise<number>;
  /**
   * インデックスによる検索 (IndexedDB互換)
   */
  index(name: string): ObjectStoreIndex;
}

export interface StorageManager {
  /**
   * 設定保存などのシンプルなキーバリューストア (LocalStorage相当)
   */
  kv: KeyValueStore;

  /**
   * 構造化データ保存用のオブジェクトストア (IndexedDB相当)
   * 引数によって異なるストア（名前空間）を返せるようにする
   */
  getStore(name: string): ObjectStore;
}

export interface Platform {
  window: WindowManager;
  http: HttpClient;
  download: DownloadManager;
  cookies: CookieManager;
  storage: StorageManager;
}
