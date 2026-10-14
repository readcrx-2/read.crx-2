import { Clipboard, ExternalLink, ImagePlus, MoreVertical, Settings } from "lucide-react";
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { uploadImageToImgur } from "src/features/media/application/imgur-upload";
import { useMediaViewerStore } from "src/features/media/browser/use-media-viewer-store";
import { extractUrlsFromMessage, toViewerImageUrl } from "src/features/media/domain/url-media";
import { ExternalImage } from "src/features/media/ui/ExternalImage";
import { MediaViewerContainer } from "src/features/media/ui/MediaViewerContainer";
import { useTabStore } from "src/features/tabs/browser/use-tab-store";
import { useWrite } from "src/features/write/browser/use-write";
import {
  useWriteDraft,
  useWriteDraftActions,
  useWriteSessionControls,
} from "src/features/write/browser/use-write-session";
import { OperationStatusItem } from "src/view/browser/components/OperationStatusItem";
import { useOptionalBottomPanel } from "src/view/browser/hooks/use-bottom-panel";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";
import { useScopedConfigBooleanSetting } from "src/view/browser/hooks/use-scoped-config-boolean-setting";
import { useToast } from "src/view/browser/hooks/use-toast";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { Dialog } from "src/view/browser/ui/Dialog";
import { CheckboxField } from "src/view/browser/ui/FormControls";
import { copyText, readClipboardImage } from "src/view/browser/utils/clipboard";
import { sanitizeUrlsInText } from "src/view/browser/utils/url-tracking";
import { bindWriteConfirmationFrame } from "src/view/browser/utils/write-confirmation";
import { findUrlTrackingWarning, findWriteWarnings } from "src/view/browser/utils/write-warning";

const WRITE_SUBMIT_CTRL_ENTER_KEY = "write_submit_ctrl_enter";
const WRITE_CLOSE_PANEL_AFTER_SUBMIT_KEY = "write_close_panel_after_submit";
const WRITE_SANITIZE_URLS_ON_PASTE_KEY = "write_sanitize_urls_on_paste";
const noop = () => {};

export interface WritePanelContentProps {
  standalone?: boolean;
  onClose?: () => void;
  portalContainer?: HTMLElement | null;
}

export const WritePanelContent: React.FC<WritePanelContentProps> = (props) => {
  const bottomPanel = useOptionalBottomPanel();
  const { isWindowOpen, openWriteWindow, selectedThreadUrl, selectThread, appendDraft } =
    useWriteSessionControls();

  useEffect(() => {
    const request = bottomPanel?.writePanelInsertRequest;
    if (!isWindowOpen || !request) {
      return;
    }

    const targetThreadUrl = request.threadUrl ?? selectedThreadUrl;
    if (!targetThreadUrl) {
      return;
    }

    // 変更理由: 別窓を表示中はペイン側の書き込みUIをマウントしないため、
    // 返信要求を共有下書きへ移してから元のペイン側の要求を消費する。
    selectThread(targetThreadUrl);
    appendDraft(targetThreadUrl, request.text);
    bottomPanel.clearWritePanelInsertRequest(request.id);
  }, [appendDraft, bottomPanel, isWindowOpen, selectThread, selectedThreadUrl]);

  if (isWindowOpen && !props.standalone) {
    return (
      <div className="write-panel__detached-message">
        <span>書き込み欄は別窓で開いています。</span>
        <button
          type="button"
          className="write-panel__btn write-panel__btn--secondary"
          onClick={() => openWriteWindow()}
        >
          別窓を表示
        </button>
      </div>
    );
  }

  return <WritePanelEditor {...props} />;
};

