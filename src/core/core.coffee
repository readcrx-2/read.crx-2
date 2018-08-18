import * as BBSMenu from "./BBSMenu.coffee"
import Board from "./Board.coffee"
import * as BoardTitleSolver from "./BoardTitleSolver.coffee"
import BookmarkCompatibilityLayer from "./BookmarkCompatibilityLayer.ts"
import ChromeBookmarkEntryList from "./ChromeBookmarkEntryList.ts"
import * as Bookmark from "./Bookmark.ts"
import Cache from "./Cache.coffee"
import * as contextMenus from "./ContextMenus.coffee"
import * as DOMData from "./DOMData.coffee"
import * as History from "./History.coffee"
import * as HTTP from "./HTTP.ts"
import * as ImageReplaceDat from "./ImageReplaceDat.coffee"
import * as NG from "./NG.coffee"
import Notification from "./Notification.coffee"
import * as ReadState from "./ReadState.coffee"
import * as ReplaceStrTxt from "./ReplaceStrTxt.coffee"
import Thread from "./Thread.coffee"
import ThreadSearch from "./ThreadSearch.coffee"
import * as URL from "./URL.ts"
import * as util from "./util.coffee"
import * as Util from "./Util.ts"
import * as WriteHistory from "./WriteHistory.coffee"

do ->
  app.module("bbsmenu", [], (callback) ->
    callback(BBSMenu)
    return
  )
  app.module("board", [], (callback) ->
    callback(Board)
    return
  )
  app.module("board_title_solver", [], (callback) ->
    callback(BoardTitleSolver)
    return
  )
  app.module("cache", [], (callback) ->
    callback(Cache)
    return
  )
  app.module("thread_search", [], (callback) ->
    callback(ThreadSearch)
    return
  )
  return

export {
  BBSMenu
  Board
  BoardTitleSolver
  Bookmark
  BookmarkCompatibilityLayer
  ChromeBookmarkEntryList
  Cache
  contextMenus
  DOMData
  History
  HTTP
  ImageReplaceDat
  NG
  Notification
  ReadState
  ReplaceStrTxt
  Thread
  ThreadSearch
  URL
  util
  Util
  WriteHistory
}
