import Write from "./write.coffee"
import {tsld as getTsld} from "../core/URL.ts"

Write.setFont()

class SubmitThread extends Write
  _PONG_MSG: "write_iframe_pong:thread"

  constructor: ->
    super()
    return

  _setHeaderModifier: ->
    {id} = await browser.tabs.getCurrent()
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
      ["requestHeaders", "blocking"]
    )
    return

  _setTitle: ({isThread}) ->
    title = @title + "板"
    $h1 = @$view.T("h1")[0]
    document.title = title
    $h1.textContent = title
    $h1.addClass("https") if getScheme(@url) is "https"
    return

  _onSuccess: (key) ->
    mes = @$view.C("message")[0].value
    name = @$view.C("name")[0].value
    mail = @$view.C("mail")[0].value
    title = @$view.C("title")[0].value
    url = @url

    if getTsld(url) in ["5ch.net", "2ch.sc", "bbspink.com", "open2ch.net"]
      keys = key.match(/.*\/test\/read\.cgi\/(\w+?)\/(\d+)\/l\d+/)
      unless keys?
        $notice.textContent = "書き込み失敗 - 不明な転送場所"
      else
        server = url.match(/^(https?:\/\/\w+\.(?:5ch\.net|2ch\.sc|bbspink\.com|open2ch\.net)).*/)[1]
        thread_url = "#{server}/test/read.cgi/#{keys[1]}/#{keys[2]}/"
        browser.runtime.sendMessage({type: "written", kind: "own", url, thread_url, mes, name, mail, title})
    else if getTsld(url) is "shitaraba.net"
      browser.runtime.sendMessage({type: "written", kind: "board", url, mes, name, mail, title})
    return

  _getIframeArgs: ->
    args = super()
    args.rcrxTitle = @$view.C("title")[0].value
    return args

  _getFormData: ->
    {scheme, bbsType, splittedUrl, args} = super()
    #2ch
    if bbsType is "2ch"
      #open2ch
      if getTsld(@url) is "open2ch.net"
        return {
          action: "#{scheme}://#{splittedUrl[2]}/test/bbs.cgi"
          charset: "UTF-8"
          input:
            submit: "新規スレッド作成"
            bbs: splittedUrl[3]
            subject: args.rcrxTitle
            FROM: args.rcrxName
            mail: args.rcrxMail
          textarea:
            MESSAGE: args.rcrxMessage
        }
      else
        return {
          action: "#{scheme}://#{splittedUrl[2]}/test/bbs.cgi"
          charset: "Shift_JIS"
          input:
            submit: "新規スレッド作成"
            time: (Date.now() // 1000) - 60
            bbs: splittedUrl[3]
            subject: args.rcrxTitle
            FROM: args.rcrxName
            mail: args.rcrxMail
          textarea:
            MESSAGE: args.rcrxMessage
        }
    #したらば
    else if bbsType is "jbbs"
      return {
        action: "#{scheme}://jbbs.shitaraba.net/bbs/write.cgi/#{splittedUrl[3]}/#{splittedUrl[4]}/new/"
        charset: "EUC-JP"
        input:
          submit: "新規スレッド作成"
          TIME: (Date.now() // 1000) - 60
          DIR: splittedUrl[3]
          BBS: splittedUrl[4]
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
