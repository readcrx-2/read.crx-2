import React, { useEffect, useMemo, useState } from "react";
import { useImgurAlbumMedia } from "src/features/media/application/imgur-album";
import { extractUrlsFromMessage } from "src/features/media/domain/url-media";
import { ResMediaGallery } from "src/features/media/ui/ResMediaGallery";
import {
  useIsNgTemporarilyDisabled,
  useNgDisplayMode,
} from "src/features/ng/browser/use-ng-status";
import { NgBadge } from "src/features/ng/ui/NgBadge";
import { ResBody } from "src/features/thread/ui/ResBody";
import type { IRes } from "src/service-container";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { getEventTargetElement } from "src/view/browser/utils/dom";
import { getIdHeatColor } from "src/view/browser/utils/id-heat";
import type { UrlClickHandler, UrlContextMenuHandler } from "src/view/browser/utils/link-routing";
import { resolveNgDisplayMode } from "src/view/browser/utils/ng-display-mode";
import { getReplyHeatLevel } from "src/view/browser/utils/reply-heat";
import { decodeResponseHtml } from "src/view/browser/utils/response-format";

export const PopupResCard: React.FC<StaticResCardProps> = React.memo(
  ({
    res,
    messageProtocol,
    anchorPreviewDepth,
    repIndex,
    idIndex,
    disableRepClick,
    isHighlighted,
    isOwn,
    isReplyToOwn,
    onUrlClick,
    onUrlContextMenu,
    onLinkMiddleClickStart,
    onIdLinkClick,
    onRepClick,
    onOpenRootReplyTree,
    onAnchorClick,
    onAnchorHover,
    onAnchorLeave,
    onContextMenu,
    isImageBlurred,
    ngResNums,
    resMap,
    threadKey,
    allowHardNgReveal = false,
  }) => {
    const { window: viewWindow } = useViewSurface();
    const isNgTemporarilyDisabled = useIsNgTemporarilyDisabled();
    // ResItemと同じく、collapseルールの折りたたみを全体設定より優先する。
    const ngDisplayMode = resolveNgDisplayMode(useNgDisplayMode(), res.ng);
    const decoded = useMemo(() => decodeResponseHtml(res, messageProtocol), [messageProtocol, res]);
    // ポップアップも自動更新中の親再描画に巻き込まれるため、同じHTMLの再代入を避けて
    // 選択中のText nodeを維持する。
    const nameMarkup = useMemo(() => ({ __html: decoded.nameHtml }), [decoded.nameHtml]);
    const urls = useMemo(() => extractUrlsFromMessage(decoded.messageHtml), [decoded.messageHtml]);
    const resolvedMedia = useImgurAlbumMedia(decoded.messageHtml, urls, threadKey);

    // repIndex が渡された場合のみ返信数を表示する
    const repCount = repIndex?.get(res.num)?.size ?? 0;
    const replyHeat = getReplyHeatLevel(repCount);
    const resNumClassName = `res__num${
      replyHeat === "hot" ? " res__num--hot" : replyHeat === "warm" ? " res__num--warm" : ""
    }`;
    const repClassName = `res__rep${
      replyHeat === "hot"
        ? " res__rep--hot"
        : replyHeat === "warm"
          ? " res__rep--warm"
          : " res__rep--link"
    }`;
    // idIndex が渡された場合のみ同一IDのレス数を表示してクリック可能にする
    const idCount = res.id ? (idIndex?.get(res.id)?.size ?? 0) : 0;

    // NG 判定は ResItem と同じロジック
    const isNgMatched = res.ng != null || res.class?.includes("ng");
    const isNgActive = !isNgTemporarilyDisabled && isNgMatched;
    const isNgHighlighted = isNgMatched && ngDisplayMode === "highlight-ng";
    const [isNgRevealed, setIsNgRevealed] = useState(false);
    const canRevealNg =
      ngDisplayMode === "soft-ng" || (ngDisplayMode === "hard-ng" && allowHardNgReveal);
    useEffect(() => {
      if (!canRevealNg && isNgRevealed) {
        // 表示方式の変更後に以前の一時表示を引き継がず、各方式のNG方針を保つ。
        setIsNgRevealed(false);
      }
    }, [canRevealNg, isNgRevealed]);
    if (isNgActive && ngDisplayMode === "hard-ng" && !allowHardNgReveal) {
      // 通常レスと同じhard-ngを適用し、ポップアップだけから本文を覗けないようにする。
      return null;
    }
    if (isNgActive && canRevealNg && !isNgRevealed) {
      return (
        <article
          className="res res--ng-placeholder"
          role="button"
          aria-label="クリックして内容を表示"
          tabIndex={0}
          onClick={() => setIsNgRevealed(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setIsNgRevealed(true);
            }
          }}
        >
          <header className="res__header">
            <span className={resNumClassName}>{res.num}</span>
            <NgBadge result={res.ng} />
          </header>
          <div className="res__ng-reveal">クリックして内容を表示</div>
        </article>
      );
    }

    return (
      <article
        className={[
          "res",
          isHighlighted ? "res--highlighted-persistent" : "",
          isNgHighlighted ? "res--ng-highlight" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onContextMenu={(e) => {
          if (!onContextMenu) return;
          if (
            getEventTargetElement(e.target, viewWindow)?.closest(
              "a, .res__thumb, .res__media-embed",
            )
          ) {
            // popup 内でもリンク/画像の右クリックは既定メニューを優先する。
            return;
          }
          e.preventDefault();
          onContextMenu(e, res);
        }}
      >
        <header className="res__header">
          <span className={resNumClassName}>{res.num}</span>
          <span className="res__name" dangerouslySetInnerHTML={nameMarkup} />
          {/* 変更理由: ポップアップにも同じスレッドの返信関係を渡し、本文表示との認識を揃える。 */}
          {isOwn ? <span className="res__badge res__badge--own">自分</span> : null}
          {isReplyToOwn ? <span className="res__badge res__badge--reply-to-own">返信</span> : null}
          {isNgMatched ? <NgBadge result={res.ng} /> : null}
          {isNgActive && canRevealNg && isNgRevealed ? (
            <button
              type="button"
              className="res__ng-hide"
              aria-label={`レス${res.num}をNG表示に戻す`}
              onClick={(event) => {
                event.stopPropagation();
                // NG判定は変更せず、ポップアップ内の一時表示だけをプレースホルダーへ戻す。
                setIsNgRevealed(false);
              }}
            >
              再非表示
            </button>
          ) : null}
          {res.id && (
            <span
              className={`res__id${
                idCount >= 5 ? " res__id--freq" : idCount >= 2 ? " res__id--link" : ""
              }`}
              // popup側も本文と同じ色スケールを使い、ID密度の見え方を統一する。
              style={{ color: getIdHeatColor(idCount) }}
              onClick={(e) => {
                e.stopPropagation();
                onIdLinkClick(res.id!, e);
              }}
            >
              {res.id}
              {idCount >= 2 && `(${idCount})`}
            </span>
          )}
          <span className="res__date">{res.date ?? res.other}</span>
          {repCount > 0 && onRepClick && (
            <span
              className={`${repClassName}${disableRepClick ? " res__rep--disabled" : ""}`}
              aria-disabled={disableRepClick ? true : undefined}
              title={
                disableRepClick ? "参照元レスの返信はこのポップアップ内では開けません" : undefined
              }
              onClick={(e) => {
                // 参照元レスの「返信」は同一ツリーを再帰的に開いてしまうため、
                // 返信ポップアップ内では明示的に無効化する。
                if (disableRepClick) {
                  e.stopPropagation();
                  return;
                }
                e.stopPropagation();
                onRepClick(res.num, e);
              }}
            >
              返信({repCount})
            </span>
          )}
          {onOpenRootReplyTree && (
            <button
              type="button"
              className="res__open-root-tree-btn"
              onClick={(e) => {
                // アンカーの葉からでも議論の起点へ辿れるよう、
                // 返信ツリーの開始レスを呼び出し元で解決してから開く。
                e.stopPropagation();
                onOpenRootReplyTree(res.num, e);
              }}
            >
              ツリー先頭から
            </button>
          )}
        </header>
        <ResBody
          messageHtml={resolvedMedia.messageHtml}
          anchorPreviewDepth={anchorPreviewDepth}
          ngResNums={ngResNums}
          resMap={resMap}
          onUrlClick={(url, button, mode) => onUrlClick(url, undefined, button, mode)}
          onUrlContextMenu={(url, e, mode) => onUrlContextMenu(url, e, mode)}
          onMiddleClickStart={onLinkMiddleClickStart}
          onIdLinkClick={onIdLinkClick}
          onAnchorClick={onAnchorClick}
          onAnchorHover={onAnchorHover}
          onAnchorLeave={onAnchorLeave}
        />
        <ResMediaGallery
          urls={resolvedMedia.urls}
          onUrlClick={onUrlClick}
          onMiddleClickStart={onLinkMiddleClickStart}
          openOnMiddleMouseDown
          isBlurred={isImageBlurred}
        />
      </article>
    );
  },
);
PopupResCard.displayName = "PopupResCard";
export interface StaticResCardProps {
  res: IRes;
  messageProtocol: string;
  anchorPreviewDepth: number;
  /** 渡された場合、ヘッダーに返信数ボタンを表示する */
  repIndex?: Map<number, Set<number>>;
  /** 渡された場合、ヘッダーのIDに同一IDのレス数を表示してクリック可能にする */
  idIndex?: Map<string, Set<number>>;
  /** 参照元レスの返信を再帰的に開くのを防ぐための無効化フラグ */
  disableRepClick?: boolean;
  isHighlighted?: boolean;
  /** 本文側と同じ自分レス・自分への返信バッヂを表示する。 */
  isOwn?: boolean;
  isReplyToOwn?: boolean;
  onUrlClick: UrlClickHandler;
  onUrlContextMenu: UrlContextMenuHandler;
  onLinkMiddleClickStart?: () => void;
  onIdLinkClick: (id: string, e: React.MouseEvent) => void;
  onRepClick?: (resNum: number, e: React.MouseEvent) => void;
  onOpenRootReplyTree?: (resNum: number, e: React.MouseEvent) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (targets: number[], anchorRect: DOMRect, label: string, depth: number) => void;
  onAnchorLeave: (fromDepth: number) => void;
  onContextMenu?: (e: React.MouseEvent, res: IRes) => void;
  /** ポップアップ内でも画像ぼかしを適用するためのフラグ */
  isImageBlurred?: boolean;
  /** 本文中のアンカー先NGレスを強調するためのレス番号集合 */
  ngResNums?: ReadonlySet<number>;
  /** 本文アンカーの欠損判定をメインスレッドと揃えるためのレス索引 */
  resMap?: ReadonlyMap<number, unknown>;
  /** 親スレッドのURL。ポップアップでも同じ失敗抑止単位を使う。 */
  threadKey?: string;
  /** 返信ツリーなどでhard-ngもプレースホルダー表示し、明示操作で本文を確認できるようにする。 */
  allowHardNgReveal?: boolean;
}
