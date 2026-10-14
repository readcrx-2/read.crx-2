import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  AnchorPopupItem,
  ContextMenuPopupItem,
  ContextMenuPopupPayload,
  IdPopupItem,
  PopupItem,
  TreePopupItem,
} from "src/features/popup/browser/popup-types";
import { usePopupCore } from "src/features/popup/browser/use-popup-core";
import type { IRes } from "src/service-container/interfaces";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import {
  ANCHOR_PREVIEW_GUTTER,
  ANCHOR_PREVIEW_HIDE_DELAY_MS,
  ANCHOR_PREVIEW_MAX_WIDTH,
  ANCHOR_PREVIEW_OFFSET,
} from "src/view/browser/utils/constants";
import { getPopupViewportBounds } from "src/view/browser/utils/use-adjust-overflow";

const DEFAULT_POPUP_SCOPE_ID = "default";

export interface ThreadPopupManagerParams {
  scopeId?: string;
  rootRef: RefObject<HTMLDivElement | null>;
  resMap: Map<number, IRes>;
}

export interface ThreadPopupManagerResult {
  popups: PopupItem[];
  anchorPreviews: AnchorPopupItem[];
  treePopupItems: TreePopupItem[];
  idPopupItems: IdPopupItem[];
  contextMenuItems: ContextMenuPopupItem[];
  hasAnchorPreviews: boolean;
  addPopup: (popup: Omit<PopupItem, "id" | "z">) => string;
  addTreePopup: (
    resNum: number,
    clientX: number,
    clientY: number,
    parentId?: string,
    anchorPreviewDepth?: number,
  ) => string;
  addPopupContextMenu: (
    clientX: number,
    clientY: number,
    items: ContextMenuPopupPayload["items"],
    parentId?: string,
  ) => string;
  addIdPopup: (
    clientX: number,
    clientY: number,
    items: IRes[],
    title: string,
    parentId?: string,
  ) => string;
  clearAnchorPreviewHideTimer: () => void;
  closeNonContextPopups: () => void;
  closePopupById: (id: string) => void;
  closePopupChildren: (popupId: string) => void;
  isPopupDescendantOf: (popupId: string, ancestorId: string) => boolean;
  toggleTreePopupPinned: (popupId: string) => void;
  toggleIdPopupPinned: (popupId: string) => void;
  toggleAnchorPopupPinned: (popupId: string) => void;
  hasPopupChild: (popupId: string) => boolean;
  hideAnchorPreview: (fromDepth?: number) => void;
  hideAnchorPreviewImmediately: (fromDepth?: number) => void;
  showAnchorPreview: (
    targets: number[],
    anchorRect: DOMRect,
    label: string,
    depth: number,
    sourcePopupId?: string,
  ) => void;
}

