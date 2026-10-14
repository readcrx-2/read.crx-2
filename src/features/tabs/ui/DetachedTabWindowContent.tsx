import React, { type ReactNode, useMemo } from "react";
import { AutoScrollStateProvider } from "src/features/auto-refresh/browser/use-auto-scroll-state";
import { AutoRefreshStatusItem } from "src/features/auto-refresh/ui/AutoRefreshStatusItem";
import { CommentOverlayStatusItem } from "src/features/comment-overlay/ui/CommentOverlayStatusItem";
import { NgStatusProvider } from "src/features/ng/browser/use-ng-status";
import { NgStatusItem } from "src/features/ng/ui/NgStatusItem";
import { PaneProvider } from "src/features/tabs/browser/use-tab-store";
import { TabViewScopeProvider } from "src/features/tabs/browser/use-tab-view-scope";
import { TabPanel } from "src/features/tabs/ui/TabView";
import { WindowNavigationBridge } from "src/features/tabs/ui/WindowNavigationBridge";
import { IkioiStatusItem } from "src/features/thread/ui/IkioiStatusItem";
import { PopularFilterStatusItem } from "src/features/thread/ui/PopularFilterStatusItem";
import { ThreadListPanelToggleItem } from "src/features/thread-list/ui/ThreadListPanelToggleItem";
import { WritePanelToggleItem } from "src/features/write/ui/WritePanelToggleItem";
import { BottomPanel } from "src/view/browser/components/BottomPanel";
import { PageCountStatusItem } from "src/view/browser/components/PageCountStatusItem";
import { StatusBar, StatusBarProvider } from "src/view/browser/components/StatusBar";
import { TitleBar } from "src/view/browser/components/TitleBar";
import { BottomPanelProvider } from "src/view/browser/hooks/use-bottom-panel";
import { PageCountStatusProvider } from "src/view/browser/hooks/use-page-count-status";
import { type ViewSurface, ViewSurfaceProvider } from "src/view/browser/hooks/use-view-surface";
import type { Tab } from "src/view/browser/types";
import { ToastProvider } from "src/view/browser/ui/Toast";

/**
 * 切り離したタブ1枚分の別窓内UI。
 *
 * 変更理由: 窓のライフサイクル管理(TabWindowHost)と、別窓の中身の組み立てが
 * 同じファイルにあると、ステータス項目の追加だけでも窓管理の差分に埋もれるため分離した。
 */
export const DetachedTabWindowContent: React.FC<{
  tab: Tab;
  paneId: string;
  surface: ViewSurface;
}> = ({ tab, paneId, surface }) => (
  <TabViewScopeProvider scope={{ paneId, tabId: tab.id }}>
    <PaneProvider paneId={paneId}>
      <StatusBarProvider>
        <PageCountStatusProvider>
          <NgStatusProvider>
            <AutoScrollStateProvider>
              <TabWindowSurface surface={surface}>
                {/* 本窓とレイアウトを共有せず、別窓ごとに下部パネルの開閉・高さを持つ。 */}
                <BottomPanelProvider isolated>
                  <WindowNavigationBridge tabId={tab.id} manageBrowserHistory={false} />
                  {/* 別窓内の返信・別窓生成失敗などの通知を、表示中の窓へ出す。 */}
                  <ToastProvider topOffset="16px" rightOffset="16px" />
                  {/* 表示タブをContextで固定し、元ペインの選択変更に影響されない共通タイトルを出す。 */}
                  <TitleBar />
                  <div className="content-area">
                    <TabPanel tab={tab} isActive isOverlayTarget={false} viewSurface={surface} />
                  </div>
                  {/* 固定タブ自身が切り離し中でも閉じないよう、別窓内のパネルとして明示する。 */}
                  <BottomPanel hostedInTabWindow />
                  <NgStatusItem />
                  <IkioiStatusItem />
                  <PopularFilterStatusItem />
                  <AutoRefreshStatusItem />
                  <CommentOverlayStatusItem isActive />
                  <PageCountStatusItem />
                  <ThreadListPanelToggleItem />
                  <WritePanelToggleItem />
                  <StatusBar />
                </BottomPanelProvider>
              </TabWindowSurface>
            </AutoScrollStateProvider>
          </NgStatusProvider>
        </PageCountStatusProvider>
      </StatusBarProvider>
    </PaneProvider>
  </TabViewScopeProvider>
);

const TabWindowSurface: React.FC<{
  surface: ViewSurface;
  children: ReactNode;
}> = ({ surface, children }) => {
  // 窓ごとに同一のsurfaceオブジェクトを渡し、ページ内のイベント購読を不要に解除しない。
  const { document: surfaceDocument, window: surfaceWindow } = surface;
  const stableSurface = useMemo(
    () => ({ document: surfaceDocument, window: surfaceWindow }),
    [surfaceDocument, surfaceWindow],
  );
  return <ViewSurfaceProvider surface={stableSurface}>{children}</ViewSurfaceProvider>;
};
