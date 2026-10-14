import type React from "react";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { POPUP_SELECTOR } from "src/view/browser/utils/constants";
import { getEventTargetElement } from "src/view/browser/utils/dom";
import {
  getPopupElementId,
  isContextMenuPopupId,
  isPopupBranchTarget as isPopupBranchTargetElement,
  POPUP_KEEP_OPEN_TARGET_SELECTOR,
} from "src/view/browser/utils/popup-dom";

const POPUP_MOUSELEAVE_SUPPRESS_MS = 250;

/**
 * popup要素のhover・outside click・子popup遷移をまとめて扱うhook。
 *
 * リンクや中クリック直後のmouseleave抑止も同じイベント順序に依存するため、
 * 別hookへ分けず、このhook内でclose判定と一体に管理する。
 */
export interface PopupCloseBehaviorParams {
  popupRef?: RefObject<HTMLElement | null>;
  outsideClickIgnoreRefs?: Array<RefObject<HTMLElement | null>>;
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
}

export interface PopupCloseBehaviorResult {
  armMouseLeaveCloseSuppression: () => void;
  handleAuxClickCapture: (event: React.MouseEvent<HTMLElement>) => void;
  handleMouseDownCapture: (event: React.MouseEvent<HTMLElement>) => void;
  handleMouseEnter: (event: React.MouseEvent<HTMLElement>) => void;
  handleMouseLeave: (event: React.MouseEvent<HTMLElement>) => void;
}

