# 現在のタブが自分自身であるか確認する
isCurrentTab = ->
  return new Promise( (resolve, reject) ->
    id = chrome.runtime.id
    chrome.tabs.query(
      {active: true, lastFocusedWindow: true},
      ([tab]) ->
        if tab.url.startsWith("chrome-extension://#{id}")
          resolve(tab)
        else
          reject()
        return
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
          reject()
        else
          resolve(tabs[0])
        return
    )
  )

# アイコンクリック時の動作
chrome.browserAction.onClicked.addListener( ->
  # 現在のタブが自分自身なら何もしない
  try
    {windowId, id} = await isCurrentTab()
  catch
    try
      {windowId, id} = await searchRcrx()
    catch
      # 存在しなければタブを作成する
      chrome.tabs.create(url: "/view/index.html")
      return
  # 実行中のread.crxが存在すればそれを開く
  chrome.windows.update(windowId, {focused: true})
  chrome.tabs.update(id, {highlighted: true})
  return
)

# 終了通知の受信
chrome.runtime.onMessage.addListener( ({type}) ->
  return unless type is "exit_rcrx"
  # zombie.htmlが動いているかもしれないので10秒待機
  setTimeout( ->
    try
      await searchRcrx()
    catch
      # 実行していなければメモリ解放のためにリロード
      chrome.runtime.reload()
    return
  , 1000 * 10)
  return
)

# 対応URLのチェック
supportedURL = [
  /^https?:\/\/[\w\.]+\/test\/read\.cgi\/\w+\/\d+\/.*?/
  /^https?:\/\/\w+\.machi\.to\/bbs\/read\.cgi\/\w+\/\d+\/.*?/
  /^https?:\/\/jbbs\.(?:livedoor\.jp|shitaraba\.net)\/bbs\/read(?:_archive)?\.cgi\/\w+\/\d+\/\d+\/.*?/
  /^https?:\/\/jbbs\.(?:livedoor\.jp|shitaraba\.net)\/\w+\/\d+\/storage\/\d+\.html$/
  /^https?:\/\/[\w\.]+\/\w+\/(?:#.*)?/
  /^https?:\/\/jbbs\.(?:livedoor\.jp|shitaraba\.net)\/\w+\/\d+\/(?:#.*)?/
]

# コンテキストメニューの作成
chrome.contextMenus.create(
  id: "open_link_in_rcrx"
  title: "リンクをread.crx-2で開く"
  contexts: ["link"]
  documentUrlPatterns: [
    "http://*/*"
    "https://*/*"
    "file://*/*"
  ]
  targetUrlPatterns: [
    "*://*.2ch.net/*"
    "*://*.5ch.net/*"
    "*://*.2ch.sc/*"
    "*://*.open2ch.net/*"
    "*://*.bbspink.com/*"
    "*://jbbs.shitaraba.net/*"
    "*://jbbs.livedoor.jp/*"
    "*://*.machi.to/*"
  ]
)

# コンテキストメニューのクリック時の動作
chrome.contextMenus.onClicked.addListener( ({menuItemId, linkUrl: url}, tab) ->
  return unless menuItemId is "open_link_in_rcrx"

  # 対応URLであるか確認
  unless supportedURL.some((a) -> a.test(url))
    new Notification("未対応のURLです")
    return
  try
    {windowId, id} = await searchRcrx()
    # 実行中のread.crxが存在すればそれを開く
    chrome.windows.update(windowId, {focused: true})
    chrome.tabs.update(id, {highlighted: true})
    chrome.runtime.sendMessage(type: "open", query: url)
  catch
    # 存在しなければタブを作成する
    chrome.tabs.create(url: "/view/index.html?q=#{url}")
  return
)
