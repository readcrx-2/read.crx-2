import type { ReactNode } from "react";

interface SettingsGroupProps {
  title?: ReactNode;
  description?: ReactNode;
  /** NG・置換のエディタのように独自の枠を持つ中身は、行の枠へ入れずにそのまま置く。 */
  bare?: boolean;
  children: ReactNode;
}

/**
 * 設定画面の項目のまとまり。見出しを枠の外に置き、その下の1枚の枠に項目を1行ずつ並べる。
 *
 * 変更理由: カテゴリやパネルごとに枠や見出しの組み方が違うと、画面全体が整頓されて見えない。
 * 通常の項目も独自のパネルもこの部品で囲み、見出しと枠の形を1種類に揃える。
 */
export function SettingsGroup({ title, description, bare = false, children }: SettingsGroupProps) {
  return (
    <section className="settings-page__group">
      {title && (
        <div className="settings-page__group-header">
          <h3 className="settings-page__group-title">{title}</h3>
          {description && <p className="settings-page__group-description">{description}</p>}
        </div>
      )}
      {bare ? children : <div className="settings-page__group-card">{children}</div>}
    </section>
  );
}

/** 直前の項目に対する操作ボタンを、線で切り離さず同じ枠の中へ並べる。 */
export function SettingsGroupActions({ children }: { children: ReactNode }) {
  return <div className="settings-page__group-actions">{children}</div>;
}

/** 枠の中で行に収まらない注意やエラーを、行と同じ余白で出す。 */
export function SettingsGroupNote({ children }: { children: ReactNode }) {
  return <div className="settings-page__group-note">{children}</div>;
}
