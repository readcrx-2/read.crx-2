class ThreadSearch
  loaded: "None"
  loaded20: null

  constructor: (@query, @scheme) ->
    return

  _parse = (scheme) ->
    return ({url, key, subject, resno, server, ita}) ->
      urlScheme = app.URL.getScheme(url)
      boardUrl = "#{urlScheme}://#{server}/#{ita}/"
      try
        boardTitle = await app.BoardTitleSolver.ask(boardUrl)
      catch
        boardTitle = ""
      return {
        url: app.URL.setScheme(url, scheme)
        createdAt: app.util.stampToDate(key)
        title: app.util.decodeCharReference(subject)
        resCount: +resno
        boardUrl
        boardTitle
        isHttps: (scheme is "https")
      }

  _read: (count) ->
    {status, body} = await new app.HTTP.Request("GET", "https://dig.5ch.net/?keywords=#{encodeURIComponent(@query)}&maxResult=#{count}&json=1",
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

app.module("thread_search", [], (callback) ->
  callback(ThreadSearch)
  return
)
