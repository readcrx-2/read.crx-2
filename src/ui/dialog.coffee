window.UI ?= {}
do ->
  template_confirm = ({message, label_ok, label_no}) ->
    return """
      <div class="dialog_spacer"></div>
      <div class="dialog_body">
        <div class="dialog_message">#{message}</div>
        <div class="dialog_bottom">
          <button class="dialog_ok">#{label_ok}</button>
          <button class="dialog_no">#{label_no}</button>
        </div>
      </div>
      <div class="dialog_spacer"></div>
    """

  UI.dialog = (method, prop) ->
    return new Promise( (resolve, reject) ->
      #prop.message, prop.label_ok, prop.label_no
      if method is "confirm"
        $dialog = $__("div")
        $dialog.setClass("dialog dialog_confirm dialog_overlay")
        $dialog.innerHTML = template_confirm(prop)
        $dialog.C("dialog_ok")[0].on("click", ->
          $dialog.remove()
          resolve(true)
        )
        $dialog.C("dialog_no")[0].on("click", ->
          $dialog.remove()
          resolve(false)
        )
        $$.T("body")[0].append($dialog)
      else
        reject()
      return
    )
