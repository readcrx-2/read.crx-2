import {get as getBBSMenu} from "./BBSMenu.coffee"
import Board from "./Board.coffee"
import {Request} from "./HTTP.ts"
import {fix as fixUrl, setScheme, changeScheme, threadToBoard} from "./URL.ts"
import {levenshteinDistance} from "./Util.ts"

###*
@class Anchor
スレッドフロートBBSで用いられる「アンカー」形式の文字列を扱う。
###
export class Anchor
  @reg =
    ANCHOR: /(?:&gt;|＞){1,2}[\d\uff10-\uff19]+(?:[\-\u30fc][\d\uff10-\uff19]+)?(?:\s*[,、]\s*[\d\uff10-\uff19]+(?:[\-\u30fc][\d\uff10-\uff19]+)?)*/g
    _FW_NUMBER: /[\uff10-\uff19]/g

  @parseAnchor: (str) ->
    data =
      targetCount: 0
      segments: []

    str = app.replaceAll(str, "\u30fc", "-")
    str = str.replace(Anchor.reg._FW_NUMBER, ($0) ->
      return String.fromCharCode($0.charCodeAt(0) - 65248)
    )

    if not /^(?:&gt;|＞){0,2}([\d]+(?:-\d+)?(?:\s*[,、]\s*\d+(?:-\d+)?)*)$/.test(str)
      return data

    segReg = /(\d+)(?:-(\d+))?/g
    while segment = segReg.exec(str)
      # 桁数の大きすぎる値は無視
      continue if segment[1].length > 5 or segment[2]?.length > 5
      # 1以下の値は無視
      continue if +segment[1] < 1

      if segment[2]
        if +segment[1] <= +segment[2]
          segrangeStart = +segment[1]
          segrangeEnd = +segment[2]
        else
          segrangeStart = +segment[2]
          segrangeEnd = +segment[1]
      else
        segrangeStart = segrangeEnd = +segment[1]

      data.targetCount += segrangeEnd - segrangeStart + 1
      data.segments.push([segrangeStart, segrangeEnd])
    return data

boardUrlReg = /^https?:\/\/\w+\.5ch\.net\/(\w+)\/$/
#2chの鯖移転検出関数
#移転を検出した場合は移転先のURLをresolveに載せる
#検出出来なかった場合はrejectする
#htmlを渡す事で通信をスキップする事が出来る
export chServerMoveDetect = (oldBoardUrl, html) ->
  oldBoardUrl = changeScheme(oldBoardUrl, "http")
  unless typeof html is "string"
    #htmlが渡されなかった場合は通信する
    {status, body: html} = await (new Request("GET", oldBoardUrl,
      mimeType: "text/html; charset=Shift_JIS"
      cache: false
    )).send()
    unless status is 200
      throw new Error("サーバー移転判定のための通信に失敗しました")

  #htmlから移転を判定
  res = ///location\.href="(https?://(\w+\.)?5ch\.net/\w*/)"///.exec(html)
  if res
    if res[2]?
      newBoardUrlTmp = res[1]
    else
      {responseURL} = await (new Request("GET", res[1])).send()
      newBoardUrlTmp = responseURL
    newBoardUrlTmp = setScheme(newBoardUrlTmp, "http")
    if newBoardUrlTmp isnt oldBoardUrl
      newBoardUrl = newBoardUrlTmp

  #bbsmenuから検索
  unless newBoardUrl?
    newBoardUrl = await do ->
      {menu: data} = await getBBSMenu()
      unless data?
        throw new Error("BBSMenuの取得に失敗しました")
      match = oldBoardUrl.match(boardUrlReg)
      unless match.length > 0
        throw new Error("板のURL形式が不明です")
      for category in data
        for board in category.board
          m = board.url.match(boardUrlReg)
          if m?
            oldUrl = setScheme(match[0], "http")
            newUrl = setScheme(m[0], "http")
            if match[1] is m[1] and oldUrl isnt newUrl
              return oldUrl
      throw new Error("BBSMenuにその板のサーバー情報が存在しません")
      return

  #移転を検出した場合は移転検出メッセージを送出
  app.message.send("detected_ch_server_move",
    {before: oldBoardUrl, after: newBoardUrl})
  return newBoardUrl

