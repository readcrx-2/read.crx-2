import React, { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";

interface CursorTooltipState {
  label: string;
  x: number;
  y: number;
}

interface CursorTooltipProps extends CursorTooltipState {
  abovePopups?: boolean;
}

export function CursorTooltip({
  label,
  x,
  y,
  abovePopups = false,
}: CursorTooltipProps): React.ReactElement {
  const { document: viewDocument } = useViewSurface();
  // 変更理由: タブ一覧や表のスクロール領域によるクリッピングを避け、
  // 隣の要素にも重ねられるよう、表示中の窓のルートへ描画する。
  const portalContainer =
    viewDocument.querySelector<HTMLElement>(".browser-shell") ?? viewDocument.body;

  return createPortal(
    <div
      className={`cursor-tooltip${abovePopups ? " cursor-tooltip--above-popups" : ""}`}
      style={{ left: x + 16, top: y + 16 }}
      role="tooltip"
    >
      {label}
    </div>,
    portalContainer,
  );
}

export function useCursorTooltip({ abovePopups = false }: { abovePopups?: boolean } = {}) {
  const [tooltipState, setTooltipState] = useState<CursorTooltipState | null>(null);

  const show = useCallback((label: string, event: React.MouseEvent<HTMLElement>) => {
    setTooltipState({ label, x: event.clientX, y: event.clientY });
  }, []);

  const move = useCallback((label: string, event: React.MouseEvent<HTMLElement>) => {
    setTooltipState(() => ({
      label,
      x: event.clientX,
      y: event.clientY,
    }));
  }, []);

  const hide = useCallback(() => setTooltipState(null), []);

  return {
    show,
    move,
    hide,
    tooltip: tooltipState ? <CursorTooltip {...tooltipState} abovePopups={abovePopups} /> : null,
  };
}
