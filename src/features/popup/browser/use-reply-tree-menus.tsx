import {
  CornerDownRight,
  CornerRightUp,
  Image as ImageIcon,
  ImageDown,
  ImageUp,
  Pin,
  PinOff,
} from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import type { IRes } from "src/service-container";
import { COMMAND_REQUEST_IDS, runCommandRequest } from "src/view/browser/commands/command-runtime";
import { useTheme } from "src/view/browser/hooks/use-theme";
import { useToast } from "src/view/browser/hooks/use-toast";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import type { ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import { canCopyImageToClipboard, copyImageWithNotice } from "src/view/browser/utils/clipboard";
import { getEventTargetElement } from "src/view/browser/utils/dom";
import type { ReplyTreeEntry } from "src/view/browser/utils/reply-tree-collect";
import {
  buildReplyTreeCopyText,
  collectReplyTreeEntries,
  resolveReplyTreeAncestorPath,
} from "src/view/browser/utils/reply-tree-collect";
import type { ReplyTreeImagePresentation } from "src/view/browser/utils/reply-tree-image";
import { renderReplyTreeImageBlob } from "src/view/browser/utils/reply-tree-image";

export interface SubTreeMenuState {
  resNum: number;
  ancestorResNums: number[];
  hasChildTree: boolean;
  x: number;
  y: number;
}

export type SubTreeMenuClickHandler = (
  resNum: number,
  ancestorResNums: number[],
  hasChildTree: boolean,
  event: ReactMouseEvent<HTMLButtonElement>,
) => void;

interface UseReplyTreeMenusOptions {
  resNum: number;
  resMap: Map<number, IRes>;
  /** NGレスも辿れるよう全レスから作った返信ツリー専用の索引 */
  treeRepIndex: Map<number, Set<number>>;
  threadTitle?: string;
  threadUrl?: string;
  pinned: boolean;
  onTogglePinned?: () => void;
}

interface UseReplyTreeMenusResult {
  /** ヘッダーの三点メニュー項目。起点レスが見つからない時は空になる。 */
  treeMenuItems: ContextMenuItem[];
  subTreeMenu: SubTreeMenuState | null;
  subTreeMenuItems: ContextMenuItem[];
  handleSubTreeMenuClick: SubTreeMenuClickHandler;
  closeSubTreeMenu: () => void;
}

/**
 * 返信ツリーポップアップのヘッダーメニューと、各レスのサブツリーメニューを組み立てる。
 *
 * テキスト／画像コピーの経路（Clipboard コマンド、別窓の Document、テーマ、失敗通知）を
 * ここへ集め、メニュー項目ごとに同じ呼び出しを繰り返さないようにする。
 */
export function useReplyTreeMenus({
  resNum,
  resMap,
  treeRepIndex,
  threadTitle,
  threadUrl,
  pinned,
  onTogglePinned,
}: UseReplyTreeMenusOptions): UseReplyTreeMenusResult {
  const viewSurface = useViewSurface();
  const toast = useToast();
  const theme = useTheme();
  const { document: viewDocument } = viewSurface;
  const [subTreeMenu, setSubTreeMenu] = useState<SubTreeMenuState | null>(null);
  const closeSubTreeMenu = useCallback(() => setSubTreeMenu(null), []);
  const imageCopyDisabled = !canCopyImageToClipboard(viewSurface);

  // 変更理由: 返信ツリーの文字列生成とClipboardの表示先・失敗通知を分離し、
  // ツリー側で別窓対応の経路を重複実装しないようにする。
  const copyTreeText = (sourceRes: IRes, replyResponses: IRes[]) => {
    void runCommandRequest(
      {
        id: COMMAND_REQUEST_IDS.CLIPBOARD_COPY_TEXT,
        args: { text: buildReplyTreeCopyText(sourceRes, replyResponses, threadTitle, threadUrl) },
      },
      { surface: viewSurface, toast },
    );
  };

  const copyTreeImage = (
    sourceRes: IRes,
    replyEntries: ReplyTreeEntry[],
    noticeLabel: string,
    presentation?: ReplyTreeImagePresentation,
  ) => {
    void copyImageWithNotice(
      () =>
        renderReplyTreeImageBlob(sourceRes, replyEntries, {
          threadTitle,
          threadUrl,
          theme,
          presentation,
          targetDocument: viewDocument,
        }),
      viewSurface,
      toast,
      noticeLabel,
    );
  };

  const sourceRes = resMap.get(resNum);
  const treeMenuItems: ContextMenuItem[] = sourceRes
    ? [
        {
          id: "copy-tree-responses",
          label: "返信ツリーを一括コピー",
          // 返信ツリー全体も「起点から下へ辿る」操作なので、子ツリーのコピーと同じ向きで示す。
          icon: <CornerDownRight size={14} />,
          onSelect: () => {
            // 参照元レスの内容も先頭に含め、見出しなしで自然なレス列として貼り付けられるようにする。
            const entries = collectReplyTreeEntries(resNum, treeRepIndex, resMap);
            copyTreeText(
              sourceRes,
              entries.map((entry) => entry.res),
            );
          },
        },
        {
          id: "copy-tree-image",
          label: "返信ツリーを画像としてコピー",
          icon: <ImageIcon size={14} />,
          disabled: imageCopyDisabled,
          onSelect: () => {
            copyTreeImage(
              sourceRes,
              collectReplyTreeEntries(resNum, treeRepIndex, resMap),
              "返信ツリー画像",
            );
          },
        },
        {
          id: "toggle-pin",
          label: pinned ? "ピン留めを解除" : "ピン留め",
          icon: pinned ? <PinOff size={14} /> : <Pin size={14} />,
          onSelect: onTogglePinned,
        },
      ]
    : [];

  useEffect(() => {
    if (!subTreeMenu) {
      return;
    }

    const handleOutsideSubTreeMenuClick = (e: MouseEvent) => {
      const target = getEventTargetElement(e.target, viewDocument.defaultView ?? globalThis.window);
      if (!target) {
        setSubTreeMenu(null);
        return;
      }

      if (target.closest(".context-menu")) {
        return;
      }

      // 三点ボタン自身のクリックはトグルとして handleSubTreeMenuClick 側で扱う。
      if (target.closest(".reply-tree-node__menu-btn")) {
        return;
      }

      setSubTreeMenu(null);
    };

    viewDocument.addEventListener("mousedown", handleOutsideSubTreeMenuClick);
    return () => viewDocument.removeEventListener("mousedown", handleOutsideSubTreeMenuClick);
  }, [subTreeMenu, viewDocument]);

  const handleSubTreeMenuClick: SubTreeMenuClickHandler = (
    targetResNum,
    ancestorResNums,
    hasChildTree,
    e,
  ) => {
    e.stopPropagation();
    const buttonRect = e.currentTarget.getBoundingClientRect();
    setSubTreeMenu((prev) =>
      prev?.resNum === targetResNum
        ? null
        : {
            resNum: targetResNum,
            ancestorResNums,
            hasChildTree,
            // ContextMenu は viewport 座標を受け取るため、親 popup の座標を引かない。
            x: buttonRect.right - 8,
            y: buttonRect.bottom + 4,
          },
    );
  };

  const buildSubTreeMenuItems = ({
    resNum: targetResNum,
    ancestorResNums,
    hasChildTree,
  }: SubTreeMenuState): ContextMenuItem[] => {
    const targetRes = resMap.get(targetResNum);
    if (!targetRes) {
      return [];
    }

    const ancestorPath = resolveReplyTreeAncestorPath(targetRes, ancestorResNums, resMap);
    const items: ContextMenuItem[] = [];

    if (hasChildTree) {
      items.push(
        {
          id: "copy-subtree-responses",
          label: "このレス以降のツリーをコピー",
          icon: <CornerDownRight size={14} />,
          onSelect: () => {
            const entries = collectReplyTreeEntries(targetResNum, treeRepIndex, resMap);
            copyTreeText(
              targetRes,
              entries.map((entry) => entry.res),
            );
          },
        },
        {
          id: "copy-subtree-image",
          label: "このレス以降のツリーを画像としてコピー",
          icon: <ImageDown size={14} />,
          disabled: imageCopyDisabled,
          onSelect: () => {
            copyTreeImage(
              targetRes,
              collectReplyTreeEntries(targetResNum, treeRepIndex, resMap),
              "サブツリー画像",
            );
          },
        },
      );
    }

    items.push(
      {
        id: "copy-ancestor-path-responses",
        label: "ツリー先頭からこのレスまでコピー",
        icon: <CornerRightUp size={14} />,
        onSelect: () => {
          copyTreeText(ancestorPath.sourceRes, ancestorPath.replyResponses);
        },
      },
      {
        id: "copy-ancestor-path-image",
        label: "ツリー先頭からこのレスまで画像としてコピー",
        icon: <ImageUp size={14} />,
        disabled: imageCopyDisabled,
        onSelect: () => {
          copyTreeImage(
            ancestorPath.sourceRes,
            // 一本筋は枝分かれしないので、上から順に1段ずつ字下げして経路を示す。
            ancestorPath.replyResponses.map((res, depth) => ({ res, depth })),
            "返信経路画像",
            {
              title: `>>${targetRes.num} までの返信経路`,
              sourceSectionTitle: "参照元レス",
              responsesSectionTitle: "返信レス（上から下）",
            },
          );
        },
      },
    );

    return items;
  };

  return {
    treeMenuItems,
    subTreeMenu,
    subTreeMenuItems: subTreeMenu ? buildSubTreeMenuItems(subTreeMenu) : [],
    handleSubTreeMenuClick,
    closeSubTreeMenu,
  };
}
