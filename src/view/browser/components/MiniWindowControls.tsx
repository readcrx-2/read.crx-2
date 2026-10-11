import React from "react";

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
    <button
      type="button"
      className={`mini-window__toggle-btn${checked ? " mini-window__toggle-btn--on" : ""}`}
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={checked}
      aria-busy={busy}
      aria-label={buttonLabel}
      title={disabled && disabledReason ? disabledReason : buttonLabel}
    >
      {checked ? "ON" : "OFF"}
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
  value: T;
  options: readonly MiniWindowSelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

export function MiniWindowSelect<T extends string>({
  id,
  ariaLabel,
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
  ariaLabel?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  valueLabel: string;
  onChange: (value: number) => void;
}

export const MiniWindowSlider: React.FC<MiniWindowSliderProps> = ({
  ariaLabel,
  min,
  max,
  step,
  value,
  valueLabel,
  onChange,
}) => (
  <div className="mini-window__slider-row">
    <input
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
