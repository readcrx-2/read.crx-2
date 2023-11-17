const isTabReadcrx = (tab) => tab.url.startsWith(browser.runtime.getURL(""));

// 実行中のread.crxを探す
const searchRcrx = async function () {
  const tabs = await browser.tabs.query({
    url: browser.runtime.getURL("*"),
  });
  if (tabs.length === 0) {
    return null;
  }
  return tabs[0];
};

// アイコンクリック時の動作
const browserAction = "&[BROWSER]" === "chrome" ? browser.action : browser.browserAction;
browserAction.onClicked.addListener(async function (currentTab) {
  // 現在のタブが自分自身なら何もしない
  if (isTabReadcrx(currentTab)) {
    return;
  }

  const rcrx = await searchRcrx();
  if (rcrx != null) {
    // 実行中のread.crxが存在すればそれを開く
    browser.windows.update(rcrx.windowId, { focused: true });
    browser.tabs.update(rcrx.id, { active: true });
  } else {
    // 存在しなければタブを作成する
    browser.tabs.create({ url: "view/index.html" });
  }
});

browser.runtime.onMessage.addListener(async function ({ type }) {
  switch (type) {
    // zombieの起動がrcrx_exitに間に合わなかった場合のためにもう一度送る
    case "zombie_ping":
      browser.runtime.sendMessage({ type: "rcrx_exit" });
      break;
    case "zombie_done":
      var rcrx = await searchRcrx();
      if (rcrx != null) {
        return;
      }
      // 実行していなければメモリ解放のためにリロード
      browser.runtime.reload();
      break;
  }
});

// 対応URLのチェック
const supportedURL = new RegExp(`https?:\\/\\/(?:\
(?:[\\w\\.]+\\/test\\/read\\.cgi\\/\\w+\\/\\d+\\/.*?)|\
(?:(?:\\w+\\.)?machi\\.to\\/bbs\\/read\\.cgi\\/\\w+\\/\\d+\\/.*?)|\
(?:jbbs\\.(?:livedoor\\.jp|shitaraba\\.net)\\/bbs\\/read(?:_archive)?\\.cgi\\/\\w+\\/\\d+\\/\\d+\\/.*?)|\
(?:jbbs\\.(?:livedoor\\.jp|shitaraba\\.net)\\/\\w+\\/\\d+\\/storage\\/\\d+\\.html$)|\
(?:[\\w\\.]+\\/\\w+\\/(?:\\#.*)?)|\
(?:jbbs\\.(?:livedoor\\.jp|shitaraba\\.net)\\/\\w+\\/\\d+\\/(?:\\#.*)?)\
)`);

// コンテキストメニューの作成
browser.contextMenus.create({
  id: "open_link_in_rcrx",
  title: "リンクをread.crx-2で開く",
  contexts: ["link"],
  documentUrlPatterns: ["http://*/*", "https://*/*", "file://*/*"],
  targetUrlPatterns: [
    "*://*.2ch.net/*",
    "*://*.5ch.net/*",
    "*://*.2ch.sc/*",
    "*://*.open2ch.net/*",
    "*://*.bbspink.com/*",
    "*://jbbs.shitaraba.net/*",
    "*://jbbs.livedoor.jp/*",
    "*://*.machi.to/*",
  ],
});

// コンテキストメニューのクリック時の動作
browser.contextMenus.onClicked.addListener(async function (
  { menuItemId, linkUrl: url },
  tab
) {
  if (menuItemId !== "open_link_in_rcrx") {
    return;
  }

  // 対応URLであるか確認
  if (!supportedURL.test(url)) {
    new Notification("未対応のURLです");
    return;
  }

  const rcrx = await searchRcrx();
  if (rcrx != null) {
    // 実行中のread.crxが存在すればそれを開く
    browser.windows.update(rcrx.windowId, { focused: true });
    browser.tabs.update(rcrx.id, { active: true });
    browser.runtime.sendMessage({ type: "open", query: url });
  } else {
    // 存在しなければタブを作成する
    browser.tabs.create({ url: `view/index.html?q=${url}` });
  }
});
