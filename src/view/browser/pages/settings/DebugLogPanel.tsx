import { useCallback, useEffect, useState } from "react";
import {
  clearPersistedLogs,
  flushPersistedLogs,
  formatPersistedLog,
  MAX_PERSISTED_ENTRIES,
  type PersistedLogEntry,
  readPersistedLogs,
} from "src/app/debug/log-persistence";
import { createLogger } from "src/app/logger";
import { container } from "src/service-container/index";
import { Button } from "src/view/browser/ui/Button";
import {
  Surface,
  SurfaceActions,
  SurfaceBody,
  SurfaceDescription,
  SurfaceHeader,
  SurfaceTitle,
} from "src/view/browser/ui/Surface";
import { copyText } from "src/view/browser/utils/clipboard";

const logger = createLogger("view/settings");

// 画面には直近だけを出す。全件はコピーや保存で取り出す。
const VISIBLE_ENTRY_COUNT = 100;

function buildDebugLogFilename(now = new Date()): string {
  const pad2 = (value: number): string => value.toString().padStart(2, "0");
  const date = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const time = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  return `chlens-debug-log-${date}-${time}.txt`;
}

/**
 * 保存済みのデバッグログを画面で確認し、コピー・保存・削除できるようにする。
 *
 * 変更理由: ログを永続化しても、取り出す手段が開発者ツール経由だけだと不具合報告に添付しにくい。
 * 設定画面から利用者自身がコピーや保存をできるようにする。
 */
export function DebugLogPanel() {
  const [entries, setEntries] = useState<PersistedLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      await flushPersistedLogs();
      setEntries(await readPersistedLogs({ limit: VISIBLE_ENTRY_COUNT }));
    } catch (error) {
      logger.error("デバッグログの読み込みに失敗しました", error);
      container.toast.error("デバッグログの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // コピーと保存は、画面の100件ではなく保存済みの全件を対象にする。
  const readAllText = useCallback(async (): Promise<string> => {
    await flushPersistedLogs();
    const all = await readPersistedLogs({ limit: MAX_PERSISTED_ENTRIES });
    return all.map(formatPersistedLog).join("\n");
  }, []);

  const handleCopy = useCallback(async () => {
    setBusy(true);
    try {
      await copyText(await readAllText());
      container.toast.success("デバッグログをコピーしました");
    } catch (error) {
      logger.error("デバッグログのコピーに失敗しました", error);
      container.toast.error("デバッグログのコピーに失敗しました");
    } finally {
      setBusy(false);
    }
  }, [readAllText]);

  const handleSave = useCallback(async () => {
    setBusy(true);
    try {
      const blob = new Blob([await readAllText()], { type: "text/plain;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = buildDebugLogFilename();
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      container.toast.success("デバッグログを保存しました");
    } catch (error) {
      logger.error("デバッグログの保存に失敗しました", error);
      container.toast.error("デバッグログの保存に失敗しました");
    } finally {
      setBusy(false);
    }
  }, [readAllText]);

  const handleClear = useCallback(async () => {
    // 原因調査の手がかりを消す操作なので、誤操作防止の確認を挟む。
    if (!window.confirm("保存済みのデバッグログをすべて削除します。よろしいですか？")) {
      return;
    }
    setBusy(true);
    try {
      await clearPersistedLogs();
      setEntries([]);
      container.toast.success("デバッグログを削除しました");
    } catch (error) {
      logger.error("デバッグログの削除に失敗しました", error);
      container.toast.error("デバッグログの削除に失敗しました");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <Surface variant="flat">
      <SurfaceHeader>
        <SurfaceTitle>デバッグログ</SurfaceTitle>
        <SurfaceDescription>
          エラーや警告などの記録を最大{MAX_PERSISTED_ENTRIES}
          件まで保存しています。不具合の報告にはコピーか保存をご利用ください。
        </SurfaceDescription>
      </SurfaceHeader>
      <SurfaceBody>
        <textarea
          readOnly
          rows={12}
          aria-label="デバッグログ（直近）"
          value={entries.map(formatPersistedLog).join("\n")}
          placeholder={loading ? "読み込み中…" : "保存されたログはありません"}
        />
        <SurfaceActions>
          <Button onClick={() => void reload()} loading={loading}>
            更新
          </Button>
          <Button onClick={() => void handleCopy()} disabled={busy}>
            すべてコピー
          </Button>
          <Button onClick={() => void handleSave()} disabled={busy}>
            ファイルに保存
          </Button>
          <Button variant="danger" onClick={() => void handleClear()} disabled={busy}>
            ログを削除
          </Button>
        </SurfaceActions>
      </SurfaceBody>
    </Surface>
  );
}
