import {
  isNextThreadSearchTriggered,
  NEXT_THREAD_TRIGGER_RES_COUNT,
} from "src/features/next-thread/domain/auto-next-thread-trigger";

export function shouldDeferExpiredAutoRefreshStop({
  shouldDeferNextThreadStop,
  expired,
  hasReachedThreadLimit,
  isActive,
  isDraining,
}: {
  shouldDeferNextThreadStop: boolean;
  expired: boolean;
  hasReachedThreadLimit: boolean;
  isActive: boolean;
  isDraining: boolean;
}): boolean {
  // dat落ちは新着の再生待ちでは停止を遅らせず、次スレ探索の期限だけを待つ。
  // 表示完了を待つのは通常の1000レス到達時だけとし、期限付きの次スレ探索は維持する。
  return shouldDeferNextThreadStop || (!expired && hasReachedThreadLimit && isActive && isDraining);
}

export function resolveThreadAutoRefreshStop({
  autoNextThreadEnabled,
  responseCount,
  expired,
  missingFromSubject,
  stopped,
}: {
  autoNextThreadEnabled: boolean;
  responseCount: number;
  expired: boolean;
  missingFromSubject: boolean;
  stopped: boolean;
}) {
  const autoRefreshExpired = expired || missingFromSubject || stopped;
  const hasReachedThreadLimit = responseCount >= NEXT_THREAD_TRIGGER_RES_COUNT;
  const shouldStopFetching = isNextThreadSearchTriggered(responseCount, autoRefreshExpired);

  // 本文取得はdat落ち・満了で止めても、次スレ移動がONなら設定した探索期限まで待つ。
  // 期限終了の停止記録だけは待機へ戻さず、開始条件と停止保留の配線をここで揃える。
  return {
    autoRefreshExpired,
    hasReachedThreadLimit,
    shouldStopFetching,
    shouldDeferNextThreadStop: autoNextThreadEnabled && shouldStopFetching && !stopped,
    stopMessage: autoRefreshExpired
      ? "dat落ちを検知したため自動更新を停止しました"
      : "1000レスに到達したため自動更新を停止しました",
  };
}
