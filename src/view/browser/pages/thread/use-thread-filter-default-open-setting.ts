import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";

export const THREAD_FILTER_DEFAULT_OPEN_CONFIG_KEY = "thread_filter_default_open";

/** スレッドを開いたときにフィルタバーを開いた状態で始めるかどうか。 */
export function useThreadFilterDefaultOpenSetting(): boolean {
  return useConfigBooleanSetting(THREAD_FILTER_DEFAULT_OPEN_CONFIG_KEY).value;
}
