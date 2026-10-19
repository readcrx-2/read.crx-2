import React, { useCallback, useEffect } from "react";
import { createLogger } from "src/app/logger";
import { isTauriRuntime } from "src/app/platform/runtime";
import { useArchiveReplayMainThreadSync } from "src/features/archive-replay/browser/use-main-thread-sync";
import { openArchiveReplayWindow as openArchiveReplayNativeWindow } from "src/features/archive-replay/platform";
import { AutoScrollStateProvider } from "src/features/auto-refresh/browser/use-auto-scroll-state";
import { AutoRefreshStatusItem } from "src/features/auto-refresh/ui/AutoRefreshStatusItem";
import { BookmarkRootSelectorDialog } from "src/features/bookmark/ui/BookmarkRootSelectorDialog";
import { CommentOverlayCommandBridge } from "src/features/comment-overlay/ui/CommentOverlayCommandBridge";
import { CommentOverlayJumpBridge } from "src/features/comment-overlay/ui/CommentOverlayJumpBridge";
import { CommentOverlayStatusItem } from "src/features/comment-overlay/ui/CommentOverlayStatusItem";
import { OverlayPlacementWindowProvider } from "src/features/comment-overlay/ui/OverlayPlacementWindow";
import { useNextThreadSearch } from "src/features/next-thread/browser/use-next-thread-search";
import { NextThreadSearchDialog } from "src/features/next-thread/ui/NextThreadSearchDialog";
import { NgStatusProvider } from "src/features/ng/browser/use-ng-status";
import { NgStatusItem } from "src/features/ng/ui/NgStatusItem";
import { useTabBarOrientation } from "src/features/tabs/browser/use-tab-bar-orientation";
import { TabBar } from "src/features/tabs/ui/TabBar";
import { WindowNavigationBridge } from "src/features/tabs/ui/WindowNavigationBridge";
import { IkioiStatusItem } from "src/features/thread/ui/IkioiStatusItem";
import { PopularFilterStatusItem } from "src/features/thread/ui/PopularFilterStatusItem";
import { ThreadListPanelToggleItem } from "src/features/thread-list/ui/ThreadListPanelToggleItem";
import { WriteSessionProvider } from "src/features/write/browser/use-write-session";
import { WritePanelToggleItem } from "src/features/write/ui/WritePanelToggleItem";
import { WriteWindowHost } from "src/features/write/ui/WriteWindowHost";
import { container } from "src/service-container/index";
import { StatusBar, StatusBarProvider } from "src/view/browser/components/StatusBar";
import { BottomPanelProvider } from "src/view/browser/hooks/use-bottom-panel";
import { useNotificationListener } from "src/view/browser/hooks/use-notification-listener";
import { PageCountStatusProvider } from "src/view/browser/hooks/use-page-count-status";
import { useTheme } from "src/view/browser/hooks/use-theme";
import { BottomPanel } from "src/view/browser/shell/BottomPanel";
import { ContentArea } from "src/view/browser/shell/ContentArea";
import { NavigationBar } from "src/view/browser/shell/NavigationBar";
import { PageCountStatusItem } from "src/view/browser/shell/PageCountStatusItem";
import { TabWindowHost } from "src/view/browser/shell/TabWindowHost";
import { TitleBar } from "src/view/browser/shell/TitleBar";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import {
  PaneProvider,
  TabProvider,
  useTabDispatch,
  useTabPanes,
  useTabStore,
} from "src/view/browser/state/tabs/use-tab-store";
import { ToastProvider } from "src/view/browser/ui/Toast";
import { TooltipProvider } from "src/view/browser/ui/Tooltip";
import { applyBBSMenuToItestServerMap } from "src/view/browser/utils/itest-server-map";
import browser from "webextension-polyfill";

const logger = createLogger("view/browser");

// MCPのURL省略要求とサービスワーカー用設定を保存する。
// TabStoreはReact Context内の状態なので、UI外のサービスワーカーへはこの最小限の値だけ渡す。
const ActiveThreadBridgeState: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  const { viewPage } = useTabStore();
  const activeThreadUrl = isActive && viewPage.type === "thread" ? viewPage.threadUrl : undefined;
  const format2chnet = container.config.get("format_2chnet");

  useEffect(() => {
    if (!/^(?:chrome|moz)-extension:$/.test(location.protocol) || !isActive) return;

    // 変更理由: サービスワーカーはwindowのReact状態を参照できないため、
    // URL省略要求に必要な現在スレッドだけを拡張ストレージへ同期する。
    const state = activeThreadUrl ?? null;
    void browser.runtime
      .sendMessage({
        type: "mcp-state",
        activeThreadUrl: state,
        format2chnet,
      })
      .catch((error: unknown) => {
        logger.error("現在スレッド情報の同期に失敗しました:", error);
      });
  }, [activeThreadUrl, format2chnet, isActive]);

  return null;
};

