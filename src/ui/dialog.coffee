do ($ = jQuery) ->
  template_confirm = """
    <div class="dialog dialog_confirm dialog_overlay">
      <div class="dialog_spacer"></div>
      <div class="dialog_body">
        <div class="dialog_message"></div>
        <div class="dialog_bottom">
          <button class="dialog_ok"></button>
          <button class="dialog_no"></button>
        </div>
      </div>
      <div class="dialog_spacer"></div>
    </div>
  """

  $.dialog = (method, prop) ->
    return new Promise( (resolve, reject) ->
      #prop.message, prop.label_ok, prop.label_no
      if method is "confirm"
        $(template_confirm)
          .find(".dialog_message")
            .text(prop.message)
          .end()
          .find(".dialog_ok")
            .text(prop.label_ok)
            .on "click", ->
              $(@).closest(".dialog").remove()
              resolve(true)
          .end()
          .find(".dialog_no")
            .text(prop.label_no)
            .on "click", ->
              $(@).closest(".dialog").remove()
              resolve(false)
          .end()
          .appendTo("body")
      else
        reject()
    )
