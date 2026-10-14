import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { container } from "src/service-container/index";
import type { IRes } from "src/service-container/interfaces";
import { stripHtml } from "src/view/browser/utils/response-format";
import { buildWrittenResSet } from "src/view/browser/utils/thread-emphasis";
import {
  findLatestWrittenRes,
  type PendingWritePayload,
  resolveWrittenResTimestamp,
  subscribeThreadWriteCompleted,
  subscribeThreadWriteStarted,
} from "src/view/browser/utils/thread-write-sync";

interface PendingWriteMatchState extends PendingWritePayload {
  baselineResponseCount: number;
  baselineLastResNum: number | null;
}

interface PendingWriteHistoryPersistence {
  submittedAt: number;
  promise: Promise<number | null | undefined>;
}

interface UseOwnResTrackingParams {
  threadUrl: string;
  threadTitle: string;
  responses: IRes[];
}

interface UseOwnResTrackingResult {
  ownResNums: Set<number>;
  handleWriteHistoryAdded: (resNum: number) => void;
  handleWriteHistoryRemoved: (resNum: number) => void;
}

export function useOwnResTracking({
  threadUrl,
  threadTitle,
  responses,
}: UseOwnResTrackingParams): UseOwnResTrackingResult {
  const [ownResNums, setOwnResNums] = useState<Set<number>>(new Set());
  const [pendingWrite, setPendingWrite] = useState<PendingWriteMatchState | null>(null);
  const responseCountRef = useRef(0);
  const lastResponseNumRef = useRef<number | null>(null);
  const pendingWriteHistoryRef = useRef<PendingWriteHistoryPersistence | null>(null);
  // 変更理由: 投稿成功の応答を待つ間に自動更新が走ると、
  // responseCountRef が新着込みの値になり hasAdvancedSinceSubmit が永久に false になる。
  // 送信直後の notifyThreadWriteStarted でベースラインを先取りしておくことで競合を防ぐ。
  const writeBaselineRef = useRef<{
    responseCount: number;
    lastResNum: number | null;
    submittedAt: number;
  } | null>(null);

  useLayoutEffect(() => {
    responseCountRef.current = responses.length;
    lastResponseNumRef.current = responses.at(-1)?.num ?? null;
  }, [responses]);

  useEffect(() => {
    let alive = true;
    const loadOwnResNums = async () => {
      try {
        const rows = await container.writeHistory.getByUrl(threadUrl);
        if (!alive) return;
        setOwnResNums(buildWrittenResSet(rows));
      } catch (error) {
        console.error("[useOwnResTracking] 書込履歴の取得に失敗しました", { threadUrl, error });
        if (alive) setOwnResNums(new Set());
      }
    };
    void loadOwnResNums();
    return () => {
      alive = false;
    };
  }, [threadUrl]);

  useEffect(() => {
    setPendingWrite(null);
    pendingWriteHistoryRef.current = null;
  }, [threadUrl]);

  useEffect(() => {
    return subscribeThreadWriteStarted((payload) => {
      if (payload.threadUrl !== threadUrl) return;
      writeBaselineRef.current = {
        responseCount: responseCountRef.current,
        lastResNum: lastResponseNumRef.current,
        submittedAt: payload.submittedAt,
      };
    });
  }, [threadUrl]);

  useEffect(() => {
    const handleThreadWriteCompleted = (payload: PendingWritePayload) => {
      if (payload.threadUrl !== threadUrl) return;

      // 変更理由: 送信前時点の末尾レス位置を覚えておくと、同文レスが既にあるスレでも
      // 新着到着前の古いレスを誤って「今書いたレス」と認定する事故を避けられる。
      // ベースラインは送信直後の writeBaselineRef を優先し、送信中の自動更新で
      // responseCountRef が更新されても競合が起きないようにする。
      const baseline =
        writeBaselineRef.current?.submittedAt === payload.submittedAt
          ? writeBaselineRef.current
          : null;
      writeBaselineRef.current = null;

      setPendingWrite({
        ...payload,
        baselineResponseCount: baseline?.responseCount ?? responseCountRef.current,
        baselineLastResNum: baseline?.lastResNum ?? lastResponseNumRef.current,
      });

      if (container.config.get("no_writehistory") === "on") {
        pendingWriteHistoryRef.current = null;
        return;
      }

      const historyPromise = (async () => {
        try {
          return await container.writeHistory.add({
            url: threadUrl,
            res: 0,
            title: threadTitle,
            // 変更理由: レス番号確定前でも成功直後の離脱で履歴を失わないよう、
            // 入力値ベースの仮エントリを先に保存して後から確定情報へ更新する。
            name: payload.inputName,
            mail: payload.inputMail,
            inputName: payload.inputName,
            inputMail: payload.inputMail,
            message: payload.message,
            date: payload.submittedAt,
          });
        } catch (error) {
          console.error("[useOwnResTracking] 仮の書込履歴の保存に失敗しました", {
            threadUrl,
            error,
          });
          return null;
        }
      })();

      pendingWriteHistoryRef.current = {
        submittedAt: payload.submittedAt,
        promise: historyPromise,
      };
    };

    return subscribeThreadWriteCompleted(handleThreadWriteCompleted);
  }, [threadUrl, threadTitle]);

  // 変更理由: 通常レスとして一度描画してから印を付けるちらつきを防ぐため、描画前に照合する。
  useLayoutEffect(() => {
    if (!pendingWrite || responses.length === 0) return;

    const currentLastResNum = responses.at(-1)?.num ?? null;
    const hasAdvancedSinceSubmit =
      responses.length > pendingWrite.baselineResponseCount ||
      (pendingWrite.baselineLastResNum != null &&
        currentLastResNum != null &&
        currentLastResNum > pendingWrite.baselineLastResNum);
    if (!hasAdvancedSinceSubmit) return;

    const matchedRes = findLatestWrittenRes(responses, pendingWrite.message, ownResNums);
    if (!matchedRes) return;

    setPendingWrite(null);

    // 変更理由: DB 書き込みの完了を待つと強調反映が遅延するため、
    // レス番号確定直後に同期的に ownResNums へ反映して即時強調を保証する。
    setOwnResNums((prev) => {
      if (prev.has(matchedRes.num)) return prev;
      const next = new Set(prev);
      next.add(matchedRes.num);
      return next;
    });

    void (async () => {
      if (container.config.get("no_writehistory") !== "on") {
        try {
          const finalizedRecord = {
            url: threadUrl,
            res: matchedRes.num,
            title: threadTitle,
            name: stripHtml(matchedRes.name),
            mail: matchedRes.mail,
            inputName: pendingWrite.inputName,
            inputMail: pendingWrite.inputMail,
            message: pendingWrite.message,
            date: resolveWrittenResTimestamp(matchedRes),
          };

          const pendingHistory = pendingWriteHistoryRef.current;
          const provisionalHistoryId =
            pendingHistory?.submittedAt === pendingWrite.submittedAt
              ? await pendingHistory.promise
              : null;

          if (pendingHistory?.submittedAt === pendingWrite.submittedAt) {
            pendingWriteHistoryRef.current = null;
          }

          if (provisionalHistoryId != null) {
            await container.writeHistory.update({
              id: provisionalHistoryId,
              ...finalizedRecord,
            });
          } else {
            await container.writeHistory.add(finalizedRecord);
          }
        } catch (error) {
          console.error("[useOwnResTracking] 書込履歴の確定に失敗しました", { threadUrl, error });
          // 書込履歴の永続化に失敗しても、画面上の自分レス強調までは失わない。
        }
      }
    })();
  }, [ownResNums, threadUrl, threadTitle, pendingWrite, responses]);

  const handleWriteHistoryAdded = useCallback((resNum: number) => {
    setOwnResNums((prev) => {
      if (prev.has(resNum)) return prev;
      const next = new Set(prev);
      next.add(resNum);
      return next;
    });
  }, []);

  const handleWriteHistoryRemoved = useCallback((resNum: number) => {
    setOwnResNums((prev) => {
      if (!prev.has(resNum)) return prev;
      const next = new Set(prev);
      next.delete(resNum);
      return next;
    });
  }, []);

  return { ownResNums, handleWriteHistoryAdded, handleWriteHistoryRemoved };
}
