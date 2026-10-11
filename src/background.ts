import browser from "webextension-polyfill";

import { createReadyViewerTab } from "./app/platform/browser/ready-viewer-tab";
import { startMcpWorker } from "./mcp/worker-bridge";

const NEW_UI_URL_PREFIX = browser.runtime.getURL("view/index.html");
const NEW_UI_URL_QUERY = `${browser.runtime.getURL("view/index.html")}*`;
let newUiPrimaryTabId: number | null = null;

type OpenNewUiMessage = {
  type: "open-new-ui";
  url: string;
};

type OpenInNewViewerTabMessage = {
  type: "open-in-new-viewer-tab";
  url: string;
};

// 指定されたタブがこの拡張機能のUIかどうか判定
const isNewUiTab = (tab: browser.Tabs.Tab | undefined): boolean =>
  typeof tab?.url === "string" && tab.url.startsWith(NEW_UI_URL_PREFIX);

// 既存のread.crx UIタブを探す
const findNewUiTab = async (): Promise<browser.Tabs.Tab | null> => {
  const tabs = await browser.tabs.query({ url: NEW_UI_URL_QUERY });
  if (tabs.length === 0) return null;

  // 保存されているIDと一致するタブがあれば優先
  if (newUiPrimaryTabId != null) {
    const primaryTab = tabs.find((tab) => tab.id === newUiPrimaryTabId);
    if (primaryTab) return primaryTab;
  }
  return tabs[0];
};

const focusTabById = async (tabId: number): Promise<void> => {
  const tab = await browser.tabs.get(tabId);
  if (tab.windowId != null) {
    await browser.windows.update(tab.windowId, { focused: true });
  }
  await browser.tabs.update(tabId, { active: true });
};

// 指定されたウィンドウID、または現在のウィンドウにタブを作成
const createTabInWindow = async (url: string, windowId?: number): Promise<browser.Tabs.Tab> => {
  const targetWindowId = windowId ?? (await browser.windows.getCurrent()).id;
  return createReadyViewerTab(url, targetWindowId);
};

// URLを開く、または既存のタブを更新してフォーカスする（唯一の入り口）
const openOrFocusNewUiTab = async (currentUrl?: string): Promise<void> => {
  const existingTab = await findNewUiTab();
  const viewerUrl = currentUrl
    ? `${NEW_UI_URL_PREFIX}?q=${encodeURIComponent(currentUrl)}`
    : NEW_UI_URL_PREFIX;

  if (existingTab?.id != null) {
    await browser.tabs.update(existingTab.id, {
      url: viewerUrl,
      active: true,
    });
    await focusTabById(existingTab.id);
    newUiPrimaryTabId = existingTab.id;
  } else {
    // 変更理由: windowIdを指定しないと別ウィンドウでタブが開くことがあるため、
    // 現在のウィンドウにタブを作成する
    const createdTab = await createTabInWindow(viewerUrl);
    if (createdTab.id != null) {
      newUiPrimaryTabId = createdTab.id;
    }
  }
};

/**
 * 強制的な単一インスタンス管理ロジック
 * 他のスクリプトや手入力で新しいタブが開かれた場合に対処
 */
const enforceSingleInstance = async (tab: browser.Tabs.Tab) => {
  if (!isNewUiTab(tab) || tab.id === undefined) return;

  const existingTab = await findNewUiTab();

  // 自分自身が唯一のインスタンスならそれをプライマリにする
  if (!existingTab || existingTab.id === tab.id) {
    newUiPrimaryTabId = tab.id;
    return;
  }

  // 他に既にタブが存在する場合：
  // 1. 既存のタブにフォーカス
  await focusTabById(existingTab.id!);
  // 2. 新しく作られた方のタブを閉じる
  const tabWindowId = tab.windowId;
  await browser.tabs.remove(tab.id);

  // 3. 変更理由: 別ウィンドウで開かれたタブを閉じた後、
  // そのウィンドウに他のタブが残っていなければウィンドウ自体を閉じる
  if (tabWindowId != null) {
    try {
      const remainingTabs = await browser.tabs.query({ windowId: tabWindowId });
      if (remainingTabs.length === 0) {
        await browser.windows.remove(tabWindowId);
      }
    } catch {
      // ウィンドウが既に閉じられている場合は無視
    }
  }
};

