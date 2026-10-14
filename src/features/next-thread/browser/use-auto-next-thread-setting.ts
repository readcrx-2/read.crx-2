import { useCallback, useEffect, useState } from "react";
import { DEFAULT_CONFIG } from "src/app/config-defaults";
import type { AutoNextThreadMode } from "src/features/next-thread/domain/next-thread-search";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";
import {
  persistConfigValue,
  readConfigValue,
  subscribeConfigKeys,
} from "src/view/browser/utils/config-setting";

export const AUTO_NEXT_THREAD_CONFIG_KEY = "auto_next_thread";
export const AUTO_NEXT_THREAD_MODE_CONFIG_KEY = "auto_next_thread_mode";
export const NEXT_THREAD_SEARCH_DURATION_CONFIG_KEY = "next_thread_search_duration";

function readSearchDurationSeconds(): number {
  const value = Number(readConfigValue(NEXT_THREAD_SEARCH_DURATION_CONFIG_KEY));
  // 古い設定や未保存値でも無期限にならないよう、既定値とEdgeLiveViewerの設定範囲を使う。
  return Number.isFinite(value) && value >= 60 && value <= 600
    ? Math.floor(value)
    : Number(DEFAULT_CONFIG.next_thread_search_duration);
}

function readAutoNextThreadMode(): AutoNextThreadMode {
  const value = readConfigValue(AUTO_NEXT_THREAD_MODE_CONFIG_KEY);
  if (value === "aggressive") {
    return value;
  }
  // 変更理由: 慎重モードを選択肢から外したため、過去の保存値は標準へ読み替える。
  return DEFAULT_CONFIG.auto_next_thread_mode as AutoNextThreadMode;
}

export function useAutoNextThreadSetting(): {
  enabled: boolean;
  mode: AutoNextThreadMode;
  searchDurationSeconds: number;
  setEnabled: (enabled: boolean) => void;
  setMode: (mode: AutoNextThreadMode) => void;
} {
  const { value: enabled, setValue: setEnabled } = useConfigBooleanSetting(
    AUTO_NEXT_THREAD_CONFIG_KEY,
  );
  const [mode, setModeState] = useState(readAutoNextThreadMode);
  const [searchDurationSeconds, setSearchDurationSeconds] = useState(readSearchDurationSeconds);

  useEffect(() => {
    return subscribeConfigKeys(
      [AUTO_NEXT_THREAD_MODE_CONFIG_KEY, NEXT_THREAD_SEARCH_DURATION_CONFIG_KEY],
      () => {
        setModeState(readAutoNextThreadMode());
        setSearchDurationSeconds(readSearchDurationSeconds());
      },
      { label: "AutoNextThreadSetting" },
    );
  }, []);

  const setMode = useCallback((nextMode: AutoNextThreadMode) => {
    setModeState(nextMode);
    persistConfigValue(AUTO_NEXT_THREAD_MODE_CONFIG_KEY, nextMode, "AutoNextThreadSetting");
  }, []);

  return { enabled, mode, searchDurationSeconds, setEnabled, setMode };
}
