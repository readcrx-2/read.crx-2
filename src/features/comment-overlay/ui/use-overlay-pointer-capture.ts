import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import { type RefObject, useEffect } from "react";
import { createLogger } from "src/app/logger";
import { isTauriRuntime } from "src/app/platform/runtime";

const logger = createLogger("comment-overlay");

/** 透過中の窓にはmouseenterが届かないため、OSのカーソル座標でコメントを判定する。 */
export function useOverlayPointerCapture(rootRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!isTauriRuntime()) return;
    const overlay = getCurrentWindow();
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let capturing = false;

    const sample = async (): Promise<void> => {
      try {
        if (!(await overlay.isVisible())) {
          if (capturing) {
            await overlay.setIgnoreCursorEvents(true);
            capturing = false;
          }
          if (!disposed) timer = setTimeout(() => void sample(), 250);
          return;
        }

        const [cursor, origin, scaleFactor] = await Promise.all([
          cursorPosition(),
          overlay.innerPosition(),
          overlay.scaleFactor(),
        ]);
        if (disposed) return;
        const root = rootRef.current;
        const x = (cursor.x - origin.x) / scaleFactor;
        const y = (cursor.y - origin.y) / scaleFactor;
        const target = root?.ownerDocument.elementFromPoint(x, y);
        const hovered = target?.closest<HTMLElement>(".comment-overlay-stage__comment");
        const commentKey = root?.contains(hovered ?? null)
          ? (hovered?.dataset.commentKey ?? null)
          : null;
        const hasMenu = root?.querySelector(".comment-overlay-stage__menu") != null;
        // 変更理由: 窓全体の入力を常時有効にすると透明部分も背後の操作を塞ぐ。
        // コメントか開いたメニュー上にいる時だけ透過を解除し、状態が変わる時だけIPCする。
        const shouldCapture = commentKey !== null || hasMenu;
        if (shouldCapture !== capturing) {
          await overlay.setIgnoreCursorEvents(!shouldCapture);
          capturing = shouldCapture;
        }
        if (!disposed) {
          timer = setTimeout(() => void sample(), 16);
        }
      } catch (error: unknown) {
        logger.error("コメントOverlayのカーソル判定に失敗しました:", error);
        if (!disposed) timer = setTimeout(() => void sample(), 1000);
      }
    };

    void sample();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      void overlay.setIgnoreCursorEvents(true).catch((error: unknown) => {
        logger.error("コメントOverlayのクリック透過復元に失敗しました:", error);
      });
    };
  }, [rootRef]);
}
