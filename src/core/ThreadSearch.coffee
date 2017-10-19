class ThreadSearch
  constructor: (@query) ->
    return

  _parse = ({url, key, subject, resno, server, ita}) ->
    scheme = app.URL.getScheme(url)
    try
      boardTitle = await app.BoardTitleSolver.ask("#{scheme}://#{server}/#{ita}/")
    catch
      boardTitle = ""
    return {
      url
      createdAt: app.util.stampToDate(key)
      title: app.util.decodeCharReference(subject)
      resCount: +resno
      boardUrl: "#{scheme}://#{server}/#{ita}/"
      boardTitle
    }

  read: ->
    {status, body} = await new app.HTTP.Request("GET", "https://dig.5ch.net/?keywords=#{encodeURIComponent(@query)}&maxResult=500&json=1",
      cache: false
    ).send()
    unless status is 200
      throw new Error("検索の通信に失敗しました")
    try
      {result} = JSON.parse(body)
    catch
      throw new Error("検索のJSONのパースに失敗しました")
    return Promise.all(result.map(_parse))

app.module("thread_search", [], (callback) ->
  callback(ThreadSearch)
  return
)