// 1ペイン分の縦カラム（タブバー＋ナビゲーション＋コンテンツ）。
// PaneProvider で囲うことで、配下の TabBar/ContentArea/各ページが自ペインのスライスを透過的に操作する。
const PaneColumn: React.FC<{ paneId: string; isActive: boolean }> = ({ paneId, isActive }) => {
  return (
    <PaneProvider paneId={paneId}>
      <PaneColumnInner isActive={isActive} />
    </PaneProvider>
  );
};

// PaneProvider 配下でしか使えない（ペインスコープの dispatch を取るため）。
const PaneColumnInner: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  const dispatch = useTabDispatch();
  const { viewPage, viewTab } = useTabStore();
  const tabBarOrientation = useTabBarOrientation();
  const {
    state: nextThreadSearchState,
    searchNextThread,
    searchSimilarThreads,
    close: closeNextThreadSearch,
    selectCandidate,
  } = useNextThreadSearch({
    viewPage,
    isActive,
    keepAutoRefresh: viewTab.autoRefreshEnabled,
    dispatch,
  });

  // 変更理由: 水平・垂直どちらの配置でもペイン内容は同一にするため、TabBar 以外の
  // 本体部分を共通化して二重管理を防ぐ。
  const openArchiveReplayWindow = useCallback(() => {
    if (!isTauriRuntime()) {
      // コマンド一覧から除外される以外の経路でも、ブラウザ版でTauri専用窓を開かない。
      logger.error("Tauri版以外から再生窓を開こうとしました");
      return;
    }
    // 変更理由: 再生中もThreadViewとコメントOverlayを同時に使うため、
    // Mainのペインへ埋め込まず、専用Tauri窓の表示だけを要求する。
    void openArchiveReplayNativeWindow().catch((error: unknown) => {
      logger.error("再生窓の表示に失敗しました", error);
    });
  }, []);
  const navigationBar = (
    <NavigationBar
      openNextThreadSearchDialog={searchNextThread}
      openSimilarThreadSearchDialog={searchSimilarThreads}
      openArchiveReplayWindow={openArchiveReplayWindow}
    />
  );
  const paneBody = (
    <>
      <ActiveThreadBridgeState isActive={isActive} />
      <ContentArea isOverlayTarget={isActive} />
      <BottomPanel />
      {/* コマンドとナビゲーションを同じオムニバーへ集約し、
          操作元のペイン状態を使うためアクティブペインだけが起動を担当する。 */}
      {isActive ? (
        <>
          <NextThreadSearchDialog
            state={nextThreadSearchState}
            onClose={closeNextThreadSearch}
            onSelect={selectCandidate}
          />
        </>
      ) : null}
      {/* 以下はこのペインの StatusBarProvider に項目を登録する。 */}
      <NgStatusItem />
      <IkioiStatusItem />
      <PopularFilterStatusItem />
      <AutoRefreshStatusItem />
      <CommentOverlayStatusItem isActive={isActive} />
      <PageCountStatusItem />
      <ThreadListPanelToggleItem />
      <WritePanelToggleItem />
      <StatusBar />
    </>
  );

  return (
    <section
      className="pane-column"
      data-active={isActive ? "true" : "false"}
      data-tab-orientation={tabBarOrientation}
      // ペイン内のどこかを操作したらそのペインをフォーカスする。
      // capture フェーズで拾い、子要素の操作前にアクティブペインを確定させる。
      onPointerDownCapture={() => {
        if (!isActive) {
          dispatch(tabActions.setActivePane());
        }
      }}
    >
      {/*
        ステータス／NG／書き込みパネル／自動スクロールの各状態をペイン単位に分離する。
        これらのプロバイダをペイン内に降ろすことで、2ペイン時に左右それぞれが
        独立したステータスバーと書き込みパネルを持てるようにする（旧構成はシェル直下に
        1個だけ置き、アクティブペインの情報しか映せなかった）。
        StatusBar の項目登録は固定 ID なので、プロバイダがペイン単位になることで
        左右の項目衝突も自然に解消される。
      */}
      <StatusBarProvider>
        <PageCountStatusProvider>
          <NgStatusProvider>
            <BottomPanelProvider>
              <AutoScrollStateProvider>
                {tabBarOrientation === "vertical" ? (
                  // 変更理由: 垂直モードではタブバーをペインの上端まで伸ばし、
                  // タイトルバー以下を右へ押しのける。タイトルバーもペイン単位にし、
                  // 自ペインの操作欄を持つ。1ペイン優先の簡易対応とし、
                  // 2ペイン時は操作欄が複製される。
                  <div className="pane-column__vertical-body">
                    <TabBar orientation="vertical" />
                    <div className="pane-column__vertical-main">
                      <TitleBar />
                      <div className="pane-column__chrome">{navigationBar}</div>
                      {paneBody}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="pane-column__chrome">
                      <TabBar orientation="horizontal" />
                      {navigationBar}
                    </div>
                    {paneBody}
                  </>
                )}
              </AutoScrollStateProvider>
            </BottomPanelProvider>
          </NgStatusProvider>
        </PageCountStatusProvider>
      </StatusBarProvider>
    </section>
  );
};

