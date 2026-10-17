import { useEffect, useMemo } from "react";
import { useNgStatus } from "src/features/ng/browser/use-ng-status";
import type { IRes } from "src/service-container/interfaces";
import {
  getThreadPageCountKey,
  usePageCountStatus,
} from "src/view/browser/hooks/use-page-count-status";

interface UseThreadStatusSyncParams {
  tabId: string;
  threadUrl: string;
  loading: boolean;
  responses: IRes[];
  ownResNums: Set<number>;
  replyToOwnResNums: Set<number>;
}

interface UseThreadStatusSyncResult {
  /** NG判定されたレス番号。本文の折りたたみ表示にも使う。 */
  ngResNums: Set<number>;
}

const isNgResponse = (res: IRes): boolean => res.ng != null || Boolean(res.class?.includes("ng"));

/**
 * ステータスバーはページ外で描画されるため、スレッドのレス数・NG数・自分関連のハイライト数を
 * 共有ストアへ反映する。アンマウント時には値を戻し、別タブの結果が混ざらないようにする。
 */
export function useThreadStatusSync({
  tabId,
  threadUrl,
  loading,
  responses,
  ownResNums,
  replyToOwnResNums,
}: UseThreadStatusSyncParams): UseThreadStatusSyncResult {
  const { setThreadStats } = useNgStatus();
  const { setPageCount } = usePageCountStatus();
  const pageCountKey = getThreadPageCountKey(tabId, threadUrl);

  const ngResNums = useMemo(
    () => new Set(responses.filter(isNgResponse).map((res) => res.num)),
    [responses],
  );
  const threadNgCount = ngResNums.size;

  const ownHighlightCount = useMemo(() => {
    const highlightedResNums = new Set<number>(ownResNums);
    for (const resNum of replyToOwnResNums) {
      highlightedResNums.add(resNum);
    }
    return highlightedResNums.size;
  }, [ownResNums, replyToOwnResNums]);

  useEffect(() => {
    // 変更理由: ステータスバーはページ外で描画されるため、タブ単位でレス数を共有し、
    // 別タブの取得結果が現在の表示へ混ざらないようにする。
    setPageCount(pageCountKey, {
      kind: "thread",
      count: loading && responses.length === 0 ? null : responses.length,
    });
    return () => setPageCount(pageCountKey, null);
  }, [loading, pageCountKey, responses.length, setPageCount]);

  useEffect(() => {
    // ステータスバーの件数はページ外コンポーネントから参照するため、
    // スレッド側で集計して共有ストアへ反映する。
    setThreadStats({
      ngCount: threadNgCount,
      highlightCount: ownHighlightCount,
    });
    return () => {
      setThreadStats({ ngCount: 0, highlightCount: 0 });
    };
  }, [ownHighlightCount, setThreadStats, threadNgCount]);

  return { ngResNums };
}