export function usePopupCloseBehavior({
  popupRef,
  outsideClickIgnoreRefs,
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
}: PopupCloseBehaviorParams): PopupCloseBehaviorResult {
  const { window: viewWindow, document: viewDocument } = useViewSurface();
  const [isHovering, setIsHovering] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const suppressNextDisableReleaseCloseRef = useRef(false);

  const suppressCloseUntilRef = useRef(0);
  const suppressNextMouseLeaveRef = useRef(false);

  const armMouseLeaveCloseSuppression = useCallback(() => {
    // middle click 後の close はブラウザやデバイス差で発火タイミングが揺れるため、
    // 時間窓だけでなく「次の mouseleave を1回だけ必ず無視」するガードを併用する。
    suppressNextMouseLeaveRef.current = true;
    suppressCloseUntilRef.current = Date.now() + POPUP_MOUSELEAVE_SUPPRESS_MS;
  }, []);

  const handleMouseDownCapture = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const target = getEventTargetElement(event.target, viewWindow);
      if (target?.closest(POPUP_KEEP_OPEN_TARGET_SELECTOR)) {
        // popup本体クリック時は枝を畳みたいが、リンク操作まで同じ扱いにすると
        // 「ポップアップ内のa要素を押した瞬間に子popupが消える」ので先に除外する。
        armMouseLeaveCloseSuppression();
        return;
      }

      // 右クリック（button=2）は contextmenu イベントで処理するため、
      // onPopupMouseDown を呼ばない。呼ぶと Zustand 状態更新が
      // contextmenu より先に同期レンダリングされ、テキスト選択が消えてしまう。
      if (event.button === 2) {
        return;
      }

      onPopupMouseDown?.();
    },
    [armMouseLeaveCloseSuppression, onPopupMouseDown, viewWindow],
  );

  const shouldSuppressMouseLeaveClose = useCallback(() => {
    if (suppressNextMouseLeaveRef.current) {
      suppressNextMouseLeaveRef.current = false;
      return true;
    }
    return suppressCloseUntilRef.current > Date.now();
  }, []);

  const handleAuxClickCapture = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (event.button !== 1) {
        return;
      }

      const target = getEventTargetElement(event.target, viewWindow);
      if (!target?.closest(POPUP_KEEP_OPEN_TARGET_SELECTOR)) {
        return;
      }

      armMouseLeaveCloseSuppression();
    },
    [armMouseLeaveCloseSuppression, viewWindow],
  );

  const isPopupBranchTarget = useCallback(
    (target: EventTarget | null) =>
      isPopupBranchTargetElement(target, popupId, isPopupDescendantOf, viewWindow),
    [isPopupDescendantOf, popupId, viewWindow],
  );

  const isWithinIgnoredOutsideTarget = useCallback(
    (target: EventTarget | null) => {
      const targetElement = getEventTargetElement(target, viewWindow);
      if (!targetElement) {
        return false;
      }

      return (
        outsideClickIgnoreRefs?.some((ignoreRef) => ignoreRef.current?.contains(targetElement)) ??
        false
      );
    },
    [outsideClickIgnoreRefs, viewWindow],
  );

  const prevCloseDisabledRef = useRef(!!closeDisabled);
  useEffect(() => {
    const wasDisabled = prevCloseDisabledRef.current;
    prevCloseDisabledRef.current = !!closeDisabled;
    const isActuallyHovering = popupRef?.current?.matches(":hover") ?? isHovering;
    if (!closeOnMouseLeave) {
      // コンテキストメニューは outside click でのみ閉じる仕様なので、
      // 子popup終了時の disable 復帰で親まで自動 close しない。
      return;
    }
    if (wasDisabled && !closeDisabled && suppressNextDisableReleaseCloseRef.current) {
      // 子から親へ戻る途中は child branch を先に落とすので、
      // disable 復帰の瞬間だけ親の自動 close を1回抑止して hover 遷移を待つ。
      suppressNextDisableReleaseCloseRef.current = false;
      return;
    }
    // 子popupが閉じた直後に mouseleave を取り逃したケースは、
    // React state だけだと子popup経由の移動で stale になることがあるため、
    // 復帰判定だけは実 DOM の :hover を優先して閉じ忘れを防ぐ。
    if (wasDisabled && !closeDisabled && !isActuallyHovering) {
      onCloseRef.current();
    }
  }, [closeDisabled, closeOnMouseLeave, isHovering, popupRef]);

  useEffect(() => {
    const handleOutsideMouseDown = (event: MouseEvent) => {
      const targetPopupId = getPopupElementId(event.target, viewWindow);
      if (
        popupId &&
        targetPopupId &&
        targetPopupId !== popupId &&
        isPopupBranchTarget(event.target)
      ) {
        // 子メニュー内 click で child branch が閉じた直後は、
        // 親 popup まで disable 復帰 auto-close で巻き込まないように1回だけ抑止する。
        suppressNextDisableReleaseCloseRef.current = true;
      }

      // トリガー上の pointer/mouse down では先に close せず、
      // 後段の click トグルに開閉の責務を寄せて「閉じるつもりが再オープン」を防ぐ。
      if (isWithinIgnoredOutsideTarget(event.target)) {
        return;
      }

      if (!closeOnOutsideClick) {
        return;
      }

      const target = getEventTargetElement(event.target, viewWindow);
      if (target && popupRef?.current?.contains(target)) {
        return;
      }

      const popupElement = target?.closest(POPUP_SELECTOR);
      if (!popupElement) {
        onCloseRef.current();
        return;
      }

      if (!popupId) {
        return;
      }

      if (isPopupBranchTarget(event.target)) {
        return;
      }

      onCloseRef.current();
    };
    viewDocument.addEventListener("mousedown", handleOutsideMouseDown);
    return () => viewDocument.removeEventListener("mousedown", handleOutsideMouseDown);
  }, [
    closeOnOutsideClick,
    isPopupBranchTarget,
    isWithinIgnoredOutsideTarget,
    popupId,
    popupRef,
    viewDocument,
    viewWindow,
  ]);

  const handleMouseEnter = (event: React.MouseEvent<HTMLElement>) => {
    setIsHovering(true);
    const relatedPopupId = getPopupElementId(event.relatedTarget, viewWindow);
    if (popupId && isPopupDescendantOf?.(relatedPopupId ?? "", popupId)) {
      if (isContextMenuPopupId(relatedPopupId)) {
        // コンテキストメニューは outside click まで維持したいので、
        // 子メニューから親へ戻っても branch を自動で閉じない。
        onPopupMouseEnter?.();
        return;
      }
      // 親へ戻った瞬間にその親配下の枝を畳むと、子から親へ戻った後に古い子孫が残らない。
      suppressNextDisableReleaseCloseRef.current = true;
      onEnterFromDescendant?.();
    }
    onPopupMouseEnter?.();
  };

  const handleMouseLeave = (event: React.MouseEvent<HTMLElement>) => {
    const relatedTarget = getEventTargetElement(event.relatedTarget, viewWindow);
    if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
      return;
    }
    const relatedPopupId = getPopupElementId(event.relatedTarget, viewWindow);
    if (popupId && relatedPopupId) {
      if (isPopupBranchTarget(event.relatedTarget)) {
        // 子孫popupへ移動した時も実際には親popupを離れているので hover だけは解除し、
        // 子が閉じた瞬間に「まだ親を指しているか」を closeDisabled の復帰判定で見直せるようにする。
        setIsHovering(false);
        return;
      }
    }
    if (
      !popupId &&
      getEventTargetElement(event.relatedTarget, viewWindow)?.closest(POPUP_SELECTOR)
    ) {
      return;
    }
    if (shouldSuppressMouseLeaveClose()) {
      return;
    }
    // 子孫へ抜ける時だけ枝を維持し、それ以外の遷移は種類に関係なく現在のpopupを閉じる。
    onPopupMouseLeave?.();
    setIsHovering(false);
    if (!closeOnMouseLeave) {
      return;
    }
    if (closeDisabled) {
      return;
    }
    onCloseRef.current();
  };

  return {
    armMouseLeaveCloseSuppression,
    handleAuxClickCapture,
    handleMouseDownCapture,
    handleMouseEnter,
    handleMouseLeave,
  };
}
