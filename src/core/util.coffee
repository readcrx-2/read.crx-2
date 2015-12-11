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

#2chの鯖移転検出関数
#移転を検出した場合は移転先のURLをresolveに載せる
#検出出来なかった場合はrejectする
#htmlを渡す事で通信をスキップする事が出来る
app.util.ch_server_move_detect = (old_board_url, html) ->
  $.Deferred (deferred) ->
    if typeof html is "string"
      deferred.resolve(html)
    else
      deferred.reject()

  #htmlが渡されなかった場合は通信する
  .pipe null, ->
    $.Deferred (deferred) ->
      $.ajax
        url: old_board_url
        cache: false
        dataType: "text"
        timeout: 1000 * 30
        mimeType: "text/html; charset=Shift_JIS"
        complete: ($xhr) ->
          if $xhr.status is 200
            deferred.resolve($xhr.responseText)
          else
            deferred.reject()

  #htmlから移転を判定
  .pipe (html) ->
    $.Deferred (deferred) ->
      res = ///location\.href="(http://\w+\.2ch\.net/\w*/)"///.exec(html)

      if res and res[1] isnt old_board_url
        deferred.resolve(res[1])
      else
        deferred.reject()

  #移転を検出した場合は移転検出メッセージを送出
  .done (new_board_url) ->
    app.message.send("detected_ch_server_move",
      {before: old_board_url, after: new_board_url})

  .promise()

#文字参照をデコード
do ->
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
app.util.get_how_to_open = (original_e) ->
  e = {which, shiftKey, ctrlKey} = original_e
  e.ctrlKey or= original_e.metaKey
  def = {new_tab: false, new_window: false, background: false}
  if e.type is "click"
    if e.which is 1 and not e.shiftKey and not e.ctrlKey
      {new_tab: false, new_window: false, background: false}
    else if e.which is 1 and e.shiftKey and not e.ctrlKey
      {new_tab: false, new_window: true, background: false}
    else if e.which is 1 and not e.shiftKey and e.ctrlKey
      {new_tab: true, new_window: false, background: true}
    else if e.which is 1 and e.shiftKey and e.ctrlKey
      {new_tab: true, new_window: false, background: false}
    else if e.which is 2 and not e.shiftKey and not e.ctrlKey
      {new_tab: true, new_window: false, background: true}
    else if e.which is 2 and e.shiftKey and not e.ctrlKey
      {new_tab: true, new_window: false, background: false}
    else if e.which is 2 and not e.shiftKey and e.ctrlKey
      {new_tab: true, new_window: false, background: true}
    else if e.which is 2 and e.shiftKey and e.ctrlKey
      {new_tab: true, new_window: false, background: false}
    else
      def
  else
    def

app.util.search_next_thread = (thread_url, thread_title) ->
  $.Deferred (d) ->
    thread_url = app.url.fix(thread_url)
    board_url = app.url.thread_to_board(thread_url)
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
        d.resolve(tmp[0...5])
      else
        d.reject()
      return
    return
  .promise()

#検索用に全角/半角や大文字/小文字を揃える
app.util.normalize = (str) ->
  str
    #全角英数を半角英数に変換
    .replace(
      ///[
        \uff10-\uff19 #０-９
        \uff21-\uff3a #Ａ-Ｚ
        \uff41-\uff5a #ａ-ｚ
      ]///g
      ($0) -> String.fromCharCode($0.charCodeAt(0) - 65248)
    )
    #カタカナをひらがなに変換
    .replace(
      ///[
        \u30a2-\u30f3 #ア-ン
      ]///g
      ($0) -> String.fromCharCode($0.charCodeAt(0) - 96)
    )
    #半角カタカナを平仮名に変換
    .replace(
      ///[
        \uff66-\uff6f #ｦ-ｯ
        #\uff70は半カナではない
        \uff71-\uff9d #ｱ-ﾝ
      ]///g
      ($0) ->
        String.fromCharCode({
          0xff66: 0x3092
          0xff67: 0x3041
          0xff68: 0x3043
          0xff69: 0x3045
          0xff6a: 0x3047
          0xff6b: 0x3049
          0xff6c: 0x3083
          0xff6d: 0x3085
          0xff6e: 0x3087
          0xff6f: 0x3063
          0xff71: 0x3042
          0xff72: 0x3044
          0xff73: 0x3046
          0xff74: 0x3048
          0xff75: 0x304a
          0xff76: 0x304b
          0xff77: 0x304d
          0xff78: 0x304f
          0xff79: 0x3051
          0xff7a: 0x3053
          0xff7b: 0x3055
          0xff7c: 0x3057
          0xff7d: 0x3059
          0xff7e: 0x305b
          0xff7f: 0x305d
          0xff80: 0x305f
          0xff81: 0x3061
          0xff82: 0x3064
          0xff83: 0x3066
          0xff84: 0x3068
          0xff85: 0x306a
          0xff86: 0x306b
          0xff87: 0x306c
          0xff88: 0x306d
          0xff89: 0x306e
          0xff8a: 0x306f
          0xff8b: 0x3072
          0xff8c: 0x3075
          0xff8d: 0x3078
          0xff8e: 0x307b
          0xff8f: 0x307e
          0xff90: 0x307f
          0xff91: 0x3080
          0xff92: 0x3081
          0xff93: 0x3082
          0xff94: 0x3084
          0xff95: 0x3086
          0xff96: 0x3088
          0xff97: 0x3089
          0xff98: 0x308a
          0xff99: 0x308b
          0xff9a: 0x308c
          0xff9b: 0x308d
          0xff9c: 0x308f
          0xff9d: 0x3093
        }[$0.charCodeAt(0)])
    )
    #全角スペース/半角スペースを削除
    .replace(/[\u0020\u3000]/g, "")
    #大文字を小文字に変換
    .toLowerCase()

