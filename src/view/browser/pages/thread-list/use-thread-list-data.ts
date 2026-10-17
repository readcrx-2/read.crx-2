import type { MutableRefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createLogger } from "src/app/logger";
import {
  getThreadListCache,
  setThreadListCache,
} from "src/features/thread-list/ui/thread-list-shared";
import { container } from "src/service-container/index";
import type { IThread } from "src/service-container/interfaces";
import { consumeManualRefresh } from "src/view/browser/utils/manual-refresh";

const logger = createLogger("view/browser");

interface UseThreadListDataOptions {
  boardUrl: string;
  refreshKey: number;
  manualRefreshScopeKey: string;
  /** 板を開いた時刻。取得完了の時刻で閲覧日時を進めないために参照する。 */
  visitedBoardRef: MutableRefObject<{ url: string; lastVisited: number } | null>;
  /** 取得確認後の保存へ引き継ぐ、解決済みの板名。 */
  resolvedBoardTitlesRef: MutableRefObject<Map<string, string>>;
}

/**
 * スレ一覧の取得・キャッシュ復元・NG設定変更への追従を担う。
 *
 * 変更理由: 取得フロー(成功・注意メッセージ付きの空結果・失敗時のキャッシュ復元)は
 * 画面の表示状態と独立して検証できるため、ThreadListPage から切り出す。
 */
export function useThreadListData({
  boardUrl,
  refreshKey,
  manualRefreshScopeKey,
  visitedBoardRef,
  resolvedBoardTitlesRef,
}: UseThreadListDataOptions) {
  const previousRefreshKeyRef = useRef(refreshKey);
  const [threads, setThreads] = useState<IThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRefreshOverlay, setShowRefreshOverlay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchThreads = useCallback(async () => {
    const startedAt = Date.now();
    const isRefresh = previousRefreshKeyRef.current !== refreshKey;
    previousRefreshKeyRef.current = refreshKey;
    if (isRefresh) consumeManualRefresh(manualRefreshScopeKey);
    setLoading(true);
    if (isRefresh) {
      setShowRefreshOverlay(true);
    }
    setError(null);
    try {
      // container経由でBoardサービスにアクセス
      const result = await container.board.getThreads(boardUrl);
      setThreads(result.threads);
      if (!result.message && result.threads.length > 0) {
        // 実際にスレ一覧を取得・解析できた板だけを確認し、ホストの固定リストを不要にする。
        // 名前が先に届く場合も拾い、取得完了の時刻で閲覧日時を進めない。
        const visitedAt =
          visitedBoardRef.current?.url === boardUrl
            ? visitedBoardRef.current.lastVisited
            : startedAt;
        container.openedBoards.upsertOpenedBoardEntry(
          boardUrl,
          resolvedBoardTitlesRef.current.get(boardUrl) ?? null,
          visitedAt,
          true,
        );
      }
      if (result.threads.length > 0 || !result.message) {
        // 変更理由: 注意メッセージ付きの空結果で直前の正常キャッシュを上書きすると、
        // 戻る操作時に復元できず誤警告だけが残るため、失敗相当の空結果は保存しない。
        void setThreadListCache(boardUrl, result.threads);
      }
      // 戻る操作直後は「取得成功 + 注意メッセージ」が返る場合があるため、
      // 一覧を描画できる件数がある間はエラー文言を出さずUIの連続性を優先する。
      if (result.message && result.threads.length === 0) {
        const cached = await getThreadListCache(boardUrl);
        if (cached && cached.length > 0) {
          // 変更理由: 初回起動後に履歴からスレ一覧へ戻る際、サービスの注意メッセージと
          // IDBキャッシュ復元が競合しても、表示可能な一覧があるなら誤警告を出さない。
          setThreads(cached);
        } else {
          setError(result.message);
        }
      }
    } catch (e) {
      logger.error("スレッド一覧の取得に失敗しました:", {
        boardUrl: boardUrl,
        error: e,
      });
      const cached = await getThreadListCache(boardUrl);
      if (cached && cached.length > 0) {
        // 変更理由: 一時的な通信失敗でもキャッシュから一覧を復元できる場合は、画面上部を
        // エラーで塞がず、利用可能な直前データを優先する。詳細な失敗はログに残す。
        setThreads(cached);
      } else {
        setError(e instanceof Error ? e.message : "スレッド一覧の取得に失敗しました");
      }
    } finally {
      setLoading(false);
      // 変更理由: 完了後のフェード用にスピナーを残すとロード時間より長く見えるため、
      // 成功・失敗のどちらでも取得完了と同時に更新表示を終了する。
      setShowRefreshOverlay(false);
    }
    // refreshKeyが変わったとき（更新ボタン押下）に再取得を走らせる
  }, [manualRefreshScopeKey, boardUrl, refreshKey, visitedBoardRef, resolvedBoardTitlesRef]);

  // 変更理由: IDBキャッシュから前回のスレ一覧を復元し、新しいデータの取得中は古い結果を表示し続ける。
  useEffect(() => {
    void (async () => {
      const cached = await getThreadListCache(boardUrl);
      if (cached && cached.length > 0) {
        setThreads(cached);
      }
    })();
  }, [boardUrl]);

  useEffect(() => {
    void fetchThreads();
  }, [fetchThreads]);

  useEffect(() => {
    // NG設定が更新されたら、一覧のスレッドに対しても判定を再実行する。
    const handleNgChanged = () => {
      setThreads((prev) =>
        prev.map((thread) => {
          const ngResult = container.ng.isNGBoard(thread.title, boardUrl, thread.resCount);
          // 変更理由: hideは一覧から除外し、collapseだけを折りたたみ領域へ送る。
          const highlight =
            ngResult?.action === "highlight" ||
            ngResult?.type === "HighlightTitle" ||
            ngResult?.type === "RegExpHighlightTitle";
          const demoted = ngResult?.action === "collapse";

          return {
            ...thread,
            ng: highlight || demoted ? null : ngResult,
            demoted: demoted ? ngResult : null,
            highlight: highlight ? ngResult : null,
          };
        }),
      );
    };

    container.message.on("ng_changed", handleNgChanged);
    return () => {
      container.message.off("ng_changed", handleNgChanged);
    };
  }, [boardUrl]);

  return { threads, setThreads, loading, showRefreshOverlay, error, fetchThreads };
}
