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

function buildIdPopupCopyText(items: IRes[], threadTitle?: string, threadUrl?: string): string {
  const sections = [items.map(formatResForCopy).join("\n\n")];
  const threadInfo = [threadTitle, threadUrl].filter((value): value is string => value != null);
  if (threadInfo.length > 0) {
    sections.push(threadInfo.join("\n"));
  }
  return sections.join("\n\n");
}

// --- IDポップアップ ---
export const ResPopup: React.FC<{
  x: number;
  y: number;
  title: string;
  items: IRes[];
  messageProtocol: string;
  repIndex: Map<number, Set<number>>;
  idIndex?: Map<string, Set<number>>;
  onUrlClick: UrlClickHandler;
  onUrlContextMenu: UrlContextMenuHandler;
  onIdLinkClick: (id: string, e: React.MouseEvent) => void;
  onRepClick: (resNum: number, e: React.MouseEvent) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (targets: number[], anchorRect: DOMRect, label: string, depth: number) => void;
  onAnchorLeave: (fromDepth: number) => void;
  /**
   * メニューを親ポップアップと同じスタックで管理し、
   * 子メニューのクリックで親が閉じないよう中央管理へ委譲する。
   */
  onResContextMenu: (targetRes: IRes, event: React.MouseEvent) => void;
  onClose: () => void;
  /** アンカープレビューとの親子関係制御用 */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  popupId?: string;
  isPopupDescendantOf?: (popupId: string, ancestorId: string) => boolean;
  onEnterFromDescendant?: () => void;
  /** 親popupをクリックした時に、その配下の枝だけ畳めるようにする。 */
  onPopupMouseDown?: () => void;
  /** 子ポップアップが開いている間は外側クリック閉じを無効にする */
  disableOutsideClick?: boolean;
  /** ピン留め中は明示的に閉じるまで自動クローズしない。 */
  pinned?: boolean;
  onTogglePinned?: () => void;
  /** z-indexを明示指定（省略時はCSSのデフォルト値を使用） */
  zIndex?: number;
  /** 画像コピー末尾に付加するスレタイ */
  threadTitle?: string;
  /** 画像コピー末尾に付加するスレッドURL */
  threadUrl?: string;
  /** ポップアップ内でも画像ぼかしを適用するためのセット */
  blurredResNums?: Set<number>;
  ngResNums?: ReadonlySet<number>;
  ownResNums?: ReadonlySet<number>;
  replyToOwnResNums?: ReadonlySet<number>;
  resMap?: ReadonlyMap<number, unknown>;
  threadKey?: string;
}> = ({
  x,
  y,
  title,
  items,
  messageProtocol,
  repIndex,
  idIndex,
  onUrlClick,
  onUrlContextMenu,
  onIdLinkClick,
  onRepClick,
  onAnchorClick,
  onAnchorHover,
  onAnchorLeave,
  onResContextMenu,
  onClose,
  onMouseEnter,
  onMouseLeave,
  popupId,
  isPopupDescendantOf,
  onEnterFromDescendant,
  onPopupMouseDown,
  disableOutsideClick,
  pinned = false,
  onTogglePinned,
  zIndex,
  threadTitle,
  threadUrl,
  blurredResNums,
  ngResNums,
  ownResNums,
  replyToOwnResNums,
  resMap,
  threadKey,
}) => {
  const viewSurface = useViewSurface();
  const toast = useToast();
  const { document: viewDocument } = viewSurface;
  const theme = useTheme();
  const { menuButtonRef, menuPosition, handleMenuClick, closeMenu } = usePopupHeaderMenu();
  // 変更理由: IDレス本文のコピーも共通コマンドへ寄せ、別窓のClipboardと通知先を
  // メニューごとに個別管理しないようにする。
  const runClipboardCommand = useCallback(
    (text: string) => {
      void runCommandRequest(
        { id: COMMAND_REQUEST_IDS.CLIPBOARD_COPY_TEXT, args: { text } },
        { surface: viewSurface, toast },
      );
    },
    [toast, viewSurface],
  );

  const idMenuItems: ContextMenuItem[] = [
    {
      id: "copy-id-responses",
      label: "IDのレスを一括コピー",
      icon: <Copy size={14} />,
      onSelect: () => {
        // ID索引の表示順を保ったままコピーし、別の場所へ移してもレス単位で読める形にする。
        runClipboardCommand(buildIdPopupCopyText(items, threadTitle, threadUrl));
      },
    },
    {
      id: "copy-id-image",
      label: "IDのレスを画像としてコピー",
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
          "IDのレス画像",
        );
      },
    },
    {
      id: "toggle-id-pin",
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
  return (
    <FloatingPopup
      className="res-popup"
      x={x}
      y={y}
      zIndex={zIndex}
      popupId={popupId}
      isPopupDescendantOf={isPopupDescendantOf}
      onEnterFromDescendant={onEnterFromDescendant}
      closeDisabled={disableOutsideClick || pinned}
      closeOnOutsideClick={!pinned}
      onClose={onClose}
      onPopupMouseDown={onPopupMouseDown}
      onPopupMouseEnter={onMouseEnter}
      onPopupMouseLeave={onMouseLeave}
      // ポップアップ内のレス間マウス移動で ResBody の handleMouseLeave が起動した
      // アンカープレビュー hide タイマーをキャンセルする。mouseover はバブルするため、
      // 子孫要素への移動時も発火し、mouseenter と異なりポップアップ外からの進入に限定されない。
      onMouseOver={onMouseEnter}
    >
      {({ armMouseLeaveCloseSuppression }) => (
        <>
          <PopupHeader
            title={title}
            menuButtonRef={menuButtonRef}
            menuLabel="IDポップアップメニュー"
            onMenuClick={handleMenuClick}
            pinned={pinned}
            onTogglePinned={onTogglePinned}
            onClose={onClose}
          />
          <div className="res-popup__body">
            {items.map((res) => (
              <PopupResCard
                key={res.num}
                res={res}
                messageProtocol={messageProtocol}
                anchorPreviewDepth={0}
                repIndex={repIndex}
                idIndex={idIndex}
                onUrlClick={onUrlClick}
                onUrlContextMenu={onUrlContextMenu}
                onLinkMiddleClickStart={armMouseLeaveCloseSuppression}
                onIdLinkClick={onIdLinkClick}
                onRepClick={onRepClick}
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
              />
            ))}
          </div>
          {menuPosition && items.length > 0 && (
            <ContextMenu
              x={menuPosition.x}
              y={menuPosition.y}
              items={idMenuItems}
              // ヘッダーメニューを所属popupとして扱い、メニュー操作で親のIDポップアップを閉じない。
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
