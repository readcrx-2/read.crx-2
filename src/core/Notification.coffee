export default class Notification
  constructor: (@title, @message, @url, @tag) ->
    @notify = new window.Notification(
      @title,
      {
        tag: @tag
        body: @message
        icon: "../img/read.crx_128x128.png"
      }
    )
    if @url isnt ""
      @notify.on("click", =>
        chrome.tabs.getCurrent( (tab) =>
          chrome.tabs.update(tab.id, highlighted: true)
          app.message.send("open", url: @url)
          @notify.close()
          return
        )
        return
      )
    return
