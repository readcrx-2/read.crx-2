import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { createLogger } from "src/app/logger";
import { uploadImageToImgur } from "src/features/media/application/imgur-upload";
import type { ViewSurface } from "src/view/browser/hooks/use-view-surface";
import { readClipboardImage } from "src/view/browser/utils/clipboard";

const logger = createLogger("write");

export interface ImgurUploadStatus {
  type: "info" | "success" | "error";
  message: string;
}

interface UseImgurUploadParams {
  threadUrl: string;
  message: string;
  isSubmitting: boolean;
  setMessage: (message: string) => void;
  setDraft: (threadUrl: string, message: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  viewSurface: ViewSurface;
}

/** 書き込み欄の画像をImgurへ投稿し、得られたURLを本文の末尾へ追加する。 */
export function useImgurUpload({
  threadUrl,
  message,
  isSubmitting,
  setMessage,
  setDraft,
  textareaRef,
  viewSurface,
}: UseImgurUploadParams) {
  const { window: viewWindow } = viewSurface;
  const messageRef = useRef(message);
  messageRef.current = message;
  const [isImgurUploading, setIsImgurUploading] = useState(false);
  const [imgurUploadStatus, setImgurUploadStatus] = useState<ImgurUploadStatus | null>(null);

  useEffect(() => {
    if (!imgurUploadStatus || imgurUploadStatus.type === "info") return;
    // 変更理由: 完了・失敗は次の操作を始めるまで数秒だけ残し、古い結果が
    // 新しい作業状況に見え続けないようにする。
    const timer = viewWindow.setTimeout(() => setImgurUploadStatus(null), 5_000);
    return () => viewWindow.clearTimeout(timer);
  }, [imgurUploadStatus, viewWindow]);

  const runImgurUpload = useCallback(
    async (getImage: () => Promise<Blob>) => {
      if (isSubmitting || isImgurUploading) return;
      const uploadThreadUrl = threadUrl;
      const originalMessage = messageRef.current;
      setImgurUploadStatus({ type: "info", message: "画像を準備しています..." });
      setIsImgurUploading(true);
      try {
        const image = await getImage();
        setImgurUploadStatus({ type: "info", message: "Imgurに投稿しています..." });
        const imageUrl = await uploadImageToImgur(image);
        const separator = originalMessage === "" || originalMessage.endsWith("\n") ? "" : "\n";
        const nextMessage = `${originalMessage}${separator}${imageUrl}\n`;

        // 変更理由: 投稿中に投稿先が切り替わっても、画像URLを別スレの本文へ混ぜない。
        if (threadUrl === uploadThreadUrl) {
          messageRef.current = nextMessage;
          setMessage(nextMessage);
          // Reactの本文反映後にカーソルを末尾へ置き、URLの続きから入力できるようにする。
          viewWindow.requestAnimationFrame(() => {
            const textarea = textareaRef.current;
            if (!textarea) return;
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
          });
        } else if (uploadThreadUrl) {
          setDraft(uploadThreadUrl, nextMessage);
        }
        setImgurUploadStatus({ type: "success", message: "画像を投稿し、URLを本文に追加しました" });
      } catch (error) {
        logger.error("画像の投稿に失敗しました", error);
        setImgurUploadStatus({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setIsImgurUploading(false);
      }
    },
    [isImgurUploading, isSubmitting, setDraft, setMessage, textareaRef, threadUrl, viewWindow],
  );

  const handlePasteClipboardImage = useCallback(() => {
    void runImgurUpload(() => readClipboardImage(viewSurface));
  }, [runImgurUpload, viewSurface]);

  return { isImgurUploading, imgurUploadStatus, runImgurUpload, handlePasteClipboardImage };
}
