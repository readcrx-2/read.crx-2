import { X } from "lucide-react";
import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useAutoScrollState } from "src/features/auto-refresh/browser/use-auto-scroll-state";
import { useDetachedTabController } from "src/features/tabs/browser/use-detached-tab-controller";
import { useTabStore } from "src/features/tabs/browser/use-tab-store";
import { ThreadListPanel } from "src/features/thread-list/ui/ThreadListPanel";
import { WritePanelContent } from "src/features/write/ui/WritePanelContent";
import {
  BOTTOM_PANEL_THREAD_LIST_TAB_ID,
  BOTTOM_PANEL_WRITE_TAB_ID,
  useBottomPanel,
} from "src/view/browser/hooks/use-bottom-panel";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { isHTMLElementInWindow } from "src/view/browser/utils/dom";

interface BottomPanelProps {
  /**
   * 切り離したタブ自身の別窓の中に置かれたパネルか。
   *
   * 変更理由: 本窓のパネルは、表示中のタブが別窓へ移ったら操作対象を失うため閉じる。
   * 一方、別窓内のパネルは固定された自タブ(常に切り離し中)を操作するので、
   * 同じ判定を使うと開いた直後に閉じてしまう。
   */
  hostedInTabWindow?: boolean;
}

export const BottomPanel: React.FC<BottomPanelProps> = ({ hostedInTabWindow = false }) => {
  const { viewTab, viewPage } = useTabStore();
  const { isDetachedTab } = useDetachedTabController();
  // 変更理由: 下部パネルを別窓へ移しても、リサイズ操作と開閉直後の追従を
  // 元のWindowへ登録しないよう、表示先のイベント境界を揃える。
  const { window: viewWindow, document: viewDocument } = useViewSurface();
  const { canAutoScroll } = useAutoScrollState();
  const { isOpen, height, activePanelTabId, tabs, closePanel, setHeight, setActivePanelTab } =
    useBottomPanel();

  const rootRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragStartHeight = useRef<number>(height);
  const wasOpenRef = useRef(false);
  const canAutoScrollWhenClosedRef = useRef(canAutoScroll);

  useEffect(() => {
    // スレ一覧・書き込みのどちらも現在スレを操作対象にするため、別ページへ移動したら
    // 下部パネルを閉じて、板・スレの文脈がない状態で誤操作できないようにする。
    if (
      isOpen &&
      (viewPage.type !== "thread" || (!hostedInTabWindow && isDetachedTab(viewTab.id)))
    ) {
      closePanel();
    }
  }, [closePanel, hostedInTabWindow, isDetachedTab, isOpen, viewPage.type, viewTab.id]);

  useEffect(() => {
    if (!isOpen) {
      canAutoScrollWhenClosedRef.current = canAutoScroll;
    }
  }, [canAutoScroll, isOpen]);

  useLayoutEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = isOpen;

    const justOpened = !wasOpen && isOpen;
    if (
      !justOpened ||
      viewPage.type !== "thread" ||
      activePanelTabId !== BOTTOM_PANEL_WRITE_TAB_ID
    ) {
      return;
    }

    if (!canAutoScroll && !canAutoScrollWhenClosedRef.current) {
      return;
    }

    // 2ペイン時は data-active な tab-panel が左右に1個ずつ存在するため、
    // document 全体ではなく自ペイン（.pane-column）配下に限定して、
    // 他ペインのスレッドを誤ってスクロールしないようにする。
    const scope = rootRef.current?.closest(".pane-column") ?? viewDocument;
    const activePanel = scope.querySelector(".content-area__tab-panel[data-active='true']");
    if (!isHTMLElementInWindow(activePanel, viewWindow)) {
      return;
    }

    const stickToBottom = () => {
      // 「線より下にいる時にパネルを開いた」ケースでは、
      // 直前まで見ていた最下部コンテキストを維持するため末尾へ寄せる。
      activePanel.scrollTop = activePanel.scrollHeight;
    };

    stickToBottom();
    const rafId = viewWindow.requestAnimationFrame(stickToBottom);
    return () => {
      viewWindow.cancelAnimationFrame(rafId);
    };
  }, [activePanelTabId, canAutoScroll, isOpen, viewDocument, viewPage.type, viewWindow]);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStartY.current = e.clientY;
      dragStartHeight.current = height;

      const onMouseMove = (ev: MouseEvent) => {
        if (dragStartY.current === null) return;
        // ハンドルを上に動かすほど高さが増える
        const delta = dragStartY.current - ev.clientY;
        setHeight(dragStartHeight.current + delta);
      };

      const onMouseUp = () => {
        dragStartY.current = null;
        viewWindow.removeEventListener("mousemove", onMouseMove);
        viewWindow.removeEventListener("mouseup", onMouseUp);
      };

      viewWindow.addEventListener("mousemove", onMouseMove);
      viewWindow.addEventListener("mouseup", onMouseUp);
    },
    [height, setHeight, viewWindow],
  );

  if (!isOpen || viewPage.type !== "thread") return null;

  return (
    <div ref={rootRef} className="bottom-panel" style={{ height }}>
      {/* ドラッグリサイズハンドル */}
      <div
        className="bottom-panel__resize-handle"
        onMouseDown={handleResizeMouseDown}
        title="ドラッグしてサイズを変更"
      />

      {/* タブストリップ */}
      <div className="bottom-panel__header">
        <div className="bottom-panel__tab-strip" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activePanelTabId === tab.id}
              className={`bottom-panel__tab${
                activePanelTabId === tab.id ? " bottom-panel__tab--active" : ""
              }`}
              onClick={() => setActivePanelTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="bottom-panel__header-actions">
          <button className="bottom-panel__icon-btn" onClick={closePanel} title="パネルを閉じる">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* タブコンテンツ */}
      <div className="bottom-panel__body" role="tabpanel">
        {activePanelTabId === BOTTOM_PANEL_THREAD_LIST_TAB_ID && (
          <ThreadListPanel threadUrl={viewPage.threadUrl} />
        )}
        {activePanelTabId === BOTTOM_PANEL_WRITE_TAB_ID && <WritePanelContent />}
      </div>
    </div>
  );
};
