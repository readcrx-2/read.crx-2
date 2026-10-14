import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { getEventTargetElement } from "src/view/browser/utils/dom";

export interface PopupHeaderMenuPosition {
  x: number;
  y: number;
}

interface PopupHeaderMenuResult {
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  menuPosition: PopupHeaderMenuPosition | null;
  handleMenuClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  closeMenu: () => void;
}

/** popupヘッダーのメニュー位置と outside click を共通管理する。 */
export function usePopupHeaderMenu(): PopupHeaderMenuResult {
  const { window: viewWindow, document: viewDocument } = useViewSurface();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<PopupHeaderMenuPosition | null>(null);

  const closeMenu = useCallback(() => setMenuPosition(null), []);

  useEffect(() => {
    if (!menuPosition) {
      return;
    }

    const handleOutsideMenuClick = (event: globalThis.MouseEvent) => {
      const target = getEventTargetElement(event.target, viewWindow);
      if (!target) {
        closeMenu();
        return;
      }

      if (target.closest(".context-menu") || menuButtonRef.current?.contains(target)) {
        return;
      }

      closeMenu();
    };

    viewDocument.addEventListener("mousedown", handleOutsideMenuClick);
    return () => viewDocument.removeEventListener("mousedown", handleOutsideMenuClick);
  }, [closeMenu, menuPosition, viewDocument, viewWindow]);

  const handleMenuClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const buttonRect = event.currentTarget.getBoundingClientRect();
    setMenuPosition((previous) =>
      previous
        ? null
        : {
            // ContextMenu は viewport 座標へ配置されるため、popup基準の相対座標へ変換しない。
            x: buttonRect.right - 8,
            y: buttonRect.bottom + 4,
          },
    );
  }, []);

  return { menuButtonRef, menuPosition, handleMenuClick, closeMenu };
}
