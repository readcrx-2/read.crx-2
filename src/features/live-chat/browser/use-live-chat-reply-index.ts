import { useCallback, useMemo, useState } from "react";

interface DisplayedState {
  scope: string;
  responseNums: ReadonlySet<number>;
}

/** 取得済みの返信関係を、入場表示が完了したレスまでに制限する。 */
export function useLiveChatReplyIndex({
  scopeKey,
  isFlowing,
  baseline,
  responses,
  repIndex,
}: {
  scopeKey: string;
  isFlowing: boolean;
  baseline: number;
  responses: readonly { num: number }[];
  repIndex: Map<number, Set<number>>;
}) {
  const scope = `${scopeKey}\u0000${isFlowing}`;
  const [stored, setDisplayed] = useState<DisplayedState>({
    scope,
    responseNums: new Set(),
  });
  let displayed = stored;
  if (stored.scope !== scope) {
    // 別スレッドや通常表示からの復帰に、前の入場完了番号を持ち込まない。
    displayed = { scope, responseNums: new Set() };
    setDisplayed(displayed);
  }

  const onEntryDisplayed = useCallback(
    (responseNum: number) => {
      setDisplayed((current) => {
        if (current.scope !== scope || current.responseNums.has(responseNum)) return current;
        return { ...current, responseNums: new Set([...current.responseNums, responseNum]) };
      });
    },
    [scope],
  );
  const replySourceNums = useMemo(
    () =>
      isFlowing
        ? new Set(
            responses
              .filter((res) => res.num <= baseline || displayed.responseNums.has(res.num))
              .map((res) => res.num),
          )
        : undefined,
    [baseline, displayed.responseNums, isFlowing, responses],
  );
  const displayedRepIndex = useMemo(() => {
    if (replySourceNums == null) return repIndex;
    const result = new Map<number, Set<number>>();
    for (const [target, sourceNums] of repIndex) {
      const displayedSources = new Set([...sourceNums].filter((num) => replySourceNums.has(num)));
      if (displayedSources.size > 0) result.set(target, displayedSources);
    }
    return result;
  }, [repIndex, replySourceNums]);

  return { repIndex: displayedRepIndex, replySourceNums, onEntryDisplayed };
}
