import { ContextMenu as RadixContextMenu } from "radix-ui";
import type { ReactNode, RefObject } from "react";
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { usePopupCloseBehavior } from "src/features/popup/browser/use-popup-manager";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { getEventTargetElement } from "src/view/browser/utils/dom";

export interface ContextMenuItem {
  id: string;
  label?: string;
  allowMultilineLabel?: boolean;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  onSelect?: () => void;
  onAuxSelect?: (button: number) => void;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  header?: ReactNode;
  triggerRef?: RefObject<HTMLElement | null>;
  popupId?: string;
  isPopupDescendantOf?: (popupId: string, ancestorId: string) => boolean;
  onEnterFromDescendant?: () => void;
  onMouseEnter?: () => void;
  onPopupMouseDown?: () => void;
  closeDisabled?: boolean;
  zIndex?: number;
}

/** Radix ContextMenuを既存の座標・popup lifecycle APIへ適合させる共通wrapper。 */
export const ContextMenu: React.FC<Props> = ({
  x,
  y,
  items,
  onClose,
  header,
  triggerRef,
  popupId,
  isPopupDescendantOf,
  onEnterFromDescendant,
  onMouseEnter,
  onPopupMouseDown,
  closeDisabled,
  zIndex,
}) => {
  const { window: viewWindow, document: viewDocument } = useViewSurface();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerElementRef = useRef<HTMLSpanElement>(null);
  const { handleAuxClickCapture, handleMouseDownCapture, handleMouseEnter, handleMouseLeave } =
    usePopupCloseBehavior({
      popupRef: menuRef,
      outsideClickIgnoreRefs: triggerRef ? [triggerRef] : undefined,
      popupId,
      isPopupDescendantOf,
      onEnterFromDescendant,
      closeDisabled,
      // コンテキストメニューは hover/mouseleave で閉じず、Radixのdismissとoutside clickだけで閉じる。
      closeOnMouseLeave: false,
      onClose,
      onPopupMouseDown,
      onPopupMouseEnter: onMouseEnter,
    });

  const visibleItems = useMemo(() => items.filter((item) => item.separator || item.label), [items]);

  const isPopupBranchTarget = (target: EventTarget | null) => {
    const targetElement = getEventTargetElement(target, viewWindow);
    if (!popupId || !targetElement) {
      return false;
    }

    const targetPopupId = targetElement
      .closest('[data-popup="true"]')
      ?.getAttribute("data-popup-id");
    return (
      targetPopupId === popupId ||
      (targetPopupId != null && isPopupDescendantOf?.(targetPopupId, popupId) === true)
    );
  };

  // 変更理由: トグルボタン上の押下で Radix が先に閉じると、後続の click トグルが
  // 閉じた状態を見て開き直してしまう。開閉の責務はボタン側のトグルへ寄せ、
  // mousedown 側の outsideClickIgnoreRefs と同じくトリガー上では閉じない。
  const isTriggerTarget = (target: EventTarget | null) => {
    const targetElement = getEventTargetElement(target, viewWindow);
    return (
      triggerRef?.current != null &&
      targetElement != null &&
      triggerRef.current.contains(targetElement)
    );
  };

  // Radixのvirtual anchorへ座標を渡すため、既存の「stateが生成されたら開く」契約を
  // contextmenuイベントへ変換する。これによりRadix側のfocus/dismissable layerを利用できる。
  useLayoutEffect(() => {
    const trigger = triggerElementRef.current;
    if (!trigger) {
      return;
    }

    const viewWindowWithConstructors = viewWindow as Window & typeof globalThis;
    const init = {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 2,
    };
    // 別窓のWindowProxyでMouseEvent constructorが未公開でも、表示先Documentの
    // createEventを使えばRadixへ同じcontextmenuを渡せる。
    const contextMenuEvent =
      typeof viewWindowWithConstructors.MouseEvent === "function"
        ? new viewWindowWithConstructors.MouseEvent("contextmenu", init)
        : (() => {
            const event = viewDocument.createEvent("MouseEvent");
            event.initMouseEvent(
              "contextmenu",
              init.bubbles,
              init.cancelable,
              viewWindow,
              0,
              0,
              0,
              init.clientX,
              init.clientY,
              false,
              false,
              false,
              false,
              init.button,
              null,
            );
            return event;
          })();
    trigger.dispatchEvent(contextMenuEvent);
  }, [viewDocument, viewWindow, x, y]);

  return (
    <RadixContextMenu.Root
      modal={false}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <RadixContextMenu.Trigger asChild>
        <span
          ref={triggerElementRef}
          data-context-menu-trigger="true"
          aria-hidden="true"
          // 座標付きの仮想イベントを親コンポーネントの背景メニューへ流さない。
          onContextMenu={(event) => event.stopPropagation()}
          style={{
            position: "fixed",
            left: x,
            top: y,
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: "none",
          }}
        />
      </RadixContextMenu.Trigger>
      <RadixContextMenu.Content
        asChild
        // 右端・下端で開いた場合も viewport 内へ押し戻し、共通メニュー全体で同じ挙動にする。
        avoidCollisions
        collisionPadding={8}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => {
          if (closeDisabled || isPopupBranchTarget(event.target) || isTriggerTarget(event.target)) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          if (closeDisabled || isPopupBranchTarget(event.target) || isTriggerTarget(event.target)) {
            event.preventDefault();
          }
        }}
      >
        <div
          ref={menuRef}
          data-popup="true"
          data-popup-id={popupId}
          className="context-menu"
          // Content の配置は Radix が contextmenu の clientX/clientY を基準に行う。
          // ここで left/top を再設定するとクリック座標が二重に加算されるため、z-index だけ補正する。
          style={zIndex != null ? { zIndex } : undefined}
          onMouseDownCapture={handleMouseDownCapture}
          onAuxClickCapture={handleAuxClickCapture}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {header ? <div className="context-menu__header">{header}</div> : null}
          {visibleItems.map((item) => {
            if (item.separator) {
              return <div key={item.id} className="context-menu__separator" />;
            }

            return (
              <button
                key={item.id}
                className={`context-menu__item${item.danger ? " context-menu__item--danger" : ""}${
                  item.allowMultilineLabel ? " context-menu__item--multiline" : ""
                }`}
                disabled={item.disabled}
                title={item.label}
                // mousedown でフォーカスが移動するとページ上のテキスト選択が消えるため、
                // preventDefault でフォーカス移動を抑止し、選択状態を維持する。
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (!item.disabled) {
                    item.onSelect?.();
                  }
                  onClose();
                }}
                onAuxClick={(event) => {
                  if (item.disabled || !item.onAuxSelect) return;
                  if (event.button === 1) {
                    event.preventDefault();
                  }
                  item.onAuxSelect(event.button);
                  onClose();
                }}
              >
                {item.icon && <span className="context-menu__icon">{item.icon}</span>}
                <span
                  className={`context-menu__label${
                    item.allowMultilineLabel ? " context-menu__label--multiline" : ""
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </RadixContextMenu.Content>
    </RadixContextMenu.Root>
  );
};
