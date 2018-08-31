templateConfirm = ({message, labelOk = "はい", labelNo = "いいえ"}) ->
  return """
    <div class="dialog_spacer"></div>
    <div class="dialog_body">
      <div class="dialog_message">#{message}</div>
      <div class="dialog_bottom">
        <button class="dialog_ok">#{labelOk}</button>
        <button class="dialog_no">#{labelNo}</button>
      </div>
    </div>
    <div class="dialog_spacer"></div>
  """

export default Dialog = (method, prop) ->
  return new Promise( (resolve, reject) ->
    #prop.message, prop.labelOk, prop.labelNo
    if method is "confirm"
      $dialog = $__("div")
      $dialog.setClass("dialog dialog_confirm dialog_overlay")
      $dialog.innerHTML = templateConfirm(prop)
      $dialog.C("dialog_ok")[0].on("click", ->
        $dialog.remove()
        resolve(true)
      )
      $dialog.C("dialog_no")[0].on("click", ->
        $dialog.remove()
        resolve(false)
      )
      document.body.addLast($dialog)
    else
      reject()
    return
  )
