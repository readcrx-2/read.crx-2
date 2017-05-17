regs = [
  ///^https?://(?!find|info|p2)\w+(?:\.2ch\.net|\.2ch\.sc|\.open2ch\.net)/\w+/(?:index\.html)?(?:#\d+)?$///
  ///^https?://(?!itest)\w+(?:\.2ch\.net|\.2ch\.sc|\.open2ch\.net|\.bbspink\.com)/test/read\.cgi/\w+/\d+///
  ///^https?://jbbs\.shitaraba\.net/\w+/\d+/(?:index\.html)?(?:#\d+)?$///
  ///^https?://jbbs\.shitaraba\.net/bbs/read(?:_archive)?\.cgi/\w+/\d+/\d+///
  ///^https?://jbbs\.shitaraba\.net/\w+/\d+/storage/\d+\.html///
  ///^https?://\w+\.machi\.to/\w+/(?:index\.html)?(?:#\d+)?$///
  ///^https?://\w+\.machi\.to/bbs/read\.cgi/\w+/\d+///
]

open_button_id = "36e5cda5"
close_button_id = "92a5da13"

if (regs.some (a) -> a.test(location.href))
  document.body.addEventListener "mousedown", (e) ->
    if e.target.id is open_button_id
      url = chrome.extension.getURL("/view/index.html")
      url += "?q=#{encodeURIComponent(location.href)}"
      a = document.createElement("a")
      a.href = url
      event = new MouseEvent("click", {button: e.button ,ctrlKey: e.ctrlKey, shiftKey: e.shiftKey})
      a.dispatchEvent(event)
    else if e.target.id is close_button_id
      @removeChild(e.target.parentElement)
    return

  container = document.createElement("div")
  style =
    position: "fixed"
    right: "10px"
    top: "60px"
    "background-color": "rgba(255,255,255,0.8)"
    color: "#000"
    border: "1px solid black"
    "border-radius": "4px"
    padding: "5px"
    "font-size": "14px"
    "font-weight": "normal"
    "z-index": "255"

  for key, val of style
    container.style[key] = val

  open_button = document.createElement("span")
  open_button.id = open_button_id
  open_button.textContent = "read.crx 2 で開く"
  open_button.style["cursor"] = "pointer"
  open_button.style["text-decoration"] = "underline"
  container.appendChild(open_button)

  close_button = document.createElement("span")
  close_button.id = close_button_id
  close_button.textContent = " x"
  close_button.style["cursor"] = "pointer"
  close_button.style["display"] = "inline-block"
  close_button.style["margin-left"] = "5px"
  container.appendChild(close_button)

  document.body.appendChild(container)
