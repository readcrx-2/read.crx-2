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

export type SettingsFormWidget = "radio" | "textarea" | "ng_editor" | "replacement_editor";
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
}

export type SettingsSectionGroupId = "app" | "browsing" | "manage";

/** サイドバーで見出しの下にまとめて並べる設定カテゴリの組。 */
export interface SettingsSectionGroup {
  id: SettingsSectionGroupId;
  title: string;
  sections: readonly SettingsSectionDefinition[];
}
