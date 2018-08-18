import {ask as askBoardTitleSolver} from "./BoardTitleSolver.coffee"
import {Request} from "./HTTP.ts"
import {stampToDate, decodeCharReference} from "./util.coffee"
import {getScheme, setScheme} from "./URL.ts"

export default class
  loaded: "None"
  loaded20: null

  constructor: (@query, @scheme) ->
    return

  _parse = (scheme) ->
    return ({url, key, subject, resno, server, ita}) ->
      urlScheme = getScheme(url)
      boardUrl = "#{urlScheme}://#{server}/#{ita}/"
      try
        boardTitle = await askBoardTitleSolver(boardUrl)
      catch
        boardTitle = ""
      return {
        url: setScheme(url, scheme)
        createdAt: stampToDate(key)
        title: decodeCharReference(subject)
        resCount: +resno
        boardUrl
        boardTitle
        isHttps: (scheme is "https")
      }

  _read: (count) ->
    {status, body} = await new Request("GET", "https://dig.5ch.net/?keywords=#{encodeURIComponent(@query)}&maxResult=#{count}&json=1",
      cache: false
    ).send()
    unless status is 200
      throw new Error("検索の通信に失敗しました")
    try
      {result} = JSON.parse(body)
    catch
      throw new Error("検索のJSONのパースに失敗しました")
    return Promise.all(result.map(_parse(@scheme)))

  _getDiff = (a, b) ->
    diffed = []
    aUrls = []
    for aVal in a
      aUrls.push(aVal.url)
    for bVal in b when !aUrls.includes(bVal.url)
      diffed.push(bVal)
    return diffed

  read: ->
    if @loaded is "None"
      @loaded = "Small"
      @loaded20 = @_read(20)
      return @loaded20
    if @loaded is "Small"
      @loaded = "Big"
      return _getDiff(await @loaded20, await @_read(500))
    return []
