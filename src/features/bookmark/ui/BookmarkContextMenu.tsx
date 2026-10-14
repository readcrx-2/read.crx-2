import { Clipboard, ExternalLink, Trash2 } from "lucide-react";
import { container } from "src/service-container/index";
import {
  COMMAND_REQUEST_IDS,
  type CommandTarget,
  runCommandRequest,
} from "src/view/browser/commands/command-runtime";
import { useToast } from "src/view/browser/hooks/use-toast";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { ContextMenu, type ContextMenuItem } from "src/view/browser/ui/ContextMenu";

export interface BookmarkContextMenuState<Entry> {
  entry: Entry;
  x: number;
  y: number;
}

interface BookmarkContextMenuProps {
  target: CommandTarget;
  x: number;
  y: number;
  onOpenCurrentTab?: () => void;
  onOpenInNewTab: (background: boolean) => void;
  onRemoved: (url: string) => void;
  onClose: () => void;
}

/** ホームと一覧で削除・コピーの挙動を揃え、遷移可否だけを呼び出し元で決める。 */
export function BookmarkContextMenu({
  target,
  x,
  y,
  onOpenCurrentTab,
  onOpenInNewTab,
  onRemoved,
  onClose,
}: BookmarkContextMenuProps) {
  const surface = useViewSurface();
  const toast = useToast();

  const removeBookmark = async () => {
    try {
      // アダプタはvoidを返す同期実装も許容するため、レガシー実装のfalseだけを失敗と扱う。
      // 保存に失敗した行まで消すと成功に見えるため、完了結果を確認してから画面へ反映する。
      const removed: unknown = await Promise.resolve(container.bookmark.remove(target.url));
      if (removed === false) {
        throw new Error("ブックマークの削除が完了しませんでした");
      }
      onRemoved(target.url);
      toast.info("ブックマークを削除しました");
    } catch (error) {
      console.error("ブックマークの削除に失敗しました", { target, error });
      toast.error("ブックマークの削除に失敗しました");
    }
  };

  const copy = (format: "title" | "url" | "title-url" | "markdown") => {
    // コピー先と通知先を表示中の窓へ揃え、別窓の一覧でも元窓へ操作が戻らないようにする。
    void runCommandRequest(
      { id: COMMAND_REQUEST_IDS.TARGET_COPY, args: { target, format } },
      { surface, toast },
    );
  };

  const items: ContextMenuItem[] = [
    // 現在タブへの遷移は、対応する操作を渡した呼び出し元で表示する。
    ...(onOpenCurrentTab
      ? [
          {
            id: "open-current",
            label: "現在のタブで開く",
            icon: <ExternalLink size={14} />,
            onSelect: onOpenCurrentTab,
          },
        ]
      : []),
    {
      id: "open-new-tab",
      label: "新しいタブで開く",
      icon: <ExternalLink size={14} />,
      onSelect: () => onOpenInNewTab(false),
      onAuxSelect: (button) => {
        if (button === 1) onOpenInNewTab(true);
      },
    },
    { id: "separator-bookmark", separator: true },
    {
      id: "remove-bookmark",
      label: "ブックマークを削除",
      icon: <Trash2 size={14} />,
      danger: true,
      onSelect: () => void removeBookmark(),
    },
    { id: "separator-copy", separator: true },
    {
      id: "copy-title",
      label: "タイトルをコピー",
      icon: <Clipboard size={14} />,
      onSelect: () => copy("title"),
    },
    { id: "copy-url", label: "URLをコピー", onSelect: () => copy("url") },
    {
      id: "copy-title-url",
      label: "タイトル&URLをコピー",
      icon: <Clipboard size={14} />,
      onSelect: () => copy("title-url"),
    },
    {
      id: "copy-markdown",
      label: "タイトル&URLをMarkdownでコピー",
      onSelect: () => copy("markdown"),
    },
  ];

  return <ContextMenu x={x} y={y} items={items} onClose={onClose} />;
}
