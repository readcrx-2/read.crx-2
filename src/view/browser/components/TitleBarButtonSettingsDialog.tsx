import React, { useEffect, useId, useState } from "react";
import { Button } from "src/view/browser/ui/Button";
import { Dialog } from "src/view/browser/ui/Dialog";

interface TitleBarButtonSwitchProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function TitleBarButtonSwitch({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: TitleBarButtonSwitchProps) {
  return (
    <div className="title-bar-button-settings__item">
      <div className="title-bar-button-settings__copy">
        <span className="title-bar-button-settings__label" id={`${id}-label`}>
          {label}
        </span>
        <span className="title-bar-button-settings__description" id={`${id}-description`}>
          {description}
        </span>
      </div>
      {/* 変更理由: 四角いチェックボックスではなく、表示・非表示を即時に理解できる
          スイッチとして操作できるよう、role=switchを持つボタンで表現する。 */}
      <button
        id={id}
        type="button"
        className="title-bar-button-settings__switch"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-description`}
        onClick={() => onCheckedChange(!checked)}
      >
        <span aria-hidden="true" />
      </button>
    </div>
  );
}

export interface TitleBarButtonSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  backEnabled: boolean;
  onBackEnabledChange: (enabled: boolean) => void;
  forwardEnabled: boolean;
  onForwardEnabledChange: (enabled: boolean) => void;
  refreshEnabled: boolean;
  onRefreshEnabledChange: (enabled: boolean) => void;
}

export const TitleBarButtonSettingsDialog: React.FC<TitleBarButtonSettingsDialogProps> = ({
  open,
  onOpenChange,
  backEnabled,
  onBackEnabledChange,
  forwardEnabled,
  onForwardEnabledChange,
  refreshEnabled,
  onRefreshEnabledChange,
}) => {
  const descriptionId = useId();
  const [dialogPortalContainer, setDialogPortalContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // テーマトークンを継承したペイン内へPortalを置き、アプリのテーマとモーダルの色を揃える。
    setDialogPortalContainer(document.querySelector<HTMLElement>(".browser-shell"));
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={dialogPortalContainer ?? undefined}>
        <Dialog.Overlay className="browser-dialog-overlay" />
        <Dialog.Content
          className="browser-dialog-content title-bar-button-settings-dialog"
          aria-describedby={descriptionId}
        >
          <Dialog.Title className="browser-dialog-title">タイトルバーのボタン設定</Dialog.Title>
          <Dialog.Description id={descriptionId} className="browser-dialog-description">
            タブバーの配置にかかわらず、タイトルバー左側に表示するボタンを選択します。
          </Dialog.Description>
          <div className="title-bar-button-settings__list">
            <TitleBarButtonSwitch
              id="title-bar-setting-back"
              label="戻る"
              description="閲覧履歴を1つ前へ移動します。"
              checked={backEnabled}
              onCheckedChange={onBackEnabledChange}
            />
            <TitleBarButtonSwitch
              id="title-bar-setting-forward"
              label="進む"
              description="閲覧履歴を1つ先へ移動します。"
              checked={forwardEnabled}
              onCheckedChange={onForwardEnabledChange}
            />
            <TitleBarButtonSwitch
              id="title-bar-setting-refresh"
              label="更新"
              description="表示中の板やスレッドを更新します。"
              checked={refreshEnabled}
              onCheckedChange={onRefreshEnabledChange}
            />
          </div>
          <div className="title-bar-button-settings__actions">
            <Dialog.Close asChild>
              <Button variant="subtle">閉じる</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
