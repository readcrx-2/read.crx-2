app.module "thread_search", [], (callback) ->
  class ThreadSearch
    constructor: (@query) ->
      return

    _parse = (x) ->
      return new Promise( (resolve, reject) ->
        scheme = app.URL.getScheme(x.url)
        app.BoardTitleSolver.ask("#{scheme}://#{x.server}/#{x.ita}/").then( (boardName) ->
          resolve(
            url: x.url
            created_at: new Date x.key * 1000
            title: app.util.decode_char_reference(x.subject)
            res_count: +x.resno
            board_url: "#{scheme}://#{x.server}/#{x.ita}/"
            board_title: boardName
          )
          return
        , ->
          reject()
          return
        )
      )

    read: ->
      return new Promise( (resolve, reject) =>
        request = new app.HTTP.Request("GET", "http://dig.2ch.net/?keywords=#{encodeURIComponent(@query)}&maxResult=500&json=1", {
          cache: false
        })
        request.send (response) ->
          if response.status is 200
            resolve(response.body)
          else
            reject(response.body)
          return
        return
      ).then( (responseText) ->
        return new Promise( (resolve, reject) ->
          try
            result = JSON.parse(responseText)
          catch
            reject(message: "通信エラー（JSONパースエラー）")
            return
          res = result.result
          Promise.all(res.map(_parse)).then( (r) ->
            resolve(r)
          )
          return
        )
      , ->
        reject(message: "通信エラー")
      )

  callback(ThreadSearch)
  return
