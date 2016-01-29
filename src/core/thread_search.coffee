app.module "thread_search", [], (callback) ->
  class ThreadSearch
    constructor: (@query) ->
      @offset = 0
      return

    read: ->
      $.ajax({
        url: "http://dig.2ch.net/?keywords=#{encodeURI(@query)}&maxResult=500"
        cache: false
        dataType: "text"
        timeout: 1000 * 30
      })
      .pipe(((responseText) => $.Deferred (d) =>
        # UA次第で別サイトのURLが返される場合が有るため対策
        responseText = responseText.replace(/http:\/\/bintan\.ula\.cc\/test\/read\.cgi\/([\w\.]+)\/(\w+)\/(\d+)\/\w*/g, "http://$1/test/read.cgi/$2/$3/")
        responseText = responseText.replace(/http:\/\/bintan\.ula\.cc\/test\/2chview\.php\/([\w\.]+)\/(\w+)\/\w*(?:\?guid=ON)?/g, "http://$1/$2/")

        reg = /<span id="title".*?><a href="(http:\/\/\w+\.\w+\.\w+\/test\/read\.cgi\/\w*\/\d+\/)\w*">(.+?) ? ?\((\d+)\)<\/a><\/span>(?:.|\n)*?<span class="itashibori"><a href="(http:\/\/\w+\.\w+\.\w+\/\w*\/)">(.+?)<\/a><\/span>(?:\n|.)*?<span class="time">(.+?)\(立\)<\/span>/g
        data = []
        while x = reg.exec(responseText)
          data.push
            url: x[1]
            created_at: x[6]
            title: x[2]
            res_count: +x[3]
            board_url: x[4]
            board_title: x[5]

        @offset += data.length
        d.resolve(data)
        return
      ), (=> $.Deferred (d) => d.reject(message: "通信エラー"); return))
      .promise()

  callback(ThreadSearch)
  return
