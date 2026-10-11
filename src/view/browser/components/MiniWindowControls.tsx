import React, { useId } from "react";

// MiniWindowの中身で繰り返し書いていた行レイアウトを部品にまとめ、
// クラス名・ON/OFF表示・無効時の理由表示を各ステータス項目で揃える。

interface MiniWindowSectionProps {
  title?: string;
  /** 見出しを対応するフォーム部品のラベルにする場合に、その部品のidを渡す。 */
  titleFor?: string;
  children: React.ReactNode;
}

export const MiniWindowSection: React.FC<MiniWindowSectionProps> = ({
  title,
  titleFor,
  children,
}) => (
  <div className="mini-window__section">
    {title != null &&
      (titleFor != null ? (
        <label className="mini-window__section-header" htmlFor={titleFor}>
          {title}
        </label>
      ) : (
        <div className="mini-window__section-header">{title}</div>
      ))}
    {children}
  </div>
);

export const MiniWindowSeparator: React.FC = () => <div className="mini-window__separator" />;

export const MiniWindowNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mini-window__note">{children}</p>
);

interface MiniWindowToggleProps {
  label: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** 無効な理由。ボタンのtitleに出し、押せない理由をホバーで確認できるようにする。 */
  disabledReason?: string;
  busy?: boolean;
  /** 行ラベルとは別に、ボタン自体へ状態込みの名前を付けたい場合に指定する。 */
  buttonLabel?: string;
}

export const MiniWindowToggle: React.FC<MiniWindowToggleProps> = ({
  label,
  checked,
  onToggle,
  disabled = false,
  disabledReason,
  busy,
  buttonLabel,
}) => (
  <div className="mini-window__toggle-row">
    <span className="mini-window__toggle-label">{label}</span>
    {/* 変更理由: ON/OFFの文字ボタンより状態を一目で読めるスイッチ表示にする。
        文字は読み上げと既存のテキスト照合のため、視覚的に隠して残す。 */}
    <button
      type="button"
      className="mini-window__switch"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={checked}
      aria-busy={busy}
      aria-label={buttonLabel}
      title={disabled && disabledReason ? disabledReason : buttonLabel}
    >
      <span className="mini-window__switch-thumb" aria-hidden="true" />
      <span className="mini-window__switch-text">{checked ? "ON" : "OFF"}</span>
    </button>
  </div>
);

export interface MiniWindowSelectOption<T extends string> {
  value: T;
  label: string;
}

interface MiniWindowSelectProps<T extends string> {
  id?: string;
  ariaLabel?: string;
  /** 選択肢の違いなど、行に置くと長くなる補足をホバーで示す。 */
  title?: string;
  value: T;
  options: readonly MiniWindowSelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

export function MiniWindowSelect<T extends string>({
  id,
  ariaLabel,
  title,
  value,
  options,
  onChange,
  disabled,
}: MiniWindowSelectProps<T>): React.ReactElement {
  return (
    <div className="mini-window__select-row">
      <select
        id={id}
        className="mini-window__select"
        aria-label={ariaLabel}
        title={title}
        value={value}
        // optionsに渡した値しか選べないため、T へ戻してよい。
        onChange={(event) => onChange(event.target.value as T)}
        disabled={disabled}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface MiniWindowSliderProps {
  /** 指定すると、ラベル・スライダー・値を1行に並べる。 */
  label?: string;
  ariaLabel?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  valueLabel: string;
  onChange: (value: number) => void;
}

export const MiniWindowSlider: React.FC<MiniWindowSliderProps> = ({
  label,
  ariaLabel,
  min,
  max,
  step,
  value,
  valueLabel,
  onChange,
}) => {
  const sliderId = useId();
  return (
    <div className="mini-window__slider-row">
      {label != null && (
        <label className="mini-window__toggle-label" htmlFor={sliderId}>
          {label}
        </label>
      )}
      <input
        id={sliderId}
        className="mini-window__slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="mini-window__slider-value">{valueLabel}</span>
    </div>
  );
};

interface MiniWindowFieldProps {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}

/** ラベルと操作を1行に並べ、セクション見出しを置くより縦幅を抑える。 */
export const MiniWindowField: React.FC<MiniWindowFieldProps> = ({ label, htmlFor, children }) => (
  <div className="mini-window__field-row">
    <label className="mini-window__toggle-label" htmlFor={htmlFor}>
      {label}
    </label>
    {children}
  </div>
);

interface MiniWindowDetailsProps {
  summary: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

/**
 * 頻繁に触らない設定を折りたたむ。
 * MiniWindowは閉じるたびに中身がアンマウントされるため、開閉状態は呼び出し側で保持する。
 */
export const MiniWindowDetails: React.FC<MiniWindowDetailsProps> = ({
  summary,
  open,
  onOpenChange,
  children,
}) => (
  <details
    className="mini-window__details"
    open={open}
    onToggle={(event) => onOpenChange(event.currentTarget.open)}
  >
    <summary className="mini-window__details-summary">{summary}</summary>
    {children}
  </details>
);
