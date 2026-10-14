import { Copy, Image as ImageIcon, Pin, PinOff } from "lucide-react";
import React, { useCallback } from "react";
import { usePopupHeaderMenu } from "src/features/popup/browser/use-popup-header-menu";
import { PopupHeader } from "src/features/popup/ui/PopupHeader";
import { PopupResCard } from "src/features/popup/ui/PopupResCard";
import type { IRes } from "src/service-container";
import { COMMAND_REQUEST_IDS, runCommandRequest } from "src/view/browser/commands/command-runtime";
import { useTheme } from "src/view/browser/hooks/use-theme";
import { useToast } from "src/view/browser/hooks/use-toast";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import type { ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import { ContextMenu } from "src/view/browser/ui/ContextMenu";
import { FloatingPopup } from "src/view/browser/ui/FloatingPopup";
import { canCopyImageToClipboard, copyImageWithNotice } from "src/view/browser/utils/clipboard";
import type { UrlClickHandler, UrlContextMenuHandler } from "src/view/browser/utils/link-routing";
import { formatResForCopy } from "src/view/browser/utils/response-format";
import { canvasToBlob, renderResponseListImageCanvas } from "src/view/browser/utils/response-image";

function buildAnchorPopupCopyText(items: IRes[], threadTitle?: string, threadUrl?: string): string {
  const sections = [items.map(formatResForCopy).join("\n\n")];
  const threadInfo = [threadTitle, threadUrl].filter((value): value is string => value != null);
  if (threadInfo.length > 0) {
    sections.push(threadInfo.join("\n"));
  }
  return sections.join("\n\n");
}

export interface AnchorPreviewProps {
  depth: number;
  x: number;
  y: number;
  items: IRes[];
  label: string;
  messageProtocol: string;
  repIndex: Map<number, Set<number>>;
  idIndex?: Map<string, Set<number>>;
  onUrlClick: UrlClickHandler;
  onUrlContextMenu: UrlContextMenuHandler;
  onIdLinkClick: (id: string, e: React.MouseEvent) => void;
  onRepClick: (resNum: number, e: React.MouseEvent) => void;
  onOpenRootReplyTree: (resNum: number, e: React.MouseEvent) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (targets: number[], anchorRect: DOMRect, label: string, depth: number) => void;
  onAnchorLeave: (fromDepth: number) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  popupId?: string;
  isPopupDescendantOf?: (popupId: string, ancestorId: string) => boolean;
  onEnterFromDescendant?: () => void;
  /** 親popup自体を触った時は、このpreview配下の枝だけ閉じ直せるようにする。 */
  onPopupMouseDown?: () => void;
  /** 子メニューも親子スタックへ載せ、参照プレビューの早閉じを防ぐ。 */
  onResContextMenu: (targetRes: IRes, event: React.MouseEvent) => void;
  hasChildPopup?: boolean;
  /** z-indexを明示指定（後から開いたポップアップが前面に出るよう呼び出し元が管理する） */
  zIndex: number;
  /** ポップアップ内でも画像ぼかしを適用するためのセット */
  blurredResNums?: Set<number>;
  ngResNums?: ReadonlySet<number>;
  ownResNums?: ReadonlySet<number>;
  replyToOwnResNums?: ReadonlySet<number>;
  resMap?: ReadonlyMap<number, unknown>;
  threadKey?: string;
  /** ピン留め中は明示的に閉じるまで自動クローズしない。 */
  pinned?: boolean;
  onTogglePinned?: () => void;
  /** ヘッダーの閉じるボタンや外側クリックで閉じる時の処理 */
  onClose?: () => void;
  /** 一括コピー末尾に付加するスレタイ */
  threadTitle?: string;
  /** 一括コピー末尾に付加するスレッドURL */
  threadUrl?: string;
}

export const AnchorPreview: React.FC<AnchorPreviewProps> = ({
  depth,
  x,
  y,
  items,
  label,
  messageProtocol,
  repIndex,
  idIndex,
  onUrlClick,
  onUrlContextMenu,
  onIdLinkClick,
  onRepClick,
  onOpenRootReplyTree,
  onAnchorClick,
  onAnchorHover,
  onAnchorLeave,
  onMouseEnter,
  onMouseLeave,
  popupId,
  isPopupDescendantOf,
  onEnterFromDescendant,
  onPopupMouseDown,
  onResContextMenu,
  hasChildPopup,
  zIndex,
  blurredResNums,
  ngResNums,
  ownResNums,
  replyToOwnResNums,
  resMap,
  threadKey,
  pinned = false,
  onTogglePinned,
  onClose,
  threadTitle,
  threadUrl,
}) => {
  const viewSurface = useViewSurface();
  const toast = useToast();
  const { document: viewDocument } = viewSurface;
  const theme = useTheme();
  const { menuButtonRef, menuPosition, handleMenuClick, closeMenu } = usePopupHeaderMenu();
  const title = `参照: ${label}`;
  // 変更理由: ポップアップ固有のClipboard呼び出しをなくし、別窓でも
  // 同じ表示先とエラー通知を共有する。
  const runClipboardCommand = useCallback(
    (text: string) => {
      void runCommandRequest(
        { id: COMMAND_REQUEST_IDS.CLIPBOARD_COPY_TEXT, args: { text } },
        { surface: viewSurface, toast },
      );
    },
    [toast, viewSurface],
  );

  const anchorMenuItems: ContextMenuItem[] = [
    {
      id: "copy-anchor-responses",
      label: "参照を一括コピー",
      icon: <Copy size={14} />,
      onSelect: () => {
        // 変更理由: IDポップアップと同じく表示順を保ったままコピーし、貼り付け先でも読める形にする。
        runClipboardCommand(buildAnchorPopupCopyText(items, threadTitle, threadUrl));
      },
    },
    {
      id: "copy-anchor-image",
      label: "参照を画像としてコピー",
      icon: <ImageIcon size={14} />,
      disabled: !canCopyImageToClipboard(viewSurface),
      onSelect: () => {
        void copyImageWithNotice(
          async () => {
            const canvas = renderResponseListImageCanvas(items, {
              title,
              threadTitle,
              threadUrl,
              theme,
              targetDocument: viewDocument,
            });
            return canvasToBlob(canvas);
          },
          viewSurface,
          toast,
          "参照画像",
        );
      },
    },
    {
      id: "toggle-anchor-pin",
      label: pinned ? "ピン留めを解除" : "ピン留め",
      icon: pinned ? <PinOff size={14} /> : <Pin size={14} />,
      onSelect: onTogglePinned,
    },
  ];

  const handleResContextMenu = useCallback(
    (event: React.MouseEvent, targetRes: IRes) => {
      event.stopPropagation();
      // 右クリックの mousedown では選択保護のため子孫を畳まない設計なので、
      // 選択が確定した contextmenu のこの時点で配下の子孫ポップアップを畳む。
      onPopupMouseDown?.();
      onResContextMenu(targetRes, event);
    },
    [onResContextMenu, onPopupMouseDown],
  );

  const handleClose = useCallback(() => {
    // 変更理由: ピン留め時もヘッダーの閉じるボタンでは明示的に閉じられるようにし、
    // ホバー離脱による自動クローズだけを抑止する。非ピン時は従来どおり離脱時と同じ処理へ委譲する。
    if (onClose) {
      onClose();
      return;
    }
    onMouseLeave();
  }, [onClose, onMouseLeave]);

  return (
    <FloatingPopup
      className="anchor-preview"
      x={x}
      y={y}
      zIndex={zIndex}
      popupId={popupId}
      isPopupDescendantOf={isPopupDescendantOf}
      onEnterFromDescendant={onEnterFromDescendant}
      closeDisabled={hasChildPopup || pinned}
      closeOnOutsideClick={!pinned}
      onClose={onMouseLeave}
      onPopupMouseDown={onPopupMouseDown}
      onPopupMouseEnter={onMouseEnter}
      onMouseOver={onMouseEnter}
    >
      {({ armMouseLeaveCloseSuppression }) => (
        <>
          {/* 変更理由: IDポップアップや返信ツリーと共通のヘッダー操作にし、
              ピン留め・コピー・画像化を三点ドットメニューから利用できるようにする。 */}
          <PopupHeader
            title={title}
            menuButtonRef={menuButtonRef}
            menuLabel="アンカーポップアップメニュー"
            onMenuClick={handleMenuClick}
            pinned={pinned}
            onTogglePinned={onTogglePinned}
            onClose={handleClose}
          />
          <div className="anchor-preview__body">
            {items.slice(0, 8).map((res) => (
              /* hard-ngでも空のアンカーポップアップにせず、利用者が明示操作で本文を確認できるようにする。 */
              <PopupResCard
                key={res.num}
                res={res}
                messageProtocol={messageProtocol}
                anchorPreviewDepth={depth + 1}
                repIndex={repIndex}
                idIndex={idIndex}
                onUrlClick={onUrlClick}
                onUrlContextMenu={onUrlContextMenu}
                onLinkMiddleClickStart={armMouseLeaveCloseSuppression}
                onIdLinkClick={onIdLinkClick}
                onRepClick={onRepClick}
                onOpenRootReplyTree={onOpenRootReplyTree}
                onAnchorClick={onAnchorClick}
                onAnchorHover={onAnchorHover}
                onAnchorLeave={onAnchorLeave}
                onContextMenu={handleResContextMenu}
                isImageBlurred={blurredResNums?.has(res.num)}
                ngResNums={ngResNums}
                isOwn={ownResNums?.has(res.num)}
                isReplyToOwn={replyToOwnResNums?.has(res.num)}
                resMap={resMap}
                threadKey={threadKey}
                allowHardNgReveal
              />
            ))}
          </div>
          {menuPosition && items.length > 0 && (
            <ContextMenu
              x={menuPosition.x}
              y={menuPosition.y}
              items={anchorMenuItems}
              // 変更理由: ヘッダーメニューを所属popupとして扱い、メニュー操作で親子ごと閉じないようにする。
              popupId={popupId}
              // 変更理由: 三点ボタンもトグル操作のため、押下時の Radix 側の先行closeで
              // click トグルが開き直さないようトリガーとして登録する。
              triggerRef={menuButtonRef}
              onClose={closeMenu}
            />
          )}
        </>
      )}
    </FloatingPopup>
  );
};
AnchorPreview.displayName = "AnchorPreview";
