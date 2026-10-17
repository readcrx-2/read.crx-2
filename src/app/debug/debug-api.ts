import {
  clearDebugLogs,
  type DebugLogEntry,
  type DebugLogQuery,
  queryDebugLogs,
  toSerializable,
} from "src/app/debug/debug-log";
import {
  clearPersistedLogs,
  type PersistedLogEntry,
  readPersistedLogs,
} from "src/app/debug/log-persistence";

/**
 * CDP経由で外部CLIから呼ぶ読み取り口。
 *
 * 変更理由: 画面内の状態はReactのstateやモジュール内に散らばっており、DevToolsを開いても
 * 一度に確認できなかった。各機能が自分の状態を登録し、CLIは `state()` だけを呼べば
 * 調査に必要な状態をまとめて取得できるようにする。
 */
export interface ChLensDebugApi {
  version: 1;
  state(): Record<string, unknown>;
  logs(query?: DebugLogQuery): DebugLogEntry[];
  clearLogs(): void;
  /** 再起動後も残る、IndexedDB に保存したログ（全ての窓の分）。 */
  persistedLogs(query?: DebugLogQuery): Promise<PersistedLogEntry[]>;
  clearPersistedLogs(): Promise<void>;
}

declare global {
  interface Window {
    __chlensDebug?: ChLensDebugApi;
  }
}

type DebugStateProvider = () => unknown;

const providers = new Map<string, DebugStateProvider>();

/** 状態の提供元を登録する。同じキーは後から登録したもので置き換え、解除関数を返す。 */
export function registerDebugStateProvider(key: string, provider: DebugStateProvider): () => void {
  providers.set(key, provider);
  return () => {
    if (providers.get(key) === provider) {
      providers.delete(key);
    }
  };
}

export function collectDebugState(): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, provider] of [...providers].sort(([a], [b]) => a.localeCompare(b))) {
    try {
      result[key] = toSerializable(provider());
    } catch (error: unknown) {
      // 一つの提供元の失敗で他の状態まで取れなくならないよう、失敗内容を値として返す。
      console.error(`[ChLens Debug] 状態 "${key}" の取得に失敗しました:`, error);
      result[key] = { error: toSerializable(error) };
    }
  }
  return result;
}

export function installDebugApi(target: Window = window): void {
  target.__chlensDebug = {
    version: 1,
    state: collectDebugState,
    logs: queryDebugLogs,
    clearLogs: clearDebugLogs,
    persistedLogs: readPersistedLogs,
    clearPersistedLogs,
  };
}
