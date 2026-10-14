import type { CSSProperties, MouseEventHandler, ReactNode } from "react";
import React, { useRef } from "react";
import { usePopupCloseBehavior } from "src/view/browser/hooks/use-popup-close-behavior";
import { useAdjustOverflow } from "src/view/browser/utils/use-adjust-overflow";

export interface FloatingPopupRenderProps {
  /** 子要素のリンク操作で mouseleave close を一時的に抑止する。 */
  armMouseLeaveCloseSuppression: () => void;
}

export interface FloatingPopupProps {
  className: string;
  x: number;
  y: number;
  zIndex?: CSSProperties["zIndex"];
  popupId?: string;
  isPopupDescendantOf?: (popupId: string, ancestorId: string) => boolean;
  onEnterFromDescendant?: () => void;
  closeDisabled?: boolean;
  closeOnMouseLeave?: boolean;
  closeOnOutsideClick?: boolean;
  onClose: () => void;
  onPopupMouseDown?: () => void;
  onPopupMouseEnter?: () => void;
  onPopupMouseLeave?: () => void;
  onMouseOver?: MouseEventHandler<HTMLDivElement>;
  children: ReactNode | ((props: FloatingPopupRenderProps) => ReactNode);
}

/**
 * Thread popupで共有する座標付きの表示要素。
 *
 * popupの親子関係や閉じ方はfeature側へ漏らさず、DOM属性・座標補正・
 * mouse lifecycleをここへ集約する。内容の描画だけはrender propで各featureが担当する。
 */
export const FloatingPopup: React.FC<FloatingPopupProps> = ({
  className,
  x,
  y,
  zIndex,
  popupId,
  isPopupDescendantOf,
  onEnterFromDescendant,
  closeDisabled,
  closeOnMouseLeave = true,
  closeOnOutsideClick = true,
  onClose,
  onPopupMouseDown,
  onPopupMouseEnter,
  onPopupMouseLeave,
  onMouseOver,
  children,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const {
    armMouseLeaveCloseSuppression,
    handleAuxClickCapture,
    handleMouseDownCapture,
    handleMouseEnter,
    handleMouseLeave,
  } = usePopupCloseBehavior({
    popupRef,
    popupId,
    isPopupDescendantOf,
    onEnterFromDescendant,
    closeDisabled,
    closeOnMouseLeave,
    closeOnOutsideClick,
    onClose,
    onPopupMouseDown,
    onPopupMouseEnter,
    onPopupMouseLeave,
  });

  // position:absolute のpopupをviewport内へ収める補正は全popupで共通化する。
  useAdjustOverflow(popupRef);

  const content =
    typeof children === "function" ? children({ armMouseLeaveCloseSuppression }) : children;

  return (
    <div
      ref={popupRef}
      data-popup="true"
      data-popup-id={popupId}
      className={className}
      style={{ left: x, top: y, ...(zIndex != null && { zIndex }) }}
      onMouseDownCapture={handleMouseDownCapture}
      onAuxClickCapture={handleAuxClickCapture}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseOver={onMouseOver}
    >
      {content}
    </div>
  );
};

FloatingPopup.displayName = "FloatingPopup";
