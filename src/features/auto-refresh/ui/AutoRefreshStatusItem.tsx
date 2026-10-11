import { Clock3, Pause, RefreshCw } from "lucide-react";
import React, { useState } from "react";
import { IDLE_STOP_TIMEOUT_OPTIONS } from "src/features/auto-refresh/browser/auto-refresh-config";
import {
  MAX_BOARD_INTERVAL_SEC,
  MAX_INTERVAL_SEC,
  MIN_BOARD_INTERVAL_SEC,
  MIN_INTERVAL_SEC,
  useAutoRefreshPanel,
} from "src/features/auto-refresh/browser/use-auto-refresh-panel";
import { useAutoScrollState } from "src/features/auto-refresh/browser/use-auto-scroll-state";
import { usePopupAutoScrollPauseSetting } from "src/features/auto-refresh/browser/use-popup-auto-scroll-pause-setting";
import {
  type ThreadDisplayMode,
  useThreadDisplayModeSetting,
} from "src/features/live-chat/browser/use-thread-display-mode-setting";
import type { AutoNextThreadMode } from "src/features/next-thread/browser/next-thread-search";
import { useAutoNextThreadSetting } from "src/features/next-thread/browser/use-auto-next-thread-setting";
import { useTabStore } from "src/features/tabs/browser/use-tab-store";
import { MiniWindow } from "src/view/browser/components/MiniWindow";
import {
  MiniWindowDetails,
  MiniWindowField,
  MiniWindowNote,
  MiniWindowSection,
  MiniWindowSelect,
  type MiniWindowSelectOption,
  MiniWindowSeparator,
  MiniWindowSlider,
  MiniWindowToggle,
} from "src/view/browser/components/MiniWindowControls";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { StatusBarItem, StatusBarMode } from "src/view/browser/components/StatusBar";
import { useMiniWindowTrigger } from "src/view/browser/hooks/use-mini-window-trigger";

// -----------------------------------------------------------------------
// ミニウィンドウの中身（UI のみ、ロジックは props 経由）
// -----------------------------------------------------------------------
interface ThreadAutoRefreshPanelContentProps {
  /** 2ペインで同時にパネルを開いても、ラベルが別タブの選択欄へ結び付かないようにする。 */
  idPrefix: string;
  displayMode: ThreadDisplayMode;
  onDisplayModeChange: (mode: ThreadDisplayMode) => void;
  isEnabled: boolean;
  isOnThread: boolean;
  isAutoNextThreadEnabled: boolean;
  autoNextThreadMode: AutoNextThreadMode;
  intervalSec: number;
  idleStopTimeoutValue: string;
  pauseAutoScrollOnPopup: boolean;
  isDetailsOpen: boolean;
  onDetailsOpenChange: (open: boolean) => void;
  onAutoNextThreadToggle: () => void;
  onAutoNextThreadModeChange: (mode: AutoNextThreadMode) => void;
  onPauseAutoScrollOnPopupToggle: () => void;
  onToggle: () => void;
  onIntervalChange: (sec: number) => void;
  onIdleStopTimeoutChange: (value: string) => void;
}

const THREAD_DISPLAY_MODE_OPTIONS: readonly MiniWindowSelectOption<ThreadDisplayMode>[] = [
  { value: "normal", label: "通常" },
  { value: "live-chat", label: "ライブチャット風" },
];

// 変更理由: 判定モードの違いを別の注記で説明すると縦に長くなるため、選択肢名に含める。
const AUTO_NEXT_THREAD_MODE_OPTIONS: readonly MiniWindowSelectOption<AutoNextThreadMode>[] = [
  { value: "balanced", label: "標準（精度重視）" },
  { value: "aggressive", label: "積極（スレタイ変化を許容）" },
];

const THREAD_ONLY_REASON = "スレッドを開いているときに有効です";

/**
 * よく触る「ON/OFF・間隔・表示形式」を上に置き、一度決めたら触らない設定は
 * 折りたたみへ入れて、開いた直後のミニウィンドウの高さを抑える。
 */
