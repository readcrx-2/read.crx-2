import React, { useEffect, useMemo, useState } from "react";
import { extractUrlsFromMessage } from "src/core/util/url-media";
import { useImgurAlbumMedia } from "src/features/media/application/imgur-album";
import { ResMediaGallery } from "src/features/media/ui/ResMediaGallery";
import {
  useIsNgTemporarilyDisabled,
  useNgDisplayMode,
} from "src/features/ng/browser/use-ng-status";
import { NgBadge } from "src/features/ng/ui/NgBadge";
import { NgResponsePlaceholder } from "src/features/ng/ui/NgResponsePlaceholder";
import { ResBody } from "src/features/thread/ui/ResBody";
import type { IRes } from "src/service-container";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import type { ThreadSearchTarget } from "src/view/browser/types";
import { getEventTargetElement } from "src/view/browser/utils/dom";
import { getIdHeatColor } from "src/view/browser/utils/id-heat";
import type { UrlClickHandler, UrlContextMenuHandler } from "src/view/browser/utils/link-routing";
import { resolveNgDisplayMode } from "src/view/browser/utils/ng-display-mode";
import { getReplyHeatLevel } from "src/view/browser/utils/reply-heat";
import { decodeResponseHtml } from "src/view/browser/utils/response-format";
import {
  findSearchMatchRanges,
  highlightSearchMatches,
} from "src/view/browser/utils/search-highlight";

function renderHighlightedText(text: string, searchQuery: string): React.ReactNode {
  const ranges = findSearchMatchRanges(text, searchQuery);
  if (ranges.length === 0) {
    return text;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      parts.push(text.slice(cursor, range.start));
    }
    parts.push(
      <mark key={`${range.start}-${range.end}`} className="res__search-match">
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  }
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return parts;
}