// タブが作成された瞬間
browser.tabs.onCreated.addListener((tab) => {
  void enforceSingleInstance(tab);
});

// タブのURLが更新された瞬間（アドレスバーからの入力等に対応）
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "loading") {
    void enforceSingleInstance(tab);
  }
});

// タブが閉じられた時のクリーンアップ
browser.tabs.onRemoved.addListener((tabId: number) => {
  if (newUiPrimaryTabId === tabId) {
    newUiPrimaryTabId = null;
  }
});

// 既存ビューアータブへ新しい専ブラタブで開くよう指示する。タブがなければ新規作成する。
const openInNewViewerTab = async (currentUrl: string): Promise<void> => {
  const existingTab = await findNewUiTab();
  const viewerUrl = `${NEW_UI_URL_PREFIX}?q=${encodeURIComponent(currentUrl)}`;

  if (existingTab?.id != null) {
    // 変更理由: タブのURLを上書きするとビューアーがリロードされ既存の専ブラタブが消えるため、
    // sendMessage でビューアー側に新タブ追加を委譲する。
    await browser.tabs.sendMessage(existingTab.id, {
      type: "open-tab-in-viewer",
      url: currentUrl,
    });
    await focusTabById(existingTab.id);
  } else {
    const createdTab = await createTabInWindow(viewerUrl);
    if (createdTab.id != null) {
      newUiPrimaryTabId = createdTab.id;
    }
  }
};

const closeSourceTab = async (sourceTabId: number | undefined): Promise<void> => {
  if (typeof sourceTabId !== "number") return;

  try {
    // 変更理由: コンテンツスクリプトには tabs.remove 権限がないため、
    // sender.tab を受け取れる背景側で、ChLensへの遷移完了後にだけ元タブを閉じる。
    await browser.tabs.remove(sourceTabId);
  } catch (error: unknown) {
    // 元タブが先に閉じられた場合でも、ChLensで開く操作自体は成功扱いにする。
    console.error("[ChLens] ChLensで開いた元ブラウザタブを閉じられませんでした", {
      tabId: sourceTabId,
      error,
    });
  }
};

const openInNewViewerTabFromSource = async (
  currentUrl: string,
  sourceTabId: number | undefined,
): Promise<void> => {
  try {
    await openInNewViewerTab(currentUrl);
  } catch (error: unknown) {
    // 開く処理に失敗したときは、元タブを復旧経路として残す。
    console.error("[ChLens] ChLensで開く処理に失敗しました", { currentUrl, error });
    return;
  }

  await closeSourceTab(sourceTabId);
};

// メッセージ経由の起動
browser.runtime.onMessage.addListener((message: unknown, sender: browser.Runtime.MessageSender) => {
  const msg = message as OpenNewUiMessage | OpenInNewViewerTabMessage;
  if (msg.type === "open-new-ui") {
    void openOrFocusNewUiTab(msg.url);
  } else if (msg.type === "open-in-new-viewer-tab") {
    void openInNewViewerTabFromSource(msg.url, sender.tab?.id);
  }
});

// ツールバーアイコンクリック時の動作
browser.action.onClicked.addListener(async (currentTab) => {
  // 現在のタブが既にread.crxなら何もしない
  if (isNewUiTab(currentTab)) return;

  // 変更理由: ツールバーアイコンからの起動では、対応可否にかかわらず
  // 現在のページURLを検索語としてomnibarへ自動入力しない。
  await openOrFocusNewUiTab();
});

// MCPのデータ取得は表示画面の有無に依存させず、拡張のサービスワーカーで実行する。
// 画面側のReact bundleへ中継処理を入れると、画面を閉じた後にログを読めなくなるため、
// background.jsを唯一の接続・取得入口にする。
startMcpWorker();
