export const NEXT_THREAD_TRIGGER_RES_COUNT = 1000;

export function isNextThreadSearchTriggered(responseCount: number, expired: boolean): boolean {
  // 満了前にdat落ちするスレもあるため、レス数だけで探索を制限しない。
  // 本文の取得停止と次スレ探索で同じ条件を使い、探索開始前に自動更新がOFFになるのを防ぐ。
  return expired || responseCount >= NEXT_THREAD_TRIGGER_RES_COUNT;
}
