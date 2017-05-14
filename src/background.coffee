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
