regs = [
  ///^https?://(?!find|info|p2)\w+(?:\.[25]ch\.net|\.2ch\.sc|\.open2ch\.net|\.bbspink\.com)/(?:subback/)?\w+/?(?:index\.html)?(?:#\d+)?$///
  ///^https?://\w+(?:\.[25]ch\.net|\.2ch\.sc|\.open2ch\.net|\.bbspink\.com)/(?:\w+/)?test/read\.cgi/\w+/\d+/?.*///
  ///^https?://ula\.[25]ch\.net/2ch/\w+/[\w+\.]+/\d+/.*///
  ///^https?://c\.2ch\.net/test/-/\w+/i?(?:\?.+)?///
  ///^https?://c\.2ch\.net/test/-/\w+/\d+/(?:i|g|\d+)?(?:\?.+)?///
  ///^https?://jbbs\.shitaraba\.net/\w+/\d+/(?:index\.html)?(?:#\d+)?$///
  ///^https?://jbbs\.shitaraba\.net/bbs/read(?:_archive)?\.cgi/\w+/\d+/\d+///
  ///^https?://jbbs\.shitaraba\.net/\w+/\d+/storage/\d+\.html///
  ///^https?://\w+\.machi\.to/\w+/(?:index\.html)?(?:#\d+)?$///
  ///^https?://\w+\.machi\.to/bbs/read\.cgi/\w+/\d+///
]

openButtonId = "36e5cda5"
closeButtonId = "92a5da13"
url = chrome.extension.getURL("/view/index.html")
url += "?q=#{encodeURIComponent(location.href)}"

if regs.some((a) -> a.test(location.href))
  document.body.addEventListener("mousedown", ({target, button, ctrlKey, shiftKey}) ->
    if target.id is openButtonId
      a = document.createElement("a")
      a.href = url
      event = new MouseEvent("click", {button, ctrlKey, shiftKey})
      a.dispatchEvent(event)
    else if target.id is closeButtonId
      @removeChild(target.parentElement)
    return
  )

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

  openButton = document.createElement("span")
  openButton.id = openButtonId
  openButton.textContent = "read.crx 2 で開く"
  openButton.style["cursor"] = "pointer"
  openButton.style["text-decoration"] = "underline"
  container.appendChild(openButton)

  closeButton = document.createElement("span")
  closeButton.id = closeButtonId
  closeButton.textContent = " x"
  closeButton.style["cursor"] = "pointer"
  closeButton.style["display"] = "inline-block"
  closeButton.style["margin-left"] = "5px"
  container.appendChild(closeButton)

  document.body.appendChild(container)
