import type React from "react";
import { useCallback, useMemo } from "react";
import { buildReplyIndexes } from "src/core/thread/reply-index";
import { usePopupHeaderMenu } from "src/features/popup/browser/use-popup-header-menu";
import { useReplyTreeMenus } from "src/features/popup/browser/use-reply-tree-menus";
import { PopupHeader } from "src/features/popup/ui/PopupHeader";
import { PopupResCard } from "src/features/popup/ui/PopupResCard";
import { ReplyTree } from "src/features/popup/ui/ReplyTree";
import type { IRes } from "src/service-container";
import { ContextMenu } from "src/view/browser/ui/ContextMenu";
import { FloatingPopup } from "src/view/browser/ui/FloatingPopup";
import type { UrlClickHandler, UrlContextMenuHandler } from "src/view/browser/utils/link-routing";

// --- 返信ツリーポップアップ ---
export const ReplyTreePopup: React.FC<{
  x: number;
  y: number;
  resNum: number;
  repIndex: Map<number, Set<number>>;
  /** ライブチャットでは入場が完了したレスだけを返信ツリーへ反映する。 */
  replySourceNums?: ReadonlySet<number>;
  idIndex?: Map<string, Set<number>>;
  resMap: Map<number, IRes>;
  messageProtocol: string;
  anchorPreviewDepth: number;
  onUrlClick: UrlClickHandler;
  onUrlContextMenu: UrlContextMenuHandler;
  onIdLinkClick: (id: string, e: React.MouseEvent) => void;
  onRepClick: (resNum: number, e: React.MouseEvent) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (targets: number[], anchorRect: DOMRect, label: string, depth: number) => void;
  onAnchorLeave: (fromDepth: number) => void;
  /** 親子関係つきのメニュースタックをThreadPage側で一元管理する。 */
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
  /** 一括コピー末尾に付加するスレタイ */
  threadTitle?: string;
  /** 一括コピー末尾に付加するスレッドURL */
  threadUrl?: string;
  /** ポップアップ内でも画像ぼかしを適用するためのセット */
  blurredResNums?: Set<number>;
  ngResNums?: ReadonlySet<number>;
  ownResNums?: ReadonlySet<number>;
  replyToOwnResNums?: ReadonlySet<number>;
  threadKey?: string;
}> = ({
  x,
  y,
  resNum,
  repIndex,
  replySourceNums,
  idIndex,
  resMap,
  messageProtocol,
  anchorPreviewDepth,
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
  threadKey,
}) => {
  // hard-ngの通常索引は非表示レスを除外するため、返信ツリーでは全レスから専用索引を作り、
  // NGレスもクリック式プレースホルダーとして辿れるようにする。
  // ライブチャットの未表示分は専用索引にも混ぜず、返信数とツリーの先出しを防ぐ。
  const treeRepIndex = useMemo(
    () =>
      buildReplyIndexes(
        Array.from(resMap.values()).filter(
          (res) => replySourceNums == null || replySourceNums.has(res.num),
        ),
      ).repIndex,
    [replySourceNums, resMap],
  );
  const { menuButtonRef, menuPosition, handleMenuClick, closeMenu } = usePopupHeaderMenu();
  const { treeMenuItems, subTreeMenu, subTreeMenuItems, handleSubTreeMenuClick, closeSubTreeMenu } =
    useReplyTreeMenus({
      resNum,
      resMap,
      treeRepIndex,
      threadTitle,
      threadUrl,
      pinned,
      onTogglePinned,
    });
  const sourceRes = resMap.get(resNum) ?? null;

  const handleResContextMenu = useCallback(
    (event: React.MouseEvent, targetRes: IRes) => {
      event.stopPropagation();
      // 右クリックで文脈メニューを開く前に、このポップアップ配下の子孫
      // (アンカープレビュー/子ツリー)を畳む。テキスト選択を消さないため右クリックの
      // mousedown では閉じない設計（button=2 をスキップ）になっており、選択が確定した
      // contextmenu のこの時点で onPopupMouseDown(=子孫クローズ) を呼んで畳む。
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
            title={`>>${resNum} への返信ツリー`}
            menuButtonRef={menuButtonRef}
            menuLabel="返信ツリーメニュー"
            onMenuClick={handleMenuClick}
            pinned={pinned}
            onTogglePinned={onTogglePinned}
            onClose={onClose}
          />
          <div className="res-popup__body">
            {sourceRes && (
              <section className="res-popup__section">
                <div className="res-popup__section-title">参照元レス</div>
                <PopupResCard
                  res={sourceRes}
                  messageProtocol={messageProtocol}
                  anchorPreviewDepth={anchorPreviewDepth}
                  repIndex={repIndex}
                  idIndex={idIndex}
                  // 参照元レスの「返信」を押すと同じツリーを重ね続けるだけなので無効化する。
                  disableRepClick={true}
                  isHighlighted={true}
                  onUrlClick={onUrlClick}
                  onUrlContextMenu={onUrlContextMenu}
                  onLinkMiddleClickStart={armMouseLeaveCloseSuppression}
                  onIdLinkClick={onIdLinkClick}
                  onRepClick={onRepClick}
                  onAnchorClick={onAnchorClick}
                  onAnchorHover={onAnchorHover}
                  onAnchorLeave={onAnchorLeave}
                  onContextMenu={handleResContextMenu}
                  isImageBlurred={blurredResNums?.has(sourceRes.num)}
                  ngResNums={ngResNums}
                  isOwn={ownResNums?.has(sourceRes.num)}
                  isReplyToOwn={replyToOwnResNums?.has(sourceRes.num)}
                  resMap={resMap}
                  threadKey={threadKey}
                  allowHardNgReveal
                />
              </section>
            )}
            <section className="res-popup__section">
              <div className="res-popup__section-title">返信レス</div>
              <ReplyTree
                resNum={resNum}
                repIndex={treeRepIndex}
                idIndex={idIndex}
                resMap={resMap}
                messageProtocol={messageProtocol}
                anchorPreviewDepth={anchorPreviewDepth}
                onUrlClick={onUrlClick}
                onUrlContextMenu={onUrlContextMenu}
                onLinkMiddleClickStart={armMouseLeaveCloseSuppression}
                onIdLinkClick={onIdLinkClick}
                onRepClick={onRepClick}
                onAnchorClick={onAnchorClick}
                onAnchorHover={onAnchorHover}
                onAnchorLeave={onAnchorLeave}
                onResContextMenu={handleResContextMenu}
                blurredResNums={blurredResNums}
                ngResNums={ngResNums}
                ownResNums={ownResNums}
                replyToOwnResNums={replyToOwnResNums}
                allowHardNgReveal
                threadKey={threadKey}
                onSubTreeMenu={handleSubTreeMenuClick}
              />
            </section>
          </div>
          {menuPosition && treeMenuItems.length > 0 && (
            <ContextMenu
              x={menuPosition.x}
              y={menuPosition.y}
              items={treeMenuItems}
              // このメニューはDOM上ではツリーポップアップ内にあるが、
              // 親のIDポップアップから見ると別のpopupになる。親子関係を識別できるよう
              // ツリーポップアップ自身のIDを引き継ぎ、コピー操作で親まで閉じないようにする。
              popupId={popupId}
              // 変更理由: 三点ボタンもトグル操作のため、押下時の Radix 側の先行closeで
              // click トグルが開き直さないようトリガーとして登録する。
              triggerRef={menuButtonRef}
              onClose={closeMenu}
            />
          )}
          {subTreeMenu && (
            <ContextMenu
              x={subTreeMenu.x}
              y={subTreeMenu.y}
              items={subTreeMenuItems}
              // サブツリーメニューも同じ理由で、所属するツリーポップアップとして扱う。
              popupId={popupId}
              onClose={closeSubTreeMenu}
            />
          )}
        </>
      )}
    </FloatingPopup>
  );
};
