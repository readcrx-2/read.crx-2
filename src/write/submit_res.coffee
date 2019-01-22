import Write from "./write.coffee"
import {getByUrl as getWriteHistoryByUrl} from "../core/WriteHistory.coffee"
import {URL} from "../core/URL.ts"

Write.setFont()

class SubmitRes extends Write
  constructor: ->
    super()
    @_setupDatalist()
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
          "*://*/test/bbs.cgi*"
          "*://jbbs.shitaraba.net/bbs/write.cgi/*"
        ]
      }
      extraInfoSpec
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
    browser.runtime.sendMessage({type: "written?", url: url.href, mes, name, mail})
    return

  _onSuccess: (key) ->
    mes = @$view.C("message")[0].value
    name = @$view.C("name")[0].value
    mail = @$view.C("mail")[0].value
    browser.runtime.sendMessage({type: "written", url: @url.href, mes, name, mail})
    return

  _setupDatalist: ->
    data = await getWriteHistoryByUrl(@url.href)
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
            submit: "書"
            bbs: splittedUrl[3]
            key: splittedUrl[4]
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
            submit: "書きこむ"
            time: (Date.now() // 1000) - 60
            bbs: splittedUrl[3]
            key: splittedUrl[4]
            FROM: args.rcrxName
            mail: args.rcrxMail
            oekaki_thread1: ""
          textarea:
            MESSAGE: args.rcrxMessage
        }
    # したらば
    else if bbsType is "jbbs"
      return {
        action: "#{protocol}//jbbs.shitaraba.net/bbs/write.cgi/#{splittedUrl[3]}/#{splittedUrl[4]}/#{splittedUrl[5]}/"
        charset: "EUC-JP"
        input:
          TIME: (Date.now() // 1000) - 60
          DIR: splittedUrl[3]
          BBS: splittedUrl[4]
          KEY: splittedUrl[5]
          NAME: args.rcrxName
          MAIL: args.rcrxMail
        textarea:
          MESSAGE: args.rcrxMessage
      }
    # まちBBS
    else if bbsType is "machi"
      return {
        action: "#{protocol}//#{hostname}/bbs/write.cgi"
        charset: "Shift_JIS"
        input:
          submit: "書きこむ"
          TIME: (Date.now() // 1000) - 60
          BBS: splittedUrl[3]
          KEY: splittedUrl[4]
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
