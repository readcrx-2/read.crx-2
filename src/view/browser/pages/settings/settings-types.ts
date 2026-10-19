import type { RJSFSchema, UiSchema } from "@rjsf/utils";
import type { ReactNode } from "react";
import type { SettingsSectionId } from "src/view/browser/types";

// SettingsSectionId と SettingsPageUiState はタブの表示状態（TabViewState）にも保存されるため、
// UI 部品層の view/browser/types.ts に定義を置いている。

export type SettingsSupplementaryPanelId =
  | "titleBarButtonSettings"
  | "externalIntegration"
  | "debugLog"
  | "dangerZone"
  | "dataManagement"
  | "siteBoardSettings";

// segmented は短い2〜3択を行の右へ横並びで置き、radio は長い選択肢を行の下へ縦に並べる。
export type SettingsFormWidget =
  | "radio"
  | "segmented"
  | "textarea"
  | "ng_editor"
  | "replacement_editor";
export type SettingsFormValue = boolean | number | string | undefined;
export type SettingsSectionFormData = Record<string, SettingsFormValue>;
export type SettingsFormState = Record<SettingsSectionId, SettingsSectionFormData>;

export interface SettingsOption {
  const: string;
  title: string;
}

export interface SettingsFieldBase {
  key: string;
  title: string;
  description?: string;
  deprecated?: boolean;
  widget?: SettingsFormWidget;
  rows?: number;
}

export interface SettingsBooleanField extends SettingsFieldBase {
  kind: "boolean";
}

export interface SettingsNumberField extends SettingsFieldBase {
  kind: "number";
  minimum?: number;
  maximum?: number;
  step?: number;
}

export interface SettingsStringField extends SettingsFieldBase {
  kind: "string";
  options?: readonly SettingsOption[];
}

export type SettingsFieldDefinition =
  | SettingsBooleanField
  | SettingsNumberField
  | SettingsStringField;

export interface SettingsDividerItem {
  kind: "divider";
  id: string;
  title: string;
  description?: string;
}

export type SettingsSectionItem = SettingsFieldDefinition | SettingsDividerItem;

/** 区切りの見出しと、その下にまとめて1枚の枠へ並べる項目。 */
export interface SettingsFieldGroup {
  divider?: SettingsDividerItem;
  fields: readonly SettingsFieldDefinition[];
}

export function isSettingsDividerItem(item: SettingsSectionItem): item is SettingsDividerItem {
  return item.kind === "divider";
}

export function isSettingsFieldItem(item: SettingsSectionItem): item is SettingsFieldDefinition {
  return item.kind !== "divider";
}

export interface SettingsSectionDefinition {
  id: SettingsSectionId;
  title: string;
  description: string;
  icon: ReactNode;
  fields: readonly SettingsSectionItem[];
  schema: RJSFSchema;
  uiSchema: UiSchema<SettingsSectionFormData>;
  supplementaryPanelIds?: readonly SettingsSupplementaryPanelId[];
  relatedSection?: SettingsRelatedSection;
}

/** 関連する設定が別カテゴリにあるとき、見出しの下に出す案内と移動先。 */
export interface SettingsRelatedSection {
  id: SettingsSectionId;
  description: string;
  label: string;
}

export type SettingsSectionGroupId = "app" | "browsing" | "manage";

/** サイドバーで見出しの下にまとめて並べる設定カテゴリの組。 */
export interface SettingsSectionGroup {
  id: SettingsSectionGroupId;
  title: string;
  sections: readonly SettingsSectionDefinition[];
}
