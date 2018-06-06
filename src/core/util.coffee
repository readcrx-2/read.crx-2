app.util = {}

###*
@namespace app.util
@class Anchor
スレッドフロートBBSで用いられる「アンカー」形式の文字列を扱う。
###
class app.util.Anchor
  @reg =
    ANCHOR: /(?:&gt;|＞){1,2}[\d\uff10-\uff19]+(?:[\-\u30fc][\d\uff10-\uff19]+)?(?:\s*,\s*[\d\uff10-\uff19]+(?:[\-\u30fc][\d\uff10-\uff19]+)?)*/g
    _FW_DASH: /\u30fc/g
    _FW_NUMBER: /[\uff10-\uff19]/g

  @parseAnchor: (str) ->
    data =
      targetCount: 0
      segments: []

    str = str.replace(Anchor.reg._FW_DASH, "-")
    str = str.replace(Anchor.reg._FW_NUMBER, ($0) ->
      return String.fromCharCode($0.charCodeAt(0) - 65248)
    )

    if not /^(?:&gt;|＞){0,2}([\d]+(?:-\d+)?(?:\s*,\s*\d+(?:-\d+)?)*)$/.test(str)
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

do ->
  boardUrlReg = /^https?:\/\/\w+\.5ch\.net\/(\w+)\/$/
  #2chの鯖移転検出関数
  #移転を検出した場合は移転先のURLをresolveに載せる
  #検出出来なかった場合はrejectする
  #htmlを渡す事で通信をスキップする事が出来る
  app.util.chServerMoveDetect = (oldBoardUrl, html) ->
    if app.URL.getScheme(oldBoardUrl) is "https"
      oldBoardUrl = app.URL.changeScheme(oldBoardUrl)
    unless typeof html is "string"
      #htmlが渡されなかった場合は通信する
      {status, body} = await new app.HTTP.Request("GET", oldBoardUrl,
        mimeType: "text/html; charset=Shift_JIS"
        cache: false
      )
      unless status is 200
        throw new Error("サーバー移転判定のための通信に失敗しました")

    #htmlから移転を判定
    res = ///location\.href="(https?://\w+\.5ch\.net/\w*/)"///.exec(html)
    if res
      newBoardUrlTmp = app.URL.setScheme(res[1], "http")
      if newBoardUrlTmp isnt oldBoardUrl
        newBoardUrl = newBoardUrlTmp

    #bbsmenuから検索
    unless newBoardUrl?
      newBoardUrl = do ->
        {data} = await app.BBSMenu.get()
        unless data?
          throw new Error("BBSMenuの取得に失敗しました")
        match = oldBoardUrl.match(boardUrlReg)
        unless match.length > 0
          throw new Error("板のURL形式が不明です")
        for category in data
          for board in category.board
            m = board.url.match(boardUrlReg)
            if m?
              oldUrl = app.URL.setScheme(match[0], "http")
              newUrl = app.URL.setScheme(m[0], "http")
              if match[1] is m[1] and oldUrl isnt newUrl
                return oldUrl
        throw new Error("BBSMenuにその板のサーバー情報が存在しません")
        return

    #移転を検出した場合は移転検出メッセージを送出
    app.message.send("detected_ch_server_move",
      {before: oldBoardUrl, after: newBoardUrl})
    return newBoardUrl

  #文字参照をデコード
  span = document.createElement("span")
  app.util.decodeCharReference = (str) ->
    return str.replace(/\&(?:#(\d+)|#x([\dA-Fa-f]+)|([\da-zA-Z]+));/g, ($0, $1, $2, $3) ->
      #数値文字参照 - 10進数
      if $1?
        return String.fromCodePoint($1)
      #数値文字参照 - 16進数
      if $2?
        return String.fromCodePoint(parseInt($2, 16))
      #文字実体参照
      if $3?
        span.innerHTML = $0
        return span.textContent
      return $0
    )

  #マウスクリックのイベントオブジェクトから、リンク先をどう開くべきかの情報を導く
  openMap = new Map([
    #which(number), shift(bool), ctrl(bool)の文字列
    ["1falsefalse", { newTab: false, newWindow: false, background: false }]
    ["1truefalse",  { newTab: false, newWindow: true,  background: false }]
    ["1falsetrue",  { newTab: true,  newWindow: false, background: true  }]
    ["1truetrue",   { newTab: true,  newWindow: false, background: false }]
    ["2falsefalse", { newTab: true,  newWindow: false, background: true  }]
    ["2truefalse",  { newTab: true,  newWindow: false, background: false }]
    ["2falsetrue",  { newTab: true,  newWindow: false, background: true  }]
    ["2truetrue",   { newTab: true,  newWindow: false, background: false }]
  ])
  app.util.getHowToOpen = ({type, which, shiftKey, ctrlKey, metaKey}) ->
    ctrlKey or= metaKey
    def = {newTab: false, newWindow: false, background: false}
    if type is "mousedown"
      key = "" + which + shiftKey + ctrlKey
      return openMap.get(key) if openMap.has(key)
    return def

  app.util.searchNextThread = (threadUrl, threadTitle) ->
    threadUrl = app.URL.fix(threadUrl)
    boardUrl = app.URL.threadToBoard(threadUrl)
    threadTitle = app.util.normalize(threadTitle)

    {threads} = await app.Board.get(boardUrl)
    unless threads?
      throw new Error("板の取得に失敗しました")
    threads = threads.filter( ({url, resCount}) ->
      return (url isnt threadUrl and resCount < 1001)
    ).map( ({title, url}) ->
      return {
        score: app.Util.levenshteinDistance(threadTitle, app.util.normalize(title), false)
        title
        url
      }
    ).sort( (a, b) ->
      return a.score - b.score
    )
    return threads[0...5]

  wideSlimReg = ///[
    \uff10-\uff19 #０-９
    \uff21-\uff3a #Ａ-Ｚ
    \uff41-\uff5a #ａ-ｚ
  ]///g
  kataHiraReg = ///[
    \u30a2-\u30f3 #ア-ン
  ]///g
  slimKataReg = ///[
    \uff66-\uff6f #ｦ-ｯ
    #\uff70は半カナではない
    \uff71-\uff9d #ｱ-ﾝ
  ]///g
  slimKataTable = new Map([
    [0xff66, 0x3092]
    [0xff67, 0x3041]
    [0xff68, 0x3043]
    [0xff69, 0x3045]
    [0xff6a, 0x3047]
    [0xff6b, 0x3049]
    [0xff6c, 0x3083]
    [0xff6d, 0x3085]
    [0xff6e, 0x3087]
    [0xff6f, 0x3063]
    [0xff71, 0x3042]
    [0xff72, 0x3044]
    [0xff73, 0x3046]
    [0xff74, 0x3048]
    [0xff75, 0x304a]
    [0xff76, 0x304b]
    [0xff77, 0x304d]
    [0xff78, 0x304f]
    [0xff79, 0x3051]
    [0xff7a, 0x3053]
    [0xff7b, 0x3055]
    [0xff7c, 0x3057]
    [0xff7d, 0x3059]
    [0xff7e, 0x305b]
    [0xff7f, 0x305d]
    [0xff80, 0x305f]
    [0xff81, 0x3061]
    [0xff82, 0x3064]
    [0xff83, 0x3066]
    [0xff84, 0x3068]
    [0xff85, 0x306a]
    [0xff86, 0x306b]
    [0xff87, 0x306c]
    [0xff88, 0x306d]
    [0xff89, 0x306e]
    [0xff8a, 0x306f]
    [0xff8b, 0x3072]
    [0xff8c, 0x3075]
    [0xff8d, 0x3078]
    [0xff8e, 0x307b]
    [0xff8f, 0x307e]
    [0xff90, 0x307f]
    [0xff91, 0x3080]
    [0xff92, 0x3081]
    [0xff93, 0x3082]
    [0xff94, 0x3084]
    [0xff95, 0x3086]
    [0xff96, 0x3088]
    [0xff97, 0x3089]
    [0xff98, 0x308a]
    [0xff99, 0x308b]
    [0xff9a, 0x308c]
    [0xff9b, 0x308d]
    [0xff9c, 0x308f]
    [0xff9d, 0x3093]
  ])

  spaceReg = /[\u0020\u3000]/g
  #検索用に全角/半角や大文字/小文字を揃える
  app.util.normalize = (str) ->
    return str
      #全角英数を半角英数に変換
      .replace(
        wideSlimReg
        ($0) -> String.fromCharCode($0.charCodeAt(0) - 65248)
      )
      #カタカナをひらがなに変換
      .replace(
        kataHiraReg
        ($0) -> String.fromCharCode($0.charCodeAt(0) - 96)
      )
      #半角カタカナを平仮名に変換
      .replace(
        slimKataReg
        ($0) ->
          String.fromCharCode(slimKataTable.get($0.charCodeAt(0)))
      )
      #全角スペース/半角スペースを削除
      .replace(spaceReg, "")
      #大文字を小文字に変換
      .toLowerCase()

  # striptags
  app.util.stripTags = (str) ->
    return str.replace(/(<([^>]+)>)/ig, "")

  titleReg = / ?(?:\[(?:無断)?転載禁止\]|(?:\(c\)|©|�|&copy;|&#169;)(?:2ch\.net|@?bbspink\.com)) ?/g
  markReg = /<\/?mark>/g
  # タイトルから無断転載禁止などを取り除く
  app.util.removeNeedlessFromTitle = (title) ->
    title2 = title.replace(titleReg,"")
    title = if title2 is "" then title else title2
    return title.replace(markReg, "")

  app.util.promiseWithState = (promise) ->
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

  app.util.indexedDBRequestToPromise = (req) ->
    return new Promise( (resolve, reject) ->
      req.onsuccess = resolve
      req.onerror = reject
      return
    )

  app.util.stampToDate = (stamp) ->
    return new Date(stamp * 1000)

  app.util.stringToDate = (string) ->
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
