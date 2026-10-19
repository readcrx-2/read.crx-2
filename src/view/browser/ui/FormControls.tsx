import {
  Checkbox as RadixCheckbox,
  RadioGroup as RadixRadioGroup,
  Switch as RadixSwitch,
} from "radix-ui";
import type { ReactNode } from "react";

interface CheckboxFieldProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function CheckboxField({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: CheckboxFieldProps) {
  return (
    <div className="browser-field browser-field--checkbox">
      <div className="browser-checkbox-field">
        <RadixCheckbox.Root
          id={id}
          checked={checked}
          className="browser-checkbox-field__control"
          onCheckedChange={(nextChecked) => onCheckedChange(nextChecked === true)}
        >
          <RadixCheckbox.Indicator className="browser-checkbox-field__indicator">
            ✓
          </RadixCheckbox.Indicator>
        </RadixCheckbox.Root>
        <label className="browser-checkbox-field__label" htmlFor={id}>
          {label}
        </label>
      </div>
      {description ? <p className="browser-field__description">{description}</p> : null}
    </div>
  );
}

export interface RadioFieldOption {
  const: string;
  title: string;
}

export interface FieldDescriptionProps {
  children: ReactNode;
}

export function FieldDescription({ children }: FieldDescriptionProps) {
  return <p className="browser-field__description">{children}</p>;
}

interface SettingRowProps {
  label: string;
  description?: ReactNode;
  /** 操作部品が1つの入力要素なら、その id を渡して label で関連付ける。 */
  htmlFor?: string;
  /** ラジオ群のように label で関連付けられない部品は、この id で aria-labelledby から参照する。 */
  labelId?: string;
  /** inline は名前の右に部品を置き、stacked は長い入力のために名前の下へ全幅で置く。 */
  layout?: "inline" | "stacked";
  children: ReactNode;
}

/**
 * 設定画面の1項目を、左に名前と説明、右（または下）に操作部品を置く1行として描く。
 * 項目の種類ごとに配置が変わると左端が揃わず散らかって見えるため、全項目でこの形に揃える。
 */
export function SettingRow({
  label,
  description,
  htmlFor,
  labelId,
  layout = "inline",
  children,
}: SettingRowProps) {
  return (
    <div className="browser-setting-row" data-layout={layout}>
      <div className="browser-setting-row__text">
        {htmlFor ? (
          <label id={labelId} className="browser-setting-row__label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span id={labelId} className="browser-setting-row__label">
            {label}
          </span>
        )}
        {description ? <p className="browser-setting-row__description">{description}</p> : null}
      </div>
      <div className="browser-setting-row__control">{children}</div>
    </div>
  );
}

interface SwitchControlProps {
  id: string;
  /** 行の label で名前が付かない（行の label が別の部品を指す）場合だけ渡す。 */
  ariaLabel?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** 行の右端に置くオンオフ切り替え。名前は SettingRow の label から htmlFor で付く。 */
export function SwitchControl({
  id,
  ariaLabel,
  checked,
  disabled,
  onCheckedChange,
}: SwitchControlProps) {
  return (
    <RadixSwitch.Root
      id={id}
      aria-label={ariaLabel}
      checked={checked}
      disabled={disabled}
      className="browser-switch"
      onCheckedChange={onCheckedChange}
    >
      <RadixSwitch.Thumb className="browser-switch__thumb" />
    </RadixSwitch.Root>
  );
}

interface ChoiceControlProps {
  id: string;
  labelledBy: string;
  value: string;
  options: readonly RadioFieldOption[];
  /** segmented は短い2〜3択を横並びで、list は長い選択肢を縦に並べる。 */
  variant: "segmented" | "list";
  onValueChange: (value: string) => void;
}

export function ChoiceControl({
  id,
  labelledBy,
  value,
  options,
  variant,
  onValueChange,
}: ChoiceControlProps) {
  if (variant === "segmented") {
    return (
      <RadixRadioGroup.Root
        aria-labelledby={labelledBy}
        className="browser-segmented"
        orientation="horizontal"
        value={value}
        onValueChange={onValueChange}
      >
        {options.map((option) => (
          <RadixRadioGroup.Item
            key={option.const}
            id={`${id}-${option.const}`}
            value={option.const}
            className="browser-segmented__item"
          >
            {option.title}
          </RadixRadioGroup.Item>
        ))}
      </RadixRadioGroup.Root>
    );
  }

  return (
    <RadixRadioGroup.Root
      aria-labelledby={labelledBy}
      className="browser-radio-field__group"
      value={value}
      onValueChange={onValueChange}
    >
      {options.map((option) => {
        const optionId = `${id}-${option.const}`;
        return (
          <label key={option.const} className="browser-radio-field__option" htmlFor={optionId}>
            <RadixRadioGroup.Item
              id={optionId}
              value={option.const}
              className="browser-radio-field__control"
            >
              <RadixRadioGroup.Indicator className="browser-radio-field__indicator" />
            </RadixRadioGroup.Item>
            <span>{option.title}</span>
          </label>
        );
      })}
    </RadixRadioGroup.Root>
  );
}
