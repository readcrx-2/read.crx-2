import { useCallback, useState } from "react";
import { createLogger } from "src/app/logger";
import { stringifyNgDslValue } from "src/core/ng/ngDsl";
import { container } from "src/service-container";
import type { IThread, IToastService } from "src/service-container/interfaces";

const logger = createLogger("ng");

export interface ThreadTitleNgDialogController {
  thread: IThread | null;
  draft: string;
  saving: boolean;
  error: string | null;
  open: (thread: IThread) => void;
  close: () => void;
  setDraft: (draft: string) => void;
  submit: () => Promise<void>;
}

interface Options {
  toast: IToastService;
  logLabel: string;
}

/**
 * スレタイNGダイアログの入力・保存状態を共有する。
 *
 * 変更理由: ThreadListPageとThreadListPanelで同じ登録処理を持つと、入力検証や通知先の
 * 差分が生じるため、表示環境に応じたtoastだけを注入して状態遷移を一元化する。
 */
export function useThreadTitleNgDialog({
  toast,
  logLabel,
}: Options): ThreadTitleNgDialogController {
  const [thread, setThread] = useState<IThread | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback((target: IThread) => {
    setThread(target);
    setDraft(target.title);
    setError(null);
  }, []);

  const close = useCallback(() => {
    if (saving) {
      return;
    }
    setThread(null);
    setError(null);
  }, [saving]);

  const submit = useCallback(async () => {
    const title = draft.trim();
    if (!title || saving) {
      return;
    }

    setSaving(true);
    setError(null);
    const ngRule = `hide:\n  when title contains ${stringifyNgDslValue(title)}`;
    try {
      await container.ng.add(ngRule);
      toast.info(`スレタイをNGに追加しました: ${title}`);
      setThread(null);
    } catch (submitError) {
      logger.error(`[${logLabel}] スレタイNGの登録に失敗しました`, submitError);
      const message = submitError instanceof Error ? submitError.message : "NG登録に失敗しました";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }, [draft, logLabel, saving, toast]);

  return { thread, draft, saving, error, open, close, setDraft, submit };
}
