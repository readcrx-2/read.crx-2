import browser from "webextension-polyfill";

/** テーマ適用とReactの初回描画が済んだビューアータブを選択する。 */
export async function createReadyViewerTab(
  url: string,
  windowId?: number,
): Promise<browser.Tabs.Tab> {
  const readyTabIds = new Set<number>();
  const removedTabIds = new Set<number>();
  let createdTabId: number | undefined;
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const settle = () => {
    if (createdTabId === undefined) return;
    if (removedTabIds.has(createdTabId)) {
      rejectReady(new Error("起動準備中のビューアータブが閉じられました"));
      return;
    }
    if (readyTabIds.has(createdTabId)) resolveReady();
  };
  const handleMessage = (message: unknown, sender: browser.Runtime.MessageSender) => {
    if (
      typeof message !== "object" ||
      message === null ||
      !("type" in message) ||
      message.type !== "viewer-ready" ||
      !("tabId" in message) ||
      typeof message.tabId !== "number" ||
      sender.id !== browser.runtime.id ||
      !sender.url?.startsWith(browser.runtime.getURL("view/index.html"))
    ) {
      return;
    }
    readyTabIds.add(message.tabId);
    settle();
  };
  const handleRemoved = (tabId: number) => {
    removedTabIds.add(tabId);
    settle();
  };

  // tabs.createが返るより先に準備完了通知が届く場合も拾えるよう、作成前から購読する。
  browser.runtime.onMessage.addListener(handleMessage);
  browser.tabs.onRemoved.addListener(handleRemoved);
  try {
    // HTMLを読む前の白い初期フレームを見せないため、画面の準備が整うまで元のタブを保つ。
    const tab = await browser.tabs.create({ url, active: false, windowId });
    if (tab.id === undefined) throw new Error("作成したビューアータブのIDがありません");
    createdTabId = tab.id;
    settle();
    await ready;
    return await browser.tabs.update(createdTabId, { active: true });
  } finally {
    browser.runtime.onMessage.removeListener(handleMessage);
    browser.tabs.onRemoved.removeListener(handleRemoved);
  }
}
