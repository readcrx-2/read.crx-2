import { AlertTriangle } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { container } from "src/service-container/index";
import { DebugLogPanel } from "src/view/browser/pages/settings/DebugLogPanel";
import {
  buildDataExportFilename,
  exportDataArchive,
  importDataArchive,
} from "src/view/browser/pages/settings/settings-data-transfer";
import type { SettingsSupplementaryPanelId } from "src/view/browser/pages/settings/settings-types";
import { SettingsGroup, SettingsGroupNote } from "src/view/browser/pages/settings/SettingsGroup";
import { SiteBoardSettingsPanel } from "src/view/browser/pages/settings/SiteBoardSettingsPanel";
import { TitleBarButtonSettingsPanel } from "src/view/browser/pages/settings/TitleBarButtonSettingsPanel";
import type { SettingsMaintenanceActions } from "src/view/browser/pages/settings/use-settings-maintenance";
import { Alert } from "src/view/browser/ui/Alert";
import { Button } from "src/view/browser/ui/Button";
import { Dialog } from "src/view/browser/ui/Dialog";
import { SettingRow } from "src/view/browser/ui/FormControls";
import { Spinner } from "src/view/browser/ui/Spinner";
import {
  readBookmarkFolderName,
  readConfiguredBookmarkFolderId,
  supportsBookmarkFolderSelection,
} from "src/view/browser/utils/bookmark-root";

interface SettingsSupplementaryPanelsProps {
  panelIds?: readonly SettingsSupplementaryPanelId[];
  maintenanceActions: SettingsMaintenanceActions;
}

