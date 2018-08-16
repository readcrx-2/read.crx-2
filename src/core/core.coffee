import BBSMenu from "./BBSMenu.coffee"
import Board from "./Board.coffee"
import BoardTitleSolver from "./BoardTitleSolver.coffee"
import BookmarkCompatibilityLayer from "./BookmarkCompatibilityLayer.ts"
import ChromeBookmarkEntryList from "./ChromeBookmarkEntryList.ts"
import * as Bookmark from "./Bookmark.ts"
import Cache from "./Cache.coffee"
import contextMenus from "./ContextMenus.coffee"
import DOMData from "./DOMData.coffee"
import History from "./History.coffee"
import * as HTTP from "./HTTP.ts"
import ImageReplaceDat from "./ImageReplaceDat.coffee"
import NG from "./NG.coffee"
import Notification from "./Notification.coffee"
import ReadState from "./ReadState.coffee"
import ReplaceStrTxt from "./ReplaceStrTxt.coffee"
import Thread from "./Thread.coffee"
import ThreadSearch from "./ThreadSearch.coffee"
import * as URL from "./URL.ts"
import * as util from "./util.coffee"
import * as Util from "./Util.ts"
import WriteHistory from "./WriteHistory.coffee"

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

  core = {
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
  for key, val of core
    app[key] = val
  return
