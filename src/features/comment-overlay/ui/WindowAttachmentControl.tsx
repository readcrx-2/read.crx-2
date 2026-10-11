import { useEffect, useState } from "react";

import type { CommentOverlayWindowPlatform } from "../platform/types";

type Attachment = NonNullable<CommentOverlayWindowPlatform["attachment"]>;

export function WindowAttachmentControl({ attachment }: { attachment: Attachment }) {
  const [windows, setWindows] = useState<readonly { id: string; title: string }[]>([]);
  const [state, setState] = useState(() => attachment.getState());
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setWindows(await attachment.listWindows());
      setError(null);
    } catch (cause: unknown) {
      console.error("[ChLens] 追従先ウィンドウ一覧の取得に失敗しました:", cause);
      setError("一覧を取得できませんでした。一覧を更新してください。");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let disposed = false;
    void attachment
      .listWindows()
      .then((nextWindows) => {
        if (!disposed) setWindows(nextWindows);
      })
      .catch((cause: unknown) => {
        console.error("[ChLens] 追従先ウィンドウ一覧の取得に失敗しました:", cause);
        if (!disposed) setError("一覧を取得できませんでした。一覧を更新してください。");
      })
      .finally(() => {
        if (!disposed) setBusy(false);
      });
    // 対象の終了や手動調整での解除を、パネルを開き直さずに表示へ反映する。
    const timer = setInterval(() => setState(attachment.getState()), 500);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [attachment]);

  const selectTarget = async (id: string | null) => {
    setBusy(true);
    try {
      await attachment.setTarget(id);
      setError(null);
    } catch (cause: unknown) {
      console.error("[ChLens] 追従先ウィンドウの設定に失敗しました:", cause);
      setError(String(cause));
    } finally {
      setState(attachment.getState());
      setBusy(false);
    }
  };

  return (
    <section className="overlay-control-panel overlay-window-attachment">
      <label htmlFor="overlay-attachment-target">ウィンドウに追従</label>
      <div className="overlay-window-attachment__controls">
        <select
          id="overlay-attachment-target"
          value={state.targetId ?? ""}
          disabled={busy}
          onChange={(event) => {
            void selectTarget(event.target.value || null);
          }}
        >
          <option value="">追従しない（手動調整）</option>
          {state.targetId && !windows.some((window) => window.id === state.targetId) && (
            <option value={state.targetId}>選択中のウィンドウ</option>
          )}
          {windows.map((window) => (
            <option key={window.id} value={window.id}>
              {window.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void refresh();
          }}
        >
          一覧を更新
        </button>
      </div>
      {!busy && windows.length === 0 && (
        <p className="mini-window__note">
          対象ウィンドウがありません。別のアプリを開いて一覧を更新してください。
        </p>
      )}
      <p className="mini-window__note">
        選んだウィンドウの内側に合わせて移動・サイズ変更します。最小化中はコメントを隠します。手動調整すると追従を解除します。
      </p>
      {(error || state.error) && <p role="alert">{error || state.error}</p>}
    </section>
  );
}