export const ResItem: React.FC<ResItemProps> = React.memo(
  ({
    res,
    idPos,
    idCount,
    repCount,
    miniAa,
    messageProtocol,
    onIdClick,
    onRepClick,
    onUrlClick,
    onUrlContextMenu,
    onAnchorClick,
    onAnchorHover,
    onAnchorLeave,
    onContextMenu,
    isOwn,
    isReplyToOwn,
    isImageBlurred,
    imageBlurRadius,
    ngResNums,
    resMap,
    threadUrl,
    searchQuery = "",
    searchTarget = "all",
    animateEntry = false,
    onEntryDisplayed,
  }) => {
    const { window: viewWindow } = useViewSurface();
    const isNgTemporarilyDisabled = useIsNgTemporarilyDisabled();
    // collapseルールに一致したレスは全体設定より優先して折りたたむため、レスごとに解決する。
    const ngDisplayMode = resolveNgDisplayMode(useNgDisplayMode(), res.ng);
    // res.ng はサービス層がNGワード照合した結果を格納するフィールド。
    // 古いビューは class[] の "ng" 要素で判定していたが、new viewでは res.ng を優先チェックする。
    // 一時解除中はデータ自体を消さずに表示判定だけをオフにして、復帰時の再評価コストを避ける。
    const isNgMatched = res.ng != null || res.class?.includes("ng");
    const isNgActive = !isNgTemporarilyDisabled && isNgMatched;
    const isNgHighlighted = isNgMatched && ngDisplayMode === "highlight-ng";
    const [isNgRevealed, setIsNgRevealed] = useState(false);
    useEffect(() => {
      if (ngDisplayMode !== "soft-ng" && isNgRevealed) {
        // soft-ng以外へ切り替えた後にsoft-ngへ戻した際、本文を自動再表示しない。
        setIsNgRevealed(false);
      }
    }, [isNgRevealed, ngDisplayMode]);
    const isEntryAnimated =
      animateEntry &&
      !(
        isNgActive &&
        (ngDisplayMode === "hard-ng" || (ngDisplayMode === "soft-ng" && !isNgRevealed))
      );
    useEffect(() => {
      // NGのプレースホルダーには入場動作がないため、描画確定時点で表示済みにする。
      if (animateEntry && !isEntryAnimated) onEntryDisplayed?.(res.num);
    }, [animateEntry, isEntryAnimated, onEntryDisplayed, res.num]);
    const decoded = useMemo(() => decodeResponseHtml(res, messageProtocol), [messageProtocol, res]);
    // 検索判定と同じ語を表示層へ渡し、本文・名前・IDのどこでレスが一致したかを追えるようにする。
    // 本文と名前のHTMLはテキストノードだけを変換し、リンクやアンカーの操作対象を保つ。
    const highlightedNameHtml = useMemo(
      () =>
        searchTarget === "all" || searchTarget === "name"
          ? highlightSearchMatches(decoded.nameHtml, searchQuery)
          : decoded.nameHtml,
      [decoded.nameHtml, searchQuery, searchTarget],
    );
    // React 19 は同じ名前HTMLでも wrapper object が毎回変わると innerHTML を再代入する。
    // 本文更新時に名前欄を選択している場合も、Text nodeを置換せず選択範囲を維持する。
    const nameMarkup = useMemo(() => ({ __html: highlightedNameHtml }), [highlightedNameHtml]);
    const urls = useMemo(() => extractUrlsFromMessage(decoded.messageHtml), [decoded.messageHtml]);
    const resolvedMedia = useImgurAlbumMedia(decoded.messageHtml, urls, threadUrl);
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
    // 状態フラグが重なるレスでも表示色が揺れないよう、優先順位をここで一度だけ解決する。
    // NGは一時解除中でも最も強い注意状態として残し、次に自分、最後に自分宛て返信を採用する。
    // 既存の個別フラグ用クラスは互換性のため残し、色と行インジケーターは解決済みクラスで統一する。
    const responseState = isNgMatched ? "ng" : isOwn ? "own" : isReplyToOwn ? "reply-to-own" : null;
    const responseStateClassName = responseState ? `res--state-${responseState}` : "";
    const nameStateClassName = responseState ? `res__name--state-${responseState}` : "";
    const articleClassName = [
      "res",
      animateEntry ? "res--live-chat-enter" : "",
      miniAa ? "res--aa" : "",
      isOwn ? "res--own" : "",
      isReplyToOwn ? "res--reply-to-own" : "",
      isNgHighlighted ? "res--ng-highlight" : "",
      responseStateClassName,
    ]
      .filter(Boolean)
      .join(" ");
    const nameClassName = [
      "res__name",
      isOwn ? "res__name--own" : "",
      isReplyToOwn ? "res__name--reply-to-own" : "",
      nameStateClassName,
    ]
      .filter(Boolean)
      .join(" ");

    if (isNgActive && ngDisplayMode === "hard-ng") {
      // hard-ngではレス要素自体を描画せず、本文・ポップアップへの偶発的な露出を防ぐ。
      return null;
    }

    if (isNgActive && ngDisplayMode === "soft-ng" && !isNgRevealed) {
      return (
        <NgResponsePlaceholder
          responseNumber={res.num}
          result={res.ng}
          responseStateClassName={responseStateClassName}
          onReveal={() => setIsNgRevealed(true)}
          onContextMenu={(event) => onContextMenu(event, res)}
        />
      );
    }

    return (
      <article
        data-res-num={res.num}
        className={articleClassName}
        onAnimationEnd={(event) => {
          // 本文内のメディア等のアニメーションでは返信数を進めず、レス自身の入場完了だけを通知する。
          if (
            isEntryAnimated &&
            event.target === event.currentTarget &&
            event.animationName === "live-chat-enter"
          ) {
            onEntryDisplayed?.(res.num);
          }
        }}
        onContextMenu={(e) => {
          const target = getEventTargetElement(e.target, viewWindow);
          if (target?.closest("a, .res__link, .res__thumb, .res__media-embed")) {
            // リンクや画像の右クリックはブラウザ既定メニューへ委譲する。
            return;
          }
          onContextMenu(e, res);
        }}
      >
        <header className="res__header">
          <span className={resNumClassName}>{res.num}</span>
          <span className={nameClassName} dangerouslySetInnerHTML={nameMarkup} />
          {isOwn ? <span className="res__badge res__badge--own">自分</span> : null}
          {isReplyToOwn ? <span className="res__badge res__badge--reply-to-own">返信</span> : null}
          {isNgMatched ? <NgBadge result={res.ng} /> : null}
          {isNgActive && ngDisplayMode === "soft-ng" && isNgRevealed ? (
            <button
              type="button"
              className="res__ng-hide"
              aria-label={`レス${res.num}をNG表示に戻す`}
              onClick={(event) => {
                event.stopPropagation();
                // NG判定とレスデータは保持したまま表示状態だけ戻すことで、再表示時の情報を保つ。
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
              // IDは出現数に応じて連続色にして、少数/中間/多投稿の密度差を一目で判別しやすくする。
              style={{ color: getIdHeatColor(idCount) }}
              onClick={(e) => {
                e.stopPropagation();
                onIdClick(res.id!, e);
              }}
            >
              {renderHighlightedText(
                res.id,
                searchTarget === "all" || searchTarget === "id" ? searchQuery : "",
              )}
              {idCount >= 2 && `(${idPos}/${idCount})`}
            </span>
          )}
          <span className="res__date">{res.date ?? res.other}</span>
          {repCount > 0 && (
            <span
              className={repClassName}
              onClick={(e) => {
                e.stopPropagation();
                onRepClick(res.num, e);
              }}
            >
              返信({repCount})
            </span>
          )}
        </header>
        <ResBody
          messageHtml={resolvedMedia.messageHtml}
          searchQuery={searchQuery}
          searchTarget={searchTarget}
          anchorPreviewDepth={0}
          ngResNums={ngResNums}
          resMap={resMap}
          onUrlClick={(url, button, mode) => onUrlClick(url, undefined, button, mode)}
          onUrlContextMenu={(url, e, mode) => onUrlContextMenu(url, e, mode)}
          onIdLinkClick={onIdClick}
          onAnchorClick={onAnchorClick}
          onAnchorHover={onAnchorHover}
          onAnchorLeave={onAnchorLeave}
        />
        <ResMediaGallery
          urls={resolvedMedia.urls}
          onUrlClick={onUrlClick}
          isBlurred={isImageBlurred}
          imageBlurRadius={imageBlurRadius}
        />
      </article>
    );
  },
);
ResItem.displayName = "ResItem"; // --- 個別レス表示 ---

export interface ResItemProps {
  /** ライブチャットの新着だけに入場動作を付け、既存の本文・NG処理を共用する。 */
  animateEntry?: boolean;
  /** ライブチャットの入場完了を返信数などの表示へ反映する。 */
  onEntryDisplayed?: (responseNum: number) => void;
  res: IRes;
  idPos: number;
  idCount: number;
  repCount: number;
  miniAa: boolean;
  messageProtocol: string;
  onIdClick: (id: string, e: React.MouseEvent) => void;
  onRepClick: (resNum: number, e: React.MouseEvent) => void;
  /** url: クリックされたURL, resImages: 同レス内の全画像URL（ビューア前後移動用、省略可） */
  onUrlClick: UrlClickHandler;
  onUrlContextMenu: UrlContextMenuHandler;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (targets: number[], anchorRect: DOMRect, label: string, depth: number) => void;
  onAnchorLeave: (fromDepth: number) => void;
  onContextMenu: (e: React.MouseEvent, res: IRes) => void;
  isOwn: boolean;
  isReplyToOwn: boolean;
  isImageBlurred: boolean;
  imageBlurRadius: number;
  ngResNums?: ReadonlySet<number>;
  /** 本文アンカーの欠損判定をスレッド全体のレス索引と揃える。 */
  resMap?: ReadonlyMap<number, unknown>;
  /** アルバムAPIの失敗抑止をスレッド単位で分離するためのキー */
  threadUrl?: string;
  searchQuery?: string;
  searchTarget?: ThreadSearchTarget;
}
