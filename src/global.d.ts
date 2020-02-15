///<reference path="./shortQuery.d.ts" />

interface Window {
  app: any;
}

declare namespace app {
  const config: any;
  const Callbacks: any;
  const log: any;
  const LocalStorage: any;
  const deepCopy: any;
  const message: any;
  const defer: any;

  const bookmark: any;
  const HTTP: any;
  const util: any;
}

declare namespace browser.bookmarks {
  const onImportBegan: EvListener<() => void>;
  const onImportEnded: EvListener<() => void>;
}

// https://github.com/Microsoft/TypeScript/issues/13086
interface Map<K, V> {
  has<CheckedString extends string>(this: Map<string, V>, key: CheckedString): this is MapWith<K, V, CheckedString>
}
interface MapWith<K, V, DefiniteKey extends K> extends Map<K, V> {
  get(k: DefiniteKey): V;
  get(k: K): V | undefined;
}
interface ReadonlyMap<K, V> {
  has<CheckedString extends string>(this: ReadonlyMap<string, V>, key: CheckedString): this is ReadonlyMapWith<K, V, CheckedString>
}
interface ReadonlyMapWith<K, V, DefiniteKey extends K> extends ReadonlyMap<K, V> {
  get(k: DefiniteKey): V;
  get(k: K): V | undefined;
}
