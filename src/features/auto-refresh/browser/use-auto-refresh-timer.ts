import { useEffect, useState } from "react";
import {
  MIN_THREAD_AUTO_REFRESH_MS,
  readThreadAutoRefreshIntervalMs,
  THREAD_AUTO_REFRESH_CONFIG_KEY,
} from "src/features/auto-refresh/browser/auto-refresh-config";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { subscribeConfigKeys } from "src/view/browser/utils/config-setting";
import { SCOPED_SETTINGS_CONFIG_KEY } from "src/view/browser/utils/scoped-settings";

interface UseAutoRefreshTimerOptions {
  /** 自動更新間隔のサイト・板スコープを決めるURL。 */
  scopeUrl?: string;
  /** false の間はタイマーを止める（OFF、dat落ちなど）。 */
  active: boolean;
  /**
   * 間隔ごとに呼ぶ処理。関数が変わるとタイマーを作り直し、そこから間隔を数え直す。
   * 呼び出し側は更新のたびに関数が変わるため、更新開始から次の tick までの間隔が保たれる。
   */
  onTick: () => void;
}

/**
 * 自動更新の間隔設定を購読し、表示中のときだけ一定間隔で onTick を呼ぶ。
 * 返り値は現在の間隔（ms）。
 */
export function useAutoRefreshTimer({
  scopeUrl,
  active,
  onTick,
}: UseAutoRefreshTimerOptions): number {
  const { window: viewWindow, document: viewDocument } = useViewSurface();
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    viewDocument.visibilityState === "visible",
  );
  const [intervalMs, setIntervalMs] = useState(() => readThreadAutoRefreshIntervalMs(scopeUrl));

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsDocumentVisible(viewDocument.visibilityState === "visible");
    };

    viewDocument.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      viewDocument.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [viewDocument]);

  useEffect(() => {
    const applyInterval = () => {
      setIntervalMs(readThreadAutoRefreshIntervalMs(scopeUrl));
    };
    // 変更理由: 設定画面や別タブでサイト・板設定が変わったときも、
    // 実行中のタイマーを再作成して表示中のスレへ即時反映する。
    return subscribeConfigKeys(
      [THREAD_AUTO_REFRESH_CONFIG_KEY, SCOPED_SETTINGS_CONFIG_KEY],
      applyInterval,
      {
        label: "AutoRefresh",
      },
    );
  }, [scopeUrl]);

  useEffect(() => {
    if (!active || !isDocumentVisible || intervalMs < MIN_THREAD_AUTO_REFRESH_MS) {
      return;
    }

    const timerId = viewWindow.setInterval(onTick, intervalMs);
    return () => {
      viewWindow.clearInterval(timerId);
    };
  }, [active, intervalMs, isDocumentVisible, onTick, viewWindow]);

  return intervalMs;
}
