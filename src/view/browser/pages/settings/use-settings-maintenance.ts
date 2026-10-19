import { fetchHttpsFirst } from "packages/chlib/src/fetcher/https-first";
import { useCallback, useState } from "react";
import {
  mapWithConcurrency,
  MAX_CONCURRENT_BATCH_REQUESTS,
} from "src/core/util/map-with-concurrency";
import { container } from "src/service-container/index";
import {
  readAllSettings,
  readBBSMenuUrlsForCheck,
} from "src/view/browser/pages/settings/settings-sections";
import type { SettingsFormState } from "src/view/browser/pages/settings/settings-types";

interface UseSettingsMaintenanceActionsOptions {
  formState: SettingsFormState | null;
  onResetFormState: (nextState: SettingsFormState) => void;
  onResetError: (message: string | null) => void;
}

export interface SettingsMaintenanceActions {
  isBbsMenuChecking: boolean;
  isBbsMenuRefreshing: boolean;
  isResettingAllSettings: boolean;
  handleBBSMenuCheck: () => Promise<void>;
  handleBBSMenuRefresh: () => Promise<void>;
  handleResetAllSettings: () => Promise<void>;
}

export function useSettingsMaintenanceActions({
  formState,
  onResetFormState,
  onResetError,
}: UseSettingsMaintenanceActionsOptions): SettingsMaintenanceActions {
  const [isBbsMenuChecking, setIsBbsMenuChecking] = useState(false);
  const [isBbsMenuRefreshing, setIsBbsMenuRefreshing] = useState(false);
  const [isResettingAllSettings, setIsResettingAllSettings] = useState(false);

  const handleBBSMenuCheck = useCallback(async () => {
    if (isBbsMenuChecking || !formState) {
      return;
    }

    const raw = formState["site-board"]?.bbsmenu;
    const targets = readBBSMenuUrlsForCheck(typeof raw === "string" ? raw : "");
    if (targets.length === 0) {
      container.toast.error("チェック対象のBBSMENU URLがありません");
      return;
    }

    setIsBbsMenuChecking(true);
    try {
      const results = await mapWithConcurrency(
        targets,
        MAX_CONCURRENT_BATCH_REQUESTS,
        async (targetUrl) => {
          try {
            const response = await fetchHttpsFirst(targetUrl, "GET", (requestUrl) =>
              fetch(requestUrl, {
                method: "GET",
                cache: "no-store",
              }),
            );
            return {
              ok: response.ok,
              status: response.status,
              url: targetUrl,
            };
          } catch {
            return {
              ok: false,
              status: 0,
              url: targetUrl,
            };
          }
        },
      );

      const failed = results.filter((result) => !result.ok);
      if (failed.length === 0) {
        container.toast.success(`BBSMENU読み込みチェック成功 (${results.length}件)`);
      } else {
        const summary = failed
          .slice(0, 3)
          .map((entry) => `${entry.status || "ERR"}: ${entry.url}`)
          .join(" / ");
        container.toast.error(
          `BBSMENU読み込みチェック失敗 (${failed.length}/${results.length}件): ${summary}`,
        );
      }
    } finally {
      setIsBbsMenuChecking(false);
    }
  }, [formState, isBbsMenuChecking]);

  const handleBBSMenuRefresh = useCallback(async () => {
    if (isBbsMenuRefreshing) {
      return;
    }

    setIsBbsMenuRefreshing(true);
    try {
      // 通常メニューは forceReload で再取得して上書きし、
      // 「その他」は明示的に開いた板の記録を正規化して再構成する。
      const result = await container.bbsMenu.get(true);
      if (result.status === "success") {
        // 変更理由: 板一覧ページは設定画面と別コンポーネントで保持されるため、
        // キャッシュ更新だけでは表示中の古い「その他」が残る。
        container.message.send("bbs_menu_updated");
        container.toast.success("BBSMENUをリフレッシュしました");
      } else {
        container.toast.error(result.message ?? "BBSMENUの更新に失敗しました");
      }
    } catch (refreshError) {
      container.toast.error(
        refreshError instanceof Error ? refreshError.message : "BBSMENUの更新に失敗しました",
      );
    } finally {
      setIsBbsMenuRefreshing(false);
    }
  }, [isBbsMenuRefreshing]);

  const handleResetAllSettings = useCallback(async () => {
    if (isResettingAllSettings) {
      return;
    }

    const accepted = window.confirm("すべての設定をデフォルトに戻します。よろしいですか？");
    if (!accepted) {
      return;
    }

    setIsResettingAllSettings(true);
    onResetError(null);

    try {
      const getAll = container.config.getAll;
      const del = container.config.del;
      if (!getAll || !del) {
        throw new Error("設定リセットAPIが利用できません");
      }

      const allConfigEntries = getAll();
      const keys = Object.keys(allConfigEntries)
        .filter((key) => key.startsWith("config_"))
        .map((key) => key.slice(7));

      // 既定値へ戻す目的なので set(default) ではなく del を使い、
      // 既定に存在しない一時キーも同時に掃除する。
      await Promise.all(keys.map((key) => del(key)));

      onResetFormState(readAllSettings());
      container.toast.success("すべての設定をデフォルトに戻しました");
    } catch (resetError) {
      const message =
        resetError instanceof Error ? resetError.message : "設定の初期化に失敗しました";
      onResetError(message);
      container.toast.error(message);
    } finally {
      setIsResettingAllSettings(false);
    }
  }, [isResettingAllSettings, onResetError, onResetFormState]);

  return {
    isBbsMenuChecking,
    isBbsMenuRefreshing,
    isResettingAllSettings,
    handleBBSMenuCheck,
    handleBBSMenuRefresh,
    handleResetAllSettings,
  };
}
