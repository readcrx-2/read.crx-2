import { PenLine } from "lucide-react";
import React from "react";
import { useWriteSessionControls } from "src/features/write/browser/use-write-session";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { StatusBarItem } from "src/view/browser/components/StatusBar";
import { BOTTOM_PANEL_WRITE_TAB_ID, useBottomPanel } from "src/view/browser/hooks/use-bottom-panel";
import { useTabStore } from "src/view/browser/state/tabs/use-tab-store";

export const WritePanelToggleItem: React.FC = () => {
  const { isOpen, activePanelTabId, togglePanel, requestWritePanelFocus } = useBottomPanel();
  const { viewPage } = useTabStore();
  const { isWindowOpen, openWriteWindow, selectThread, requestWriteWindowFocus } =
    useWriteSessionControls();

  // 書き込み UI はスレッド専用なので、他ページではステータスバーに出さない。
  if (viewPage.type !== "thread") {
    return null;
  }

  return (
    <StatusBarItem
      id="write-panel-toggle"
      alignment="right"
      priority={STATUS_BAR_PRIORITY.right.writePanelToggle}
      interactive
      title="書き込みパネルを開閉"
    >
      <button
        className="status-bar__btn"
        onClick={() => {
          // 表示中のスレから開いた場合は、そのスレを共通書き込み窓の初期選択にする。
          selectThread(viewPage.threadUrl);
          if (isWindowOpen) {
            // 共有窓が既にある場合は下部パネルを再表示せず、同じエディタへ戻す。
            if (openWriteWindow()) {
              requestWriteWindowFocus();
            }
            return;
          }
          // 変更理由: 書き込みは入力欄と本文を両方見渡せる既定サイズで開き、
          // スレ一覧を使った後も大きな高さがそのまま残らないようにする。
          togglePanel(BOTTOM_PANEL_WRITE_TAB_ID);
          if (!isOpen || activePanelTabId !== BOTTOM_PANEL_WRITE_TAB_ID) {
            requestWritePanelFocus();
          }
        }}
        aria-label="書き込みパネルを開閉"
      >
        <PenLine size={12} />
        <span>書き込み</span>
      </button>
    </StatusBarItem>
  );
};
