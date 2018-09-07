import Write from "./write.coffee"
import {tsld as getTsld} from "../core/URL.ts"

app.boot("/write/submit_thread.html", ->
  isThread = true
  args = Write.getArgs()
  Write.setupTheme()
  Write.setDOM()
  Write.setTitle({isThread})

  do ->
    {id} = await browser.tabs.getCurrent()
    browser.webRequest.onBeforeSendHeaders.addListener(
      Write.beforeSendFunc
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

  $view = $$.C("view_write")[0]

  timer = new Write.Timer({
    onError: Write.onErrorFunc
  })

  Write.setupMessage({
    timer
    isThread
    onSuccess: (key) ->
      mes = $view.C("message")[0].value
      name = $view.C("name")[0].value
      mail = $view.C("mail")[0].value
      title = $view.C("title")[0].value
      {url} = args

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
    onError: Write.onErrorFunc
  })

  Write.setupForm(timer, isThread, (splittedUrl, iframeArgs, bbsType, scheme) ->
    #2ch
    if bbsType is "2ch"
      #open2ch
      if getTsld(args.url) is "open2ch.net"
        return {
          action: "#{scheme}://#{splittedUrl[2]}/test/bbs.cgi"
          charset: "UTF-8"
          input:
            submit: "新規スレッド作成"
            bbs: splittedUrl[3]
            subject: iframeArgs.rcrxTitle
            FROM: iframeArgs.rcrxName
            mail: iframeArgs.rcrxMail
          textarea:
            MESSAGE: iframeArgs.rcrxMessage
        }
      else
        return {
          action: "#{scheme}://#{splittedUrl[2]}/test/bbs.cgi"
          charset: "Shift_JIS"
          input:
            submit: "新規スレッド作成"
            time: (Date.now() // 1000) - 60
            bbs: splittedUrl[3]
            subject: iframeArgs.rcrxTitle
            FROM: iframeArgs.rcrxName
            mail: iframeArgs.rcrxMail
          textarea:
            MESSAGE: iframeArgs.rcrxMessage
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
          SUBJECT: iframeArgs.rcrxTitle
          NAME: iframeArgs.rcrxName
          MAIL: iframeArgs.rcrxMail
        textarea:
          MESSAGE: iframeArgs.rcrxMessage
      }
    return
  )
  return
)
