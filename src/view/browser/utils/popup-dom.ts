import { POPUP_ID_ATTRIBUTE, POPUP_SELECTOR } from "src/view/browser/utils/constants";
import { getEventTargetElement } from "src/view/browser/utils/dom";

/**
 * popup DOMを見分けるための補助関数。
 *
 * popupの表示やclose処理そのものはhook側に置き、ここではDOM属性と
 * popup branchの判定だけを扱う。DOMイベントを受け取ってもstateは変更しない。
 */

// リンク操作ではpopupを残したままブラウザ側の処理へ渡したいので、
// popupの通常領域を閉じる操作と同じ扱いにしない対象をここでまとめる。
export const POPUP_KEEP_OPEN_TARGET_SELECTOR =
  "a, .res__link, .res__thumb, .res__media-embed, .context-menu";

export function isContextMenuPopupId(popupId: string | null): boolean {
  return popupId?.startsWith("contextMenu-") ?? false;
}

export function getPopupElementId(
  target: EventTarget | null,
  targetWindow: Window = globalThis.window,
): string | null {
  const targetElement = getEventTargetElement(target, targetWindow);
  const popupElement = targetElement?.closest(POPUP_SELECTOR);
  return popupElement?.getAttribute(POPUP_ID_ATTRIBUTE) ?? null;
}

export function isPopupBranchTarget(
  target: EventTarget | null,
  popupId: string | undefined,
  isPopupDescendantOf?: (popupId: string, ancestorId: string) => boolean,
  targetWindow: Window = globalThis.window,
): boolean {
  const targetPopupId = getPopupElementId(target, targetWindow);
  if (!popupId || !targetPopupId) {
    return false;
  }

  return targetPopupId === popupId || isPopupDescendantOf?.(targetPopupId, popupId) === true;
}
