import { useEffect, useState } from "react";
import { useViewSurface } from "src/features/auxiliary-window/browser/use-view-surface";
import { useLatestRef } from "src/view/browser/hooks/use-latest-ref";

interface ResponseNumber {
  num: number;
}

// waiting: 自動更新ON直後の再取得を待っている, fetching: その再取得中。
type CatchUpPhase = "none" | "waiting" | "fetching";

interface PlaybackState {
  scope: string;
  baseline: number | null;
  released: number | null;
  catchUp: CatchUpPhase;
}

// 一度に流す上限。これを超える新着は取得の遅れ・復帰・スリープ明けなどで溜まった分とみなし、
// 古い分を即表示して末尾だけを流す。全件を流すと数秒〜数十秒ふわふわ表示され続けて追いつけない。
export const LIVE_CHAT_MAX_PENDING = 30;
export const LIVE_CHAT_TAIL_COUNT = 10;

// 取得周期の手前でキューを消化し、勢いの大きいスレでも表示遅延を積み重ねない。
export function getLiveChatDelay(pendingCount: number, intervalMs: number): number {
  return Math.max(16, Math.min(600, (intervalMs * 0.8) / Math.max(1, pendingCount)));
}

function releaseAll(playback: PlaybackState, lastNum: number | null): PlaybackState {
  return { ...playback, baseline: lastNum, released: lastNum, catchUp: "none" };
}

// 自動更新ON直後の再取得は、OFFの間に溜まった分の取り込みなので流さずに追いつく。
// 再取得はONを反映したeffectから始まるため、ONの描画時点ではまだloadingになっていない。
function advanceCatchUp(
  playback: PlaybackState,
  lastNum: number | null,
  isFetching: boolean,
): PlaybackState {
  if (playback.catchUp === "none") return playback;
  if (playback.released !== lastNum) return releaseAll(playback, lastNum);
  if (playback.catchUp === "waiting" && isFetching) return { ...playback, catchUp: "fetching" };
  // 新着なしで取得が終わったら、以降の新着は通常どおり流す。
  if (playback.catchUp === "fetching" && !isFetching) return { ...playback, catchUp: "none" };
  return playback;
}

export function useLiveChatResponses<T extends ResponseNumber>({
  responses,
  scopeKey,
  enabled,
  isActive,
  isAutoRefreshEnabled,
  isFetching,
  intervalMs,
  paused = false,
}: {
  responses: T[];
  scopeKey: string;
  enabled: boolean;
  isActive: boolean;
  isAutoRefreshEnabled: boolean;
  isFetching: boolean;
  intervalMs: number;
  /** ポップアップを読んでいる間など、保留した新着を残して再生だけを止める。 */
  paused?: boolean;
}) {
  const { window: viewWindow } = useViewSurface();
  // タイマーのcleanup前に予約済みのcallbackが届いても、一時停止後の行を表示しない。
  const pausedRef = useLatestRef(paused);
  // 流すのは自動更新で追いかけている最中だけ。手動更新やdat落ち後の取得、非表示の間に
  // 届いた分は利用者が待つ理由がないため、scopeを切り替えてその場で全件表示する。
  const isFlowing = enabled && isActive && isAutoRefreshEnabled;
  const scope = `${scopeKey}\u0000${isFlowing}`;
  const lastNum = responses.at(-1)?.num ?? null;
  const [stored, setPlayback] = useState<PlaybackState>({
    scope,
    baseline: lastNum,
    released: lastNum,
    catchUp: "none",
  });
  const [wasAutoRefreshEnabled, setWasAutoRefreshEnabled] = useState(isAutoRefreshEnabled);
  if (wasAutoRefreshEnabled !== isAutoRefreshEnabled) {
    setWasAutoRefreshEnabled(isAutoRefreshEnabled);
  }
  const hasJustEnabledAutoRefresh = isAutoRefreshEnabled && !wasAutoRefreshEnabled;
  const [settled, setSettled] = useState({ scope, released: lastNum });
  let playback = stored;
  if (stored.scope !== scope) {
    // 切り替えはその場で全件表示し、新着だけを流す。effectで初期化すると
    // 新スレの描画に旧スレの上限が一度混ざるため、描画前に同じstateを同期する。
    playback = {
      scope,
      baseline: lastNum,
      released: lastNum,
      catchUp: isFlowing && hasJustEnabledAutoRefresh ? "waiting" : "none",
    };
  } else if (stored.baseline === null && lastNum !== null) {
    // 初回取得も全件をすぐ表示する。
    playback = releaseAll(stored, lastNum);
  }
  playback = advanceCatchUp(playback, lastNum, isFetching);

  let pending = isFlowing ? responses.filter((res) => res.num > (playback.released ?? 0)) : [];
  // バッチ内では一定間隔を保つ。残り件数が減るたびに間隔を延ばすと、最後尾が次回取得に間に合わない。
  const [pace, setPace] = useState({
    scope,
    lastNum,
    delay: getLiveChatDelay(pending.length, intervalMs),
  });
  let delay = pace.delay;
  if (
    pace.scope !== scope ||
    pace.lastNum !== lastNum ||
    (!paused && pending.length > LIVE_CHAT_MAX_PENDING)
  ) {
    // 一時停止中は新着が上限を超えても表示を進めず、再開時に通常の追いつき処理へ渡す。
    if (!paused && pending.length > LIVE_CHAT_MAX_PENDING) {
      // 読み飛ばす分は入場動作も付けず、末尾だけを新着として流す。
      const skippedNum = pending[pending.length - LIVE_CHAT_TAIL_COUNT - 1].num;
      playback = { ...playback, baseline: skippedNum, released: skippedNum };
      pending = pending.slice(-LIVE_CHAT_TAIL_COUNT);
    }
    delay = getLiveChatDelay(pending.length, intervalMs);
    setPace({ scope, lastNum, delay });
  }
  if (playback !== stored) {
    setPlayback(playback);
  }
  const nextNum = pending[0]?.num;

  useEffect(() => {
    if (!isFlowing || paused || nextNum === undefined) return;
    const timer = viewWindow.setTimeout(() => {
      setPlayback((current) =>
        !pausedRef.current && current.scope === scope ? { ...current, released: nextNum } : current,
      );
    }, delay);
    // 非表示化・通常表示への切り替え・次スレ移動で予約を破棄し、旧スレのレスを混ぜない。
    return () => viewWindow.clearTimeout(timer);
  }, [delay, isFlowing, nextNum, paused, pausedRef, scope, viewWindow]);

  useEffect(() => {
    // 最後の行の高さをResizeObserverが追従させてから、満了停止や次スレ移動を許可する。
    let secondFrame: number | undefined;
    const frame = viewWindow.requestAnimationFrame(() => {
      secondFrame = viewWindow.requestAnimationFrame(() =>
        setSettled({ scope, released: playback.released }),
      );
    });
    return () => {
      viewWindow.cancelAnimationFrame(frame);
      if (secondFrame !== undefined) viewWindow.cancelAnimationFrame(secondFrame);
    };
  }, [playback.released, scope, viewWindow]);

  return {
    responses: isFlowing
      ? responses.filter((res) => res.num <= (playback.released ?? 0))
      : responses,
    pendingCount: pending.length,
    isFlowing,
    isDraining:
      isFlowing &&
      (pending.length > 0 || settled.scope !== scope || settled.released !== playback.released),
    baseline: playback.baseline ?? 0,
  };
}
