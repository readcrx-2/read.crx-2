// ファイルをモジュール化して declare global を有効にする
export {};

declare global {
  const __CHLENS_TAURI_BUILD__: boolean;

  namespace browser.bookmarks {
    const onImportBegan: EvListener<() => void>;
    const onImportEnded: EvListener<() => void>;
  }

  // https://github.com/Microsoft/TypeScript/issues/13086
  interface Map<K, V> {
    has<CheckedString extends string>(
      this: Map<string, V>,
      key: CheckedString,
    ): this is MapWith<K, V, CheckedString>;
  }
  interface MapWith<K, V, DefiniteKey extends K> extends Map<K, V> {
    get(k: DefiniteKey): V;
    get(k: K): V | undefined;
  }
  interface ReadonlyMap<K, V> {
    has<CheckedString extends string>(
      this: ReadonlyMap<string, V>,
      key: CheckedString,
    ): this is ReadonlyMapWith<K, V, CheckedString>;
  }
  interface ReadonlyMapWith<K, V, DefiniteKey extends K> extends ReadonlyMap<K, V> {
    get(k: DefiniteKey): V;
    get(k: K): V | undefined;
  }
}

// vite が処理する CSS の side-effect import 用のモジュール宣言。
declare module "*.css";

declare module "normalize-wheel" {
  interface NormalizedWheelEvent {
    spinX: number;
    spinY: number;
    pixelX: number;
    pixelY: number;
  }

  export default function normalizeWheel(event: WheelEvent | MouseEvent): NormalizedWheelEvent;
}
