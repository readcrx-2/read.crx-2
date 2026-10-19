import React from "react";
import { useTitleBarButtonSettings } from "src/view/browser/hooks/use-title-bar-navigation-setting";
import { SettingsGroup } from "src/view/browser/pages/settings/SettingsGroup";
import { SettingRow, SwitchControl } from "src/view/browser/ui/FormControls";

/**
 * 設定画面でタイトルバー左端に表示するボタンを個別に切り替える。
 *
 * 変更理由: 以前はボタンからモーダルを開いて切り替えていたが、3つのスイッチのために
 * 画面を重ねる必要はなく、ほかの設定項目と同じ行の形で直接切り替えられる方が分かりやすい。
 */
export const TitleBarButtonSettingsPanel: React.FC = () => {
  const {
    backEnabled,
    forwardEnabled,
    refreshEnabled,
    setBackEnabled,
    setForwardEnabled,
    setRefreshEnabled,
  } = useTitleBarButtonSettings();

  const buttons = [
    {
      id: "title-bar-setting-back",
      label: "戻る",
      description: "閲覧履歴を1つ前へ移動します。",
      checked: backEnabled,
      onCheckedChange: setBackEnabled,
    },
    {
      id: "title-bar-setting-forward",
      label: "進む",
      description: "閲覧履歴を1つ先へ移動します。",
      checked: forwardEnabled,
      onCheckedChange: setForwardEnabled,
    },
    {
      id: "title-bar-setting-refresh",
      label: "更新",
      description: "表示中の板やスレッドを更新します。",
      checked: refreshEnabled,
      onCheckedChange: setRefreshEnabled,
    },
  ];

  return (
    <SettingsGroup
      title="タイトルバー"
      description="タブバーの配置にかかわらず、タイトルバー左側に表示するボタンを選択します。"
    >
      {buttons.map((button) => (
        <SettingRow
          key={button.id}
          htmlFor={button.id}
          label={button.label}
          description={button.description}
        >
          <SwitchControl
            id={button.id}
            checked={button.checked}
            onCheckedChange={button.onCheckedChange}
          />
        </SettingRow>
      ))}
    </SettingsGroup>
  );
};
