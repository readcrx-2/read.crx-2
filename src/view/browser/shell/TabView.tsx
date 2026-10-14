import { memo, type RefObject, useEffect, useRef, useState } from "react";
import { isAutoRefreshEnabledForPage } from "src/features/auto-refresh/browser/auto-refresh-pages";
import { type ViewSurface, ViewSurfaceProvider } from "src/view/browser/hooks/use-view-surface";
import { BoardListPage } from "src/view/browser/pages/BoardListPage";
import { BookmarkListPage } from "src/view/browser/pages/BookmarkListPage";
import { HistoryListPage } from "src/view/browser/pages/HistoryListPage";
import { HomeTabPage } from "src/view/browser/pages/HomeTabPage";
import { LogListPage } from "src/view/browser/pages/LogListPage";
import { SettingsPage } from "src/view/browser/pages/SettingsPage";
import { ThreadListPage } from "src/view/browser/pages/ThreadListPage";
import { ThreadPage } from "src/view/browser/pages/ThreadPage";
import { WriteHistoryListPage } from "src/view/browser/pages/WriteHistoryListPage";
import type { Tab } from "src/view/browser/types";
import { getCurrentPage } from "src/view/browser/types";

function buildPageRenderKey(
  tabId: string,
  historyIndex: number,
  page: ReturnType<typeof getCurrentPage>,
): string {
  switch (page.type) {
    case "thread":
      return `${tabId}:${historyIndex}:thread:${page.threadUrl}`;
    case "threadList":
      return `${tabId}:${historyIndex}:threadList:${page.boardUrl}`;
    case "boardList":
      return `${tabId}:${historyIndex}:boardList`;
    case "settings":
      return `${tabId}:${historyIndex}:settings`;
    case "bookmarkList":
      return `${tabId}:${historyIndex}:bookmarkList`;
    case "historyList":
      return `${tabId}:${historyIndex}:historyList`;
    case "writeHistoryList":
      return `${tabId}:${historyIndex}:writeHistoryList`;
    case "logList":
      return `${tabId}:${historyIndex}:logList`;
    case "home":
    case "newTab":
      return `${tabId}:${historyIndex}:${page.type}`;
  }
}

function shouldStartThreadAutoRefreshAtBottom(tab: Tab): boolean {
  const page = getCurrentPage(tab);
  if (page.type !== "thread" || !isAutoRefreshEnabledForPage(tab, page) || tab.currentIndex === 0) {
    return false;
  }

  // 変更理由: FOLLOW_NEXT_THREAD だけが自動更新の束縛を次のスレへ引き継ぐため、
  // 直前もスレッドなら新スレ表示直後の最下部同期が必要な遷移と判定できる。
  return tab.history[tab.currentIndex - 1]?.type === "thread";
}

interface TabPageContentProps {
  tab: Tab;
  isActive: boolean;
  isOverlayTarget: boolean;
  threadListActive?: boolean;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}

const TabPageContent = memo(function TabPageContent({
  tab,
  isActive,
  isOverlayTarget,
  threadListActive,
  scrollContainerRef,
}: TabPageContentProps) {
  const page = getCurrentPage(tab);

  switch (page.type) {
    case "newTab":
    case "home":
      // 旧空タブの種別も同じホームを表示し、入口画面を一つに統一する。
      return <HomeTabPage />;
    case "boardList":
      return <BoardListPage tabId={tab.id} isActive={isActive} refreshKey={tab.reloadKey} />;
    case "settings":
      return <SettingsPage tabId={tab.id} page={page} />;
    case "bookmarkList":
      // isActive をpropsで渡すことで、ページ内部のuseTabStoreフル購読を避けて不要な再レンダリングを防ぐ。
      return <BookmarkListPage tabId={tab.id} isActive={isActive} />;
    case "historyList":
      return <HistoryListPage tabId={tab.id} isActive={isActive} refreshKey={tab.reloadKey} />;
    case "writeHistoryList":
      return <WriteHistoryListPage tabId={tab.id} isActive={isActive} refreshKey={tab.reloadKey} />;
    case "logList":
      return <LogListPage tabId={tab.id} isActive={isActive} refreshKey={tab.reloadKey} />;
    case "threadList":
      return (
        <ThreadListPage
          tabId={tab.id}
          tab={tab}
          page={page}
          refreshKey={tab.reloadKey}
          isActive={threadListActive ?? false}
          isAutoRefreshEnabled={isAutoRefreshEnabledForPage(tab, page)}
          scrollContainerRef={scrollContainerRef}
        />
      );
    case "thread":
      return (
        <ThreadPage
          tabId={tab.id}
          tab={tab}
          page={page}
          refreshKey={tab.reloadKey}
          isActive={isActive}
          isOverlayTarget={isOverlayTarget}
          isAutoRefreshEnabled={isAutoRefreshEnabledForPage(tab, page)}
          startAutoRefreshAtBottom={shouldStartThreadAutoRefreshAtBottom(tab)}
          scrollContainerRef={scrollContainerRef}
        />
      );
  }
});

export interface TabPanelProps {
  tab: Tab;
  isActive: boolean;
  isOverlayTarget: boolean;
  viewSurface?: ViewSurface;
}

/**
 * タブ1枚分の表示とライフサイクルを管理する。
 *
 * 変更理由: ContentAreaがタブ一覧の選択だけを担当し、タブ本体を独立した表示単位に
 * することで、将来メイン領域以外へ同じタブを表示するときも状態保持の規則を共有できる。
 */
export const TabPanel = memo(function TabPanel({
  tab,
  isActive,
  isOverlayTarget,
  viewSurface,
}: TabPanelProps) {
  const page = getCurrentPage(tab);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // パフォーマンス向上とメモリ節約のため、バックグラウンドで開かれたタブ（まだ一度も表示されていないタブ）は
  // 初回表示（アクティブ化）されるまでDOMのマウントおよびレンダリングを遅延させる。
  const [hasRendered, setHasRendered] = useState(isActive);

  useEffect(() => {
    if (isActive && !hasRendered) {
      setHasRendered(true);
    }
  }, [isActive, hasRendered]);

  if (!hasRendered && !isActive) {
    return null;
  }

  const panel = (
    <div
      data-tab-panel-id={tab.id}
      ref={scrollContainerRef}
      data-active={isActive ? "true" : "false"}
      className="content-area__tab-panel"
      style={{ display: isActive ? "block" : "none" }}
    >
      {
        // display 切替で DOM/scroll を残しつつ、
        // ページ本体はタブ自身が変わった時だけ再実行させる。
        <TabPageContent
          key={buildPageRenderKey(tab.id, tab.currentIndex, page)}
          tab={tab}
          isActive={isActive}
          isOverlayTarget={isOverlayTarget && isActive}
          threadListActive={page.type === "threadList" ? isActive : undefined}
          scrollContainerRef={scrollContainerRef}
        />
      }
    </div>
  );

  return viewSurface ? (
    <ViewSurfaceProvider surface={viewSurface}>{panel}</ViewSurfaceProvider>
  ) : (
    panel
  );
});
