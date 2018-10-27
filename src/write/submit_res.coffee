import Write from "./write.coffee"
import {getByUrl as getWriteHistoryByUrl} from "../core/WriteHistory.coffee"
import {tsld as getTsld} from "../core/URL.ts"

Write.setFont()

class SubmitRes extends Write
  constructor: ->
    super()
    @_setupDatalist()
    return

  _setHeaderModifier: ->
    {id} = await browser.tabs.getCurrent()
    browser.webRequest.onBeforeSendHeaders.addListener(
      @_beforeSendFunc()
      {
        tabId: id
        types: ["sub_frame"]
        urls: [
          "*://*/test/bbs.cgi*"
          "*://jbbs.shitaraba.net/bbs/write.cgi/*"
        ]
      }
      ["requestHeaders", "blocking"]
    )
    browser.webRequest.onHeadersReceived.addListener( ({responseHeaders}) ->
      # X-Frame-Options回避
      for {name}, i in responseHeaders when name is "X-Frame-Options"
        responseHeaders.splice(i, 1)
        return {responseHeaders}
      return
    {
      tabId: id
      types: ["sub_frame"]
      urls: [
        "*://*/test/bbs.cgi*"
        "*://jbbs.shitaraba.net/bbs/write.cgi/*"
      ]
    }
    ["blocking", "responseHeaders"])
    return

  _onError: (message) ->
    super(message)
    {url, message: mes, name, mail} = @
    browser.runtime.sendMessage({type: "written?", url, mes, name, mail})
    return

  _onSuccess: (key) ->
    mes = @$view.C("message")[0].value
    name = @$view.C("name")[0].value
    mail = @$view.C("mail")[0].value
    browser.runtime.sendMessage({type: "written", url: @url, mes, name, mail})
    return

  _setupDatalist: ->
    data = await getWriteHistoryByUrl(@url)
    names = []
    mails = []
    for {input_name, input_mail} in data
      if names.length <= 5
        unless input_name is "" or names.includes(input_name)
          names.push(input_name)
      if mails.length <= 5
        unless input_mail is "" or mails.includes(input_mail)
          mails.push(input_mail)
      if names.length+mails.length >= 10
        break
    $names = $__("datalist")
    $names.id = "names"
    for n in names
      $option = $__("option")
      $option.value = n
      $names.addLast($option)
    $mails = $__("datalist")
    $mails.id = "mails"
    for m in mails
      $option = $__("option")
      $option.value = m
      $mails.addLast($option)
    $$.I("main").addLast($names, $mails)
    return

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
            submit: "書"
            bbs: splittedUrl[5]
            key: splittedUrl[6]
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
            submit: "書きこむ"
            time: (Date.now() // 1000) - 60
            bbs: splittedUrl[5]
            key: splittedUrl[6]
            FROM: args.rcrxName
            mail: args.rcrxMail
          textarea:
            MESSAGE: args.rcrxMessage
        }
    #したらば
    else if bbsType is "jbbs"
      return {
        action: "#{scheme}://jbbs.shitaraba.net/bbs/write.cgi/#{splittedUrl[5]}/#{splittedUrl[6]}/#{splittedUrl[7]}/"
        charset: "EUC-JP"
        input:
          TIME: (Date.now() // 1000) - 60
          DIR: splittedUrl[5]
          BBS: splittedUrl[6]
          KEY: splittedUrl[7]
          NAME: args.rcrxName
          MAIL: args.rcrxMail
        textarea:
          MESSAGE: args.rcrxMessage
      }
    # まちBBS
    else if bbsType is "machi"
      return {
        action: "#{scheme}://#{splittedUrl[2]}/bbs/write.cgi"
        charset: "Shift_JIS"
        input:
          submit: "書きこむ"
          TIME: (Date.now() // 1000) - 60
          BBS: splittedUrl[5]
          KEY: splittedUrl[6]
          NAME: args.rcrxName
          MAIL: args.rcrxMail
        textarea:
          MESSAGE: args.rcrxMessage
      }
    return

app.boot("/write/submit_res.html", ->
  new SubmitRes()
  return
)
