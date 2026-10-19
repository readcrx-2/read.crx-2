import React, { useState } from "react";
import { TitleBarButtonSettingsDialog } from "src/view/browser/components/TitleBarButtonSettingsDialog";
import { useTitleBarButtonSettings } from "src/view/browser/hooks/use-title-bar-navigation-setting";
import { SettingsGroup } from "src/view/browser/pages/settings/SettingsGroup";
import { Button } from "src/view/browser/ui/Button";
import { SettingRow } from "src/view/browser/ui/FormControls";

/**
 * 設定画面からタイトルバー左端の表示ボタンを個別に変更する入口を提供する。
 *
 * 変更理由: 切り替えはタイトルバー専用のモーダルにまとめたまま、入口だけをほかの設定項目と
 * 同じ見出しと枠の行の形にして、設定画面の中で浮かないようにする。
 */
export const TitleBarButtonSettingsPanel: React.FC = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const {
    backEnabled,
    forwardEnabled,
    refreshEnabled,
    setBackEnabled,
    setForwardEnabled,
    setRefreshEnabled,
  } = useTitleBarButtonSettings();

  return (
    <>
      <SettingsGroup title="タイトルバー">
        <SettingRow
          label="表示するボタン"
          description="タブバーの配置にかかわらず、タイトルバー左側へ表示する戻る・進む・更新ボタンを選択します。"
        >
          <Button onClick={() => setIsDialogOpen(true)}>タイトルバーのボタン設定</Button>
        </SettingRow>
      </SettingsGroup>
      <TitleBarButtonSettingsDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        backEnabled={backEnabled}
        onBackEnabledChange={setBackEnabled}
        forwardEnabled={forwardEnabled}
        onForwardEnabledChange={setForwardEnabled}
        refreshEnabled={refreshEnabled}
        onRefreshEnabledChange={setRefreshEnabled}
      />
    </>
  );
};