#文字参照をデコード
$span = $__("span")
export decodeCharReference = (str) ->
  return str.replace(/\&(?:#(\d+)|#x([\dA-Fa-f]+)|([\da-zA-Z]+));/g, ($0, $1, $2, $3) ->
    #数値文字参照 - 10進数
    if $1?
      return String.fromCodePoint($1)
    #数値文字参照 - 16進数
    if $2?
      return String.fromCodePoint(parseInt($2, 16))
    #文字実体参照
    if $3?
      $span.innerHTML = $0
      return $span.textContent
    return $0
  )

#マウスクリックのイベントオブジェクトから、リンク先をどう開くべきかの情報を導く
openMap = new Map([
  #button(number), shift(bool), ctrl(bool)の文字列
  ["0falsefalse", { newTab: false, newWindow: false, background: false }]
  ["0truefalse",  { newTab: false, newWindow: true,  background: false }]
  ["0falsetrue",  { newTab: true,  newWindow: false, background: true  }]
  ["0truetrue",   { newTab: true,  newWindow: false, background: false }]
  ["1falsefalse", { newTab: true,  newWindow: false, background: true  }]
  ["1truefalse",  { newTab: true,  newWindow: false, background: false }]
  ["1falsetrue",  { newTab: true,  newWindow: false, background: true  }]
  ["1truetrue",   { newTab: true,  newWindow: false, background: false }]
])
export getHowToOpen = ({type, button, shiftKey, ctrlKey, metaKey}) ->
  ctrlKey or= metaKey
  def = {newTab: false, newWindow: false, background: false}
  if type is "mousedown"
    key = "" + button + shiftKey + ctrlKey
    return openMap.get(key) if openMap.has(key)
  return def

export searchNextThread = (threadUrl, threadTitle, resString) ->
  threadUrl = fixUrl(threadUrl)
  boardUrl = threadToBoard(threadUrl)
  threadTitle = normalize(threadTitle)

  {data: threads} = await Board.get(boardUrl)
  unless threads?
    throw new Error("板の取得に失敗しました")
  threads = threads.filter( ({url, resCount}) ->
    return (url isnt threadUrl and resCount < 1001)
  ).map( ({title, url}) ->
    score = levenshteinDistance(threadTitle, normalize(title), false)
    m = url.match(/(?:https:\/\/)?(?:\w+(\.[25]ch\.net\/.+)|(.+))$/)
    if resString.includes(m[1] ? m[2] ? url)
      score -= 5
    return {score, title, url}
  ).sort( (a, b) ->
    return a.score - b.score
  )
  return threads[0...5]

wideSlimNormalizeReg = ///[
  # 全角記号/英数(０-９,Ａ-Ｚ,ａ-ｚ,その他記号)
  \uff01-\uff5d #＼→\も含む
  # 半角カタカナ(ｦ-ｯ, ｱ-ﾝ, ｰ)
  \uff66-\uff9d #\uff70はｰ(半角カタカナ長音符)
]+///g
kataHiraReg = ///[
  \u30a1-\u30f3 #ァ-ン
]///g
# 検索用に全角/半角や大文字/小文字を揃える
export normalize = (str) ->
  str = str
    # 全角記号/英数を半角記号/英数に、半角カタカナを全角カタカナに変換
    .replace(
      wideSlimNormalizeReg
      (s) -> s.normalize("NFKC")
    )
    # カタカナをひらがなに変換
    .replace(
      kataHiraReg
      ($0) -> String.fromCharCode($0.charCodeAt(0) - 96)
    )
  # 全角スペース/半角スペースを削除
  str = app.replaceAll(
    app.replaceAll(str, "\u0020", "")
  , "\u3000", "")
  # 大文字を小文字に変換
  return str.toLowerCase()

# striptags
export stripTags = (str) ->
  return str.replace(/<[^>]+>/ig, "")

titleReg = / ?(?:\[(?:無断)?転載禁止\]|(?:\(c\)|©|�|&copy;|&#169;)(?:2ch\.net|@?bbspink\.com)) ?/g
# タイトルから無断転載禁止などを取り除く
export removeNeedlessFromTitle = (title) ->
  title2 = title.replace(titleReg,"")
  title = if title2 is "" then title else title2
  return app.replaceAll(
    app.replaceAll(title, "<mark>", "")
  , "</mark>", "")

export promiseWithState = (promise) ->
  state = "pending"
  promise.then( ->
    state = "resolved"
    return
  , ->
    state = "rejected"
    return
  )
  return {
    isResolved: ->
      return state is "resolved"
    isRejected: ->
      return state is "rejected"
    getState: ->
      return state
    promise
  }

export indexedDBRequestToPromise = (req) ->
  return new Promise( (resolve, reject) ->
    req.onsuccess = resolve
    req.onerror = reject
    return
  )

export stampToDate = (stamp) ->
  return new Date(stamp * 1000)

export stringToDate = (string) ->
  date = string.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\(.\))?\s?(\d{1,2}):(\d\d)(?::(\d\d)(?:\.\d+)?)?/)
  flg = false
  if date?
    flg = true if date[1]?
    flg = false unless date[2]? and 1 <= +date[2] <= 12
    flg = false unless date[3]? and 1 <= +date[3] <= 31
    flg = false unless date[4]? and 0 <= +date[4] <= 23
    flg = false unless date[5]? and 0 <= +date[5] <= 59
    date[6] = 0 unless date[6]? and 0 <= +date[6] <= 59
  if flg
    return new Date(date[1], date[2] - 1, date[3], date[4], date[5], date[6])
  return null
