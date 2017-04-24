app.module "thread_search", [], (callback) ->
  class ThreadSearch
    constructor: (@query) ->
      return

    _parse = (x) ->
      def = $.Deferred()
      scheme = app.url.getScheme(x.url)
      app.BoardTitleSolver.ask("#{scheme}://#{x.server}/#{x.ita}/").done((boardName) ->
        def.resolve(
          url: x.url
          created_at: new Date x.key * 1000
          title: x.subject
          res_count: +x.resno
          board_url: "#{scheme}://#{x.server}/#{x.ita}/"
          board_title: boardName
        )
        return
      ).fail(->
        def.reject()
      )
      return def.promise()

    read: ->
      $.Deferred (d) =>
        request = new app.HTTP.Request("GET", "http://dig.2ch.net/?keywords=#{encodeURI(@query)}&maxResult=500&json=1", {
          cache: false
        })
        request.send (response) ->
          if response.status is 200
            d.resolve(response.body)
          else
            d.reject(response.body)
          return
        return
      .then(((responseText) => $.Deferred (d) =>
        try
          result = JSON.parse(responseText)
        catch
          d.reject(message: "通信エラー（JSONパースエラー）")
          return

        app.util.concurrent(result.result, _parse).done( (res) ->
          d.resolve(res)
          return
        )
        return
      ), (=> $.Deferred (d) => d.reject(message: "通信エラー"); return))
      .promise()

  callback(ThreadSearch)
  return