export function SettingsSupplementaryPanels({
  panelIds,
  maintenanceActions,
}: SettingsSupplementaryPanelsProps) {
  const [folderName, setFolderName] = useState<string | null>(null);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  // 基本は完全バックアップにして、必要な場合だけダイアログで対象を外せるようにする。
  const [includeHistoryInExport, setIncludeHistoryInExport] = useState(true);
  const [includeWriteHistoryInExport, setIncludeWriteHistoryInExport] = useState(true);
  const [includeBookmarksInExport, setIncludeBookmarksInExport] = useState(true);
  const [includeLogsInExport, setIncludeLogsInExport] = useState(true);
  const [includeSessionInExport, setIncludeSessionInExport] = useState(true);
  const [isExportingArchive, setIsExportingArchive] = useState(false);
  const [isImportingArchive, setIsImportingArchive] = useState(false);
  const [isDeletingLogs, setIsDeletingLogs] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dialogPortalContainer, setDialogPortalContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setDialogPortalContainer(document.querySelector<HTMLElement>(".browser-shell"));
  }, []);

  const loadBookmarkFolder = useCallback(async () => {
    if (!supportsBookmarkFolderSelection()) {
      setBookmarkLoading(false);
      setFolderName(null);
      setBookmarkError(null);
      return;
    }

    setBookmarkLoading(true);
    setBookmarkError(null);

    try {
      const bookmarkId = readConfiguredBookmarkFolderId();
      if (!bookmarkId) {
        setFolderName(null);
        return;
      }

      const nextFolderName = await readBookmarkFolderName(bookmarkId);
      setFolderName(nextFolderName);

      if (!nextFolderName) {
        setBookmarkError("保存先フォルダが未設定か、すでに削除されています");
      }
    } catch (loadError) {
      setBookmarkError(
        loadError instanceof Error ? loadError.message : "ブックマーク保存先の取得に失敗しました",
      );
      setFolderName(null);
    } finally {
      setBookmarkLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!panelIds?.includes("externalIntegration")) {
      return;
    }

    void loadBookmarkFolder();
  }, [loadBookmarkFolder, panelIds]);

  useEffect(() => {
    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (key === "bookmark_id") {
        void loadBookmarkFolder();
      }
    };

    container.message.on("config_updated", handleConfigUpdated);

    return () => {
      container.message.off("config_updated", handleConfigUpdated);
    };
  }, [loadBookmarkFolder]);

  const handleExportArchive = useCallback(async () => {
    if (isExportingArchive) {
      return;
    }

    setIsExportDialogOpen(false);
    setIsExportingArchive(true);
    try {
      const blob = await exportDataArchive({
        includeHistory: includeHistoryInExport,
        includeWriteHistory: includeWriteHistoryInExport,
        includeBookmarks: includeBookmarksInExport,
        includeLogs: includeLogsInExport,
        includeSession: includeSessionInExport,
      });

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = buildDataExportFilename();
      anchor.click();
      URL.revokeObjectURL(objectUrl);

      container.toast.success("データをzipでエクスポートしました");
    } catch (error) {
      const message = error instanceof Error ? error.message : "データのエクスポートに失敗しました";
      container.toast.error(message);
    } finally {
      setIsExportingArchive(false);
    }
  }, [
    includeBookmarksInExport,
    includeHistoryInExport,
    includeLogsInExport,
    includeSessionInExport,
    includeWriteHistoryInExport,
    isExportingArchive,
  ]);

  const handleImportArchiveFile = useCallback(
    async (file: File) => {
      if (isImportingArchive) {
        return;
      }

      setIsImportingArchive(true);
      try {
        const result = await importDataArchive(file);

        const historySummary =
          result.importedHistoryCount > 0
            ? `閲覧履歴 ${result.importedHistoryCount}件`
            : "閲覧履歴 0件";
        const writeHistorySummary =
          result.importedWriteHistoryCount > 0
            ? `書込履歴 ${result.importedWriteHistoryCount}件`
            : "書込履歴 0件";
        const bookmarkSummary = `ブックマーク ${result.importedBookmarkCount}件`;
        const logSummary = `過去ログ ${result.importedLogCount}件`;
        const sessionSummary =
          result.importedSessionCount > 0 ? "セッション 1件" : "セッション 0件";

        container.toast.success(
          `インポート完了: 設定 ${result.importedSettingsCount}件 / ${historySummary} / ${writeHistorySummary} / ${bookmarkSummary} / ${logSummary} / ${sessionSummary}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "データのインポートに失敗しました";
        container.toast.error(message);
      } finally {
        setIsImportingArchive(false);
      }
    },
    [isImportingArchive],
  );

  const handleImportButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleDeleteLogs = useCallback(async () => {
    if (isDeletingLogs) {
      return;
    }
    // 恒久保存されたログを消すため、誤操作防止の確認を挟む。
    if (
      !window.confirm(
        "保存済みのログ（過去ログ）をすべて削除します。元に戻せません。よろしいっすか？",
      )
    ) {
      return;
    }

    setIsDeletingLogs(true);
    try {
      await container.threadLog.deleteLogs();
      container.message.send("log_updated", { type: "cleared" });
      container.toast.success("ログをすべて削除しました");
    } catch (error) {
      const message = error instanceof Error ? error.message : "ログの削除に失敗しました";
      container.toast.error(message);
    } finally {
      setIsDeletingLogs(false);
    }
  }, [isDeletingLogs]);

  const panels = useMemo(() => {
    if (!panelIds || panelIds.length === 0) {
      return [] as React.ReactNode[];
    }

    return panelIds.map((panelId) => {
      switch (panelId) {
        case "titleBarButtonSettings":
          return <TitleBarButtonSettingsPanel key={panelId} />;
        case "siteBoardSettings":
          return <SiteBoardSettingsPanel key={panelId} />;
        case "externalIntegration":
          if (!supportsBookmarkFolderSelection()) {
            return null;
          }

          return (
            <SettingsGroup key={panelId} title="ブックマーク">
              <SettingRow
                label="保存先フォルダ"
                description="ブックマークを保存するブラウザのフォルダです。"
              >
                <span
                  className="settings-page__bookmark-source-label"
                  aria-busy={bookmarkLoading || undefined}
                >
                  {bookmarkLoading ? (
                    <Spinner size="xs" aria-label="保存先を読み込み中" />
                  ) : (
                    (folderName ?? "未設定")
                  )}
                </span>
                <Button onClick={() => container.message.send("bookmark_root_selector_open")}>
                  {folderName ? "保存先を変更" : "保存先を選択"}
                </Button>
              </SettingRow>
              {bookmarkError && (
                <SettingsGroupNote>
                  <Alert color="red" icon={<AlertTriangle size={16} />}>
                    {bookmarkError}
                  </Alert>
                </SettingsGroupNote>
              )}
            </SettingsGroup>
          );
        case "debugLog":
          return <DebugLogPanel key={panelId} />;
        case "dangerZone":
          // 変更理由: 元に戻せない操作を1つの枠にまとめ、ほかの操作と取り違えないようにする。
          return (
            <SettingsGroup
              key={panelId}
              title="削除と初期化"
              description="どちらも元に戻せません。"
            >
              <SettingRow
                label="過去ログを削除"
                description="閲覧したスレの本文を恒久保存したログをすべて削除します。"
              >
                <Button
                  variant="danger"
                  onClick={() => void handleDeleteLogs()}
                  loading={isDeletingLogs}
                >
                  ログをすべて削除
                </Button>
              </SettingRow>
              <SettingRow label="設定を初期化" description="すべての設定をデフォルト値へ戻します。">
                <Button
                  variant="danger"
                  onClick={() => void maintenanceActions.handleResetAllSettings()}
                  loading={maintenanceActions.isResettingAllSettings}
                >
                  すべての設定をデフォルトに戻す
                </Button>
              </SettingRow>
            </SettingsGroup>
          );
        case "dataManagement":
          return (
            <SettingsGroup
              key={panelId}
              title="バックアップ"
              description="設定・履歴・ブックマーク・過去ログ・セッションをzipでバックアップ/復元します。"
            >
              <SettingRow label="エクスポート" description="含める内容を選んでzipに保存します。">
                <Button onClick={() => setIsExportDialogOpen(true)} loading={isExportingArchive}>
                  zipをエクスポート
                </Button>
              </SettingRow>
              <SettingRow label="インポート" description="バックアップしたzipから復元します。">
                <Button
                  variant="danger"
                  onClick={handleImportButtonClick}
                  loading={isImportingArchive}
                >
                  zipをインポート
                </Button>
              </SettingRow>

              <Dialog.Root open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
                <Dialog.Portal container={dialogPortalContainer ?? undefined}>
                  <Dialog.Overlay className="browser-dialog-overlay" />
                  <Dialog.Content
                    className="browser-dialog-content settings-export-dialog"
                    aria-describedby="settings-export-dialog-description"
                  >
                    <Dialog.Title className="browser-dialog-title">
                      バックアップ内容を選択
                    </Dialog.Title>
                    <Dialog.Description
                      id="settings-export-dialog-description"
                      className="browser-dialog-description"
                    >
                      基本はすべて含まれます。不要な項目だけ外してください。設定は常に含まれます。
                    </Dialog.Description>
                    <div className="settings-export-dialog__options">
                      <label className="settings-export-dialog__checkbox">
                        <input
                          type="checkbox"
                          checked={includeHistoryInExport}
                          onChange={(event) =>
                            setIncludeHistoryInExport(event.currentTarget.checked)
                          }
                        />
                        閲覧履歴を含める
                      </label>
                      <label className="settings-export-dialog__checkbox">
                        <input
                          type="checkbox"
                          checked={includeWriteHistoryInExport}
                          onChange={(event) =>
                            setIncludeWriteHistoryInExport(event.currentTarget.checked)
                          }
                        />
                        書き込み履歴を含める
                      </label>
                      <label className="settings-export-dialog__checkbox">
                        <input
                          type="checkbox"
                          checked={includeBookmarksInExport}
                          onChange={(event) =>
                            setIncludeBookmarksInExport(event.currentTarget.checked)
                          }
                        />
                        ブックマークを含める
                      </label>
                      <label className="settings-export-dialog__checkbox">
                        <input
                          type="checkbox"
                          checked={includeLogsInExport}
                          onChange={(event) => setIncludeLogsInExport(event.currentTarget.checked)}
                        />
                        過去ログ（本文）を含める
                      </label>
                      <label className="settings-export-dialog__checkbox">
                        <input
                          type="checkbox"
                          checked={includeSessionInExport}
                          onChange={(event) =>
                            setIncludeSessionInExport(event.currentTarget.checked)
                          }
                        />
                        セッション・タブ状態を含める
                      </label>
                    </div>
                    <div className="settings-export-dialog__actions">
                      <Dialog.Close asChild>
                        <Button variant="default">キャンセル</Button>
                      </Dialog.Close>
                      <Button
                        onClick={() => void handleExportArchive()}
                        loading={isExportingArchive}
                      >
                        この内容で保存
                      </Button>
                    </div>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>

              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,application/zip"
                style={{ display: "none" }}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  if (file) {
                    void handleImportArchiveFile(file);
                  }
                  // 同じzipを連続選択できるようvalueを毎回クリアする。
                  event.currentTarget.value = "";
                }}
              />
            </SettingsGroup>
          );
      }
    });
  }, [
    bookmarkError,
    bookmarkLoading,
    dialogPortalContainer,
    folderName,
    handleDeleteLogs,
    handleExportArchive,
    handleImportArchiveFile,
    handleImportButtonClick,
    includeHistoryInExport,
    includeBookmarksInExport,
    includeLogsInExport,
    includeSessionInExport,
    includeWriteHistoryInExport,
    isDeletingLogs,
    isExportDialogOpen,
    isExportingArchive,
    isImportingArchive,
    maintenanceActions,
    panelIds,
  ]);

  if (panels.length === 0) {
    return null;
  }

  // 変更理由: 追加の項目を section 定義側の id から描画し、ページ本体の条件分岐を増やさない。
  // 各パネルは見出しと枠を自分で持つため、ページ本体の並びへそのまま置く。
  return <>{panels}</>;
}
