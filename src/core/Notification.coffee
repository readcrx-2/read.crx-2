app.notification = {}

do ->
  app.notification.create = (title, message, url, tag) ->
    return new Notification(
      title,
      {
        tag: tag
        body: message
        icon: "../img/read.crx_128x128.png"
      }
    ).on("click", ->
      chrome.tabs.getCurrent((tab) ->
        chrome.tabs.update(tab.id, highlighted: true)
        app.message.send("open", url: url)
      )
      return
    )
  return