const ThreadAutoRefreshPanelContent: React.FC<ThreadAutoRefreshPanelContentProps> = ({
  idPrefix,
  displayMode,
  onDisplayModeChange,
  isEnabled,
  isOnThread,
  isAutoNextThreadEnabled,
  autoNextThreadMode,
  intervalSec,
  idleStopTimeoutValue,
  pauseAutoScrollOnPopup,
  isDetailsOpen,
  onDetailsOpenChange,
  onAutoNextThreadToggle,
  onAutoNextThreadModeChange,
  onPauseAutoScrollOnPopupToggle,
  onToggle,
  onIntervalChange,
  onIdleStopTimeoutChange,
}) => (
  <>
    <MiniWindowSection>
      <MiniWindowToggle
        label="自動更新"
        checked={isEnabled}
        onToggle={onToggle}
        disabled={!isOnThread}
        disabledReason={THREAD_ONLY_REASON}
      />
      {!isOnThread && <MiniWindowNote>{THREAD_ONLY_REASON}</MiniWindowNote>}
      <MiniWindowSlider
        label="更新間隔"
        min={MIN_INTERVAL_SEC}
        max={MAX_INTERVAL_SEC}
        step={5}
        value={intervalSec}
        valueLabel={`${intervalSec}秒`}
        onChange={onIntervalChange}
      />
      {/* 表示形式と取得周期を一つのパネルで扱い、ライブ専用の通信設定を増やさない。 */}
      <MiniWindowField label="表示形式" htmlFor={`${idPrefix}-display-mode`}>
        <MiniWindowSelect
          id={`${idPrefix}-display-mode`}
          value={displayMode}
          options={THREAD_DISPLAY_MODE_OPTIONS}
          onChange={onDisplayModeChange}
        />
      </MiniWindowField>
    </MiniWindowSection>

    <MiniWindowDetails summary="詳細設定" open={isDetailsOpen} onOpenChange={onDetailsOpenChange}>
      <MiniWindowSection>
        <MiniWindowToggle
          label="自動次スレ移動"
          checked={isAutoNextThreadEnabled}
          onToggle={onAutoNextThreadToggle}
          disabled={!isOnThread}
          disabledReason={THREAD_ONLY_REASON}
        />
        <MiniWindowField label="次スレ判定" htmlFor={`${idPrefix}-next-thread-mode`}>
          <MiniWindowSelect
            id={`${idPrefix}-next-thread-mode`}
            value={autoNextThreadMode}
            options={AUTO_NEXT_THREAD_MODE_OPTIONS}
            onChange={onAutoNextThreadModeChange}
            disabled={!isOnThread}
          />
        </MiniWindowField>
        <MiniWindowNote>1000到達後に次スレを探し、見つからなければ停止します</MiniWindowNote>
      </MiniWindowSection>

      <MiniWindowSeparator />

      <MiniWindowSection>
        <MiniWindowField label="新着なしで停止" htmlFor={`${idPrefix}-idle-stop`}>
          <MiniWindowSelect
            id={`${idPrefix}-idle-stop`}
            value={idleStopTimeoutValue}
            options={IDLE_STOP_TIMEOUT_OPTIONS}
            onChange={onIdleStopTimeoutChange}
          />
        </MiniWindowField>
        <MiniWindowToggle
          label="ポップアップ表示中は一時停止"
          checked={pauseAutoScrollOnPopup}
          onToggle={onPauseAutoScrollOnPopupToggle}
        />
      </MiniWindowSection>
    </MiniWindowDetails>
  </>
);

interface ThreadListAutoRefreshPanelContentProps {
  isEnabled: boolean;
  intervalSec: number;
  onToggle: () => void;
  onIntervalChange: (sec: number) => void;
}

const ThreadListAutoRefreshPanelContent: React.FC<ThreadListAutoRefreshPanelContentProps> = ({
  isEnabled,
  intervalSec,
  onToggle,
  onIntervalChange,
}) => (
  <>
    <MiniWindowSection>
      <MiniWindowToggle label="自動更新" checked={isEnabled} onToggle={onToggle} />
      <MiniWindowNote>スレ一覧を開いている間だけ、同じタブで自動更新します</MiniWindowNote>
      <MiniWindowSlider
        label="更新間隔"
        min={MIN_BOARD_INTERVAL_SEC}
        max={MAX_BOARD_INTERVAL_SEC}
        step={10}
        value={intervalSec}
        valueLabel={`${intervalSec}秒`}
        onChange={onIntervalChange}
      />
    </MiniWindowSection>
  </>
);

