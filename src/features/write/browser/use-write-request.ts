import { useCallback } from "react";
import { useWriteSessionControls } from "src/features/write/browser/use-write-session";
import { useOptionalBottomPanel } from "src/view/browser/hooks/use-bottom-panel";
import { useToast } from "src/view/browser/hooks/use-toast";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";

export type WriteRequest = (text: string, threadUrl?: string) => void;

/**
 * 返信・引用から共有書き込みセッションへ入力を渡す。
 *
 * 変更理由: 共有書き込み窓を表示中は同じ入力欄を二重に出さず、窓へ下書きを渡す必要がある。
 * 下部パネルのない表示先では窓を開く必要もあるため、表示先と書き込み窓の状態をここで
 * 振り分ける。別窓へ移したタブも自前の下部パネルを持つので、窓の種類では分けない。
 */
export function useWriteRequest(): WriteRequest {
  const bottomPanel = useOptionalBottomPanel();
  const { isWindowOpen, selectedThreadUrl, selectThread, appendDraft, openWriteWindow } =
    useWriteSessionControls();
  const toast = useToast();
  const { window: viewWindow } = useViewSurface();

  return useCallback<WriteRequest>(
    (text, threadUrl) => {
      if (isWindowOpen || !bottomPanel) {
        if (isWindowOpen) {
          // 共有書き込み窓を表示中は、同じ入力欄を下部パネルにも残さない。
          bottomPanel?.closePanel();
        }
        const targetThreadUrl = threadUrl ?? selectedThreadUrl;
        if (targetThreadUrl) {
          selectThread(targetThreadUrl);
          appendDraft(targetThreadUrl, text);
        }
        if (!isWindowOpen) {
          const opened = openWriteWindow(viewWindow);
          if (opened === false) {
            // 下部パネルのない表示先では、ポップアップブロックを画面上でも伝える。
            toast.error("書き込み窓を開けませんでした。ポップアップ設定を確認してください");
          }
        }
        return;
      }

      bottomPanel.openWritePanelWithText(text, threadUrl);
    },
    [
      appendDraft,
      bottomPanel,
      isWindowOpen,
      openWriteWindow,
      selectThread,
      selectedThreadUrl,
      toast,
      viewWindow,
    ],
  );
}