app.util.os_detect = ->
  ua = navigator.userAgent
  switch true
    when /Win(dows )?NT 10\.0/.test(ua) then os = "Windows 10"
    when /Win(dows )?NT 6\.3/.test(ua) then os = "Windows 8.1"
    when /Win(dows )?NT 6\.2/.test(ua) then os = "Windows 8"
    when /Win(dows )?NT 6\.1/.test(ua) then os = "Windows 7"
    when /Win(dows )?NT (?:5\.2|6\.0)/.test(ua) then os = "Windows Vista"
    when /Win(dows )?(NT 5\.1|XP)/.test(ua) then os = "Windows XP"
    when /Win(dows)? (9x 4\.90|ME)/.test(ua) then os = "Windows ME"
    when /Win(dows )?(NT 5\.0|2000)/.test(ua) then os = "Windows 2000"
    when /Win(dows )?98/.test(ua) then os = "Windows 98"
    when /Win(dows )?NT( 4\.0)?/.test(ua) then os = "Windows NT"
    when /Win(dows )?95/.test(ua) then os = "Windows 95"
    when /Mac OS X 10[_|\.]10[\d_\.]*/.test(ua) then os = "Mac OS X Yosemite"
    when /Mac OS X 10[_|\.]9[\d_\.]*/.test(ua) then os = "Mac OS X Mavericks"
    when /Mac OS X 10[_|\.]8[\d_\.]*/.test(ua) then os = "Mac OS X Mountain Lion"
    when /Mac OS X 10[_|\.]7[\d_\.]*/.test(ua) then os = "Mac OS X Lion"
    when /Mac OS X 10[_|\.]6[\d_\.]*/.test(ua) then os = "Mac OS X Snow Leopard"
    when /Mac OS X 10[_|\.]5[\d_\.]*/.test(ua) then os = "Mac OS X Leopard"
    when /Mac OS X 10[_|\.]4[\d_\.]*/.test(ua) then os = "Mac OS X Tiger"
    when /Mac OS X 10[_|\.]3[\d_\.]*/.test(ua) then os = "Mac OS X Panther"
    when /Mac OS X 10[_|\.]2[\d_\.]*/.test(ua) then os = "Mac OS X Jaguar"
    when /Mac OS X 10[_|\.]1[\d_\.]*/.test(ua) then os = "Mac OS X Puma"
    when /Mac OS X 10[_|\.]0[\d_\.]*/.test(ua) then os = "Mac OS X Cheetah"
    when /CrOS/.test(ua) then os = "Chrome OS"
    when /Ubuntu/.test(ua) then os = "Ubuntu"
    when /Debian/.test(ua) then os = "Debian"
    when /Gentoo/.test(ua) then os = "Gentoo"
    when /^.*\s([A-Za-z]+BSD)/.test(ua) then os = RegExp.$1 # BSD 系
    when /SunOS/.test(ua) then os = "Solaris"
    when /Win(dows)/.test(ua) then os="Windows" # その他 Windows
    when /Mac|PPC/.test(ua) then os = "Mac OS" #その他 Mac
    when /Linux/.test(ua) then os = "Linux" #その他 Linux
    else os = "N/A" # その他
  return os

# urlからタイトルを取得する
app.util.url_to_title = (url) ->
  d = new $.Deferred
  app.History.get_title(url)
    .done((got_title) ->
      history_title = got_title
      d.resolve(history_title)
      return
    )
    .fail((error) ->
      $.ajax(url)
        .done((res, status, xhr) ->
          parser = new DOMParser()
          dom = parser.parseFromString(res,"text/html")
          title = dom.getElementsByTagName("title")[0].text
          title = title.replace(/ ?(?:\[転載禁止\]|(?:\(c\)|©|�|&copy;)2ch\.net) ?/g,"")
          d.resolve(title)
          return
        )
        .fail((res, status, xhr)->
          d.reject()
          return
        )
      return
    )
  return d.promise()

# 配列を重複しないよう結合して、重複していたものの(元の配列の)要素番号とともに返す
# ※array1、array2内のみだけで重複している場合は想定していません
# duplicate[重複した値, array1内の値, array2内の値]
app.util.concat_without_duplicates = (array1, array2) ->
  result = []
  arrayRes = array1.concat(array2)
  duplicates = []
  arrayRes = arrayRes.filter( (x, i, self) ->
    if self.indexOf(x) is i
      return true
    else
      duplicate = [x, self.indexOf(x), i - array1.length]
      duplicates.push(duplicate)
      return false
  )
  result.push(arrayRes, duplicates)
  return result

# コンソール出力用書き換え
old_log = console.log.bind(console)
console.log = (a) ->
  old_log(a)
  chrome.runtime.sendMessage({type: "console", level: "log", data: a})
  return
old_debug = console.debug.bind(console)
console.debug = (a) ->
  old_debug(a)
  chrome.runtime.sendMessage({type: "console", level: "debug", data: a})
  return
old_info = console.info.bind(console)
console.info = (a) ->
  old_info(a)
  chrome.runtime.sendMessage({type: "console", level: "infog", data: a})
  return
old_warn = console.warn.bind(console)
console.warn = (a) ->
  old_warn(a)
  chrome.runtime.sendMessage({type: "console", level: "warn", data: a})
  return
old_error = console.error.bind(console)
console.error = (a) ->
  old_error(a)
  chrome.runtime.sendMessage({type: "console", level: "error", data: a})
  return
