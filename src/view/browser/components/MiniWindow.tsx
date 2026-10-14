import { X } from "lucide-react";
import React, { useEffect } from "react";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { Popover } from "src/view/browser/ui/Popover";

export interface MiniWindowProps {
  title: string;
  /** トリガーボタンの getBoundingClientRect() を渡す。位置計算に使用する。 */
  anchor: DOMRect;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  /** パネルの内容に合わせてポップアップ幅を広げる。 */
  width?: number | string;
  children: React.ReactNode;
}

/**
 * VS Code の Quick Settings 風のミニポップアップ。
 * `anchor` をもとにステータスバーの真上へ fixed 配置される。
 * タイトルと閉じるボタンを持つ汎用シェルで、中身は children で差し替え可能。
 */
export const MiniWindow: React.FC<MiniWindowProps> = ({
  title,
  anchor,
  onClose,
  triggerRef,
  width = 280,
  children,
}) => {
  const { window: viewWindow, document: viewDocument } = useViewSurface();
  // テーマトークンは `.browser-shell[data-theme]` のスコープで定義されるため、
  // body直下へPortalするとダークテーマの値を継承できない。実際のトリガーが
  // 既にマウント済みならその祖先を優先し、テストや汎用利用ではシェルを検索する。
  const portalContainer =
    triggerRef?.current?.closest<HTMLElement>(".browser-shell") ??
    viewDocument.querySelector<HTMLElement>(".browser-shell");

  // ステータスバーのanchorが移動するため、resize時は既存仕様どおり閉じる。
  useEffect(() => {
    viewWindow.addEventListener("resize", onClose);
    return () => viewWindow.removeEventListener("resize", onClose);
  }, [onClose, viewWindow]);

  return (
    <Popover.Root
      open
      modal={false}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <Popover.Anchor asChild>
        <span
          aria-hidden="true"
          data-mini-window-anchor="true"
          style={{
            position: "fixed",
            left: anchor.left,
            top: anchor.top,
            width: 1,
            height: 1,
            pointerEvents: "none",
          }}
        />
      </Popover.Anchor>
      <Popover.Portal container={portalContainer ?? undefined}>
        <Popover.Content
          asChild
          side="top"
          align="start"
          sideOffset={4}
          collisionPadding={4}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => {
            // トリガーのpointerdownでは先に閉じず、後段のonClickトグルに委ねる。
            // 別窓のDOMでは本窓のNodeコンストラクタを使わないよう、containsだけで判定する。
            if (event.target != null && triggerRef?.current?.contains(event.target as Node)) {
              event.preventDefault();
            }
          }}
        >
          <div className="mini-window" style={{ width }}>
            <div className="mini-window__header">
              <span className="mini-window__title">{title}</span>
              <button className="mini-window__close" onClick={onClose} title="閉じる">
                <X size={13} />
              </button>
            </div>
            <div className="mini-window__body">{children}</div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
