/*
 * decaffeinate suggestions:
 * DS103: Rewrite code to no longer use __guard__, or convert again using --optional-chaining
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
(function() {
  const origin = (typeof browser !== 'undefined' && browser !== null ? browser : chrome).runtime.getURL("").slice(0, -1);

  let submitThreadFlag = false;

  const exec = function(javascript) {
    const script = document.createElement("script");
    script.innerHTML = javascript;
    document.body.appendChild(script);
  };

  const sendMessagePing = function() {
    exec(`\
parent.postMessage({type: "ping"}, "${origin}");\
`);
  };

  const sendMessageSuccess = function(moveMs) {
    if (submitThreadFlag) {
      const jumpUrl = getJumpUrl();
      exec(`\
parent.postMessage({
  type : "success",
  key: "${jumpUrl}",
  message: ${moveMs}
}, "${origin}");\
`);
    } else {
      exec(`\
parent.postMessage({type: "success", message: ${moveMs}}, "${origin}");\
`);
    }
  };

  const sendMessageConfirm = function() {
    exec(`\
parent.postMessage({type: "confirm"}, "${origin}");\
`);
  };

  const sendMessageError = function(message) {
    if (typeof message === "string") {
      exec(`\
parent.postMessage({
  type: "error",
  message: "${message.replace(/\"/g, "&quot;")}"
}, "${origin}");\
`);
    } else {
      exec(`\
parent.postMessage({type: "error"}, "${origin}");\
`);
    }
  };

  const getRefreshMeta = function() {
    const $heads = document.head.children;
    for (let $head of $heads) {
      if ($head.getAttribute("http-equiv") === "refresh") {
        return $head;
      }
    }
    return null;
  };

  const getMoveSec = function() {
    const sec = 3;
    const $refreshMeta = getRefreshMeta();
    const content = $refreshMeta != null ? $refreshMeta.content : undefined;
    if ((content == null) || (content === "")) { return sec; }
    const m = content.match(/^(\d+);/);
    return (m != null ? m[1] : undefined) != null ? (m != null ? m[1] : undefined) : sec;
  };

  var getJumpUrl = function() {
    const domain = location.hostname;
    if (domain.endsWith("5ch.net") || domain.endsWith("bbspink.com") || domain.endsWith("open2ch.net")) {
      const $meta = getRefreshMeta();
      return ($meta != null ? $meta.content : undefined) != null ? ($meta != null ? $meta.content : undefined) : "";
    }
    if (domain.endsWith("2ch.sc")) {
      const as = document.getElementsByTagName("a");
      return __guard__(as != null ? as[0] : undefined, x => x.href) != null ? __guard__(as != null ? as[0] : undefined, x => x.href) : "";
    }
    return "";
  };

  const main = function() {
    const {title} = document;
    const url = location.href;

    //したらば投稿確認
    if (new RegExp(`^https?://jbbs\\.shitaraba\\.net/bbs/write.cgi/\\w+/\\d+/(?:\\d+|new)/$`).test(url)) {
      if (title.includes("書きこみました")) {
        sendMessageSuccess(3 * 1000);
      } else if (title.includes("ERROR") || title.includes("スレッド作成規制中")) {
        sendMessageError();
      }

    // まちBBS投稿確認
    } else if (new RegExp(`^https?://(?:\\w+\\.)?machi\\.to/bbs/write\\.cgi`).test(url)) {
      if (title.includes("ＥＲＲＯＲ")) {
        sendMessageError();
      }
    } else if (new RegExp(`^https?://(?:\\w+\\.)?machi\\.to`).test(url)) {
        sendMessageSuccess(1 * 1000);

    //open2ch投稿確認
    } else if (new RegExp(`^https?://\\w+\\.open2ch\\.net/test/bbs\\.cgi`).test(url)) {
      const font = document.getElementsByTagName("font");
      let text = title;
      if (font.length > 0) { text += font[0].innerText; }
      if (text.includes("書きこみました")) {
        sendMessageSuccess(getMoveSec() * 1000);
      } else if (text.includes("確認")) {
        setTimeout(sendMessageConfirm , 1000 * 6);
      } else if (text.includes("ＥＲＲＯＲ")) {
        sendMessageError();
      }

    //2ch型投稿確認
    } else if (new RegExp(`^https?://\\w+\\.\\w+\\.\\w+/test/bbs\\.cgi`).test(url)) {
      if (title.includes("書きこみました")) {
        sendMessageSuccess(getMoveSec() * 1000);
      } else if (title.includes("確認")) {
        setTimeout(sendMessageConfirm , 1000 * 6);
      } else if (title.includes("ＥＲＲＯＲ")) {
        sendMessageError();
      }
    }
  };

  const boot = function() {
    window.addEventListener("message", function(e) {
      if (e.origin === origin) {
        if (e.data === "write_iframe_pong") {
          main();
        } else if (e.data === "write_iframe_pong:thread") {
          submitThreadFlag = true;
          main();
        }
      }
    });

    sendMessagePing();
  };

  setTimeout(boot, 0);
})();

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}