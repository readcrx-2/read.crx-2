import Write from "./write.coffee"

Write.setFont()

class SubmitThread extends Write
  _PONG_MSG: "write_iframe_pong:thread"

  constructor: ->
    super()
    return

  _setHeaderModifier: ->
    {id} = await browser.tabs.getCurrent()
    extraInfoSpec = ["requestHeaders", "blocking"]
    if browser.webRequest.OnBeforeSendHeadersOptions.hasOwnProperty("EXTRA_HEADERS")
      extraInfoSpec.push("extraHeaders")

    browser.webRequest.onBeforeSendHeaders.addListener(
      @_beforeSendFunc()
      {
        tabId: id
        types: ["sub_frame"]
        urls: [
          "*://*.5ch.net/test/bbs.cgi*"
          "*://*.bbspink.com/test/bbs.cgi*"
          "*://*.2ch.sc/test/bbs.cgi*"
          "*://*.open2ch.net/test/bbs.cgi*"
          "*://jbbs.shitaraba.net/bbs/write.cgi/*"
        ]
      }
      extraInfoSpec
    )
    return

  _setTitle: ->
    title = @title + "板"
    $h1 = @$view.T("h1")[0]
    document.title = title
    $h1.textContent = title
    $h1.addClass("https") if @url.isHttps()
    return

  _onSuccess: (key) ->
    mes = @$view.C("message")[0].value
    name = @$view.C("name")[0].value
    mail = @$view.C("mail")[0].value
    title = @$view.C("title")[0].value
    url = @url

    if url.getTsld() in ["5ch.net", "2ch.sc", "bbspink.com", "open2ch.net"]
      keys = key.match(/.*\/test\/read\.cgi\/(\w+?)\/(\d+)\/l\d+/)
      unless keys?
        $notice.textContent = "書き込み失敗 - 不明な転送場所"
      else
        server = url.origin
        thread_url = "#{server}/test/read.cgi/#{keys[1]}/#{keys[2]}/"
        browser.runtime.sendMessage({type: "written", kind: "own", url: url.href, thread_url, mes, name, mail, title})
    else if url.getTsld() is "shitaraba.net"
      browser.runtime.sendMessage({type: "written", kind: "board", url: url.href, mes, name, mail, title})
    return

  _getIframeArgs: ->
    args = super()
    args.rcrxTitle = @$view.C("title")[0].value
    return args

  _getFormData: ->
    {protocol, hostname} = @url
    {bbsType, splittedUrl, args} = super()
    # 2ch
    if bbsType is "2ch"
      # open2ch
      if @url.getTsld() is "open2ch.net"
        return {
          action: "#{protocol}//#{hostname}/test/bbs.cgi"
          charset: "UTF-8"
          input:
            submit: "新規スレッド作成"
            bbs: splittedUrl[1]
            subject: args.rcrxTitle
            FROM: args.rcrxName
            mail: args.rcrxMail
          textarea:
            MESSAGE: args.rcrxMessage
        }
      else
        return {
          action: "#{protocol}//#{hostname}/test/bbs.cgi"
          charset: "Shift_JIS"
          input:
            submit: "新規スレッド作成"
            time: (Date.now() // 1000) - 60
            bbs: splittedUrl[1]
            subject: args.rcrxTitle
            FROM: args.rcrxName
            mail: args.rcrxMail
          textarea:
            MESSAGE: args.rcrxMessage
        }
    # したらば
    else if bbsType is "jbbs"
      return {
        action: "#{protocol}//jbbs.shitaraba.net/bbs/write.cgi/#{splittedUrl[1]}/#{splittedUrl[2]}/new/"
        charset: "EUC-JP"
        input:
          submit: "新規スレッド作成"
          TIME: (Date.now() // 1000) - 60
          DIR: splittedUrl[1]
          BBS: splittedUrl[2]
          SUBJECT: args.rcrxTitle
          NAME: args.rcrxName
          MAIL: args.rcrxMail
        textarea:
          MESSAGE: args.rcrxMessage
      }
    return

app.boot("/write/submit_thread.html", ->
  new SubmitThread()
  return
)
