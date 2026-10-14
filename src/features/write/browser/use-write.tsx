import {
  getWriteFormData,
  isWriteAuthToken,
  resolveWriteAuthCodeUrl,
} from "packages/chlib/src/index";
import { type FormEvent, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { platform } from "src/app";
import { wait } from "src/app/Defer";
import { isTauriRuntime } from "src/app/platform/runtime";
import type { HttpResponse, WriteFormData, WriteFormField } from "src/app/platform/types";
import { getStore2String, setStore2String } from "src/app/Store2Storage";
import { container } from "src/service-container/index";
import { useScopedConfigBooleanSetting } from "src/view/browser/hooks/use-scoped-config-boolean-setting";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import {
  notifyThreadWriteCompleted,
  notifyThreadWriteStarted,
  type PendingWritePayload,
  resolveWriteSuccessDelayMs,
} from "src/view/browser/utils/thread-write-sync";
import {
  createWriteConfirmationPage,
  type WriteConfirmationPage,
  type WriteConfirmationSubmission,
} from "src/view/browser/utils/write-confirmation";
import { classifyWriteResult, type WriteResultMessage } from "src/view/browser/utils/write-result";

// -----------------------------------------------------------------------
// 定数
// -----------------------------------------------------------------------
const NAME_KEY = "chlens_write_name";
const MAIL_KEY = "chlens_write_mail";
// sageの切り替えは投稿ごとではなく書き込み設定モーダルで管理し、パネルを簡潔に保つ。
const SAGE_CONFIG_KEY = "sage_flag";
// cs_write.js が ping に対して期待する応答文字列
const PONG_MSG = "write_iframe_pong";
// postMessage を受け取れない環境でも「書き込み中...」で固着しないための上限待機時間
const SUBMIT_WATCHDOG_MS = 20_000;

// -----------------------------------------------------------------------
// 型
// -----------------------------------------------------------------------
export type WriteStatus = "idle" | "submitting" | "confirm" | "success" | "error";

export interface UseWriteResult {
  name: string;
  mail: string;
  sage: boolean;
  message: string;
  status: WriteStatus;
  statusText: string;
  authCode: string | null;
  authCodeUrl: string | null;
  confirmationPage: WriteConfirmationPage | null;
  canSubmit: boolean;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  setName: (v: string) => void;
  setMail: (v: string) => void;
  setSage: (v: boolean) => void;
  setMessage: (v: string) => void;
  submit: (messageOverride?: string) => Promise<void>;
  submitConfirmation: (submission: WriteConfirmationSubmission) => Promise<void>;
  handleSubmit: (e: FormEvent) => Promise<void>;
  handleRetry: () => void;
}

export interface UseWriteOptions {
  /** 投稿先を切り替えたときに復元する、スレッド単位の下書き。 */
  draft?: string;
  /** 下書きの変更を表示場所の外に保存するための通知。 */
  onDraftChange?: (message: string) => void;
  /** 共有書き込み窓から再取得する対象タブ。 */
  tabId?: string;
}

// -----------------------------------------------------------------------
// 純粋関数: BBS種別に応じたフォームデータを組み立てる
// submit_res.js の _getFormData に相当
// -----------------------------------------------------------------------
function buildFormData(
  threadUrl: string,
  name: string,
  mail: string,
  message: string,
): WriteFormData | null {
  // 変更理由: 投稿先ごとのURL形式・項目名・文字コードをUI側へ重複させず、chlibでフォーム仕様を解決する。
  return getWriteFormData(threadUrl, {
    name,
    mail,
    message,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
}

// -----------------------------------------------------------------------
// 純粋関数: declarativeNetRequest でリクエストヘッダーを書き換える
// (プラットフォーム抽象化レイヤーへ委譲)
// -----------------------------------------------------------------------
async function setupHeaderModifier(formAction: string): Promise<void> {
  await platform.http.setupWriteHeaders(formAction);
}

export function parseTauriWriteResult(
  response: HttpResponse,
  fallbackUrl: string,
  expectedAction: string,
  charset: string,
): WriteResultMessage | null {
  const resultDocument = new DOMParser().parseFromString(response.body, "text/html");
  const refreshContent = Array.from(resultDocument.getElementsByTagName("meta"))
    .find((element) => element.httpEquiv?.toLowerCase() === "refresh")
    ?.getAttribute("content");
  const fontText = Array.from(
    resultDocument.getElementsByTagName("font"),
    (font) => font.textContent ?? "",
  ).join("\n");
  const errorCode = Array.from(resultDocument.getElementsByTagName("meta"))
    .find((element) => element.getAttribute("name")?.toLowerCase() === "error_code")
    ?.getAttribute("content")
    ?.trim();

  const result = classifyWriteResult({
    url: response.url || fallbackUrl,
    title: resultDocument.title,
    bodyText: resultDocument.body?.textContent ?? resultDocument.documentElement.textContent ?? "",
    fontText,
    refreshContent: refreshContent ?? undefined,
    errorCode: errorCode || undefined,
  });

  if (result?.type === "confirm") {
    return {
      ...result,
      page: createWriteConfirmationPage(
        response.body,
        response.url || fallbackUrl,
        expectedAction,
        charset,
      ),
    };
  }

  return result;
}

interface TauriWriteRequest {
  action: string;
  charset: string;
  fields: readonly WriteFormField[];
  referer: string;
  bootstrapUrl?: string;
}

async function submitTauriWrite(
  request: TauriWriteRequest,
  expectedAction: string,
): Promise<WriteResultMessage> {
  const { encodeWriteFields } = await import("src/app/platform/tauri/WriteForm");
  const { fetchTauriWrite } = await import("src/app/platform/tauri/WriteTransport");
  const mail = request.fields.find((field) => field.name === "mail")?.value ?? "";
  const response = await fetchTauriWrite({
    action: request.action,
    bootstrapUrl: request.bootstrapUrl,
    referer: request.referer,
    userAgent: container.config.get("useragent"),
    // eddibbはCookieをメール欄のトークンより優先するため、明示したトークンで再認証するときは古いCookieを送らない。
    excludedCookies: isWriteAuthToken(request.action, mail) ? ["edge-token"] : [],
    body: encodeWriteFields(request.fields, request.charset),
    charset: request.charset,
  });

  const result = parseTauriWriteResult(response, request.action, expectedAction, request.charset);
  if (result != null) {
    return result;
  }

  return {
    type: "error",
    message: `書き込み結果を判定できませんでした (HTTP ${response.status})`,
  };
}

// -----------------------------------------------------------------------
// フック本体
// -----------------------------------------------------------------------
export function useWrite(threadUrl: string, options: UseWriteOptions = {}): UseWriteResult {
  const { draft, onDraftChange, tabId } = options;
  const { dispatch } = useTabStore();
  // 変更理由: 別窓のiframe通知・送信監視・成功表示のタイマーを、書き込み窓自身の
  // Windowへ登録し、メイン窓のライフサイクルに依存しないようにする。
  const { window: viewWindow } = useViewSurface();

  const [name, setNameState] = useState(
    () => getStore2String(NAME_KEY) ?? container.config.get("default_name") ?? "",
  );
  const [mail, setMailState] = useState(
    () => getStore2String(MAIL_KEY) ?? container.config.get("default_mail") ?? "",
  );
  // 板ごとのsage上書きを投稿時にも適用し、設定画面で選んだ値と投稿欄の表示を一致させる。
  const { value: sage, setValue: setSage } = useScopedConfigBooleanSetting(
    SAGE_CONFIG_KEY,
    threadUrl,
  );
  const [message, setMessageState] = useState(() => draft ?? "");
  const [status, setStatus] = useState<WriteStatus>("idle");
  const [statusText, setStatusText] = useState("");
  const [authCode, setAuthCode] = useState<string | null>(null);
  const [authCodeUrl, setAuthCodeUrl] = useState<string | null>(null);
  const [confirmationPage, setConfirmationPage] = useState<WriteConfirmationPage | null>(null);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pendingSubmittedWriteRef = useRef<PendingWritePayload | null>(null);
  const submitWatchdogTimerRef = useRef<number | null>(null);
  const statusRef = useRef<WriteStatus>("idle");
  const previousThreadUrlRef = useRef(threadUrl);

  const setMessage = useCallback(
    (value: string) => {
      setMessageState(value);
      onDraftChange?.(value);
    },
    [onDraftChange],
  );

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const clearSubmitWatchdog = useCallback(() => {
    const timerId = submitWatchdogTimerRef.current;
    if (timerId == null) {
      return;
    }
    viewWindow.clearTimeout(timerId);
    submitWatchdogTimerRef.current = null;
  }, [viewWindow]);

  const armSubmitWatchdog = useCallback(() => {
    clearSubmitWatchdog();
    submitWatchdogTimerRef.current = viewWindow.setTimeout(() => {
      if (statusRef.current !== "submitting") {
        return;
      }

      pendingSubmittedWriteRef.current = null;
      console.error("書き込み結果の通知を受信できませんでした");
      // 変更理由: 通知欠落は投稿成否を確認できない失敗なので、通常のidleへ戻すと
      // 警告がボタン下へ残り、共通の失敗ダイアログにも表示されなくなる。
      setStatus("error");
      setStatusText("書き込み結果の通知を受信できなかったため待機を解除しました");
    }, SUBMIT_WATCHDOG_MS);
  }, [clearSubmitWatchdog, viewWindow]);

  const clearTauriWriteAttempt = useCallback(() => {
    setConfirmationPage(null);
    setAuthCode(null);
    setAuthCodeUrl(null);
  }, []);

  useEffect(() => clearSubmitWatchdog, [clearSubmitWatchdog]);

  useEffect(() => {
    const previousThreadUrl = previousThreadUrlRef.current;
    previousThreadUrlRef.current = threadUrl;
    if (previousThreadUrl === threadUrl) {
      return;
    }

    // 変更理由: 下部パネルは次スレへ移動しても同じコンポーネントを使い続けるため、
    // 旧スレの確認・送信待ち状態を残すと新スレの投稿ボタンが無効になったり、
    // 旧iframeの結果を新スレの結果として表示したりする。本文の下書きは残しつつ、
    // スレッドに紐づく通信状態だけを新しい送信先へ切り替える。
    clearSubmitWatchdog();
    pendingSubmittedWriteRef.current = null;
    clearTauriWriteAttempt();
    setStatus("idle");
    setStatusText("");

    if (!isTauriRuntime() && iframeRef.current) {
      iframeRef.current.src = "about:blank";
    }
  }, [clearSubmitWatchdog, clearTauriWriteAttempt, threadUrl]);

  useEffect(() => {
    if (draft === undefined) {
      return;
    }

    // 変更理由: 別窓で開いたまま同じスレへ返信引用を追加するとthreadUrlは変わらない。
    // URL切替用effectだけで下書きを同期すると、その引用がtextareaへ届かないため、
    // 外部セッションの本文変更を独立して反映する。
    setMessageState((currentMessage) => (currentMessage === draft ? currentMessage : draft));
  }, [draft]);

  const canSubmit = status === "idle" && threadUrl !== "" && message.trim() !== "";

  // 名前・メールを localStorage に保存
  const setName = useCallback((v: string) => {
    setNameState(v);
    void setStore2String(NAME_KEY, v);
  }, []);

  const setMail = useCallback((v: string) => {
    setMailState(v);
    void setStore2String(MAIL_KEY, v);
  }, []);

  // 書き込み成功後、少し待ってから idle に戻す
  useEffect(() => {
    if (status !== "success") return;
    const id = viewWindow.setTimeout(() => {
      setStatus("idle");
      setStatusText("");
    }, 3000);
    return () => viewWindow.clearTimeout(id);
  }, [status, viewWindow]);

  const handleWriteResult = useCallback(
    (data: WriteResultMessage) => {
      switch (data.type) {
        case "success":
          clearSubmitWatchdog();
          clearTauriWriteAttempt();
          setStatus("success");
          setStatusText("書き込みました");
          setMessage("");

          void (async () => {
            const delayMs = resolveWriteSuccessDelayMs(data.message);
            const pendingSubmittedWrite = pendingSubmittedWriteRef.current;
            pendingSubmittedWriteRef.current = null;

            // 変更理由: 再取得待ちの間に自動更新で投稿レスが届くため、
            // 自分レスの照合情報は成功確定時に配信し、待機は通信だけに適用する。
            if (pendingSubmittedWrite) {
              notifyThreadWriteCompleted(pendingSubmittedWrite);
            }

            // 変更理由: 旧UIは投稿完了ページが要求する待ち時間だけ待ってから再取得しており、
            // 即 reload すると dat 反映前の内容を掴んで「もう一度更新しないと見えない」回帰になる。
            await wait(delayMs);

            // 変更理由: 投稿後の強制再取得も通常の RELOAD 経路へ寄せ、
            // manual reload / auto refresh と同じ forceUpdate 振る舞いを保つ。
            dispatch(tabId ? { ...tabActions.reload(), tabId } : tabActions.reload());
          })();
          break;
        case "confirm":
          clearSubmitWatchdog();
          if (data.page) {
            setConfirmationPage(data.page);
          } else {
            clearTauriWriteAttempt();
          }
          // 確認ページはTauriでは安全化したHTMLを表示し、ブラウザ版では従来のiframeを見せる。
          setStatus("confirm");
          setStatusText("確認ページが表示されています");
          break;
        case "auth-code":
          clearSubmitWatchdog();
          clearTauriWriteAttempt();
          pendingSubmittedWriteRef.current = null;
          // 変更理由: 認証コードはステータスバーに全文を流すと読みにくくコピーもしづらいため、認証ダイアログで扱う。
          setAuthCode(data.code);
          setAuthCodeUrl(data.url);
          setStatus("error");
          setStatusText("認証が必要です。認証ダイアログの案内に従ってください");
          break;
        case "error":
          clearSubmitWatchdog();
          clearTauriWriteAttempt();
          pendingSubmittedWriteRef.current = null;
          // サーバーによる拒否も例外と同じく記録し、表示だけでは追えない失敗を調査できるようにする。
          console.error("書き込みが拒否されました:", data.message ?? "エラー詳細なし");
          setStatus("error");
          setStatusText(
            data.message ? `書き込み失敗: ${String(data.message)}` : "書き込みに失敗しました",
          );
          break;
      }
    },
    [clearSubmitWatchdog, clearTauriWriteAttempt, dispatch, setMessage, tabId],
  );

  // iframe からの postMessage を処理する (cs_write.js との通信)
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; message?: unknown; code?: unknown; url?: unknown };
      switch (data?.type) {
        case "ping":
          (e.source as Window | null)?.postMessage(PONG_MSG, "*");
          break;
        case "success":
          handleWriteResult({
            type: "success",
            message:
              typeof data.message === "number" || typeof data.message === "string"
                ? data.message
                : undefined,
          });
          break;
        case "confirm":
          handleWriteResult({ type: "confirm" });
          break;
        case "auth-code": {
          // content scriptの認証通知も受け取り、同じ掲示板の認証先だけを案内する。
          const authUrl =
            typeof data.url === "string" ? resolveWriteAuthCodeUrl(data.url, threadUrl) : null;
          if (typeof data.code === "string" && /^\d{6}$/.test(data.code) && authUrl != null) {
            handleWriteResult({ type: "auth-code", code: data.code, url: authUrl });
          } else {
            console.error("書き込み認証の通知が不正です");
            handleWriteResult({ type: "error", message: "認証コードの通知を読み取れませんでした" });
          }
          break;
        }
        case "error":
          handleWriteResult({
            type: "error",
            message: typeof data.message === "string" ? data.message : undefined,
          });
          break;
      }
    };
    viewWindow.addEventListener("message", handleMessage);
    return () => viewWindow.removeEventListener("message", handleMessage);
  }, [handleWriteResult, threadUrl, viewWindow]);

  const submit = useCallback(
    async (messageOverride?: string) => {
      const messageToSubmit = messageOverride ?? message;
      if (!canSubmit || !messageToSubmit.trim()) return;

      // 変更理由: eddibbは認証ページで発行した#トークンをメール欄で認証するため、
      // sage設定がONでも認証トークンを「sage」で上書きしない。
      const effectiveMail = sage && !isWriteAuthToken(threadUrl, mail) ? "sage" : mail;
      const formData = buildFormData(threadUrl, name, effectiveMail, messageToSubmit);
      if (!formData) {
        pendingSubmittedWriteRef.current = null;
        setStatus("error");
        setStatusText("このURLへの書き込み形式を判定できませんでした");
        return;
      }

      const submittedAt = Date.now();
      pendingSubmittedWriteRef.current = {
        threadUrl,
        message: messageToSubmit,
        inputName: name,
        inputMail: effectiveMail,
        submittedAt,
      };

      // 変更理由: ベースラインを送信時点で確定させる。3 秒の待機中に自動更新が走ると
      // responseCountRef が新着込みの値に更新され、hasAdvancedSinceSubmit が永久に
      // false になる競合を防ぐため、送信直後に同期イベントで通知する。
      notifyThreadWriteStarted({ threadUrl, submittedAt });

      setStatus("submitting");
      setStatusText("書き込み中...");
      const useTauriHttp = __CHLENS_TAURI_BUILD__ && isTauriRuntime();
      if (!useTauriHttp) {
        armSubmitWatchdog();
      }

      try {
        await setupHeaderModifier(formData.action);
      } catch (error) {
        console.error("書き込み用リクエストヘッダーの設定に失敗しました:", error);
        handleWriteResult({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      if (__CHLENS_TAURI_BUILD__ && useTauriHttp) {
        try {
          const { getWriteFormFields } = await import("src/app/platform/tauri/WriteForm");
          handleWriteResult(
            await submitTauriWrite(
              {
                action: formData.action,
                charset: formData.charset,
                fields: getWriteFormFields(formData),
                referer: formData.referer ?? formData.action,
                bootstrapUrl: threadUrl,
              },
              formData.action,
            ),
          );
        } catch (error) {
          console.error("Tauri版の書き込みに失敗しました:", error);
          handleWriteResult({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      const iframe = iframeRef.current;
      if (!iframe) {
        console.error("書き込みフォームのiframeを初期化できませんでした");
        handleWriteResult({ type: "error", message: "書き込みフォームを初期化できませんでした" });
        return;
      }

      // about:blank をロードしてから iframe の contentDocument にフォームを生成して送信する。
      // 拡張機能内の未配置ファイル（/view/empty.html）に依存すると、ビルド成果物で
      // ERR_FILE_NOT_FOUND になり content script へ投稿結果が通知されないため、
      // 作成元の拡張ページと同一オリジンを継承する about:blank を使う。
      // submit_res.js の _setupForm と同じアプローチ。
      const onLoad = () => {
        iframe.removeEventListener("load", onLoad);
        const doc = iframe.contentDocument;
        if (!doc) {
          console.error("書き込みフォームのiframe文書を取得できませんでした");
          handleWriteResult({
            type: "error",
            message: "書き込みフォームを初期化できませんでした",
          });
          return;
        }

        const form = doc.createElement("form");
        form.acceptCharset = formData.charset;
        form.action = formData.action;
        form.method = "POST";

        for (const [key, val] of Object.entries(formData.input)) {
          const input = doc.createElement("input");
          input.name = key;
          input.value = val;
          form.appendChild(input);
        }
        for (const [key, val] of Object.entries(formData.textarea)) {
          const ta = doc.createElement("textarea");
          ta.name = key;
          ta.textContent = val;
          form.appendChild(ta);
        }

        doc.body.appendChild(form);
        // prototype 経由で呼ぶことで React が合成したイベントをバイパスする
        Object.getPrototypeOf(form).submit.call(form);
      };

      iframe.addEventListener("load", onLoad);
      iframe.src = "about:blank";
    },
    [armSubmitWatchdog, canSubmit, handleWriteResult, threadUrl, name, mail, sage, message],
  );

  const submitConfirmation = useCallback(
    async (submission: WriteConfirmationSubmission) => {
      const page = confirmationPage;
      const form = page?.forms.find((candidate) => candidate.id === submission.formId);
      if (!page || !form) {
        handleWriteResult({
          type: "error",
          message: "確認ページの送信フォームを特定できませんでした",
        });
        return;
      }

      // iframe内のイベントリスナーは確認ページを表示したrenderの関数を保持するため、
      // React stateではなく最新statusRefを参照して二重送信を止める。
      if (statusRef.current === "submitting") return;
      statusRef.current = "submitting";
      setStatus("submitting");
      setStatusText("確認ページを送信中...");

      if (__CHLENS_TAURI_BUILD__) {
        try {
          handleWriteResult(
            await submitTauriWrite(
              {
                action: form.action,
                charset: page.charset,
                fields: submission.fields,
                referer: page.sourceUrl,
              },
              page.expectedAction,
            ),
          );
        } catch (error) {
          console.error("Tauri版の確認ページ送信に失敗しました:", error);
          handleWriteResult({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      } else {
        console.error("Chrome版ではTauri専用の確認送信を実行できません");
        handleWriteResult({
          type: "error",
          message: "確認ページの送信に失敗しました",
        });
      }
    },
    [confirmationPage, handleWriteResult],
  );

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      await submit();
    },
    [submit],
  );

  const handleRetry = useCallback(() => {
    clearSubmitWatchdog();
    pendingSubmittedWriteRef.current = null;
    clearTauriWriteAttempt();
    setStatus("idle");
    setStatusText("");
  }, [clearSubmitWatchdog, clearTauriWriteAttempt]);

  return {
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
    handleSubmit,
    handleRetry,
  };
}
