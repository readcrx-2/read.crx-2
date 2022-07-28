// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
/*
 * decaffeinate suggestions:
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const reg = new RegExp(`^https?://(?:\
(?:(?!find|info|p2)\\w+(?:\\.[25]ch\\.net|\\.2ch\\.sc|\\.open2ch\\.net|\\.bbspink\\.com)/(?:subback/)?\\w+/?(?:index\\.html)?(?:#\\d+)?$)|\
(?:\\w+(?:\\.[25]ch\\.net|\\.2ch\\.sc|\\.open2ch\\.net|\\.bbspink\\.com)/(?:\\w+/)?test/read\\.cgi/\\w+/\\d+/?.*)|\
(?:ula\\.[25]ch\\.net/2ch/\\w+/[\\w+\\.]+/\\d+/.*)|\
(?:c\\.2ch\\.net/test/-/\\w+/i?(?:\\?.+)?)|\
(?:c\\.2ch\\.net/test/-/\\w+/\\d+/(?:[ig]|\\d+)?(?:\\?.+)?)|\
(?:jbbs\\.shitaraba\\.net/\\w+/\\d+/(?:index\\.html)?(?:#\\d+)?$)|\
(?:jbbs\\.shitaraba\\.net/bbs/read(?:_archive)?\\.cgi/\\w+/\\d+/\\d+)|\
(?:jbbs\\.shitaraba\\.net/\\w+/\\d+/storage/\\d+\\.html)|\
(?:(?:\\w+\\.)?machi\\.to/\\w+/(?:index\\.html)?(?:#\\d+)?$)|\
(?:(?:\\w+\\.)?machi\\.to/bbs/read\\.cgi/\\w+/\\d+)\
)\
`);

const openButtonId = "36e5cda5";
const closeButtonId = "92a5da13";
let url = (typeof browser !== 'undefined' && browser !== null ? browser : chrome).runtime.getURL("/view/index.html");
url += `?q=${encodeURIComponent(location.href)}`;

(function() {
  if (!reg.test(location.href)) { return; }
  document.body.addEventListener("mousedown", function({target, button, ctrlKey, shiftKey}) {
    if (target.id === openButtonId) {
      const a = document.createElement("a");
      a.href = url;
      a.dispatchEvent(new MouseEvent("click", {button, ctrlKey, shiftKey}));
    } else if (target.id === closeButtonId) {
      this.removeChild(target.parentElement);
    }
  });

  const container = document.createElement("div");
  container.style.cssText = `\
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
z-index: 255;\
`;

  const openButton = document.createElement("span");
  openButton.id = openButtonId;
  openButton.textContent = "read.crx 2 で開く";
  openButton.style.cursor = "pointer";
  openButton.style.textDecoration = "underline";
  container.appendChild(openButton);

  const closeButton = document.createElement("span");
  closeButton.id = closeButtonId;
  closeButton.textContent = " x";
  closeButton.style.cursor = "pointer";
  closeButton.style.display = "inline-block";
  closeButton.style.marginLeft = "5px";
  container.appendChild(closeButton);

  document.body.appendChild(container);
})();
