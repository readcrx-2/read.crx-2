app.notification = {}

do ->
  app.notification.create = (title, message, tag) ->
    return new Notification(
      title,
      {
        tag: tag
        body: message
        icon: "../img/read.crx_128x128.png"
      }
    )
  return
