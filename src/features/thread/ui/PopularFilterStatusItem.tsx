import { ListFilter } from "lucide-react";
import React, { useCallback } from "react";
import { useTabStore, useTabViewState } from "src/features/tabs/browser/use-tab-store";
import { MiniWindow } from "src/view/browser/components/MiniWindow";
import {
  MiniWindowNote,
  MiniWindowSection,
  MiniWindowSlider,
} from "src/view/browser/components/MiniWindowControls";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { StatusBarItem } from "src/view/browser/components/StatusBar";
import { useMiniWindowTrigger } from "src/view/browser/hooks/use-mini-window-trigger";
import {
  DEFAULT_POPULAR_REPLY_THRESHOLD,
  MAX_POPULAR_REPLY_THRESHOLD,
  MIN_POPULAR_REPLY_THRESHOLD,
  normalizePopularReplyThreshold,
} from "src/view/browser/utils/popular-filter";

export const PopularFilterStatusItem: React.FC = () => {
  const { viewTab, viewPage } = useTabStore();
  const { state: viewState, update: updateViewState } = useTabViewState(viewTab.id, viewPage);

  const isPopularFilterEnabled = viewPage.type === "thread" && viewState.filter === "popular";
  const threshold = normalizePopularReplyThreshold(
    viewState.popularReplyThreshold ?? DEFAULT_POPULAR_REPLY_THRESHOLD,
  );
  const itemLabel = `人気レス ${threshold}件以上`;

  // フィルタを切り替えたあとに、表示対象ではない設定パネルだけが残らないよう閉じる。
  const {
    triggerRef: miniWindowTriggerRef,
    anchor: miniWindowAnchor,
    toggle: toggleMiniWindow,
    close: closeMiniWindow,
  } = useMiniWindowTrigger(isPopularFilterEnabled);

  const handleThresholdChange = useCallback(
    (value: number) => {
      // 本文側と同じ viewState を更新し、スライダー操作だけで表示レスを再計算させる。
      updateViewState({ popularReplyThreshold: normalizePopularReplyThreshold(value) });
    },
    [updateViewState],
  );

  if (!isPopularFilterEnabled) {
    return null;
  }

  return (
    <>
      <StatusBarItem
        id="popular-filter-status"
        alignment="left"
        priority={STATUS_BAR_PRIORITY.left.popularFilter}
        title={itemLabel}
        interactive
      >
        <button
          ref={miniWindowTriggerRef}
          className="status-bar__btn"
          onClick={toggleMiniWindow}
          title={itemLabel}
          aria-label={itemLabel}
        >
          <ListFilter size={13} aria-hidden="true" />
          <span className="status-bar__btn-label">≥{threshold}</span>
        </button>
      </StatusBarItem>

      {miniWindowAnchor && (
        <MiniWindow
          title="人気フィルタ"
          anchor={miniWindowAnchor}
          onClose={closeMiniWindow}
          triggerRef={miniWindowTriggerRef}
        >
          <MiniWindowSection>
            <MiniWindowSlider
              label="人気レス閾値"
              min={MIN_POPULAR_REPLY_THRESHOLD}
              max={MAX_POPULAR_REPLY_THRESHOLD}
              step={1}
              value={threshold}
              valueLabel={`${threshold}件`}
              onChange={handleThresholdChange}
            />
            <MiniWindowNote>返信がこの件数以上のレスを表示します</MiniWindowNote>
          </MiniWindowSection>
        </MiniWindow>
      )}
    </>
  );
};