// ペイン群を横に並べる行。
const PaneRow: React.FC = () => {
  const { panes, activePaneId } = useTabPanes();

  return (
    <div className="pane-row">
      {panes.map((pane) => (
        <PaneColumn key={pane.id} paneId={pane.id} isActive={pane.id === activePaneId} />
      ))}
    </div>
  );
};

export const BrowserApp: React.FC = () => {
  const theme = useTheme();
  // 変更理由: 垂直モードではタイトルバーをペイン単位にするため、シェル側の共通表示を切り替える。
  const shellTabBarOrientation = useTabBarOrientation();
  useNotificationListener();

  useEffect(() => {
    if (!/^(?:chrome|moz)-extension:$/.test(location.protocol)) return;

    // 新規タブは裏で読み込み、テーマとシェルの準備後に背景側から選択して白い初期画面を避ける。
    // 拡張ページからの通知ではsender.tabが省略される場合があるため、タブIDを明示する。
    void browser.tabs
      .getCurrent()
      .then(async (tab) => {
        if (tab?.id === undefined) return;
        await browser.runtime.sendMessage({ type: "viewer-ready", tabId: tab.id });
      })
      .catch((error: unknown) => {
        logger.error("ビューアーの起動準備完了を通知できませんでした", error);
      });
  }, []);

  // 変更理由: URL解決用のサーバー対応表は板一覧から更新し、画面の操作中は同期参照できるようにする。
  // 前回セッションの localStorage キャッシュがあるため、ここでの取得は
  // 次回以降の起動に備えた更新も兼ねる。
  useEffect(() => {
    void container.bbsMenu
      .get(false)
      .then((result) => {
        if (result.status === "success" && result.menu) {
          applyBBSMenuToItestServerMap(result.menu);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <TooltipProvider>
      <TabProvider>
        <WriteSessionProvider>
          {/* 実況の表示位置調整窓は、各ペインと切り離したタブの両方から開けるよう外側に置く。 */}
          <OverlayPlacementWindowProvider>
            <TabWindowHost>
              <CommentOverlayJumpBridge />
              <CommentOverlayCommandBridge />
              <WriteWindowHost />
              <ArchiveReplayMainThreadSyncBridge />
              {/*
              ステータス／NG／書き込み／自動スクロールの各プロバイダは PaneColumn 内へ移設した。
              シェル直下には全ペイン共通のグローバル UI（トースト・ダイアログ）だけを残す。
            */}
              {/* data-theme を使ってダークモード CSS 変数を切り替える */}
              <div
                className="browser-shell"
                data-theme={theme}
                data-tab-orientation={shellTabBarOrientation}
              >
                <WindowNavigationBridge />
                {/* 変更理由: 本文を覆う範囲を減らし、通知を上部バー直下の右端へ寄せる。
                    URL入力はタイトルバー内でピルと入れ替わるだけで行が増えないため、
                    入力中でも通知の位置は変えない。 */}
                <ToastProvider topOffset="var(--sys-space-13)" rightOffset="var(--sys-space-4)" />
                {/*
                水平モードではタイトルと必須のレイアウト操作はペインの外に置く。
                これにより2ペイン時も操作が重複せず、アクティブペインのタイトルだけを表示できる。
                垂直モードではタイトルバーもペイン単位にするため、共通バーは表示しない。
              */}
                {shellTabBarOrientation === "vertical" ? null : <TitleBar />}
                <PaneRow />
                <BookmarkRootSelectorDialog />
              </div>
            </TabWindowHost>
          </OverlayPlacementWindowProvider>
        </WriteSessionProvider>
      </TabProvider>
    </TooltipProvider>
  );
};

const ArchiveReplayMainThreadSyncBridge: React.FC = () => {
  useArchiveReplayMainThreadSync();
  return null;
};
