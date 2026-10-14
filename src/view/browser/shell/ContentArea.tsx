import { type FC } from "react";
import { useDetachedTabController } from "src/features/tabs/browser/use-detached-tab-controller";
import { TabPanel } from "src/view/browser/shell/TabView";
import { useTabStore } from "src/view/browser/state/tabs/use-tab-store";

interface ContentAreaProps {
  isOverlayTarget?: boolean;
}

/**
 * 現在のペインに属するタブ一覧の配置だけを担当する。
 *
 * 変更理由: タブ本体の描画と一覧の配置を分けることで、別窓用の表示ホストを追加しても
 * ページ選択・再マウント・スクロール領域の規則を二重実装せずに済む。
 */
export const ContentArea: FC<ContentAreaProps> = ({ isOverlayTarget = true }) => {
  const { state } = useTabStore();
  const { isDetachedTab } = useDetachedTabController();
  const selectedTabId = state.selectedTabId;
  // 切り離し中のタブは別窓のPortalだけで描画し、元窓にプレースホルダーを残さない。
  const visibleTabs = state.tabs.filter((tab) => !isDetachedTab(tab.id));

  return (
    <div className="content-area">
      {visibleTabs.map((tab) => (
        // 変更理由: 2ペイン時はフォーカス外のペインも表示中のため、自動更新の
        // 実行判定はペイン単位の selectedTab で行いフォーカスでは絞らない。
        // 非表示タブ・ドキュメント非表示時の停止は各ページ側の判定に任せる。
        <TabPanel
          key={tab.id}
          tab={tab}
          isActive={tab.id === selectedTabId}
          isOverlayTarget={isOverlayTarget}
        />
      ))}
    </div>
  );
};