export function useThreadPopupManager({
  scopeId = DEFAULT_POPUP_SCOPE_ID,
  // rootRef はAPI互換のため受け取るが、座標系は viewport(clientX/Y) を直接使うので未使用。
  resMap,
}: ThreadPopupManagerParams): ThreadPopupManagerResult {
  const { window: viewWindow, document: viewDocument } = useViewSurface();
  const {
    popups,
    addPopup,
    closePopupById,
    closePopupsByPredicate,
    closeNonContextPopups,
    closePopupChildren,
    isPopupDescendantOf,
    toggleTreePopupPinned,
    toggleIdPopupPinned,
    toggleAnchorPopupPinned,
  } = usePopupCore(scopeId);
  const anchorPreviewHideTimerRef = useRef<number | null>(null);

  const anchorPreviews = useMemo(
    () =>
      popups
        .filter((item): item is AnchorPopupItem => item.type === "anchor")
        .sort((left, right) => left.payload.depth - right.payload.depth),
    [popups],
  );
  const anchorPreviewsRef = useRef<AnchorPopupItem[]>(anchorPreviews);
  anchorPreviewsRef.current = anchorPreviews;

  const treePopupItems = useMemo(
    () => popups.filter((item): item is TreePopupItem => item.type === "tree"),
    [popups],
  );
  const idPopupItems = useMemo(
    () => popups.filter((item): item is IdPopupItem => item.type === "id"),
    [popups],
  );
  const contextMenuItems = useMemo(
    () => popups.filter((item): item is ContextMenuPopupItem => item.type === "contextMenu"),
    [popups],
  );

  const toPageCoords = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    // popup-portal-layer を position:fixed (viewport基準) にしたため、
    // ポップアップ要素の offsetParent もそのレイヤー(=viewport左上)になる。
    // clientX/clientY をそのまま左上座標として渡すのが正しい。
    return { x: clientX, y: clientY };
  }, []);

  const clearAnchorPreviewHideTimer = useCallback(() => {
    if (anchorPreviewHideTimerRef.current != null) {
      viewWindow.clearTimeout(anchorPreviewHideTimerRef.current);
      anchorPreviewHideTimerRef.current = null;
    }
  }, [viewWindow]);

  const hideAnchorPreviewsFromDepth = useCallback(
    (depth: number) => {
      // 変更理由: ピン留めしたアンカーは利用者が明示的に閉じるまで残すため、
      // 自動クローズの対象から外す。返信ツリーやIDポップアップの固定と同じ扱いにする。
      closePopupsByPredicate(
        (item) => item.type === "anchor" && item.payload.depth >= depth && !item.payload.pinned,
      );
    },
    [closePopupsByPredicate],
  );

  const hideAnchorPreviewImmediately = useCallback(
    (fromDepth = 0) => {
      clearAnchorPreviewHideTimer();
      hideAnchorPreviewsFromDepth(fromDepth);
    },
    [clearAnchorPreviewHideTimer, hideAnchorPreviewsFromDepth],
  );

  const hideAnchorPreview = useCallback(
    (fromDepth = 0) => {
      clearAnchorPreviewHideTimer();
      anchorPreviewHideTimerRef.current = viewWindow.setTimeout(() => {
        anchorPreviewHideTimerRef.current = null;
        hideAnchorPreviewsFromDepth(fromDepth);
      }, ANCHOR_PREVIEW_HIDE_DELAY_MS);
    },
    [clearAnchorPreviewHideTimer, hideAnchorPreviewsFromDepth, viewWindow],
  );

  const showAnchorPreview = useCallback(
    (
      targets: number[],
      anchorRect: DOMRect,
      label: string,
      depth: number,
      sourcePopupId?: string,
    ) => {
      clearAnchorPreviewHideTimer();
      const items = targets.map((num) => resMap.get(num)).filter((res): res is IRes => !!res);
      if (items.length === 0) {
        hideAnchorPreviewsFromDepth(depth);
        return;
      }

      const maxWidth = Math.min(
        ANCHOR_PREVIEW_MAX_WIDTH,
        viewWindow.innerWidth - ANCHOR_PREVIEW_GUTTER * 2,
      );
      const viewport = getPopupViewportBounds(viewWindow, viewDocument);
      const vx = Math.max(
        ANCHOR_PREVIEW_GUTTER,
        Math.min(anchorRect.left, viewWindow.innerWidth - maxWidth - ANCHOR_PREVIEW_GUTTER),
      );
      const vy = Math.max(
        ANCHOR_PREVIEW_GUTTER,
        Math.min(
          anchorRect.bottom + ANCHOR_PREVIEW_OFFSET,
          viewport.bottom - ANCHOR_PREVIEW_GUTTER,
        ),
      );
      const { x, y } = toPageCoords(vx, vy);
      const currentPreview = anchorPreviewsRef.current.find((item) => item.payload.depth === depth);
      if (
        currentPreview &&
        currentPreview.payload.label === label &&
        currentPreview.x === x &&
        currentPreview.y === y &&
        currentPreview.payload.items.length === items.length &&
        currentPreview.payload.items.every((item, index) => item.num === items[index]?.num)
      ) {
        return;
      }

      const parentId = depth > 0 ? anchorPreviewsRef.current[depth - 1]?.id : sourcePopupId;
      // sourcePopupId が設定されている時（popup内のアンカーホバー）は、
      // sourcePopupId の祖先になっているアンカープレビューを閉じてはいけない。
      // hideAnchorPreviewsFromDepth は cascade で子孫ごと閉じるため、
      // 「アンカー → ID → アンカー」の順に操作すると IDポップアップの親アンカーが
      // 消えて IDポップアップ自体も一緒に閉じてしまう問題を防ぐためこの分岐が必要。
      if (sourcePopupId) {
        closePopupsByPredicate(
          (item) =>
            item.type === "anchor" &&
            item.payload.depth >= depth &&
            !item.payload.pinned &&
            !isPopupDescendantOf(sourcePopupId, item.id),
        );
      } else {
        hideAnchorPreviewsFromDepth(depth);
      }
      addPopup({
        type: "anchor",
        x,
        y,
        payload: { items, label, depth, pinned: false },
        parentId,
      });
    },
    [
      addPopup,
      clearAnchorPreviewHideTimer,
      closePopupsByPredicate,
      hideAnchorPreviewsFromDepth,
      isPopupDescendantOf,
      resMap,
      toPageCoords,
      viewDocument,
      viewWindow,
    ],
  );

  const addTreePopup = useCallback(
    (
      resNum: number,
      clientX: number,
      clientY: number,
      parentId?: string,
      anchorPreviewDepth = 0,
    ) => {
      const { x, y } = toPageCoords(clientX, clientY);
      return addPopup({
        type: "tree",
        x,
        y,
        payload: { resNum, anchorPreviewDepth, pinned: false },
        parentId,
      });
    },
    [addPopup, toPageCoords],
  );

  const addPopupContextMenu = useCallback(
    (
      clientX: number,
      clientY: number,
      items: ContextMenuPopupPayload["items"],
      parentId?: string,
    ) => {
      closePopupsByPredicate((item) => item.type === "contextMenu");
      const { x, y } = toPageCoords(clientX, clientY);
      return addPopup({
        type: "contextMenu",
        x,
        y,
        payload: { items },
        parentId,
      });
    },
    [addPopup, closePopupsByPredicate, toPageCoords],
  );

  const addIdPopup = useCallback(
    (clientX: number, clientY: number, items: IRes[], title: string, parentId?: string) => {
      const { x, y } = toPageCoords(clientX, clientY);
      return addPopup({
        type: "id",
        x,
        y,
        // IDポップアップも返信ツリーと同じく、明示的に固定状態を持たせる。
        payload: { items, title, pinned: false },
        parentId,
      });
    },
    [addPopup, toPageCoords],
  );

  const hasPopupChild = useCallback(
    (popupId: string) => popups.some((item) => item.parentId === popupId),
    [popups],
  );

  useEffect(() => {
    return () => {
      if (anchorPreviewHideTimerRef.current != null) {
        viewWindow.clearTimeout(anchorPreviewHideTimerRef.current);
      }
    };
  }, [viewWindow]);

  return {
    popups,
    anchorPreviews,
    treePopupItems,
    idPopupItems,
    contextMenuItems,
    hasAnchorPreviews: anchorPreviews.length > 0,
    addPopup,
    addTreePopup,
    addPopupContextMenu,
    addIdPopup,
    clearAnchorPreviewHideTimer,
    closeNonContextPopups,
    closePopupById,
    closePopupChildren,
    isPopupDescendantOf,
    toggleTreePopupPinned,
    toggleIdPopupPinned,
    toggleAnchorPopupPinned,
    hasPopupChild,
    hideAnchorPreview,
    hideAnchorPreviewImmediately,
    showAnchorPreview,
  };
}
