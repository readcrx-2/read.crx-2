import { useEffect, useRef } from "react";
import { createLogger } from "src/app/logger";
import type { CommentOverlayController } from "src/features/comment-overlay/application/controller";
import type { IRes } from "src/service-container/interfaces";

const logger = createLogger("view/browser");

type CommentOverlaySyncController = Pick<
  CommentOverlayController,
  "syncThread" | "getSnapshot" | "stop"
>;

interface UseCommentOverlaySyncOptions {
  controller: CommentOverlaySyncController;
  threadUrl: string;
  responses: readonly IRes[];
  isActive: boolean;
  isAutoRefreshEnabled: boolean;
  ownResponseNumbers?: ReadonlySet<number>;
}

/** 表示中ThreadPageの確定snapshotを実況controllerへ共有し、終了条件を伝える。 */
export function useCommentOverlaySync({
  controller,
  threadUrl,
  responses,
  isActive,
  isAutoRefreshEnabled,
  ownResponseNumbers,
}: UseCommentOverlaySyncOptions): void {
  const previousRefreshRef = useRef({ threadUrl, enabled: isAutoRefreshEnabled });

  useEffect(() => {
    const previous = previousRefreshRef.current;
    previousRefreshRef.current = { threadUrl, enabled: isAutoRefreshEnabled };
    if (previous.threadUrl !== threadUrl || !previous.enabled || isAutoRefreshEnabled) return;

    const { state } = controller.getSnapshot();
    if (state.status !== "running" || state.targetThreadUrl !== threadUrl) return;

    // 自動更新のOFFをどのUIから操作しても実況を止める。初期OFFや別スレへの移動では
    // 停止せず、非表示タブでも実況対象スレッドのONからOFFへの変化だけを扱う。
    void controller.stop().catch((error: unknown) => {
      logger.error("自動更新停止に伴うコメント実況の停止に失敗しました:", error);
    });
  }, [controller, isAutoRefreshEnabled, threadUrl]);

  useEffect(() => {
    if (!isActive) return;

    // 取得結果の共有だけを行い、実況中でない場合の差分計算・送信はcontroller側で止める。
    if (ownResponseNumbers == null) {
      controller.syncThread(threadUrl, responses);
      return;
    }
    // 変更理由: own判定を同じsnapshotと一緒にcontrollerへ渡し、
    // Overlayでも自分のレスを本文側と同じ黄色枠で流せるようにする。
    controller.syncThread(threadUrl, responses, { ownResponseNumbers });
  }, [controller, isActive, ownResponseNumbers, responses, threadUrl]);
}