const WritePanelEditor: React.FC<WritePanelContentProps> = ({
  standalone = false,
  onClose,
  portalContainer,
}) => {
  const { viewPage } = useTabStore();
  // 変更理由: 設定DialogのPortal先も書き込み窓と同じDocumentへ置き、別窓で
  // メイン窓のテーマ境界へ戻らないようにする。
  const viewSurface = useViewSurface();
  const toast = useToast();
  const { window: viewWindow, document: viewDocument } = viewSurface;
  const bottomPanel = useOptionalBottomPanel();
  const writePanelInsertRequest = standalone ? null : bottomPanel?.writePanelInsertRequest;
  const clearWritePanelInsertRequest = bottomPanel?.clearWritePanelInsertRequest ?? noop;
  const closePanel = standalone ? (onClose ?? noop) : (bottomPanel?.closePanel ?? onClose ?? noop);
  const {
    selectedThreadUrl,
    targets,
    selectThread,
    openWriteWindow,
    writeWindowFocusRequestId,
    consumeWriteWindowFocusRequest,
  } = useWriteSessionControls();
  const fallbackThreadUrl = viewPage.type === "thread" ? viewPage.threadUrl : "";
  const threadUrl = selectedThreadUrl ?? fallbackThreadUrl;
  const draft = useWriteDraft(threadUrl);
  const { setDraft } = useWriteDraftActions();
  const handleDraftChange = useCallback(
    (nextMessage: string) => setDraft(threadUrl, nextMessage),
    [setDraft, threadUrl],
  );
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const writePanelFocusRequestId = bottomPanel?.writePanelFocusRequestId ?? null;
  const imgurFileInputRef = useRef<HTMLInputElement | null>(null);
  const errorDialogDescriptionId = useId();
  const authCodeUrlInputId = useId();
  const authCodeInputId = useId();
  const settingsDialogDescriptionId = useId();
  const warningDialogDescriptionId = useId();
  const [dialogPortalContainer, setDialogPortalContainer] = useState<HTMLElement | null>(
    portalContainer ?? null,
  );
  const [isErrorDialogOpen, setIsErrorDialogOpen] = useState(false);
  const [isWarningDialogOpen, setIsWarningDialogOpen] = useState(false);
  const [writeWarnings, setWriteWarnings] = useState<ReturnType<typeof findWriteWarnings>>([]);
  const [isAuthCodeUrlCopied, setIsAuthCodeUrlCopied] = useState(false);
  const [isAuthCodeCopied, setIsAuthCodeCopied] = useState(false);
  const confirmationFrameCleanupRef = useRef<(() => void) | null>(null);
  // 変更理由: 書き込み中の入力欄を増やさず、書き込みに関する設定を
  // パネル内の歯車モーダルへまとめて、必要な時だけ変更できるようにする。
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const { value: submitWithCtrlEnter, setValue: setSubmitWithCtrlEnter } = useConfigBooleanSetting(
    WRITE_SUBMIT_CTRL_ENTER_KEY,
  );
  const { value: closePanelAfterSubmit, setValue: setClosePanelAfterSubmit } =
    useConfigBooleanSetting(WRITE_CLOSE_PANEL_AFTER_SUBMIT_KEY);
  const { value: sanitizeUrlsOnPaste, setValue: setSanitizeUrlsOnPaste } =
    useScopedConfigBooleanSetting(WRITE_SANITIZE_URLS_ON_PASTE_KEY, threadUrl);
  const {
    name,
    mail,
    sage,
    message,
    status,
    statusText,
    authCode,
    authCodeUrl,
    confirmationPage,
    canSubmit,
    iframeRef,
    setName,
    setMail,
    setSage,
    setMessage,
    submit,
    submitConfirmation,
    handleRetry,
  } = useWrite(threadUrl, {
    draft,
    onDraftChange: handleDraftChange,
    tabId: targets.find((target) => target.threadUrl === threadUrl)?.tabId,
  });
  // 変更理由: 投稿前確認はドメイン共通・板別の設定画面で上書きできるよう、投稿先URLの設定を解決する。
  const { value: preSubmitWarningsEnabled } = useScopedConfigBooleanSetting(
    "write_pre_submit_warnings",
    threadUrl,
  );

  const isSubmitting = status === "submitting";
  // 変更理由: 投稿前の本文から画像だけを既存ビューアへ渡し、URLの復元や
  // 複数画像の前後移動をレス表示と同じ規則で利用できるようにする。
  const previewImages = useMemo(
    () => extractUrlsFromMessage(message).filter((url) => toViewerImageUrl(url)),
    [message],
  );
  const previewId = useId();
  const mediaViewerScopeId = `write-preview:${previewId}:${threadUrl}`;
  const openMedia = useMediaViewerStore((state) => state.openMediaFromUrl);
  const messageRef = useRef(message);
  messageRef.current = message;
  const [isImgurUploading, setIsImgurUploading] = useState(false);
  const [imgurUploadStatus, setImgurUploadStatus] = useState<{
    type: "info" | "success" | "error";
    message: string;
  } | null>(null);
  const isConfirm = status === "confirm" || confirmationPage != null;
  const isConfirmationSubmitting = confirmationPage != null && isSubmitting;
  const writeErrorMessage = statusText || "書き込みに失敗しました";

  useEffect(() => {
    const requestId = standalone ? writeWindowFocusRequestId : writePanelFocusRequestId;
    if (requestId == null) {
      return;
    }

    const frameId = viewWindow.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }

      // パネルを開いた描画が終わってからフォーカスし、ユーザーがすぐ入力できる状態にする。
      textarea.focus({ preventScroll: true });
      if (standalone) {
        consumeWriteWindowFocusRequest(requestId);
      } else {
        bottomPanel?.consumeWritePanelFocusRequest(requestId);
      }
    });

    return () => viewWindow.cancelAnimationFrame(frameId);
  }, [
    bottomPanel,
    consumeWriteWindowFocusRequest,
    standalone,
    viewWindow,
    writePanelFocusRequestId,
    writeWindowFocusRequestId,
  ]);
  const uploadStatusIsVisible =
    isImgurUploading ||
    imgurUploadStatus?.type === "success" ||
    imgurUploadStatus?.type === "error";
  // 認証手順は専用ダイアログで案内し、ステータスバーには同じ案内を残さない。
  const statusBarMessage = uploadStatusIsVisible
    ? (imgurUploadStatus?.message ?? "Imgurに投稿しています...")
    : status === "idle" || (status === "error" && authCodeUrl != null)
      ? null
      : statusText || (status === "error" ? writeErrorMessage : null);
  const statusBarIsError = uploadStatusIsVisible
    ? imgurUploadStatus?.type === "error"
    : status === "error";
  const statusBarIsBusy = isImgurUploading || status === "submitting";

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
        console.error("[ImgurUpload] 画像の投稿に失敗しました", error);
        setImgurUploadStatus({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setIsImgurUploading(false);
      }
    },
    [isImgurUploading, isSubmitting, setDraft, setMessage, threadUrl, viewWindow],
  );

  const handlePasteClipboardImage = useCallback(() => {
    void runImgurUpload(() => readClipboardImage(viewSurface));
  }, [runImgurUpload, viewSurface]);

  const requestSubmit = useCallback(() => {
    if (!canSubmit || isSubmitting) return;
    // 変更理由: 設定をOFFにした場合は投稿前の個人情報チェックと確認ダイアログを省略する。
    if (!preSubmitWarningsEnabled) {
      void submit();
      return;
    }
    const warnings = findWriteWarnings([name, mail, message]);
    const trackingWarning = findUrlTrackingWarning(message);
    if (trackingWarning) warnings.push(trackingWarning);
    if (warnings.length > 0) {
      setWriteWarnings(warnings);
      setIsWarningDialogOpen(true);
      return;
    }
    void submit();
  }, [canSubmit, isSubmitting, mail, message, name, preSubmitWarningsEnabled, submit]);

  const handleMessagePaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      // 変更理由: 板・ドメインで自動除去をOFFにした場合は、貼り付け文字列をそのまま編集欄へ渡す。
      if (!sanitizeUrlsOnPaste) return;
      const pastedText = event.clipboardData.getData("text/plain");
      const result = sanitizeUrlsInText(pastedText);
      if (result.removedParameters.length === 0) return;

      event.preventDefault();
      const textarea = event.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const nextMessage = `${message.slice(0, start)}${result.text}${message.slice(end)}`;
      const nextCaret = start + result.text.length;

      // 変更理由: 追跡値を除去した貼り付け内容を下書きにも保存し、キャレット位置を維持する。
      setMessage(nextMessage);
      toast.success("貼り付け時にURLパラメータを除去しました");
      viewWindow.requestAnimationFrame(() => {
        if (textarea.isConnected) textarea.setSelectionRange(nextCaret, nextCaret);
      });
    },
    [message, sanitizeUrlsOnPaste, setMessage, toast, viewWindow],
  );

  const removeTrackingParametersAndSubmit = useCallback(() => {
    const result = sanitizeUrlsInText(message);
    if (result.removedParameters.length === 0) return;

    // 変更理由: 除去を選んだ場合も編集欄へ反映し、実際の送信本文と表示内容を一致させる。
    setMessage(result.text);
    toast.success("URLパラメータを除去しました");
    const remainingWarnings = findWriteWarnings([name, mail, result.text]);
    const trackingWarning = findUrlTrackingWarning(result.text);
    if (trackingWarning) remainingWarnings.push(trackingWarning);
    setWriteWarnings(remainingWarnings);

    if (remainingWarnings.length === 0) {
      setIsWarningDialogOpen(false);
      void submit(result.text);
    }
  }, [mail, message, name, setMessage, submit, toast]);

  const confirmWarningSubmit = useCallback(() => {
    setIsWarningDialogOpen(false);
    void submit();
  }, [submit]);

  const handleOpenWriteWindow = useCallback(() => {
    // 別窓のReactツリーを先に作成し、現在の下部パネルは表示場所の重複を避けて閉じる。
    // 戻り値がfalseのときはポップアップがブロックされたため、入力欄を残す。
    const opened = openWriteWindow();
    if (opened !== false) {
      closePanel();
    }
  }, [closePanel, openWriteWindow]);

  useEffect(() => {
    setIsAuthCodeUrlCopied(false);
    setIsAuthCodeCopied(false);
  }, [authCode, authCodeUrl]);

  const handleCopyAuthCode = useCallback(async () => {
    if (!authCode) return;
    try {
      await copyText(authCode, viewSurface);
      setIsAuthCodeCopied(true);
      toast.success("認証コードをコピーしました");
    } catch (error) {
      console.error("eddibbの認証コードをコピーできませんでした", error);
      toast.error("認証コードをコピーできませんでした");
    }
  }, [authCode, toast, viewSurface]);

  const handleCopyAuthCodeUrl = useCallback(async () => {
    if (!authCodeUrl) return;
    try {
      await copyText(authCodeUrl, viewSurface);
      setIsAuthCodeUrlCopied(true);
      toast.success("認証URLをコピーしました");
    } catch (error) {
      console.error("eddibbの認証URLをコピーできませんでした", error);
      toast.error("認証URLをコピーできませんでした");
    }
  }, [authCodeUrl, toast, viewSurface]);

  const handleConfirmationFrameLoad = useCallback(() => {
    confirmationFrameCleanupRef.current?.();
    confirmationFrameCleanupRef.current = null;
    if (!confirmationPage || !iframeRef.current) return;

    confirmationFrameCleanupRef.current = bindWriteConfirmationFrame(
      iframeRef.current,
      (submission) => void submitConfirmation(submission),
    );
  }, [confirmationPage, iframeRef, submitConfirmation]);

  useEffect(() => {
    return () => {
      confirmationFrameCleanupRef.current?.();
      confirmationFrameCleanupRef.current = null;
    };
  }, [confirmationPage]);

  useEffect(() => {
    // テーマトークンは `.browser-shell[data-theme]` にスコープされるため、
    // body直下のPortalではダークテーマのsurface/textを継承できない。
    setDialogPortalContainer(
      portalContainer ?? viewDocument.querySelector<HTMLElement>(".browser-shell"),
    );
  }, [portalContainer, viewDocument]);

  useEffect(() => {
    // 変更理由: 通常のエラーはステータスバーへ集約し、認証URLが必要な場合だけ
    // コピー操作を提供するDialogを開く。
    setIsErrorDialogOpen(status === "error" && authCodeUrl != null);
  }, [authCodeUrl, status]);

  useEffect(() => {
    if (status !== "success" || !closePanelAfterSubmit) {
      return;
    }

    // 変更理由: 投稿成功を受け取った後だけ閉じることで、通信失敗や確認画面の途中で
    // 入力内容を隠さず、設定をONにした利用者の連続投稿だけを短くできる。
    closePanel();
  }, [closePanel, closePanelAfterSubmit, status]);

  useEffect(() => {
    if (!writePanelInsertRequest) {
      return;
    }

    const requestThreadUrl = writePanelInsertRequest.threadUrl;
    if (
      requestThreadUrl &&
      requestThreadUrl !== threadUrl &&
      targets.some((target) => target.threadUrl === requestThreadUrl)
    ) {
      // 返信操作が発生したペインと書き込み欄の表示場所が異なる場合でも、
      // 先に対象スレを選び、次の描画でそのスレの下書きへ追記する。
      selectThread(requestThreadUrl);
      return;
    }

    const separator = message === "" || message.endsWith("\n") ? "" : "\n";
    // 変更理由: 右クリックからの返信文は現在の下書きへ自然に追記し、
    // 毎回置き換えるより「開いて貼り付けた」感覚に近い挙動へ揃える。
    const nextMessage = `${message}${separator}${writePanelInsertRequest.text}`;
    setMessage(nextMessage);
    clearWritePanelInsertRequest(writePanelInsertRequest.id);

    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.focus();
    const caretPosition = nextMessage.length;
    textarea.setSelectionRange(caretPosition, caretPosition);
  }, [
    clearWritePanelInsertRequest,
    message,
    selectThread,
    setMessage,
    targets,
    threadUrl,
    writePanelInsertRequest,
  ]);

  const handleTextareaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape") {
        // IME確定など他のEscapeと区別せず、素直にパネルを閉じる。
        closePanel();
        return;
      }

      if (
        !submitWithCtrlEnter ||
        isSubmitting ||
        !canSubmit ||
        e.key !== "Enter" ||
        !(e.ctrlKey || e.metaKey)
      ) {
        return;
      }

      // textarea の改行より投稿を優先し、送信ショートカットとして一貫動作させる。
      e.preventDefault();
      requestSubmit();
    },
    [canSubmit, closePanel, isSubmitting, requestSubmit, submitWithCtrlEnter],
  );

  const handleSubmitWithCtrlEnterChange = useCallback(
    (checked: boolean) => {
      setSubmitWithCtrlEnter(checked);
    },
    [setSubmitWithCtrlEnter],
  );

  const handleSageChange = useCallback(
    (checked: boolean) => {
      setSage(checked);
    },
    [setSage],
  );

  const handleClosePanelAfterSubmitChange = useCallback(
    (checked: boolean) => {
      setClosePanelAfterSubmit(checked);
    },
    [setClosePanelAfterSubmit],
  );

  return (
    <div className="write-panel">
      {/* 書き込みと画像投稿も取得中の表示と同じ部品を使い、エラー表示の仕様を揃える。 */}
      <OperationStatusItem
        id="write-operation-status"

        message={statusBarMessage}
        busy={statusBarIsBusy}
        isError={statusBarIsError}
      />
      <form
        className={`write-panel__form${isConfirm ? " write-panel__form--confirm" : ""}`}
        onSubmit={(event) => {
          event.preventDefault();
          requestSubmit();
        }}
      >
        {isConfirm && (
          <div className="write-panel__confirm-bar">
            <span>{statusText}</span>
            <button
              type="button"
              className="write-panel__btn write-panel__btn--secondary"
              onClick={handleRetry}
              disabled={isConfirmationSubmitting}
            >
              戻る
            </button>
          </div>
        )}
        {!isConfirm && (
          <>
            {standalone && targets.length > 0 && (
              // 投稿先の切り替えは共有書き込み窓の役割に限定し、各ペインの下部パネルは
              // 表示中スレッドへそのまま投稿する簡潔な入力欄として保つ。
              <label className="write-panel__target-group">
                <span className="write-panel__field-label">投稿先</span>
                <select
                  className="write-panel__target-select"
                  value={selectedThreadUrl ?? ""}
                  onChange={(event) => selectThread(event.currentTarget.value)}
                  disabled={isSubmitting || isImgurUploading}
                  aria-label="投稿先スレッド"
                >
                  {targets.map((target) => (
                    <option key={target.threadUrl} value={target.threadUrl}>
                      {target.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="write-panel__header-row">
              <label className="write-panel__field-group">
                <span className="write-panel__field-label">名前</span>
                <input
                  className="write-panel__input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="名無し"
                />
              </label>
              <label className="write-panel__field-group write-panel__field-group--grow">
                <span className="write-panel__field-label">メール</span>
                <input
                  className="write-panel__input"
                  type="text"
                  value={sage ? "sage" : mail}
                  onChange={(e) => setMail(e.target.value)}
                  disabled={isSubmitting || sage}
                  placeholder=""
                />
              </label>
              {/* 投稿操作を入力欄の行へ寄せ、本文欄の縦幅を確保する。 */}
              <details className="write-panel__menu">
                <summary
                  className="write-panel__menu-trigger"
                  aria-label="その他の操作"
                  title="その他の操作"
                >
                  <MoreVertical size={16} aria-hidden="true" />
                </summary>
                <div className="write-panel__menu-items">
                  <button
                    type="button"
                    className="write-panel__menu-item"
                    onClick={(event) => {
                      event.currentTarget.closest("details")?.removeAttribute("open");
                      setIsSettingsDialogOpen(true);
                    }}
                    disabled={isSubmitting || isImgurUploading}
                  >
                    <Settings size={14} aria-hidden="true" />
                    <span>書き込み設定</span>
                  </button>
                  {!standalone && (
                    <button
                      type="button"
                      className="write-panel__menu-item"
                      onClick={(event) => {
                        event.currentTarget.closest("details")?.removeAttribute("open");
                        handleOpenWriteWindow();
                      }}
                      disabled={isSubmitting || isImgurUploading}
                    >
                      <ExternalLink size={14} aria-hidden="true" />
                      <span>書き込みを別窓で開く</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="write-panel__menu-item"
                    onClick={(event) => {
                      event.currentTarget.closest("details")?.removeAttribute("open");
                      imgurFileInputRef.current?.click();
                    }}
                    disabled={isSubmitting || isImgurUploading || !threadUrl}
                  >
                    <ImagePlus size={14} aria-hidden="true" />
                    <span>ローカル画像をImgurに投稿</span>
                  </button>
                  <button
                    type="button"
                    className="write-panel__menu-item"
                    onClick={(event) => {
                      event.currentTarget.closest("details")?.removeAttribute("open");
                      handlePasteClipboardImage();
                    }}
                    disabled={isSubmitting || isImgurUploading || !threadUrl}
                  >
                    <Clipboard size={14} aria-hidden="true" />
                    <span>クリップボード画像をImgurに投稿</span>
                  </button>
                </div>
              </details>
              <input
                ref={imgurFileInputRef}
                className="write-panel__file-input"
                type="file"
                accept="image/*"
                aria-label="Imgurに投稿する画像を選択"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void runImgurUpload(async () => file);
                }}
              />
            </div>
            <div className="write-panel__body-row">
              <textarea
                ref={textareaRef}
                className="write-panel__textarea"
                value={message}
                onPaste={handleMessagePaste}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                disabled={isSubmitting || isImgurUploading}
                placeholder={threadUrl ? "本文を入力..." : "スレッドを開いてから書き込んでください"}
              />
              <div className="write-panel__side">
                <button
                  type="submit"
                  className="write-panel__btn write-panel__btn--primary"
                  disabled={!canSubmit || isSubmitting || isImgurUploading}
                >
                  書き込む
                </button>
                {status === "error" && (
                  <button
                    type="button"
                    className="write-panel__btn write-panel__btn--secondary"
                    onClick={handleRetry}
                  >
                    再入力
                  </button>
                )}
              </div>
            </div>
            {previewImages.length > 0 && (
              <div
                className="write-panel__image-previews"
                role="group"
                aria-label="投稿画像のプレビュー"
              >
                {/* 変更理由: 本文内の画像を投稿前に見分けて選べるよう、サムネイルから
                    選んだ画像を開き、ビューアでは本文順に前後移動できるようにする。 */}
                {previewImages.map((url, index) => (
                  <button
                    key={url}
                    type="button"
                    className="write-panel__image-preview"
                    aria-label={`画像${index + 1}をプレビュー`}
                    title={url}
                    onClick={() => openMedia(url, previewImages, mediaViewerScopeId)}
                  >
                    <ExternalImage src={toViewerImageUrl(url) ?? url} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <iframe
          ref={iframeRef}
          className={`write-panel__iframe${isConfirm ? " write-panel__iframe--visible" : ""}`}
          title={isConfirm ? "書き込み確認" : "write-iframe"}
          aria-hidden={!isConfirm}
          {...(confirmationPage
            ? {
                srcDoc: confirmationPage.html,
                sandbox: "allow-same-origin",
                referrerPolicy: "no-referrer" as const,
                onLoad: handleConfirmationFrameLoad,
              }
            : {})}
        />
      </form>
      {/* 変更理由: パネルの切り抜きや重なり順に制限されず、別窓でも同じ画面内で表示する。 */}
      {createPortal(
        <MediaViewerContainer scopeId={mediaViewerScopeId} />,
        dialogPortalContainer ?? viewDocument.body,
      )}
      <Dialog.Root open={isWarningDialogOpen} onOpenChange={setIsWarningDialogOpen}>
        <Dialog.Portal container={dialogPortalContainer ?? undefined}>
          <Dialog.Overlay className="browser-dialog-overlay" />
          <Dialog.Content
            className="browser-dialog-content write-panel__warning-dialog"
            aria-describedby={warningDialogDescriptionId}
          >
            <Dialog.Title className="browser-dialog-title">投稿内容を確認してください</Dialog.Title>
            <Dialog.Description
              id={warningDialogDescriptionId}
              className="browser-dialog-description"
            >
              公開したくない情報や、共有元の計測に使われるURLパラメータが含まれている可能性があります。
              投稿前に内容を確認してください。
            </Dialog.Description>
            <ul className="write-panel__warning-list">
              {writeWarnings.map((warning) => (
                <li key={warning.category}>
                  <strong>{warning.category}</strong>: {warning.reason}
                </li>
              ))}
            </ul>
            <div className="write-panel__error-dialog-actions">
              <Dialog.Close asChild>
                <button type="button" className="write-panel__btn write-panel__btn--secondary">
                  内容を見直す
                </button>
              </Dialog.Close>
              {writeWarnings.some((warning) => warning.category === "URLの追跡パラメータ") && (
                <button
                  type="button"
                  className="write-panel__btn write-panel__btn--secondary"
                  onClick={removeTrackingParametersAndSubmit}
                >
                  URLパラメータを除去して投稿
                </button>
              )}
              <button
                type="button"
                className="write-panel__btn write-panel__btn--primary"
                onClick={confirmWarningSubmit}
              >
                無視して投稿
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={isSettingsDialogOpen} onOpenChange={setIsSettingsDialogOpen}>
        <Dialog.Portal container={dialogPortalContainer ?? undefined}>
          <Dialog.Overlay className="browser-dialog-overlay" />
          <Dialog.Content
            className="browser-dialog-content write-panel__settings-dialog"
            aria-describedby={settingsDialogDescriptionId}
          >
            <Dialog.Title className="browser-dialog-title">書き込み設定</Dialog.Title>
            <Dialog.Description
              id={settingsDialogDescriptionId}
              className="browser-dialog-description"
            >
              書き込みパネルの操作と投稿後の動作を設定します。
            </Dialog.Description>
            <div className="write-panel__settings-list">
              <CheckboxField
                id="write-setting-submit-ctrl-enter"
                label="Ctrl+Enterで書き込む"
                description="本文入力中にCtrl+Enter（Macは⌘+Enter）で投稿します。"
                checked={submitWithCtrlEnter}
                onCheckedChange={handleSubmitWithCtrlEnterChange}
              />
              <CheckboxField
                id="write-setting-sage"
                label="sageで書き込む"
                description="ONにすると、メール欄へsageを自動設定して投稿します。"
                checked={sage}
                onCheckedChange={handleSageChange}
              />
              <CheckboxField
                id="write-setting-close-panel"
                label="レス後に書き込みパネルを閉じる"
                description="投稿が成功したときだけ、下部の書き込みパネルを閉じます。"
                checked={closePanelAfterSubmit}
                onCheckedChange={handleClosePanelAfterSubmitChange}
              />
              <CheckboxField
                id="write-setting-sanitize-urls-on-paste"
                label="貼り付け時にURLパラメータを除去する"
                description="投稿先に応じて適用します。全体・ドメイン・板ごとの値はドメイン・板設定で変更できます。"
                checked={sanitizeUrlsOnPaste}
                onCheckedChange={setSanitizeUrlsOnPaste}
              />
            </div>
            <div className="write-panel__settings-actions">
              <Dialog.Close asChild>
                <button type="button" className="write-panel__btn write-panel__btn--secondary">
                  閉じる
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={status === "error" && isErrorDialogOpen}
        onOpenChange={(open) => {
          setIsErrorDialogOpen(open);
          // 閉じる・Esc・背景クリックでも認証案内を解除し、ステータスバーへ残し続けない。
          if (!open) handleRetry();
        }}
      >
        <Dialog.Portal container={dialogPortalContainer ?? undefined}>
          <Dialog.Overlay className="browser-dialog-overlay" />
          <Dialog.Content
            className="browser-dialog-content write-panel__error-dialog"
            aria-describedby={errorDialogDescriptionId}
          >
            <Dialog.Title className="browser-dialog-title">認証を完了してください</Dialog.Title>
            <Dialog.Description
              id={errorDialogDescriptionId}
              className="browser-dialog-description"
            >
              認証コードを認証ページで入力してトークンを発行し、メール欄へ貼り付けてから再入力してください。
            </Dialog.Description>
            {/* 変更理由: ステータスバーへ流れていた認証コードを、選択・コピーしやすい認証手順内へ移す。 */}
            {authCode && (
              <div className="write-panel__auth-url">
                <label htmlFor={authCodeInputId}>認証コード</label>
                <textarea
                  id={authCodeInputId}
                  className="write-panel__auth-url-input"
                  value={authCode}
                  readOnly
                  rows={1}
                  onFocus={(event) => event.currentTarget.select()}
                  aria-label="認証コード"
                />
                <button
                  type="button"
                  className="write-panel__btn write-panel__btn--secondary"
                  onClick={() => void handleCopyAuthCode()}
                >
                  {isAuthCodeCopied ? "コピーしました" : "コードをコピー"}
                </button>
              </div>
            )}
            {authCodeUrl && (
              <div className="write-panel__auth-url">
                <label htmlFor={authCodeUrlInputId}>認証ページURL</label>
                <textarea
                  id={authCodeUrlInputId}
                  className="write-panel__auth-url-input"
                  value={authCodeUrl}
                  readOnly
                  rows={2}
                  onFocus={(event) => event.currentTarget.select()}
                  aria-label="認証ページURL"
                />
                <button
                  type="button"
                  className="write-panel__btn write-panel__btn--secondary"
                  onClick={() => void handleCopyAuthCodeUrl()}
                >
                  {isAuthCodeUrlCopied ? "コピーしました" : "URLをコピー"}
                </button>
              </div>
            )}
            <div className="write-panel__error-dialog-actions">
              <Dialog.Close asChild>
                <button type="button" className="write-panel__btn write-panel__btn--secondary">
                  閉じる
                </button>
              </Dialog.Close>
              <Dialog.Close asChild>
                <button type="button" className="write-panel__btn write-panel__btn--primary">
                  再入力
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
