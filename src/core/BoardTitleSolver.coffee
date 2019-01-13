import {get as getBBSMenu, target as BBSMenuTarget} from "./BBSMenu.coffee"
import {Request} from "./HTTP.ts"
import {URL} from "./URL.ts"

###*
@class BoardTitleSolver
@static
###

###*
@property _bbsmenu
@private
@type Map | null
###
_bbsmenu = null

###*
@property _bbsmenuPromise
@private
@type Promise | null
###
_bbsmenuPromise = null

###*
@method _generateBBSMenu
@return {Promise}
@private
###
_generateBBSMenu = ({status, menu, message}) ->
  if status is "error"
    do ->
      await app.defer()
      app.message.send("notify",
        message: message
        background_color: "red"
      )
      return
  unless menu?
    throw new Error("板一覧が取得できませんでした")

  bbsmenu = new Map()
  for {board} in menu
    for {url, title} in board
      bbsmenu.set(url, title)
  _bbsmenu = bbsmenu
  return

###*
@method _setBBSMenu
@return {Promise}
@private
###
_setBBSMenu = ->
  obj = await getBBSMenu()
  _generateBBSMenu(obj)
  BBSMenuTarget.on("change", ({detail: obj}) =>
    _generateBBSMenu(obj)
    return
  )
  return

###*
@method _getBBSMenu
@return {Promise}
@private
###
_getBBSMenu = ->
  return _bbsmenu if _bbsmenu?
  if _bbsmenuPromise?
    await _bbsmenuPromise
  else
    _bbsmenuPromise = _setBBSMenu()
    await _bbsmenuPromise
    _bbsmenuPromise = null
  return _bbsmenu

###*
@method searchFromBBSMenu
@param {app.URL.URL} url
@return {Promise}
###
searchFromBBSMenu = (url) ->
  bbsmenu = await _getBBSMenu()
  # スキーム違いについても確認をする
  url2 = url.createProtocolToggled()
  boardName = bbsmenu.get(url.href) ? bbsmenu.get(url2.href) ? null
  return boardName

###*
@method _formatBoardTitle
@param {String} title
@param {app.URL.URL} url
@private
@return {String}
###
_formatBoardTitle = (title, url) ->
  switch url.getTsld()
    when "5ch.net" then title = title.replace("＠2ch掲示板", "")
    when "2ch.sc" then title += "_sc"
    when "open2ch.net" then title += "_op"
  return title

###*
@method searchFromBookmark
@param {app.URL.URL} url
@return {Promise}
###
searchFromBookmark = (url) ->
  # スキーム違いについても確認をする
  url2 = url.createProtocolToggled()
  bookmark = app.bookmark.get(url.href) ? app.bookmark.get(url2.href)
  if bookmark
    return _formatBoardTitle(bookmark.title, new URL(bookmark.url))
  return null

###*
@method searchFromSettingTXT
@param {app.URL.URL} url
@return {Promise}
###
searchFromSettingTXT = (url) ->
  {status, body} = await new Request("GET", "#{url.href}SETTING.TXT",
    mimeType: "text/plain; charset=Shift_JIS"
    timeout: 1000 * 10
  ).send()
  if status isnt 200
    throw new Error("SETTING.TXTを取得する通信に失敗しました")
  if res = /^BBS_TITLE_ORIG=(.+)$/m.exec(body)
    return _formatBoardTitle(res[1], url)
  if res = /^BBS_TITLE=(.+)$/m.exec(body)
    return _formatBoardTitle(res[1], url)
  throw new Error("SETTING.TXTに名前の情報がありません")
  return

###*
@method searchFromJbbsAPI
@param {String} url
@return {Promise}
###
searchFromJbbsAPI = (url) ->
  tmp = url.pathname.split("/")
  ajaxPath = "#{url.protocol}//jbbs.shitaraba.net/bbs/api/setting.cgi/#{tmp[1]}/#{tmp[2]}/"

  {status, body} = await new Request("GET", ajaxPath,
    mimeType: "text/plain; charset=EUC-JP"
    timeout: 1000 * 10
  ).send()
  if status isnt 200
    throw new Error("したらばの板のAPIの通信に失敗しました")
  if res = /^BBS_TITLE=(.+)$/m.exec(body)
    return res[1]
  throw new Error("したらばの板のAPIに名前の情報がありません")
  return

###*
@method ask
@param {String} urlStr
@return Promise
###
export ask = (urlStr) ->
  url = new URL(urlStr)

  # bbsmenu内を検索
  name = await searchFromBBSMenu(url)
  return name if name?

  # ブックマーク内を検索
  name = await searchFromBookmark(url)
  return name if name?

  try
    # SETTING.TXTからの取得を試みる
    if url.guessType().bbsType is "2ch"
      return await searchFromSettingTXT(url)
    # したらばのAPIから取得を試みる
    if url.guessType().bbsType is "jbbs"
      return await searchFromJbbsAPI(url)
  catch e
    throw new Error("板名の取得に失敗しました: #{e}")
  return
