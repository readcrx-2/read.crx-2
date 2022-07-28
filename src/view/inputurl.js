app.boot("/view/inputurl.html", function () {
  const $view = document.documentElement;

  new app.view.TabContentView($view);

  $view.T("form")[0].on("submit", function (e) {
    e.preventDefault();

    let urlStr = this.url.value;
    urlStr = urlStr.replace(new RegExp(`^(ttps?)://`), "h$1://");
    if (!new RegExp(`^https?://`).test(urlStr)) {
      urlStr = `http://${urlStr}`;
    }
    const url = new app.URL.URL(urlStr);
    const { type: guessType } = url.guessType();
    if (guessType === "thread" || guessType === "board") {
      app.message.send("open", {
        url: url.href,
        new_tab: true,
      });
      parent.postMessage({ type: "request_killme" }, location.origin);
    } else {
      const ele = $view.C("notice")[0];
      ele.textContent = "未対応形式のURLです";
      UI.Animate.fadeIn(ele);
    }
  });
});
