import { Ban, Settings2 } from "lucide-react";
import React, { useCallback } from "react";
import { useNgStatus } from "src/features/ng/browser/use-ng-status";
import { tabActions } from "src/features/tabs/browser/tab-store-actions";
import { useTabStore } from "src/features/tabs/browser/use-tab-store";
import { MiniWindow } from "src/view/browser/components/MiniWindow";
import {
  MiniWindowNote,
  MiniWindowSection,
  MiniWindowSeparator,
  MiniWindowToggle,
} from "src/view/browser/components/MiniWindowControls";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { StatusBarItem } from "src/view/browser/components/StatusBar";
import { useMiniWindowTrigger } from "src/view/browser/hooks/use-mini-window-trigger";
import { createSettingsPage } from "src/view/browser/utils/tab-pages";

export const NgStatusItem: React.FC = () => {
  const { viewPage, dispatch } = useTabStore();
  const { isNgTemporarilyDisabled, toggleNgTemporarilyDisabled, threadListStats, threadStats } =
    useNgStatus();

  const panelKind =
    viewPage.type === "thread" ? "thread" : viewPage.type === "threadList" ? "threadList" : null;

  const {
    triggerRef: miniWindowTriggerRef,
    anchor: miniWindowAnchor,
    toggle: toggleMiniWindow,
    close: closeMiniWindow,
  } = useMiniWindowTrigger(panelKind);
  const handleEditNg = useCallback(() => {
    closeMiniWindow();
    dispatch(tabActions.navigate(createSettingsPage("ng")));
  }, [closeMiniWindow, dispatch]);

  if (panelKind == null) {
    return null;
  }

  const activeStats = panelKind === "thread" ? threadStats : threadListStats;
  const itemLabel = `NG ${activeStats.ngCount}`;
  const itemTitle = isNgTemporarilyDisabled ? `${itemLabel} (一時解除中)` : `${itemLabel}`;
  const buttonClassName = `status-bar__btn${
    isNgTemporarilyDisabled ? " status-bar__btn--muted" : ""
  }`;

  return (
    <>
      <StatusBarItem
        id="ng-status"
        alignment="left"
        priority={STATUS_BAR_PRIORITY.left.ng}
        title={itemTitle}
        interactive
      >
        <button ref={miniWindowTriggerRef} className={buttonClassName} onClick={toggleMiniWindow}>
          <Ban size={12} />
          <span>{itemLabel}</span>
        </button>
      </StatusBarItem>

      {miniWindowAnchor && (
        <MiniWindow
          title="NG設定"
          anchor={miniWindowAnchor}
          onClose={closeMiniWindow}
          triggerRef={miniWindowTriggerRef}
        >
          <MiniWindowSection>
            <button className="mini-window__action-btn" onClick={handleEditNg}>
              <Settings2 size={14} />
              <span>NGワード設定を編集</span>
            </button>
          </MiniWindowSection>

          <MiniWindowSeparator />

          <MiniWindowSection>
            {/* 件数は見出し付きの2行より、1行の要約で足りる。 */}
            <MiniWindowNote>
              現在の件数: NG {activeStats.ngCount}件・ハイライト {activeStats.highlightCount}件
            </MiniWindowNote>
            {/* 一時解除はUI表示の切り替えだけに限定し、既存NG定義は保持する。 */}
            <MiniWindowToggle
              label="一時的にNGを解除"
              checked={isNgTemporarilyDisabled}
              onToggle={toggleNgTemporarilyDisabled}
            />
            <MiniWindowNote>ハイライト表示はこの切り替えの対象外です</MiniWindowNote>
          </MiniWindowSection>
        </MiniWindow>
      )}
    </>
  );
};
