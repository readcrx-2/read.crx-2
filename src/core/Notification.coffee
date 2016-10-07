app.notification = {}

do ->
  app.notification.create = (title, message, url, tag) ->
    notify = new Notification(
      title,
      {
        tag: tag
        body: message
        icon: "../img/read.crx_128x128.png"
      }
    )
    notify.on("click", ->
      chrome.tabs.getCurrent((tab) ->
        chrome.tabs.update(tab.id, highlighted: true)
        app.message.send("open", url: url)
        notify.close()
      )
      return
    )
    return notify
  return
