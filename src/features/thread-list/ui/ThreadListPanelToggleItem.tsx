import { List as ListIcon } from "lucide-react";
import React from "react";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { StatusBarItem } from "src/view/browser/components/StatusBar";
import {
  BOTTOM_PANEL_THREAD_LIST_TAB_ID,
  useBottomPanel,
} from "src/view/browser/hooks/use-bottom-panel";
import { useTabStore } from "src/view/browser/state/tabs/use-tab-store";

// ステータスバー右端に表示する下部パネルの直接操作ボタン。
// 変更理由: パネル種別を先に選ばせると書き込みまでの操作が増えるため、
// スレ一覧と書き込みをそれぞれ1クリックで開けるようにする。
export const ThreadListPanelToggleItem: React.FC = () => {
  const { togglePanel } = useBottomPanel();
  const { viewPage } = useTabStore();

  if (viewPage.type !== "thread") {
    return null;
  }

  return (
    <StatusBarItem
      id="thread-list-panel-toggle"
      alignment="right"
      priority={STATUS_BAR_PRIORITY.right.threadListPanelToggle}
      interactive
      title="スレ一覧パネルを開閉"
    >
      <button
        className="status-bar__btn"
        onClick={() => togglePanel(BOTTOM_PANEL_THREAD_LIST_TAB_ID)}
        aria-label="スレ一覧パネルを開閉"
      >
        <ListIcon size={12} />
        <span>スレ一覧</span>
      </button>
    </StatusBarItem>
  );
};
