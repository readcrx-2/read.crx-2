import Callbacks from "src/app/Callbacks";
import { DEFAULT_CONFIG } from "src/app/config-defaults";
import LocalStorage from "src/app/LocalStorage";
import { assertArg, log } from "src/app/Log";
import message from "src/app/Message";

const THEME_ID_STORAGE_KEY = "config_theme_id";

/**
 * ライトのテーマIDを "default" から "light" に改めたため、保存済みの旧IDを書き換える。
 *
 * 読み込み時に変換するだけでは、設定画面のラジオボタンが旧IDに一致せず未選択に見える。
 */
async function migrateLegacyThemeId(cache: Map<string, string>): Promise<void> {
  if (cache.get(THEME_ID_STORAGE_KEY) !== "default") return;
  cache.set(THEME_ID_STORAGE_KEY, "light");
  try {
    await LocalStorage.set(THEME_ID_STORAGE_KEY, "light");
  } catch (error) {
    log("error", "テーマ設定の旧IDを移行できませんでした", error);
  }
}

export default class Config {
  private readonly _cache = new Map<string, string>();
  private readonly _pendingStorageChanges = new Map<string, string | null>();
  readonly ready: (callback: (...args: unknown[]) => void) => void;
  private readonly _onChanged: (
    change: Record<string, { oldValue: string | null; newValue: string | null }>,
  ) => void;
  private readonly _storageListener: ((event: StorageEvent) => void) | null;

  private _normalizeStorageEventValue(rawValue: string | null): string | null {
    if (rawValue == null) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValue) as unknown;
      if (typeof parsed === "string") {
        return parsed;
      }
      if (typeof parsed === "number" || typeof parsed === "boolean") {
        return String(parsed);
      }
    } catch {
      // 旧実装などで生文字列が格納されている場合はそのまま扱う。
    }

    return rawValue;
  }

  constructor() {
    const ready = new Callbacks();
    this.ready = ready.add.bind(ready);

    // キャッシュを常にLocalStorageから再読み込みして、最新の設定値を確保する。
    // ページリロード後や他のタブからの更新を反映するため、cached.size チェックを削除した。
    void (async () => {
      const res = await LocalStorage.getAll();
      for (const [key, val] of Object.entries(res)) {
        if (key.startsWith("config_") && (typeof val === "string" || typeof val === "number")) {
          this._cache.set(key, val.toString());
        }
      }
      await migrateLegacyThemeId(this._cache);
      ready.call();
    })();

    this._onChanged = (
      change: Record<string, { oldValue: string | null; newValue: string | null }>,
    ) => {
      for (const [key, val] of Object.entries(change)) {
        if (!key.startsWith("config_")) continue;
        const { newValue } = val;

        const pendingValue = this._pendingStorageChanges.get(key);
        const normalizedValue = typeof newValue === "string" ? newValue : null;

        if (pendingValue === normalizedValue) {
          this._pendingStorageChanges.delete(key);
          continue;
        }

        this._applyChange(key, normalizedValue);
      }
    };

    if (typeof window !== "undefined") {
      this._storageListener = (event: StorageEvent) => {
        if (typeof event.key !== "string" || !event.key.startsWith("config_")) {
          return;
        }

        this._onChanged({
          [event.key]: {
            oldValue: this._normalizeStorageEventValue(event.oldValue),
            newValue: this._normalizeStorageEventValue(event.newValue),
          },
        });
      };

      // 変更理由: config保存をstore2(localStorage)に統一したため、
      // 同期通知もbrowser.storage.onChangedではなくstorageイベントで受ける。
      window.addEventListener("storage", this._storageListener);
    } else {
      this._storageListener = null;
    }
  }

  get(key: string): string | null {
    if (this._cache.has(`config_${key}`)) {
      return this._cache.get(`config_${key}`);
    }
    if (Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, key)) {
      return DEFAULT_CONFIG[key];
    }
    return null;
  }

  getAll(): Record<string, string> {
    const object: Record<string, string> = {};
    for (const [key, val] of Object.entries(DEFAULT_CONFIG)) {
      object[`config_${key}`] = val;
    }
    Object.assign(object, Object.fromEntries(this._cache));
    return object;
  }

  isOn(key: string): boolean {
    return this.get(key) === "on";
  }

  private _applyChange(storageKey: string, value: string | null) {
    const configKey = storageKey.slice(7);
    const oldValue = this.get(configKey);

    if (value == null) {
      this._cache.delete(storageKey);
    } else {
      this._cache.set(storageKey, value);
    }

    const newValue = this.get(configKey);

    if (oldValue !== newValue) {
      message.send("config_updated", {
        key: configKey,
        val: newValue,
      });
    }
  }

  async set(key: string, val: string) {
    if (typeof key !== "string" || !(typeof val === "string" || typeof val === "number")) {
      log("error", "app.Config::setに不適切な値が渡されました", arguments);
      throw new Error("app.Config::setに不適切な値が渡されました");
    }

    const storageKey = `config_${key}`;
    const nextValue = val.toString();

    await LocalStorage.set(storageKey, nextValue);
    this._pendingStorageChanges.set(storageKey, nextValue);
    this._applyChange(storageKey, nextValue);
    // 変更理由: store2ベースの同一タブ更新ではstorage changeイベントを前提にできないため、
    // pendingを即時解放して不要なメモリ保持を避ける。
    this._pendingStorageChanges.delete(storageKey);
  }

  async del(key: string) {
    if (assertArg("app.Config::del", [[key, "string"]])) {
      throw new Error("app.Config::delにstring以外の値が渡されました");
    }
    const storageKey = `config_${key}`;

    await LocalStorage.del(storageKey);
    this._pendingStorageChanges.set(storageKey, null);
    this._applyChange(storageKey, null);
    // 変更理由: setと同様に、イベント待ちせず同期的に反映した更新は即時確定する。
    this._pendingStorageChanges.delete(storageKey);
  }

  destroy() {
    this._cache.clear();
    this._pendingStorageChanges.clear();
    if (this._storageListener && typeof window !== "undefined") {
      window.removeEventListener("storage", this._storageListener);
    }
  }
}
