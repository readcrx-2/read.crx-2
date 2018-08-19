reg = ///^https?://(?:
  (?:(?!find|info|p2)\w+(?:\.[25]ch\.net|\.2ch\.sc|\.open2ch\.net|\.bbspink\.com)/(?:subback/)?\w+/?(?:index\.html)?(?:#\d+)?$)|
  (?:\w+(?:\.[25]ch\.net|\.2ch\.sc|\.open2ch\.net|\.bbspink\.com)/(?:\w+/)?test/read\.cgi/\w+/\d+/?.*)|
  (?:ula\.[25]ch\.net/2ch/\w+/[\w+\.]+/\d+/.*)|
  (?:c\.2ch\.net/test/-/\w+/i?(?:\?.+)?)|
  (?:c\.2ch\.net/test/-/\w+/\d+/(?:[ig]|\d+)?(?:\?.+)?)|
  (?:jbbs\.shitaraba\.net/\w+/\d+/(?:index\.html)?(?:#\d+)?$)|
  (?:jbbs\.shitaraba\.net/bbs/read(?:_archive)?\.cgi/\w+/\d+/\d+)|
  (?:jbbs\.shitaraba\.net/\w+/\d+/storage/\d+\.html)|
  (?:\w+\.machi\.to/\w+/(?:index\.html)?(?:#\d+)?$)|
  (?:\w+\.machi\.to/bbs/read\.cgi/\w+/\d+)
  )
  ///

openButtonId = "36e5cda5"
closeButtonId = "92a5da13"
url = (browser ? chrome).runtime.getURL("/view/index.html")
url += "?q=#{encodeURIComponent(location.href)}"

do ->
  return unless reg.test(location.href)
  document.body.addEventListener("mousedown", ({target, button, ctrlKey, shiftKey}) ->
    if target.id is openButtonId
      a = document.createElement("a")
      a.href = url
      a.dispatchEvent(new MouseEvent("click", {button, ctrlKey, shiftKey}))
    else if target.id is closeButtonId
      @removeChild(target.parentElement)
    return
  )

  container = document.createElement("div")
  container.style.cssText = """
    position: fixed;
    right: 10px;
    top: 60px;
    background-color: rgba(255,255,255,0.8);
    color: #000;
    border: 1px solid black;
    border-radius: 4px;
    padding: 5px;
    font-size: 14px;
    font-weight: normal;
    z-index: 255;
    """

  openButton = document.createElement("span")
  openButton.id = openButtonId
  openButton.textContent = "read.crx 2 で開く"
  openButton.style.cursor = "pointer"
  openButton.style.textDecoration = "underline"
  container.appendChild(openButton)

  closeButton = document.createElement("span")
  closeButton.id = closeButtonId
  closeButton.textContent = " x"
  closeButton.style.cursor = "pointer"
  closeButton.style.display = "inline-block"
  closeButton.style.marginLeft = "5px"
  container.appendChild(closeButton)

  document.body.appendChild(container)
  return
