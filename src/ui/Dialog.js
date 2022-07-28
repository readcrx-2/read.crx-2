/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
let Dialog;
const templateConfirm = ({message, labelOk = "はい", labelNo = "いいえ"}) => `\
<div class="dialog_spacer"></div>
<div class="dialog_body">
<div class="dialog_message">${message}</div>
<div class="dialog_bottom">
  <button class="dialog_ok">${labelOk}</button>
  <button class="dialog_no">${labelNo}</button>
</div>
</div>
<div class="dialog_spacer"></div>\
`;

export default Dialog = (method, prop) => new Promise( function(resolve, reject) {
  //prop.message, prop.labelOk, prop.labelNo
  if (method === "confirm") {
    const $dialog = $__("div");
    $dialog.setClass("dialog dialog_confirm dialog_overlay");
    $dialog.innerHTML = templateConfirm(prop);
    $dialog.C("dialog_ok")[0].on("click", function() {
      $dialog.remove();
      return resolve(true);
    });
    $dialog.C("dialog_no")[0].on("click", function() {
      $dialog.remove();
      return resolve(false);
    });
    document.body.addLast($dialog);
    $dialog.C("dialog_no")[0].focus();
  } else {
    reject();
  }
});
