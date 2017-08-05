class ThreadSearch
  constructor: (@query) ->
    return

  _parse = ({url, key, subject, resno, server, ita}) ->
    scheme = app.URL.getScheme(url)
    return app.BoardTitleSolver.ask("#{scheme}://#{server}/#{ita}/").then( (boardName) ->
      return {
        url
        created_at: new Date(key * 1000)
        title: app.util.decodeCharReference(subject)
        res_count: +resno
        board_url: "#{scheme}://#{server}/#{ita}/"
        board_title: boardName
      }
    )

  read: ->
    request = new app.HTTP.Request("GET", "http://dig.2ch.net/?keywords=#{encodeURIComponent(@query)}&maxResult=500&json=1",
      cache: false
    )
    return request.send().then( ({status, body}) ->
      return body if status is 200
      return Promise.reject(body)
    ).then( (responseText) ->
      try
        result = JSON.parse(responseText)
      catch
        return Promise.reject(message: "通信エラー（JSONパースエラー）")
      {result: res} = result
      return Promise.all(res.map(_parse))
    , ->
      return Promise.reject(message: "通信エラー")
    )

app.module("thread_search", [], (callback) ->
  callback(ThreadSearch)
  return
)
