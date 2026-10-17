import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriRuntime } from "src/app/platform/runtime";

import { createBrowserCommentOverlayPlatform } from "./browser";
import { createTauriCommentOverlayPlatform } from "./tauri";

export function createCommentOverlayWindowPlatform() {
  return isTauriRuntime()
    ? createTauriCommentOverlayPlatform({ managePlacement: getCurrentWindow().label === "main" })
    : createBrowserCommentOverlayPlatform();
}

export const commentOverlayWindowPlatform = createCommentOverlayWindowPlatform();

export type { CommentOverlayEvent, CommentOverlayEventBus } from "../domain";
export {
  COMMENT_OVERLAY_EVENT_NAME,
  createCommentOverlayEventBus,
  TauriCommentOverlayEventBus,
} from "./events";
export { fitCommentOverlayGeometryToAspectRatio } from "./geometry";
// 過去実況機能も同じ表示専用Overlay窓へ通知するため、窓ラベルだけをfeature間契約として公開する。
export { COMMENT_OVERLAY_VISIBILITY_EVENT_NAME, COMMENT_OVERLAY_WINDOW_LABEL } from "./tauri";
export type {
  CommentOverlayGeometry,
  CommentOverlayMonitor,
  CommentOverlayWindowPlatform,
} from "./types";
export { COMMENT_OVERLAY_ASPECT_RATIO, DEFAULT_COMMENT_OVERLAY_GEOMETRY } from "./types";
