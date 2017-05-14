# 現在のタブが自分自身であるか確認する
isCurrentTab = ->
  return new Promise( (resolve, reject) ->
    id = chrome.runtime.id
    chrome.tabs.query(
      {active: true, lastFocusedWindow: true},
      (tabs) ->
        if tabs[0].url.startsWith("chrome-extension://#{id}")
          return resolve()
        else
          return reject()
    )
  )

# 実行中のread.crxを探す
searchRcrx = ->
  return new Promise( (resolve, reject) ->
    id = chrome.runtime.id
    chrome.tabs.query(
      {url: "chrome-extension://#{id}/*"},
      (tabs) ->
        if tabs.length is 0
          return reject()
        else
          return resolve(tabs[0])
    )
  )

# アイコンクリック時の動作
chrome.browserAction.onClicked.addListener( ->
  isCurrentTab()
    # 現在のタブが自分自身である場合は何もしない
    .catch( ->
      # 実行中のread.crxを探す
      searchRcrx()
        # 存在すればそれを開く
        .then( (tab) ->
          chrome.windows.update(tab.windowId, {focused: true})
          chrome.tabs.update(tab.id, {highlighted: true})
        )
        # 存在しなければタブを作成する
        .catch( ->
          chrome.tabs.create({url: "/view/index.html"})
        )
    )
)

# 対応URLのチェック
isSupportedURL = (url) ->
  if /^https?:\/\/[\w\.]+\/test\/read\.cgi\/\w+\/\d+\/.*?/.test(url)
    return true
  else if /^https?:\/\/\w+\.machi\.to\/bbs\/read\.cgi\/\w+\/\d+\/.*?/.test(url)
    return true
  else if /^https?:\/\/jbbs\.(?:livedoor\.jp|shitaraba\.net)\/bbs\/read(?:_archive)?\.cgi\/\w+\/\d+\/\d+\/.*?/.test(url)
    return true
  else if /^https?:\/\/jbbs\.(?:livedoor\.jp|shitaraba\.net)\/\w+\/\d+\/storage\/\d+\.html$/.test(url)
    return true
  else if /^https?:\/\/[\w\.]+\/\w+\/(?:#.*)?/.test(url)
    return true
  else if /^https?:\/\/jbbs\.(?:livedoor\.jp|shitaraba\.net)\/\w+\/\d+\/(?:#.*)?/.test(url)
    return true
  return false

# コンテキストメニューの作成
chrome.contextMenus.create({
  id: "open_link_in_rcrx",
  title: "リンクをread.crx-2で開く",
  contexts: ["link"],
  documentUrlPatterns: ["http://*/*", "https://*/*", "file://*/*"],
  targetUrlPatterns: [
    "*://*.2ch.net/*",
    "*://*.2ch.sc/*",
    "*://*.open2ch.net/*",
    "*://*.bbspink.com/*",
    "*://jbbs.shitaraba.net/*",
    "*://jbbs.livedoor.jp/*",
    "*://*.machi.to/*"
  ]
})

# コンテキストメニューのクリック時の動作
chrome.contextMenus.onClicked.addListener( (info, tab) ->
  return unless info.menuItemId is "open_link_in_rcrx"

  url = info.linkUrl
  # 対応URLであるか確認
  unless isSupportedURL(url)
    new Notification("未対応のURLです")
    return
  # 実行中のread.crxを探す
  searchRcrx()
    # 存在すればそれを開く
    .then( (tab) ->
      chrome.windows.update(tab.windowId, {focused: true})
      chrome.tabs.update(tab.id, {highlighted: true})
      chrome.runtime.sendMessage({type: "open", query: url})
      return
    )
    # 存在しなければタブを作成する
    .catch( ->
      chrome.tabs.create({url: "/view/index.html?q=#{url}"})
    )
  return
)