// -----------------------------------------------------------------------
// ステータスバーアイテム本体
// -----------------------------------------------------------------------
export const AutoRefreshStatusItem: React.FC = () => {
  const { viewTab } = useTabStore();
  const { mode: displayMode, setMode: setDisplayMode } = useThreadDisplayModeSetting();
  const {
    panelKind,
    isOnThread,
    isEnabled,
    intervalSec,
    idleStopTimeoutValue,
    toggle,
    setIntervalSec,
    setIdleStopTimeout,
  } = useAutoRefreshPanel();
  const {
    enabled: isAutoNextThreadEnabled,
    mode: autoNextThreadMode,
    setEnabled: setAutoNextThreadEnabled,
    setMode: setAutoNextThreadMode,
  } = useAutoNextThreadSetting();
  const { enabled: pauseAutoScrollOnPopup, setEnabled: setPauseAutoScrollOnPopup } =
    usePopupAutoScrollPauseSetting();
  const { canAutoScroll, isAutoScrolling, isPaused } = useAutoScrollState();
  // ミニウィンドウを閉じ直しても、詳細設定を開いたまま使い続けられるよう本体側で保持する。
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // 早期returnする前にすべてのhooksを呼び出す必要があるため、panelKindが変わったら
  // フック側で閉じ、表示可否はJSXレベルで分岐する。
  const {
    triggerRef: miniWindowTriggerRef,
    anchor: miniWindowAnchor,
    toggle: toggleMiniWindow,
    close: closeMiniWindow,
  } = useMiniWindowTrigger(panelKind);

  // 変更理由: 全体の status-bar accent は StatusBarMode が source of truth なので、
  // スレ/スレ一覧の両方で同じ active 判定をここに集約する。
  const isStatusActive =
    panelKind === "thread"
      ? isEnabled && !isPaused && (canAutoScroll || isAutoScrolling)
      : panelKind === "threadList"
        ? isEnabled
        : false;
  const intervalLabel = `${intervalSec} s`;

  // panelKindがnullの場合はこのコンポーネント全体を表示しない
  if (panelKind == null) {
    return null;
  }

  const itemTitle =
    panelKind === "thread"
      ? !isEnabled
        ? "スレッド自動更新: OFF"
        : isPaused
          ? `スレッド自動更新: 一時停止中（ポップアップ表示中, ${intervalSec}秒間隔）`
          : canAutoScroll || isAutoScrolling
            ? `スレッド自動更新: 追従中（${intervalSec}秒間隔）`
            : `スレッド自動更新: 待機中（しきい線より上, ${intervalSec}秒間隔）`
      : !isEnabled
        ? "スレ一覧自動更新: OFF"
        : `スレ一覧自動更新: ON（${intervalSec}秒間隔）`;

  const renderStatusIcon = () => {
    if (panelKind === "thread") {
      if (!isEnabled) {
        return <RefreshCw size={13} aria-hidden="true" />;
      }
      if (isPaused) {
        return <Pause size={13} aria-hidden="true" />;
      }
      if (canAutoScroll || isAutoScrolling) {
        return <RefreshCw size={13} className="icon--spinning" aria-hidden="true" />;
      }
      return <Clock3 size={13} aria-hidden="true" />;
    }

    if (isEnabled) {
      return <RefreshCw size={13} className="icon--spinning" aria-hidden="true" />;
    }

    return <Pause size={13} aria-hidden="true" />;
  };

  const buttonClassName = `status-bar__btn${
    panelKind === "threadList" && !isEnabled ? " status-bar__btn--muted" : ""
  }`;
  const windowTitle = panelKind === "thread" ? "スレッド自動更新" : "スレ一覧自動更新";

  return (
    <>
      <StatusBarMode id="auto-refresh-status-mode" appearance={isStatusActive ? "active" : null} />

      <StatusBarItem
        id="auto-refresh-status"
        alignment="left"
        priority={STATUS_BAR_PRIORITY.left.autoRefresh}
        title={itemTitle}
        interactive
      >
        <button
          ref={miniWindowTriggerRef}
          className={buttonClassName}
          onClick={toggleMiniWindow}
          title={itemTitle}
          aria-label={itemTitle}
        >
          {renderStatusIcon()}
          {
            // 変更理由: ステータスバー上で現在値が見えないと、
            // ミニウィンドウを開くまで更新間隔を確認できず操作往復が増えるため。
          }
          <span className="status-bar__btn-label">{intervalLabel}</span>
        </button>
      </StatusBarItem>

      {miniWindowAnchor && (
        <MiniWindow
          title={windowTitle}
          anchor={miniWindowAnchor}
          onClose={closeMiniWindow}
          triggerRef={miniWindowTriggerRef}
        >
          {panelKind === "thread" ? (
            <ThreadAutoRefreshPanelContent
              idPrefix={`thread-auto-refresh-${viewTab?.id ?? "current"}`}
              displayMode={displayMode}
              onDisplayModeChange={setDisplayMode}
              isEnabled={isEnabled}
              isOnThread={isOnThread}
              isAutoNextThreadEnabled={isAutoNextThreadEnabled}
              autoNextThreadMode={autoNextThreadMode}
              intervalSec={intervalSec}
              idleStopTimeoutValue={idleStopTimeoutValue}
              pauseAutoScrollOnPopup={pauseAutoScrollOnPopup}
              isDetailsOpen={isDetailsOpen}
              onDetailsOpenChange={setIsDetailsOpen}
              onAutoNextThreadToggle={() => setAutoNextThreadEnabled(!isAutoNextThreadEnabled)}
              onAutoNextThreadModeChange={setAutoNextThreadMode}
              onPauseAutoScrollOnPopupToggle={() =>
                setPauseAutoScrollOnPopup(!pauseAutoScrollOnPopup)
              }
              onToggle={toggle}
              onIntervalChange={setIntervalSec}
              onIdleStopTimeoutChange={setIdleStopTimeout}
            />
          ) : (
            <ThreadListAutoRefreshPanelContent
              isEnabled={isEnabled}
              intervalSec={intervalSec}
              onToggle={toggle}
              onIntervalChange={setIntervalSec}
            />
          )}
        </MiniWindow>
      )}
    </>
  );
};
