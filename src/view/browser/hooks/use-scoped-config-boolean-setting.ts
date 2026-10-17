import { useCallback, useEffect, useState } from "react";
import { DEFAULT_CONFIG } from "src/app/config-defaults";
import { createLogger } from "src/app/logger";
import { persistConfigValue, subscribeConfigKeys } from "src/view/browser/utils/config-setting";
import {
  persistScopedSettingForUrl,
  readScopedConfigValue,
  SCOPED_SETTINGS_CONFIG_KEY,
  type ScopedSettingKey,
} from "src/view/browser/utils/scoped-settings";

const logger = createLogger("view/browser");

function readBooleanValue(
  key: ScopedSettingKey,
  rawUrl: string | undefined,
  defaultValue: boolean,
): boolean {
  const configuredValue = readScopedConfigValue(key, rawUrl);
  if (configuredValue == null) {
    return defaultValue;
  }
  return defaultValue ? configuredValue !== "off" : configuredValue === "on";
}

/** 現在の板を優先し、板設定がなければサイト・全体設定へフォールバックする。 */
export function useScopedConfigBooleanSetting(
  key: ScopedSettingKey,
  rawUrl: string | undefined,
  defaultValue = DEFAULT_CONFIG[key] === "on",
): { value: boolean; setValue: (value: boolean) => void } {
  const [value, setValueState] = useState(() => readBooleanValue(key, rawUrl, defaultValue));

  useEffect(() => {
    const sync = () => setValueState(readBooleanValue(key, rawUrl, defaultValue));
    return subscribeConfigKeys(rawUrl ? [key, SCOPED_SETTINGS_CONFIG_KEY] : [key], sync, {
      label: "ScopedConfigBooleanSetting",
    });
  }, [defaultValue, key, rawUrl]);

  const setValue = useCallback(
    (nextValue: boolean) => {
      setValueState(nextValue);
      if (rawUrl) {
        void persistScopedSettingForUrl(key, rawUrl, nextValue ? "on" : "off").catch(
          (error: unknown) => {
            logger.error("設定の保存に失敗しました", error);
          },
        );
      } else {
        persistConfigValue(key, nextValue ? "on" : "off", "ScopedConfigBooleanSetting");
      }
    },
    [key, rawUrl],
  );

  return { value, setValue };
}
