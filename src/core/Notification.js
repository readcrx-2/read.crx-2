export default class Notification
  constructor: (@title, @message, @url, @tag) ->
    @notify = null
    if window.Notification.permission is "granted"
      @notify = createNotification(@title, @message, @tag)
    else
      window.Notification.requestPermission( (permission) ->
        if permission is "granted"
          @notify = createNotification(@title, @message, @tag)
      )
    if @notify and @url isnt ""
      @notify.on("click", =>
        tab = await browser.tabs.getCurrent()
        browser.tabs.update(tab.id, active: true)
        app.message.send("open", url: @url)
        @notify.close()
        return
      )
    return

  createNotification = (title, message, tag) ->
    return new window.Notification(
      title,
      {
        tag: tag
        body: message
        icon: "../img/read.crx_128x128.png"
      }
    )
