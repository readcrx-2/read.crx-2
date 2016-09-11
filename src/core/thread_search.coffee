app.module "thread_search", [], (callback) ->
  class ThreadSearch
    constructor: (@query) ->
      return

    _parse = (x) ->
      def = $.Deferred()
      app.BoardTitleSolver.ask("http://#{x.server}/#{x.ita}/").done((boardName) ->
        def.resolve(
          url: x.url
          created_at: new Date x.key * 1000
          title: x.subject
          res_count: +x.resno
          board_url: "http://#{x.server}/#{x.ita}/"
          board_title: boardName
        )
        return
      ).fail(->
        def.reject()
      )
      return def.promise()

    read: ->
      $.ajax({
        url: "http://dig.2ch.net/?keywords=#{encodeURI(@query)}&maxResult=500&json=1"
        cache: false
        dataType: "text"
        timeout: 1000 * 30
      })
      .then(((responseText) => $.Deferred (d) =>
        try
          result = JSON.parse(responseText)
        catch
          d.reject(message: "通信エラー（JSONパースエラー）")
          return

        deferArray = []
        for x in result.result
          deferArray.push(_parse(x))
        $.when.apply(null, deferArray).always(->
          d.resolve(Array.from(arguments))
          return
        )
        return
      ), (=> $.Deferred (d) => d.reject(message: "通信エラー"); return))
      .promise()

  callback(ThreadSearch)
  return
