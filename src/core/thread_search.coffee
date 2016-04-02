app.module "thread_search", [], (callback) ->
  class ThreadSearch
    constructor: (@query) ->
      return

    read: ->
      $.ajax({
        url: "http://dig.2ch.net/?keywords=#{encodeURI(@query)}&maxResult=500&json=1"
        cache: false
        dataType: "text"
        timeout: 1000 * 30
      })
      .pipe(((responseText) => $.Deferred (d) =>
        try
          result = JSON.parse(responseText)
        catch
          d.reject(message: "通信エラー（JSONパースエラー）")
          return

        data = []
        for x in result.result
          data.push
            url: x.url
            created_at: new Date x.key * 1000
            title: x.subject
            res_count: +x.resno
            board_url: x.url
            board_title: x.ita

        d.resolve(data)
        return
      ), (=> $.Deferred (d) => d.reject(message: "通信エラー"); return))
      .promise()

  callback(ThreadSearch)
  return
