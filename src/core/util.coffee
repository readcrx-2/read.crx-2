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
    str = str.replace Anchor.reg._FW_NUMBER, ($0) ->
      String.fromCharCode($0.charCodeAt(0) - 65248)

    if not /^(?:&gt;|＞){0,2}([\d]+(?:-\d+)?(?:\s*,\s*\d+(?:-\d+)?)*)$/.test(str)
      return data

    segReg = /(\d+)(?:-(\d+))?/g
    while segment = segReg.exec(str)
      # 桁数の大きすぎる値は無視
      continue if segment[1].length > 5 or segment[2]?.length > 5
      # 1以下の値は無視
      continue if +segment[1] < 1

      if segment[2]
        continue if +segment[2] < +segment[1]
        segrangeStart = +segment[1]
        segrangeEnd = +segment[2]
      else
        segrangeStart = segrangeEnd = +segment[1]

      data.targetCount += segrangeEnd - segrangeStart + 1
      data.segments.push([segrangeStart, segrangeEnd])
    data

do ->
  boardUrlReg = /^https?:\/\/\w+\.2ch\.net\/(\w+)\/$/
  #2chの鯖移転検出関数
  #移転を検出した場合は移転先のURLをresolveに載せる
  #検出出来なかった場合はrejectする
  #htmlを渡す事で通信をスキップする事が出来る
  app.util.ch_server_move_detect = (old_board_url, html) ->
    return new Promise( (resolve, reject) ->
      if typeof html is "string"
        resolve(html)
      else
        reject()
    )
    #htmlが渡されなかった場合は通信する
    .catch ->
      return new Promise( (resolve, reject) ->
        request = new app.HTTP.Request("GET", old_board_url, {
          mimeType: "text/html; charset=Shift_JIS"
          cache: false
        })
        request.send (response) ->
          if response.status is 200
            resolve(response.body)
          else
            reject()
          return
        return
      )
    #htmlから移転を判定
    .then (html) ->
      return new Promise( (resolve, reject) ->
        res = ///location\.href="(https?://\w+\.2ch\.net/\w*/)"///.exec(html)

        if res and res[1] isnt old_board_url
          resolve(res[1])
        else
          reject()
      )
    #bbsmenuから検索
    .catch ->
      return new Promise( (resolve, reject) ->
        app.BBSMenu.get (result) ->
          if result.data?
            match = old_board_url.match(boardUrlReg)
            reject() unless match.length > 0
            for category in result.data
              for board in category.board
                m = board.url.match(boardUrlReg)
                if m? and match[1] is m[1] and match[0] isnt m[0]
                  resolve(m[0])
                  break
            reject()
          else
            reject()
          return
        return
      )
    #移転を検出した場合は移転検出メッセージを送出
    .then (new_board_url) ->
      app.message.send("detected_ch_server_move",
        {before: old_board_url, after: new_board_url})

  #文字参照をデコード
  span = document.createElement("span")
  app.util.decode_char_reference = (str) ->
    str.replace /\&(?:#(\d+)|#x([\dA-Fa-f]+)|([\da-zA-Z]+));/g, ($0, $1, $2, $3) ->
      #数値文字参照 - 10進数
      if $1?
        String.fromCodePoint($1)
      #数値文字参照 - 16進数
      else if $2?
        String.fromCodePoint(parseInt($2, 16))
      #文字実体参照
      else if $3?
        span.innerHTML = $0
        span.textContent
      else
        $0

  #マウスクリックのイベントオブジェクトから、リンク先をどう開くべきかの情報を導く
  openMap = new Map([
    #which(number), shift(bool), ctrl(bool)の文字列
    ["1falsefalse", { new_tab: false, new_window: false, background: false }]
    ["1truefalse",  { new_tab: false, new_window: true,  background: false }]
    ["1falsetrue",  { new_tab: true,  new_window: false, background: true  }]
    ["1truetrue",   { new_tab: true,  new_window: false, background: false }]
    ["2falsefalse", { new_tab: true,  new_window: false, background: true  }]
    ["2truefalse",  { new_tab: true,  new_window: false, background: false }]
    ["2falsetrue",  { new_tab: true,  new_window: false, background: true  }]
    ["2truetrue",   { new_tab: true,  new_window: false, background: false }]
  ])
  app.util.get_how_to_open = (original_e) ->
    e = {which, shiftKey, ctrlKey} = original_e
    e.ctrlKey or= original_e.metaKey
    def = {new_tab: false, new_window: false, background: false}
    if e.type is "mousedown"
      key = "" + e.which + e.shiftKey + e.ctrlKey
      if openMap.has(key)
        return openMap.get(key)
      else
        return def
    else
      return def

  app.util.search_next_thread = (thread_url, thread_title) ->
    return new Promise( (resolve, reject) ->
      thread_url = app.url.fix(thread_url)
      board_url = app.url.threadToBoard(thread_url)
      thread_title = app.util.normalize(thread_title)

      app.board.get board_url, (res) ->
        if res.data?
          tmp = res.data
          tmp = tmp.filter (thread) ->
            thread.url isnt thread_url and thread.res_count < 1001
          tmp = tmp.map (thread) ->
            {
              score: app.Util.levenshteinDistance(thread_title, app.util.normalize(thread.title), false)
              title: thread.title
              url: thread.url
            }
          tmp.sort (a, b) ->
            a.score - b.score
          resolve(tmp[0...5])
        else
          reject()
        return
      return
    )

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
    str
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
      promise: promise
    }
